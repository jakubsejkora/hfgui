import { describe, expect, it } from 'vitest'
import { isValidRepoId } from '../../../main/pathSafety'
import { USE_CASES, launchedApp } from './privateInferenceData'

describe('private inference suggestions', () => {
  it('every suggested repoId is a well-formed HF repo id', () => {
    for (const useCase of USE_CASES) {
      for (const s of useCase.suggestions) {
        expect(isValidRepoId(s.repoId), `${useCase.id}: ${s.repoId}`).toBe(true)
      }
    }
  })

  it('has no duplicate suggestions within a use case', () => {
    for (const useCase of USE_CASES) {
      const ids = useCase.suggestions.map((s) => s.repoId)
      expect(new Set(ids).size, useCase.id).toBe(ids.length)
    }
  })

  it('names no app before it has launched', () => {
    for (const useCase of USE_CASES) {
      if (launchedApp(useCase)) continue
      const shown = [useCase.title, useCase.about, useCase.modelNeeds, ...useCase.suggestions.map((s) => s.reason)]
      for (const text of shown) {
        expect(text.toLowerCase(), `${useCase.id} mentions ${useCase.app.name}`).not.toContain(useCase.app.name.toLowerCase())
      }
    }
  })

  // Live Hub check, opt-in: HFGUI_NETWORK_TESTS=1 npm test
  describe.runIf(process.env.HFGUI_NETWORK_TESTS === '1')('repo ids resolve on the Hub', () => {
    for (const useCase of USE_CASES) {
      for (const s of useCase.suggestions) {
        it(`${useCase.id}: ${s.repoId}`, async () => {
          const res = await fetch(`https://huggingface.co/api/models/${s.repoId}`)
          expect(res.status, s.repoId).toBe(200)
        })
      }
    }
  })
})
