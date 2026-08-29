/**
 * Background service worker entry point.
 *
 * Everything it wires up lives in `bootstrap.ts`, which unit tests cover; this
 * file is only the `defineBackground` wrapper and the default log level.
 */

import { startBackground } from '@/entrypoints/background/bootstrap'
import log from 'loglevel'

// Set default log level
log.setDefaultLevel('error')

// Called rather than passed by reference: WXT strips this body when it imports
// the entrypoint to read its config, and a bare reference would keep the whole
// bootstrap graph alive through that pass.
export default defineBackground(() => {
  startBackground()
})
