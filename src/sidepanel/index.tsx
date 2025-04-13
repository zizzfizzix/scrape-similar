import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SidePanel from './SidePanel'

console.log('Sidepanel script loading...')

// Get the root element
const appElement = document.getElementById('app')
if (!appElement) {
  console.error('Root element not found')
} else {
  // Create React root and render
  const root = createRoot(appElement)
  root.render(<SidePanel />)
  console.log('React app rendered in sidepanel')
}
