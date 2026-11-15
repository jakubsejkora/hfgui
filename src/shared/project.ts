/**
 * Where hfgui lives on GitHub: its releases (and so its updates — see
 * electron-builder.yml `publish`, which must name the same repo), issues and
 * source.
 */
export const REPO = 'jakubsejkora/hfgui'
export const REPO_URL = `https://github.com/${REPO}`
export const RELEASES_URL = `${REPO_URL}/releases`

/** A release's page on GitHub — its notes are the "What's new". */
export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`
}

export interface BugReportFacts {
  version: string
  osVersion: string
  cpuModel: string
  totalMemoryBytes: number
}

/**
 * A new GitHub issue on the bug form, with the fields people never know off
 * the top of their head filled in (GitHub prefills issue-form fields from
 * query parameters named after their ids — .github/ISSUE_TEMPLATE/bug_report.yml).
 * Opening it sends nothing: the browser shows the form, and the user decides.
 */
export function bugReportUrl(facts: BugReportFacts): string {
  const memory = Math.round(facts.totalMemoryBytes / 1024 ** 3)
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    version: facts.version,
    macos: facts.osVersion,
    mac: [facts.cpuModel.trim(), memory > 0 ? `${memory} GB` : ''].filter(Boolean).join(', ')
  })
  return `${REPO_URL}/issues/new?${params}`
}
