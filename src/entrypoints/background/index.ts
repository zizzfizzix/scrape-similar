/**
 * Background service worker entry point.
 *
 * Everything it wires up lives in `bootstrap.ts`, which unit tests cover; this
 * file is only the `defineBackground` wrapper and the default log level.
 */

import { startBackground } from '@/entrypoints/background/bootstrap'
import log from 'loglevel'

log.setDefaultLevel('error')

export default defineBackground(() => {
  startBackground()
})
