import { describe, expect, it } from 'vitest'
import { classifyError } from './resolve'

const fsError = (code: string, syscall = 'open'): NodeJS.ErrnoException =>
  Object.assign(new Error(`${code}: ${syscall} '/x'`), { code, syscall, path: '/x' })

describe('classifyError', () => {
  it('names file-system failures instead of calling them network errors', () => {
    expect(classifyError(fsError('ENOSPC', 'write'))).toMatchObject({ code: 'disk-full', retryable: false })
    expect(classifyError(fsError('EACCES'))).toMatchObject({ code: 'permission', retryable: false })
    expect(classifyError(fsError('EROFS', 'mkdir'))).toMatchObject({ code: 'permission', retryable: false })
    expect(classifyError(fsError('ENOENT', 'rename'))).toMatchObject({ code: 'folder-unavailable', retryable: false })
    expect(classifyError(fsError('EIO', 'write'))).toMatchObject({ code: 'folder-unavailable' })
  })

  it('keeps real network errors retryable', () => {
    const fetchFailed = new TypeError('fetch failed')
    expect(classifyError(fetchFailed)).toMatchObject({ code: 'network', retryable: true })
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    expect(classifyError(reset)).toMatchObject({ code: 'network', retryable: true })
  })
})
