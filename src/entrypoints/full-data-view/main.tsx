import '@/assets/tailwind.css'
import FullDataViewApp from '@/entrypoints/full-data-view/FullDataViewApp'
import { ExtensionPageRoot, mountExtensionPage } from '@/components/extension-page'

mountExtensionPage(
  'root',
  <ExtensionPageRoot>
    <FullDataViewApp />
  </ExtensionPageRoot>,
)
