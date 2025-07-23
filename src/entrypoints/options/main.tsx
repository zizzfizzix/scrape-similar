import '@/assets/tailwind.css'
import OptionsApp from '@/entrypoints/options/OptionsApp'
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
