import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { queryClient } from './lib/queryClient'
import { applyThemeClass } from './lib/useTheme'
import './styles/globals.css'

// Apply the theme class before first paint; useTheme keeps it in sync after.
applyThemeClass()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
