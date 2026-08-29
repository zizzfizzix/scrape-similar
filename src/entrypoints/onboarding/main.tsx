import '@/assets/tailwind.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import OnboardingApp from '@/entrypoints/onboarding/OnboardingApp'
import { ExtensionPageRoot, mountExtensionPage } from '@/components/extension-page'

mountExtensionPage(
  'root',
  <ExtensionPageRoot>
    <TooltipProvider>
      <OnboardingApp />
    </TooltipProvider>
  </ExtensionPageRoot>,
)
