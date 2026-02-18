import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { author } from '@@/package.json' with { type: 'json' }
import { HeartPlus, MessageSquare } from 'lucide-react'
import React from 'react'

interface FooterProps {
  className?: string
  showSettings?: boolean
  onResetSystemPresets?: () => void
  onPresetsImported?: () => void
  debugMode?: boolean
  onDebugModeChange?: (enabled: boolean) => void
}

export const Footer: React.FC<FooterProps> = ({
  className = '',
  showSettings = false,
  onResetSystemPresets,
  onPresetsImported,
  debugMode = false,
  onDebugModeChange,
}) => {
  const context = getCurrentContext()

  const footerContent = (
    <div className="flex items-center gap-2">
      Made by{' '}
      <a
        className="underline hover:text-primary"
        href={`https://www.linkedin.com/in/kubaserafinowski/?utm_source=scrape-similar-extension&utm_campaign=${import.meta.env.BROWSER}-${context}`}
        target="_blank"
        rel="noopener"
        onClick={(e) =>
          trackEvent(ANALYTICS_EVENTS.AUTHOR_LINK_PRESS, {
            url: e.currentTarget.href,
          })
        }
      >
        {author}
      </a>
      <a
        className="hover:scale-110 transition-transform"
        href={`https://ko-fi.com/kubaserafinowski?utm_source=scrape-similar-extension&utm_campaign=${import.meta.env.BROWSER}-${context}`}
        target="_blank"
        rel="noopener"
        aria-label="Support Kuba Serafinowski on Ko-fi"
        onClick={(e) =>
          trackEvent(ANALYTICS_EVENTS.SUPPORT_ICON_PRESS, {
            url: e.currentTarget.href,
          })
        }
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <HeartPlus className="size-4 text-red-500 hover:text-red-600 stroke-3" />
          </TooltipTrigger>
          <TooltipContent>Support</TooltipContent>
        </Tooltip>
      </a>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" id="feedback-button" aria-label="Provide feedback">
            <MessageSquare className="size-4 text-primary hover:text-primary/80 stroke-2" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Feedback</TooltipContent>
      </Tooltip>
    </div>
  )

  if (showSettings) {
    return (
      <footer
        className={`sticky bottom-0 left-0 w-full z-40 bg-background border-t border-border flex items-center justify-between px-4 h-12 text-sm font-medium text-muted-foreground anchor/footer ${className}`}
        data-slot="footer"
      >
        {footerContent}
        <SettingsDrawer
          onResetSystemPresets={onResetSystemPresets}
          onPresetsImported={onPresetsImported}
          debugMode={debugMode}
          onDebugModeChange={onDebugModeChange}
        />
      </footer>
    )
  }

  return (
    <footer
      className={`sticky bottom-0 left-0 w-full z-40 bg-background border-t border-border flex items-center justify-center py-4 text-sm text-muted-foreground anchor/footer ${className}`}
    >
      {footerContent}
    </footer>
  )
}
