import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerModelWithExo } from './exoApi'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerModelWithExo', () => {
  it('reports exo-offline when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    expect(await registerModelWithExo('org/repo')).toEqual({
      status: 'exo-offline',
      message: null
    })
  })

  it('skips registration when the model is already listed (case-insensitive)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ id: 'Org/Repo' }, { id: 'other/model' }] }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await registerModelWithExo('org/repo')).toEqual({
      status: 'already-listed',
      message: null
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('registers an unlisted model via POST /models/add', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'other/model' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'org/repo' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await registerModelWithExo('org/repo')).toEqual({
      status: 'registered',
      message: null
    })
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('http://localhost:52415/models/add')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ model_id: 'org/repo' })
  })

  it('surfaces the API error detail when the add is rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Failed to fetch model: no config' }, 400))
    vi.stubGlobal('fetch', fetchMock)
    expect(await registerModelWithExo('org/repo')).toEqual({
      status: 'failed',
      message: 'Failed to fetch model: no config'
    })
  })
})
