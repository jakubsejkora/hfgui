/**
 * How many people download and update hfgui — from GitHub's own download
 * counters for release files. Nothing in the app reports anything.
 *
 *   npm run stats       # totals per release, plus the last 1/7/30 days once
 *                       # the daily snapshots (the `stats` branch) have history
 *
 *   node scripts/stats.mjs --snapshot downloads.csv [--summary file.md]
 *                       # what .github/workflows/stats.yml runs once a day
 *
 * What the counters mean:
 * - Installs: downloads of the DMG — new installs (and the odd re-download).
 * - Updates: downloads of the zip, which only installed copies fetch, when they
 *   update to that version. A week or two after a release, roughly how many
 *   copies are in use.
 * - Update checks: downloads of latest-mac.yml. Every running copy fetches it
 *   at launch and every 4 hours: a measure of how much hfgui is used, not of
 *   how many people use it.
 * GitHub counts requests, not people, and keeps only running totals — the
 * daily snapshots are what turn them into "this week".
 */
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? null)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const [, owner, repo] = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(String(pkg.repository?.url ?? '')) ?? []
if (!owner) {
  console.error('package.json has no GitHub repository url')
  process.exit(1)
}

const KINDS = /** @type {const} */ (['installs', 'updates', 'checks'])
const LABEL = { installs: 'Installs', updates: 'Updates', checks: 'Update checks' }

/** What a release file's downloads stand for, or null for files that don't tell anything (blockmaps). */
function kindOf(asset) {
  if (/\.dmg$/i.test(asset)) return 'installs'
  if (/-mac\.zip$/i.test(asset)) return 'updates'
  if (/^latest-mac\.yml$/i.test(asset)) return 'checks'
  return null
}

async function fetchReleases() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'hfgui-stats' }
  if (token) headers.Authorization = `Bearer ${token}`
  const releases = []
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100&page=${page}`, { headers })
    if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status} for the release list`)
    const batch = await res.json()
    releases.push(...batch)
    if (batch.length < 100) break
  }
  return releases
    .filter((r) => !r.draft)
    .map((r) => ({
      tag: r.tag_name,
      published: (r.published_at ?? '').slice(0, 10),
      assets: r.assets.map((a) => ({ name: a.name, downloads: a.download_count }))
    }))
}

function totalsOf(rows) {
  const t = { installs: 0, updates: 0, checks: 0 }
  for (const r of rows) {
    const kind = kindOf(r.asset)
    if (kind) t[kind] += r.downloads
  }
  return t
}

/** date,tag,asset,downloads — one row per release file per day. */
function readCsv(text) {
  return text
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [date, tag, asset, downloads] = line.split(',')
      return { date, tag, asset, downloads: Number(downloads) }
    })
}

function toCsv(rows) {
  return ['date,tag,asset,downloads', ...rows.map((r) => `${r.date},${r.tag},${r.asset},${r.downloads}`)].join('\n') + '\n'
}

/** Change over the last `days`, against the newest snapshot at least that old. */
function deltaSince(history, now, days) {
  const cutoff = new Date(Date.parse(now) - days * 86400_000).toISOString().slice(0, 10)
  const dates = [...new Set(history.map((r) => r.date))].sort()
  const base = [...dates].reverse().find((d) => d <= cutoff)
  if (!base) return null
  const current = totalsOf(history.filter((r) => r.date === now))
  const then = totalsOf(history.filter((r) => r.date === base))
  return { base, delta: Object.fromEntries(KINDS.map((k) => [k, current[k] - then[k]])) }
}

/** The snapshots, from a file or from the `stats` branch the daily workflow keeps. */
function readHistory(file) {
  if (file && existsSync(file)) return readCsv(readFileSync(file, 'utf8'))
  try {
    execFileSync('git', ['fetch', '--quiet', 'origin', 'stats'], { stdio: 'ignore' })
    return readCsv(execFileSync('git', ['show', 'FETCH_HEAD:downloads.csv'], { encoding: 'utf8' }))
  } catch {
    return []
  }
}

const n = (x) => (x === null || x === undefined ? '—' : x.toLocaleString('en-US'))
const pad = (s, w, left = false) => (left ? String(s).padEnd(w) : String(s).padStart(w))

const releases = await fetchReleases()
const today = new Date().toISOString().slice(0, 10)
const rows = releases.flatMap((r) => r.assets.map((a) => ({ date: today, tag: r.tag, asset: a.name, downloads: a.downloads })))

const snapshotFile = flag('--snapshot')
const history = snapshotFile
  ? [...readHistory(snapshotFile).filter((r) => r.date !== today), ...rows]
  : [...readHistory(null).filter((r) => r.date !== today), ...rows]
if (snapshotFile) writeFileSync(snapshotFile, toCsv(history))

// ── Report ──────────────────────────────────────────────────────────────
const lines = []
lines.push(`hfgui downloads — github.com/${owner}/${repo} (${today})`, '')
lines.push(`${pad('Release', 10, true)}${pad('Published', 12, true)}${KINDS.map((k) => pad(LABEL[k], 15)).join('')}`)
for (const r of releases) {
  const t = totalsOf(r.assets.map((a) => ({ asset: a.name, downloads: a.downloads })))
  const has = (k) => r.assets.some((a) => kindOf(a.name) === k)
  lines.push(`${pad(r.tag, 10, true)}${pad(r.published, 12, true)}${KINDS.map((k) => pad(has(k) ? n(t[k]) : '—', 15)).join('')}`)
}
const all = totalsOf(rows)
lines.push('─'.repeat(22 + 15 * KINDS.length))
lines.push(`${pad('Total', 22, true)}${KINDS.map((k) => pad(n(all[k]), 15)).join('')}`, '')
const recent = [1, 7, 30].map((d) => [d, deltaSince(history, today, d)]).filter(([, x]) => x)
if (recent.length) {
  for (const [d, { base, delta }] of recent) {
    lines.push(`Last ${d === 1 ? 'day' : `${d} days`} (since ${base}): ${KINDS.map((k) => `+${n(delta[k])} ${LABEL[k].toLowerCase()}`).join(', ')}`)
  }
} else {
  lines.push('No daily snapshots yet — .github/workflows/stats.yml starts them once it runs on GitHub.')
}
lines.push('', 'Installs = DMG downloads · Updates = copies updating · Update checks = launches and 4-hourly checks. Requests, not people.')
console.log(lines.join('\n'))

const summary = flag('--summary')
if (summary) appendFileSync(summary, `## Downloads\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`)
