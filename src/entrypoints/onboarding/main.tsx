import '@/assets/tailwind.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import OnboardingApp from '@/entrypoints/onboarding/OnboardingApp'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConsentProvider>
        <PostHogWrapper>
          <TooltipProvider>
            <OnboardingApp />
          </TooltipProvider>
        </PostHogWrapper>
      </ConsentProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
