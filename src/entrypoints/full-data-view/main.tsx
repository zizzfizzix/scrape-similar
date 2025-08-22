import '@/assets/tailwind.css'
import { ThemeProvider } from '@/components/theme-provider'
import FullDataViewApp from '@/entrypoints/full-data-view/FullDataViewApp'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system">
      <FullDataViewApp />
    </ThemeProvider>
  </React.StrictMode>,
)
