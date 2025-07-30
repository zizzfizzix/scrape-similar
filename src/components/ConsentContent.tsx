import { Separator } from '@/components/ui/separator'
import { DatabaseIcon, EyeOffIcon, SlidersHorizontalIcon } from 'lucide-react'
import React from 'react'

export const ConsentContent: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <DatabaseIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">What we collect</p>
            <p className="text-sm text-muted-foreground">
              Anonymous usage statistics to understand how you use the extension and improve
              features
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <EyeOffIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">What we don't collect</p>
            <p className="text-sm text-muted-foreground">
              No personal information, browsing history, or scraped data is ever collected
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <SlidersHorizontalIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Your choice</p>
            <p className="text-sm text-muted-foreground">
              You can change this preference anytime in the extension settings
            </p>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg">
        <p className="text-sm text-muted-foreground">
          By accepting, you help us understand which features are most useful and identify areas for
          improvement. All data is processed anonymously through PostHog analytics.
        </p>
      </div>
      <Separator />
      <p className="text-sm text-muted-foreground">
        Read our full{' '}
        <a
          className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          href="https://digitall.studio/scrape-similar-privacy-policy.md"
          target="_blank"
          rel="noopener"
        >
          privacy policy
        </a>
      </p>
    </div>
  )
}
