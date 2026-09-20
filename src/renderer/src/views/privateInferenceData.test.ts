import { describe, expect, it } from 'vitest'
import { isValidRepoId } from '../../../main/pathSafety'
import { TOOLS } from './privateInferenceData'

describe('private inference suggestions', () => {
  it('every suggested repoId is a well-formed HF repo id', () => {
    for (const tool of TOOLS) {
      for (const s of tool.suggestions) {
        expect(isValidRepoId(s.repoId), `${tool.name}: ${s.repoId}`).toBe(true)
      }
    }
  })

  it('has no duplicate suggestions within a tool', () => {
    for (const tool of TOOLS) {
      const ids = tool.suggestions.map((s) => s.repoId)
      expect(new Set(ids).size, tool.name).toBe(ids.length)
    }
  })

  // Live Hub check, opt-in: HFGUI_NETWORK_TESTS=1 npm test
  describe.runIf(process.env.HFGUI_NETWORK_TESTS === '1')('repo ids resolve on the Hub', () => {
    for (const tool of TOOLS) {
      for (const s of tool.suggestions) {
        it(`${tool.name}: ${s.repoId}`, async () => {
          const res = await fetch(`https://huggingface.co/api/models/${s.repoId}`)
          expect(res.status, s.repoId).toBe(200)
        })
      }
    }
  })
})
