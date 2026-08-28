import '@/assets/tailwind.css'
import { SidePanelRoot } from '@/entrypoints/sidepanel/SidePanelRoot'
import log from 'loglevel'
import { createRoot } from 'react-dom/client'

log.setDefaultLevel('error')

// Get the root element
const appElement = document.getElementById('app')
if (!appElement) {
  log.error('Root element not found')
} else {
  // Create React root and render
  const root = createRoot(appElement)
  root.render(
    <ConsentProvider>
      <PostHogWrapper>
        <SidePanelRoot />
      </PostHogWrapper>
    </ConsentProvider>,
  )
}
