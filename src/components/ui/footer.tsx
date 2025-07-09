import { author } from '@/../package.json'
import { ANALYTICS_EVENTS, trackEvent } from '@/core/analytics'
import { HeartPlus } from 'lucide-react'
import React from 'react'
import { SettingsDrawer } from './settings-drawer'

interface FooterProps {
  context: 'onboarding' | 'options_page' | 'sidepanel' | 'popup'
  className?: string
  showSettings?: boolean
  onResetSystemPresets?: () => void
  debugMode?: boolean
  onDebugModeChange?: (enabled: boolean) => void
}

export const Footer: React.FC<FooterProps> = ({
  context,
  className = '',
  showSettings = false,
  onResetSystemPresets,
  debugMode = false,
  onDebugModeChange,
}) => {
  const footerContent = (
    <span className="flex items-center gap-2">
      Made by{' '}
      <a
        className="underline hover:text-primary"
        href={`https://www.linkedin.com/in/kubaserafinowski/?utm_source=scrape-similar-extension&utm_campaign=chrome-${context}`}
        target="_blank"
        rel="noopener"
        onClick={(e) =>
          trackEvent(ANALYTICS_EVENTS.AUTHOR_LINK_CLICKED, {
            context,
            url: e.currentTarget.href,
          })
        }
      >
        {author}
      </a>
      <a
        className="hover:scale-110 transition-transform"
        href={`https://ko-fi.com/kubaserafinowski?utm_source=scrape-similar-extension&utm_campaign=chrome-${context}`}
        target="_blank"
        rel="noopener"
        aria-label="Support Kuba Serafinowski on Ko-fi"
        onClick={(e) =>
          trackEvent(ANALYTICS_EVENTS.SUPPORT_ICON_CLICKED, {
            context,
            url: e.currentTarget.href,
          })
        }
      >
        <HeartPlus className="size-4 text-red-500 hover:text-red-600 stroke-3" />
      </a>
    </span>
  )

  if (showSettings) {
    return (
      <footer
        className={`sticky bottom-0 left-0 w-full z-40 bg-background border-t border-border flex items-center justify-between px-4 h-12 text-sm font-medium text-muted-foreground ${className}`}
        data-slot="footer"
      >
        {footerContent}
        <SettingsDrawer
          onResetSystemPresets={onResetSystemPresets}
          debugMode={debugMode}
          onDebugModeChange={onDebugModeChange}
        />
      </footer>
    )
  }

  return (
    <footer className={`py-4 border-t border-border bg-background ${className}`}>
      <div className="flex items-center justify-center text-sm text-muted-foreground">
        {footerContent}
      </div>
    </footer>
  )
}
