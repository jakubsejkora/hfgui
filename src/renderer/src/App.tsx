import { useEffect } from 'react'
import { useDownloadsStore } from './lib/downloadsStore'
import { useTheme } from './lib/useTheme'
import { useUiStore, type View } from './lib/uiStore'
import { TooltipProvider } from './components/ui/tooltip'
import { Sidebar } from './components/app/Sidebar'
import { Toasts } from './components/app/Toasts'
import { BrowseView } from './views/BrowseView'
import { DownloadsView } from './views/DownloadsView'
import { ModelDetailView } from './views/ModelDetailView'
import { PrivateInferenceView } from './views/PrivateInferenceView'
import { SettingsView } from './views/SettingsView'

export default function App() {
  const view = useUiStore((s) => s.view)
  useTheme()

  useEffect(() => {
    void useDownloadsStore.getState().hydrate()
    const unsubscribe = window.hfgui.onDownloadEvent((ev) =>
      useDownloadsStore.getState().applyEvent(ev)
    )
    return unsubscribe
  }, [])

  // Hooks for driving the app in e2e tests.
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__hfguiTest = {
      openModel: (id: string) => useUiStore.getState().openModel(id),
      setView: (v: View) => useUiStore.getState().setView(v),
      getJobs: () => useDownloadsStore.getState().jobs
    }
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-full">
        <Sidebar />
        <main className="relative min-w-0 flex-1">
          {/* thin strip so the window can be dragged from the top edge */}
          <div className="drag-region absolute inset-x-0 top-0 z-30 h-5" />
          {view === 'browse' && <BrowseView />}
          {view === 'downloads' && <DownloadsView />}
          {view === 'private-inference' && <PrivateInferenceView />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>
      <ModelDetailView />
      <Toasts />
    </TooltipProvider>
  )
}
