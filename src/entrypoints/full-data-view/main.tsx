import '@/assets/tailwind.css'
import { ExtensionPageRoot, mountExtensionPage } from '@/components/extension-page'
import { FullDataViewApp } from '@/entrypoints/full-data-view/FullDataViewApp'

mountExtensionPage(
  'root',
  <ExtensionPageRoot>
    <FullDataViewApp />
  </ExtensionPageRoot>,
)
