import '@/assets/tailwind.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import OptionsApp from '@/entrypoints/options/OptionsApp'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConsentProvider>
        <PostHogWrapper>
          <TooltipProvider>
            <OptionsApp />
          </TooltipProvider>
        </PostHogWrapper>
      </ConsentProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
