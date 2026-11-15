import { useEffect, useRef, type CSSProperties } from 'react'
import { defaultDestination } from '@shared/destinationRules'
import { parseModelRef } from '@shared/modelRef'
import { useDownloadsStore } from './lib/downloadsStore'
import { useDragStore, type DragModel } from './lib/dragStore'
import { usePrefs } from './lib/prefsStore'
import { useDestinations, useInvalidate } from './lib/queries'
import { ScrollRootContext } from './lib/scrollRoot'
import { useDropDownload } from './lib/useDropDownload'
import { useGlobalShortcuts } from './lib/useGlobalShortcuts'
import { useTheme } from './lib/useTheme'
import { useUiStore, type View } from './lib/uiStore'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { TooltipProvider } from './components/ui/tooltip'
import { AppSidebar } from './components/app/AppSidebar'
import { CancelDownloadDialog } from './components/app/CancelDownloadDialog'
import { DownloadsDock } from './components/app/DownloadsDock'
import { LinkDropOverlay } from './components/app/LinkDropOverlay'
import { SiteHeader } from './components/app/SiteHeader'
import { Toasts } from './components/app/Toasts'
import { TokenDialog } from './components/app/TokenDialog'
import { BrowseView } from './views/BrowseView'
import { DownloadsView } from './views/DownloadsView'
import { ModelDetailView } from './views/ModelDetailView'
import { OverviewView } from './views/OverviewView'
import { PrivateInferenceView } from './views/PrivateInferenceView'
import { SettingsView } from './views/SettingsView'

export default function App() {
  const view = useUiStore((s) => s.view)
  const sidebarOpen = usePrefs((s) => s.sidebarOpen)
  const setPrefs = usePrefs((s) => s.set)
  const dropDownload = useDropDownload()
  const { data: destinations } = useDestinations()
  const invalidate = useInvalidate()
  const scrollRoot = useRef<HTMLDivElement>(null)
  useTheme()
  useGlobalShortcuts()

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
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={(open) => setPrefs({ sidebarOpen: open })}
        className="h-svh overflow-hidden"
        style={{ '--sidebar-width': '15rem' } as CSSProperties}
      >
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">
          <SiteHeader />
          <ScrollRootContext.Provider value={scrollRoot}>
            {/* One scroll container per page visit (keyed), so each page starts at
                the top and Browse can restore its own position. */}
            <div key={view} ref={scrollRoot} className="min-h-0 flex-1 overflow-y-auto">
              {view === 'overview' && <OverviewView />}
              {view === 'browse' && <BrowseView />}
              {view === 'downloads' && <DownloadsView />}
              {view === 'private-inference' && <PrivateInferenceView />}
              {view === 'settings' && <SettingsView />}
            </div>
          </ScrollRootContext.Provider>
          <DownloadsDock />
        </SidebarInset>
      </SidebarProvider>
      <ModelDetailView />
      <TokenDialog />
      <CancelDownloadDialog />
      <LinkDropOverlay />
      <Toasts />
    </TooltipProvider>
  )
}
