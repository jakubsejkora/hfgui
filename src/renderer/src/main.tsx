import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/app/ErrorBoundary'
import { queryClient } from './lib/queryClient'
import { applyThemeClass } from './lib/useTheme'
import './styles/globals.css'

// Apply the theme class before first paint; useTheme keeps it in sync after.
applyThemeClass()

// Continuous animations (the live pulse) only run while hfgui is the focused
// window; see .live-dot in globals.css.
const syncFocus = (): void => {
  document.documentElement.toggleAttribute('data-window-blurred', !document.hasFocus())
}
window.addEventListener('focus', syncFocus)
window.addEventListener('blur', syncFocus)
syncFocus()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Last resort: never leave an empty window. Pages have their own boundary. */}
      <ErrorBoundary fullscreen>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
)
