import { formatBytes } from '@shared/format'
import type { TreeFile } from '@shared/types'

export function FileList({ files }: { files: TreeFile[] }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border">
      <ul className="divide-y text-xs">
        {files.map((file) => (
          <li key={file.path} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="selectable min-w-0 truncate font-mono text-muted-foreground" title={file.path}>
              {file.path}
            </span>
            <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
