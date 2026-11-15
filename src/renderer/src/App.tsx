import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, type CSSProperties } from 'react'
import { defaultDestination } from '@shared/destinationRules'
import { parseModelRef } from '@shared/modelRef'
import type { AppUpdateStatus, SystemInfo } from '@shared/types'
import { announceTransition } from './lib/announce'
import { applyAppUpdate } from './lib/appUpdate'
import { useDownloadsStore } from './lib/downloadsStore'
import { useDragStore, type DragModel } from './lib/dragStore'
import { usePrefs } from './lib/prefsStore'
import { useDestinations, useInvalidate, useSettings } from './lib/queries'
import { ScrollRootContext } from './lib/scrollRoot'
import { useDropDownload } from './lib/useDropDownload'
import { useGlobalShortcuts } from './lib/useGlobalShortcuts'
import { useTheme } from './lib/useTheme'
import { useUiStore, type View } from './lib/uiStore'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { TooltipProvider } from './components/ui/tooltip'
import { AppSidebar } from './components/app/AppSidebar'
import { RestartDialog } from './components/app/AppUpdate'
import { ConfirmDownloadDialog } from './components/app/ConfirmDownloadDialog'
import { DownloadsDock } from './components/app/DownloadsDock'
import { ErrorBoundary } from './components/app/ErrorBoundary'
import { LinkDropOverlay } from './components/app/LinkDropOverlay'
import { Onboarding } from './components/app/Onboarding'
import { SiteHeader } from './components/app/SiteHeader'
import { Toasts } from './components/app/Toasts'
import { TokenDialog } from './components/app/TokenDialog'
import { UpdateDialog } from './components/app/UpdateDialog'
import { BrowseView } from './views/BrowseView'
import { DiscoverView } from './views/DiscoverView'
import { DownloadsView } from './views/DownloadsView'
import { GuideView } from './views/GuideView'
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
  const { data: settings, isError: settingsFailed } = useSettings()
  const invalidate = useInvalidate()
  const queryClient = useQueryClient()
  const scrollRoot = useRef<HTMLDivElement>(null)
  useTheme()
  useGlobalShortcuts()

  useEffect(() => {
    void useDownloadsStore.getState().hydrate()
    // Disk usage changes whenever a download changes state; refresh it once a burst settles.
    let storageTimer: ReturnType<typeof setTimeout> | null = null
    const refreshStorage = (): void => {
      if (storageTimer) clearTimeout(storageTimer)
      storageTimer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['storage-report'] }), 800)
    }
    const unsubscribe = window.hfgui.onDownloadEvent((ev) => {
      if (ev.type === 'updates') {
        void queryClient.invalidateQueries({ queryKey: ['updates'] })
        return
      }
      const store = useDownloadsStore.getState()
      const previous = ev.type === 'state' ? store.jobs[ev.jobId]?.state : undefined
      store.applyEvent(ev)
      if (ev.type === 'state') announceTransition(previous, ev.snapshot)
      if (ev.type !== 'progress') refreshStorage()
    })
    // A notification click (or anything else in main) can ask for a page.
    const stopNavigate = window.hfgui.onNavigate((target) => {
      const ui = useUiStore.getState()
      ui.closeModel()
      ui.setView(target)
    })
    // hfgui's own updates: main reports every step of a check and download.
    const stopAppUpdate = window.hfgui.onAppUpdate(applyAppUpdate)
    return () => {
      unsubscribe()
      stopNavigate()
      stopAppUpdate()
      if (storageTimer) clearTimeout(storageTimer)
    }
  }, [queryClient])

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
      // Show an app-update state without a release to update to (screenshots).
      setAppUpdate: (status: AppUpdateStatus) => applyAppUpdate(status),
      // See hfgui as on a Mac with this much memory (fit hints, Discover's picks).
      setMemoryGB: (gb: number) =>
        queryClient.setQueryData<SystemInfo>(['system-info'], (info) =>
          info ? { ...info, totalMemoryBytes: gb * 1024 ** 3 } : info
        ),
      endDrag: () => useDragStore.getState().end(),
      dropModel: async (model: DragModel, kind?: string) => {
        if (!destinations) return
        const target = kind
          ? destinations.find((d) => d.kind === kind)
          : defaultDestination(model.format, destinations, settings?.preferredDestination ?? null)
        if (target) await dropDownload(model, target)
      }
    }
  }, [destinations, settings, dropDownload, invalidate, queryClient])

  // First run: the welcome replaces the app until it's done. Settings are a
  // local read; until they arrive, show nothing rather than the wrong screen.
  if (!settings && !settingsFailed) return <div className="h-svh bg-background" />
  if (settings && !settings.onboarded) {
    return (
      <TooltipProvider>
        <Onboarding />
        <TokenDialog />
        <Toasts />
      </TooltipProvider>
    )
  }

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
              <ErrorBoundary onHome={() => useUiStore.getState().setView('overview')}>
                {view === 'overview' && <OverviewView />}
                {view === 'discover' && <DiscoverView />}
                {view === 'browse' && <BrowseView />}
                {view === 'downloads' && <DownloadsView />}
                {view === 'private-inference' && <PrivateInferenceView />}
                {view === 'guide' && <GuideView />}
                {view === 'settings' && <SettingsView />}
              </ErrorBoundary>
            </div>
          </ScrollRootContext.Provider>
          <DownloadsDock />
        </SidebarInset>
      </SidebarProvider>
      <ModelDetailView />
      <TokenDialog />
      <ConfirmDownloadDialog />
      <UpdateDialog />
      <RestartDialog />
      <LinkDropOverlay />
      <Toasts />
    </TooltipProvider>
  )
}
