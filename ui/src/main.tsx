import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyTheme, useThemeStore } from './store/theme'

// Apply stored theme immediately to prevent flash
// The HTML starts with class="dark", this syncs with persisted preference
const storedTheme = useThemeStore.getState().theme
applyTheme(storedTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
