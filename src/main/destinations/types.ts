import type { DestinationKind } from '@shared/types'

export interface PathAdapter {
  kind: DestinationKind
  label: string
  /** Returns the models base dir when the target app looks installed, else null. */
  detect(): Promise<string | null>
  /** Directory a given repo's files should land in, under the chosen base dir. */
  resolveJobDir(repoId: string, baseDir: string): string
}
