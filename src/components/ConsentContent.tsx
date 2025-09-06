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
            <p className="font-medium">{i18n.t('whatWeCollect')}</p>
            <p className="text-sm text-muted-foreground">{i18n.t('whatWeCollectDesc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <EyeOffIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{i18n.t('whatWeDontCollect')}</p>
            <p className="text-sm text-muted-foreground">{i18n.t('whatWeDontCollectDesc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <SlidersHorizontalIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{i18n.t('yourChoice')}</p>
            <p className="text-sm text-muted-foreground">{i18n.t('yourChoiceDesc')}</p>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg">
        <p className="text-sm text-muted-foreground">{i18n.t('consentExplanation')}</p>
      </div>
      <Separator />
      <p className="text-sm text-muted-foreground">
        {i18n.t('readFullPrivacyPolicy')}{' '}
        <a
          className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          href="https://digitall.studio/scrape-similar-privacy-policy.md"
          target="_blank"
          rel="noopener"
        >
          {i18n.t('privacyPolicy')}
        </a>
      </p>
    </div>
  )
}
