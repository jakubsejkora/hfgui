import { formatBytes } from '@shared/format'
import type { TreeFile } from '@shared/types'

export function FileList({ files }: { files: TreeFile[] }) {
  return (
    <div className="border-border max-h-60 overflow-y-auto rounded-xl border">
      {files.map((file) => (
        <div
          key={file.path}
          className="border-border/50 flex items-center justify-between gap-3 border-b px-3 py-1.5 text-[11px] last:border-b-0"
        >
          <span className="text-muted selectable min-w-0 truncate font-mono">{file.path}</span>
          <span className="text-faint shrink-0 font-mono">{formatBytes(file.size)}</span>
        </div>
      ))}
    </div>
  )
}
