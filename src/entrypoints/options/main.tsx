import '@/assets/tailwind.css'
import OptionsApp from '@/entrypoints/options/OptionsApp'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConsentProvider>
        <PostHogWrapper>
          <OptionsApp />
        </PostHogWrapper>
      </ConsentProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
