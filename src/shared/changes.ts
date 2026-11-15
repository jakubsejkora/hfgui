/** What a file is, for people: an update to `tokenizer_config.json` is a tokenizer change. */
const LABELS: Array<[RegExp, string]> = [
  [/chat_template/i, 'chat template'],
  [/tokenizer|vocab|merges|special_tokens|added_tokens/i, 'tokenizer'],
  [/(^|\/)generation_config\.json$/i, 'generation settings'],
  [/(^|\/)(config|params)\.json$/i, 'model config'],
  [/\.(safetensors|gguf|bin|pt|pth|npz|onnx)$/i, 'weights'],
  [/\.py$/i, 'model code']
]

/** "chat template and tokenizer" — what an update changes, in a few words. */
export function describeChanges(paths: readonly string[]): string {
  const labels = [...new Set(paths.map((p) => LABELS.find(([re]) => re.test(p))?.[1] ?? p.split('/').pop()!))]
  if (labels.length === 0) return 'files'
  if (labels.length === 1) return labels[0]
  if (labels.length <= 3) return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  return `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} more`
}
