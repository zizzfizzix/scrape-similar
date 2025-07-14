import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import OnboardingApp from '@/onboarding/OnboardingApp'
import '@/styles/global.css'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PostHogWrapper>
        <OnboardingApp />
      </PostHogWrapper>
    </ThemeProvider>
  </React.StrictMode>,
)
