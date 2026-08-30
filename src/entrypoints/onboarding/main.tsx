import '@/assets/tailwind.css'
import { ExtensionPageRoot, mountExtensionPage } from '@/components/extension-page'
import { TooltipProvider } from '@/components/ui/tooltip'
import { OnboardingApp } from '@/entrypoints/onboarding/OnboardingApp'

mountExtensionPage(
  'root',
  <ExtensionPageRoot>
    <TooltipProvider>
      <OnboardingApp />
    </TooltipProvider>
  </ExtensionPageRoot>,
)
