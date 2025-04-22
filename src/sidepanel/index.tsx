import { ThemeProvider } from '@/components/theme-provider'
import SidePanel from '@/sidepanel/SidePanel'
import '@/styles/global.css'
import { createRoot } from 'react-dom/client'

// Get the root element
const appElement = document.getElementById('app')
if (!appElement) {
  console.error('Root element not found')
} else {
  // Create React root and render
  const root = createRoot(appElement)
  root.render(
    <ThemeProvider>
      <SidePanel />
    </ThemeProvider>,
  )
}
