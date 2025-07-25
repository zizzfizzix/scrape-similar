import '@/assets/tailwind.css'
import OnboardingApp from '@/entrypoints/onboarding/OnboardingApp'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConsentProvider>
        <PostHogWrapper>
          <OnboardingApp />
        </PostHogWrapper>
      </ConsentProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
