import '@/assets/tailwind.css'
import FullDataViewApp from '@/entrypoints/full-data-view/FullDataViewApp'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system">
      <ConsentProvider>
        <PostHogWrapper>
          <FullDataViewApp />
        </PostHogWrapper>
      </ConsentProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
