import { useEffect } from 'react'
import { defaultDestination } from '@shared/destinationRules'
import { parseModelRef } from '@shared/modelRef'
import { useDownloadsStore } from './lib/downloadsStore'
import { useDragStore, type DragModel } from './lib/dragStore'
import { useDestinations, useInvalidate } from './lib/queries'
import { useTheme } from './lib/useTheme'
import { useDropDownload } from './lib/useDropDownload'
import { useUiStore, type View } from './lib/uiStore'
import { TooltipProvider } from './components/ui/tooltip'
import { DownloadsDock } from './components/app/DownloadsDock'
import { LinkDropOverlay } from './components/app/LinkDropOverlay'
import { Sidebar } from './components/app/Sidebar'
import { Toasts } from './components/app/Toasts'
import { TopBar } from './components/app/TopBar'
import { BrowseView } from './views/BrowseView'
import { DownloadsView } from './views/DownloadsView'
import { ModelDetailView } from './views/ModelDetailView'
import { PrivateInferenceView } from './views/PrivateInferenceView'
import { SettingsView } from './views/SettingsView'

export default function App() {
  const view = useUiStore((s) => s.view)
  const dropDownload = useDropDownload()
  const { data: destinations } = useDestinations()
  const invalidate = useInvalidate()
  useTheme()

  useEffect(() => {
    void useDownloadsStore.getState().hydrate()
    const unsubscribe = window.hfgui.onDownloadEvent((ev) =>
      useDownloadsStore.getState().applyEvent(ev)
    )
    return unsubscribe
  }, [])

  // Hooks for driving the app in e2e tests. Each one calls the same code path
  // the UI does, so a passing test means the real flow works.
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__hfguiTest = {
      openModel: (id: string) => useUiStore.getState().openModel(id),
      setView: (v: View) => useUiStore.getState().setView(v),
      getJobs: () => useDownloadsStore.getState().jobs,
      getUi: () => {
        const { view: v, selectedModelId, search, dockExpanded } = useUiStore.getState()
        return { view: v, selectedModelId, search, dockExpanded }
      },
      openRef: (text: string) => {
        const ref = parseModelRef(text)
        if (ref) useUiStore.getState().openModel(ref.repoId)
        return !!ref
      },
      beginDrag: (model: DragModel) => useDragStore.getState().begin(model),
      getDragModel: () => useDragStore.getState().model,
      // For drivers that change settings over IPC behind the UI's back.
      refreshSettings: () => invalidate(['settings']),
      endDrag: () => useDragStore.getState().end(),
      dropModel: async (model: DragModel, kind?: string) => {
        if (!destinations) return
        const target = kind
          ? destinations.find((d) => d.kind === kind)
          : defaultDestination(model.format, destinations)
        if (target) await dropDownload(model, target)
      }
    }
  }, [destinations, dropDownload, invalidate])

  return (
    <TooltipProvider>
      <div className="ambient" />
      <div className="relative z-10 flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            {/* min-h-0 lets each view's own scroll container shrink for the dock */}
            <div className="min-h-0 flex-1">
              {view === 'browse' && <BrowseView />}
              {view === 'downloads' && <DownloadsView />}
              {view === 'private-inference' && <PrivateInferenceView />}
              {view === 'settings' && <SettingsView />}
            </div>
            <DownloadsDock />
          </main>
        </div>
      </div>
      <ModelDetailView />
      <LinkDropOverlay />
      <Toasts />
    </TooltipProvider>
  )
}
