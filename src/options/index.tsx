import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import '@/styles/global.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import OptionsApp from './OptionsApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PostHogWrapper>
        <OptionsApp />
      </PostHogWrapper>
    </ThemeProvider>
  </React.StrictMode>,
)
