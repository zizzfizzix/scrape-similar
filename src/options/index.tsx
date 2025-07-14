import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import OptionsApp from '@/options/OptionsApp'
import '@/styles/global.css'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PostHogWrapper>
        <OptionsApp />
      </PostHogWrapper>
    </ThemeProvider>
  </React.StrictMode>,
)
