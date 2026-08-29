import '@/assets/tailwind.css'
import { mountExtensionPage } from '@/components/extension-page'
import { SidePanelRoot } from '@/entrypoints/sidepanel/SidePanelRoot'
import log from 'loglevel'

log.setDefaultLevel('error')

// `SidePanelRoot` brings its own theme provider, so this stack stops short of
// one; see the note on `ExtensionPageRoot`.
mountExtensionPage(
  'app',
  <ConsentProvider>
    <PostHogWrapper>
      <SidePanelRoot />
    </PostHogWrapper>
  </ConsentProvider>,
)
