import { ConsentProvider } from '@/components/consent-provider'
import { PostHogWrapper } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Outlet } from '@tanstack/react-router'
import React from 'react'

const RootLayout: React.FC = () => {
  return (
    <ThemeProvider>
      <ConsentProvider>
        <PostHogWrapper>
          <Outlet />
        </PostHogWrapper>
      </ConsentProvider>
    </ThemeProvider>
  )
}

export default RootLayout
