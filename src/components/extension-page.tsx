import log from 'loglevel'
import React, { type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Putting an extension page on screen.
 *
 * Split out of the `main.tsx` entrypoints so the provider stack the pages share
 * — and the case where the page's root element is missing — can be exercised
 * without a real extension page. The entrypoints keep only the call.
 */

/**
 * The providers every full extension page is wrapped in.
 *
 * The side panel composes its own: `SidePanelRoot` supplies the theme, so
 * nesting a second `ThemeProvider` above it would give two of them a claim on
 * the document's theme classes.
 */
export const ExtensionPageRoot: React.FC<{ children: ReactNode }> = ({ children }) => (
  <React.StrictMode>
    <ThemeProvider>
      <ConsentProvider>
        <PostHogWrapper>{children}</PostHogWrapper>
      </ConsentProvider>
    </ThemeProvider>
  </React.StrictMode>
)

/**
 * Render `ui` into the element with id `rootElementId`.
 *
 * Reports a missing root rather than throwing: an extension page whose HTML has
 * drifted should leave a diagnosable log, not an unhandled error in a context
 * with no console anyone is watching.
 */
export const mountExtensionPage = (rootElementId: string, ui: ReactNode): Root | null => {
  const container = document.getElementById(rootElementId)
  if (!container) {
    log.error(`Root element #${rootElementId} not found`)
    return null
  }

  const root = createRoot(container)
  root.render(ui)
  return root
}
