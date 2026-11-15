/**
 * Build, sign, notarize, verify and upload a release of hfgui — one command.
 *
 *   npm run release                 # everything, ending in a *draft* GitHub release
 *   npm run release -- --no-upload  # stop after the checks (a dry run of the real thing)
 *
 * Options: --no-upload, --skip-checks (typecheck + tests), --allow-dirty.
 *
 * The version is package.json's; bump it first (`npm version minor
 * --no-git-tag-version`, commit, push). The draft is invisible to installed
 * copies until you publish it — they read GitHub's latest *published* release.
 * See docs/RELEASING.md for the one-time setup and what each step guards.
 */
import { execFileSync, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const args = new Set(process.argv.slice(2))
const upload = !args.has('--no-upload')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = pkg.version
const tag = `v${version}`
const DIST = 'dist'

const step = (m) => console.log(`\n▸ ${m}`)
const ok = (m) => console.log(`  ✓ ${m}`)
function die(m) {
  console.error(`\n✗ ${m}`)
  process.exit(1)
}
/** Run a command, streaming its output; die if it fails. */
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts })
  if (r.status !== 0) die(`${cmd} ${cmdArgs.join(' ')} failed`)
}
/** Run a command and return stdout+stderr (spctl reports on stderr). */
function capture(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
const bin = (name) => join('node_modules', '.bin', name)

if (!/^\d+\.\d+\.\d+$/.test(version)) die(`package.json version "${version}" isn't x.y.z — installed copies only take plain releases`)
console.log(`hfgui ${version} → ${upload ? `draft release ${tag}` : 'local build only (--no-upload)'}`)

// ── Preflight: fail before the slow parts ─────────────────────────────────
step('Preflight')
if (process.platform !== 'darwin') die('releases are built on a Mac')
if (!args.has('--allow-dirty')) {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  if (dirty) die(`the working tree has changes — commit them first (or pass --allow-dirty):\n${dirty}`)
  ok('working tree clean')
}

const identities = capture('security', ['find-identity', '-v', '-p', 'codesigning']).out
const devIds = [...identities.matchAll(/"(Developer ID Application: [^"]+)"/g)].map((m) => m[1])
const identity = process.env.CSC_NAME
  ? devIds.find((id) => id.includes(process.env.CSC_NAME)) ?? die(`no Developer ID identity matches CSC_NAME="${process.env.CSC_NAME}"`)
  : devIds.length === 1
    ? devIds[0]
    : die(devIds.length ? `several Developer ID identities — pick one with CSC_NAME:\n  ${devIds.join('\n  ')}` : 'no "Developer ID Application" identity in the keychain (see docs/RELEASING.md)')
ok(`signing as ${identity}`)

// The same credentials electron-builder notarizes the app with. Without them it
// would skip notarization with a log line, and Gatekeeper would block the app.
const env = process.env
const notaryArgs = env.APPLE_KEYCHAIN_PROFILE
  ? ['--keychain-profile', env.APPLE_KEYCHAIN_PROFILE]
  : env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER
    ? ['--key', env.APPLE_API_KEY, '--key-id', env.APPLE_API_KEY_ID, '--issuer', env.APPLE_API_ISSUER]
    : env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID
      ? ['--apple-id', env.APPLE_ID, '--password', env.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', env.APPLE_TEAM_ID]
      : die('no notarization credentials: set APPLE_KEYCHAIN_PROFILE (or the API-key / Apple-ID variables, see docs/RELEASING.md)')
ok(`notarizing with ${env.APPLE_KEYCHAIN_PROFILE ? `keychain profile "${env.APPLE_KEYCHAIN_PROFILE}"` : env.APPLE_API_KEY ? 'an App Store Connect API key' : 'an Apple ID'}`)

let commit = null
if (upload) {
  if (capture('gh', ['auth', 'status']).ok === false) die('the GitHub CLI isn’t signed in — run `gh auth login`')
  const existing = capture('gh', ['release', 'view', tag, '--json', 'isDraft', '--jq', '.isDraft'])
  if (existing.ok) {
    die(
      existing.out.trim() === 'true'
        ? `a draft ${tag} is already on GitHub (an earlier run?) — delete it first: gh release delete ${tag} --yes`
        : `${tag} is already released — bump the version (a published release must never change)`
    )
  }
  const latest = capture('gh', ['release', 'view', '--json', 'tagName', '--jq', '.tagName'])
  if (latest.ok && latest.out.trim()) {
    const cmp = (a, b) => a.split('.').map(Number).reduce((r, n, i) => r || n - Number(b.split('.')[i]), 0)
    const prev = latest.out.trim().replace(/^v/, '')
    if (cmp(version, prev) <= 0) die(`${version} isn’t newer than the latest release (${prev}) — installed copies would ignore it`)
    ok(`newer than the latest release, ${prev}`)
  } else {
    console.warn(`  ! couldn’t read the latest release from GitHub — make sure ${version} is newer than it`)
  }
  run('git', ['fetch', '--quiet', 'origin'])
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const onRemote = execFileSync('git', ['branch', '-r', '--contains', commit], { encoding: 'utf8' }).trim()
  if (!onRemote) die(`commit ${commit.slice(0, 7)} isn’t on GitHub yet — push it first, so the release's tag can point at it`)
  ok(`releasing commit ${commit.slice(0, 7)}`)
}

if (!args.has('--skip-checks')) {
  step('Typecheck and tests')
  run('npm', ['run', 'typecheck'])
  run('npm', ['test'])
}

// ── Build: app signed + notarized + stapled by electron-builder ───────────
step('Build')
rmSync(DIST, { recursive: true, force: true })
run(bin('electron-vite'), ['build'])
run(bin('electron-builder'), ['--mac', '--publish', 'never'])

const files = {
  dmg: join(DIST, `${pkg.productName ?? 'hfgui'}-${version}-arm64.dmg`),
  zip: join(DIST, `${pkg.productName ?? 'hfgui'}-${version}-arm64-mac.zip`),
  blockmap: join(DIST, `${pkg.productName ?? 'hfgui'}-${version}-arm64-mac.zip.blockmap`),
  feed: join(DIST, 'latest-mac.yml')
}
for (const f of Object.values(files)) if (!existsSync(f)) die(`missing ${f}`)

// ── The DMG: electron-builder leaves its container unsigned ───────────────
step('Sign, notarize and staple the DMG')
run('codesign', ['--sign', identity, '--timestamp', files.dmg])
run('xcrun', ['notarytool', 'submit', files.dmg, '--wait', ...notaryArgs])
run('xcrun', ['stapler', 'staple', files.dmg])

// ── Verify everything a user's Mac (and the updater) will check ───────────
step('Verify')
const dmgAssess = capture('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '-v', files.dmg])
if (!dmgAssess.ok || !/accepted/.test(dmgAssess.out) || !/Notarized Developer ID/.test(dmgAssess.out)) die(`Gatekeeper rejects the DMG:\n${dmgAssess.out}`)
ok('Gatekeeper accepts the DMG (Notarized Developer ID)')
if (!capture('xcrun', ['stapler', 'validate', files.dmg]).ok) die('the DMG has no stapled ticket')
ok('DMG ticket stapled')

const unpacked = mkdtempSync(join(tmpdir(), 'hfgui-release-'))
try {
  run('ditto', ['-x', '-k', files.zip, unpacked])
  const app = join(unpacked, `${pkg.productName ?? 'hfgui'}.app`)
  if (!capture('codesign', ['--verify', '--deep', '--strict', app]).ok) die('the app in the zip fails codesign --verify --deep --strict')
  ok('app signature valid (deep, strict)')
  const appAssess = capture('spctl', ['-a', '-t', 'exec', '-vv', app])
  if (!appAssess.ok || !/source=Notarized Developer ID/.test(appAssess.out)) die(`Gatekeeper rejects the app:\n${appAssess.out}`)
  ok('Gatekeeper accepts the app (Notarized Developer ID)')
  if (!capture('xcrun', ['stapler', 'validate', app]).ok) die('the app has no stapled ticket')
  ok('app ticket stapled')
  const plistVersion = capture('defaults', ['read', join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString']).out.trim()
  if (plistVersion !== version) die(`the app says it is ${plistVersion}, not ${version}`)
  ok(`app version ${plistVersion}`)
  const updateYml = readFileSync(join(app, 'Contents/Resources/app-update.yml'), 'utf8')
  const repoUrl = String(pkg.repository?.url ?? pkg.repository ?? '')
  const [, owner, repo] = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(repoUrl) ?? []
  if (!/provider: github/.test(updateYml) || !updateYml.includes(`owner: ${owner}`) || !updateYml.includes(`repo: ${repo}`)) {
    die(`app-update.yml doesn't point at github.com/${owner}/${repo}:\n${updateYml}`)
  }
  ok(`updates from github.com/${owner}/${repo}`)
} finally {
  rmSync(unpacked, { recursive: true, force: true })
}

// latest-mac.yml is what installed copies read: it must name this zip, byte for byte.
const feed = readFileSync(files.feed, 'utf8')
const zipName = files.zip.split('/').pop()
const sha512 = createHash('sha512').update(readFileSync(files.zip)).digest('base64')
if (!feed.includes(`version: ${version}`)) die(`latest-mac.yml announces another version:\n${feed}`)
if (!feed.includes(`url: ${zipName}`) || !feed.includes(`sha512: ${sha512}`)) die(`latest-mac.yml doesn't match the zip:\n${feed}`)
if (/\.dmg/.test(feed)) die('latest-mac.yml lists the DMG — its checksum went stale when it was stapled')
ok('latest-mac.yml names the zip with its sha512')

if (!upload) {
  console.log(`\nDone — everything checks out. Nothing uploaded (--no-upload). Artifacts in ${DIST}/.`)
  process.exit(0)
}

// ── Upload as a draft ─────────────────────────────────────────────────────
step(`Upload draft release ${tag}`)
run('gh', [
  'release',
  'create',
  tag,
  files.dmg,
  files.zip,
  files.blockmap,
  files.feed,
  '--draft',
  '--title',
  `hfgui ${version}`,
  '--generate-notes',
  '--target',
  commit
])
const url = capture('gh', ['release', 'view', tag, '--json', 'url', '--jq', '.url']).out.trim()
console.log(`
Draft created: ${url}

Read the generated notes, then publish:
  gh release edit ${tag} --draft=false --latest

Installed copies find it within a few hours (or at once from Settings → About → Check now).`)
