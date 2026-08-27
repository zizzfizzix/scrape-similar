import { startContentScript } from '@/entrypoints/content/bootstrap'
import log from 'loglevel'

log.setDefaultLevel('error')

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  main(ctx) {
    startContentScript(ctx)
  },
})
