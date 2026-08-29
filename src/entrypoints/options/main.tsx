import '@/assets/tailwind.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import OptionsApp from '@/entrypoints/options/OptionsApp'
import { ExtensionPageRoot, mountExtensionPage } from '@/components/extension-page'

mountExtensionPage(
  'root',
  <ExtensionPageRoot>
    <TooltipProvider>
      <OptionsApp />
    </TooltipProvider>
  </ExtensionPageRoot>,
)
