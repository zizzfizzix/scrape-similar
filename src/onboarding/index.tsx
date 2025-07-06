import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '../components/theme-provider'
import '../styles/global.css'
import OnboardingApp from './OnboardingApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <OnboardingApp />
    </ThemeProvider>
  </React.StrictMode>,
)
