import type { DestinationInfo, DestinationKind, Settings } from '@shared/types'
import { customAdapter } from './custom'
import { exoAdapter } from './exo'
import { lmstudioAdapter } from './lmstudio'
import type { PathAdapter } from './types'

export const adapters: Record<DestinationKind, PathAdapter> = {
  lmstudio: lmstudioAdapter,
  exo: exoAdapter,
  custom: customAdapter
}

const overrideKey: Record<DestinationKind, keyof Settings> = {
  lmstudio: 'lmstudioDir',
  exo: 'exoDir',
  custom: 'customDir'
}

export async function getDestinations(settings: Settings): Promise<DestinationInfo[]> {
  return Promise.all(
    (Object.values(adapters) as PathAdapter[]).map(async (adapter) => {
      const override = settings[overrideKey[adapter.kind]] as string | null
      const detected = await adapter.detect()
      const path = override ?? detected
      return {
        kind: adapter.kind,
        label: adapter.label,
        path,
        detected: detected !== null,
        source: override ? 'override' : detected ? 'detected' : 'none'
      } satisfies DestinationInfo
    })
  )
}
