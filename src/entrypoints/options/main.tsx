import '@/assets/tailwind.css'
import { ExtensionPageRoot, mountExtensionPage } from '@/components/extension-page'
import { TooltipProvider } from '@/components/ui/tooltip'
import { OptionsApp } from '@/entrypoints/options/OptionsApp'

mountExtensionPage(
  'root',
  <ExtensionPageRoot>
    <TooltipProvider>
      <OptionsApp />
    </TooltipProvider>
  </ExtensionPageRoot>,
)
