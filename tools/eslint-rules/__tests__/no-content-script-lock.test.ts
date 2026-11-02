import { noContentScriptLock } from '@@/tools/eslint-rules/no-content-script-lock.ts'
import { Linter, RuleTester } from 'eslint'
import path from 'node:path'
import tseslint from 'typescript-eslint'
import { beforeAll } from 'vitest'

// A typed rule needs a program, so the code under test is linted as one of the
// fixture files, against modules that exist on disk beside it.
const FIXTURES = path.join(import.meta.dirname, 'fixtures/content-script-lock')
const CONTENT = path.join(FIXTURES, 'content.ts')
const VIEW = path.join(FIXTURES, 'view.tsx')

const ROUTE_BOUNDARY = {
  boundaries: [
    {
      module: path.join(FIXTURES, 'helpers.ts'),
      name: 'route',
      reason: 'takes the lock only outside a content script',
    },
  ],
}

const LANGUAGE_OPTIONS = {
  parser: tseslint.parser,
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: FIXTURES,
    // Under `CI`, typescript-eslint assumes a one-shot lint and builds the
    // program from disk, where the fixture holds none of the code under test.
    disallowAutomaticSingleRunInference: true,
  },
}

// Building the program has run past the 5 s `testTimeout` under coverage on a
// loaded machine. typescript-estree caches it per tsconfig, so building it here
// keeps that cost out of the first case.
const PROGRAM_BUILD_TIMEOUT_MS = 60_000

beforeAll(() => {
  const config = { files: ['**/*.ts'], languageOptions: LANGUAGE_OPTIONS }
  // A config that does not match the file skips the parse with a warning.
  const messages = new Linter().verify('', config, CONTENT)
  if (messages.length > 0) {
    throw new Error(`program build failed: ${JSON.stringify(messages)}`)
  }
}, PROGRAM_BUILD_TIMEOUT_MS)

const ruleTester = new RuleTester({ languageOptions: LANGUAGE_OPTIONS })

const chain = (name: string, ...rest: string[]) => ({
  messageId: 'reachesLock',
  data: { name, chain: [...rest, 'locks'].join(' → ') },
})

ruleTester.run('no-content-script-lock', noContentScriptLock, {
  valid: [
    { filename: CONTENT, code: "import { pure } from './helpers'\npure(1)" },
    // Library code is not walked: `navigator` itself is no lock.
    { filename: CONTENT, code: 'export const agent = navigator.userAgent' },
    // A local declaration is linted in place, not walked.
    { filename: CONTENT, code: 'const local = (): number => 1\nlocal()' },
    { filename: CONTENT, code: "import { ping } from './helpers'\nping(3)" },
    // The walk stops at a boundary, so neither it nor its callers are reported.
    {
      filename: CONTENT,
      code: "import { route } from './helpers'\nroute(true)",
      options: [ROUTE_BOUNDARY],
    },
    {
      filename: CONTENT,
      code: "import { viaRoute } from './helpers'\nviaRoute()",
      options: [ROUTE_BOUNDARY],
    },
    { filename: CONTENT, code: 'autoRoute(true)', options: [ROUTE_BOUNDARY] },
    { filename: CONTENT, code: 'autoPure(1)' },
    // A type that names a lock-taking function is not a call to it.
    {
      filename: CONTENT,
      code: "import type { saveThing } from './helpers'\nexport type T = typeof saveThing",
    },
  ],
  invalid: [
    {
      filename: CONTENT,
      code: "import { saveThing } from './helpers'\nsaveThing()",
      errors: [chain('saveThing', 'saveThing', 'withLock')],
    },
    {
      filename: CONTENT,
      code: "import { withLock } from './lock'\nwithLock('k', async () => {})",
      errors: [chain('withLock', 'withLock')],
    },
    {
      // The content script's own reference to the lock.
      filename: CONTENT,
      code: 'navigator.locks.query()',
      errors: [chain('locks')],
    },
    {
      // A reference is enough; the walk does not need to see a call.
      filename: CONTENT,
      code: "import { saveThing } from './helpers'\nexport const later = saveThing",
      errors: [chain('saveThing', 'saveThing', 'withLock')],
    },
    {
      filename: CONTENT,
      code: "import * as helpers from './helpers'\nhelpers.saveThing()",
      errors: [chain('saveThing', 'saveThing', 'withLock')],
    },
    {
      // A WXT auto-import, declared in a `.d.ts` with no import statement.
      filename: CONTENT,
      code: 'autoSaveThing()',
      errors: [chain('autoSaveThing', 'saveThing', 'withLock')],
    },
    {
      // Without the boundary, the branch that takes the lock is reported.
      filename: CONTENT,
      code: "import { viaRoute } from './helpers'\nviaRoute()",
      errors: [chain('viaRoute', 'viaRoute', 'route', 'saveThing', 'withLock')],
    },
    {
      // `inCycle` is first met half-walked, inside `enterCycle`; that miss must
      // not be cached as lock-free.
      filename: CONTENT,
      code: "import { enterCycle, inCycle } from './helpers'\nenterCycle(1)\ninCycle(1)",
      errors: [
        chain('enterCycle', 'enterCycle', 'saveThing', 'withLock'),
        chain('inCycle', 'inCycle', 'enterCycle', 'saveThing', 'withLock'),
      ],
    },
    {
      // Inside a local declaration, the reference is reported where it appears.
      filename: CONTENT,
      code: "import { saveThing } from './helpers'\nconst run = () => saveThing()\nrun()",
      errors: [chain('saveThing', 'saveThing', 'withLock')],
    },
    {
      filename: VIEW,
      code: "import { Banner } from './components'\nexport const view = <Banner />",
      errors: [chain('Banner', 'Banner', 'saveThing', 'withLock')],
    },
    {
      // An auto-import whose export carries a type annotation: the walk follows
      // the import type's qualifier, not the annotated type.
      filename: CONTENT,
      code: 'autoTypedSave()',
      errors: [chain('autoTypedSave', 'typedSave', 'saveThing', 'withLock')],
    },
    {
      filename: VIEW,
      code: 'export const view = <AutoFcBanner />',
      errors: [chain('AutoFcBanner', 'FcBanner', 'saveThing', 'withLock')],
    },
    {
      filename: CONTENT,
      code: "import { saveThing } from './helpers'\nexport const handlers = { saveThing }",
      errors: [chain('saveThing', 'saveThing', 'withLock')],
    },
    {
      filename: CONTENT,
      code: "import { actions } from './helpers'\nactions.saveThing()",
      errors: [chain('actions', 'actions', 'saveThing', 'withLock')],
    },
    {
      // A `LockManager` method counts however the manager was reached.
      filename: CONTENT,
      code: "import { destructured, indexed } from './helpers'\ndestructured()\nindexed()",
      errors: [
        { messageId: 'reachesLock', data: { name: 'destructured', chain: 'destructured → locks' } },
        { messageId: 'reachesLock', data: { name: 'indexed', chain: 'indexed → query' } },
      ],
    },
    {
      filename: CONTENT,
      code: 'const { locks } = navigator\nlocks.query()',
      errors: [
        { messageId: 'reachesLock', data: { name: 'locks', chain: 'locks' } },
        { messageId: 'reachesLock', data: { name: 'query', chain: 'query' } },
      ],
    },
    {
      // Destructured from a namespace: the binding is local, the property is not.
      filename: CONTENT,
      code: "import * as helpers from './helpers'\nconst { saveThing } = helpers\nsaveThing()",
      errors: [chain('saveThing', 'saveThing', 'withLock')],
    },
    {
      filename: CONTENT,
      code: "const { saveThing: save } = await import('./helpers')\nawait save()",
      errors: [chain('save', 'saveThing', 'withLock')],
    },
    {
      filename: CONTENT,
      code: "import { destructuredHelper } from './helpers'\ndestructuredHelper()",
      // The second `saveThing` is the property of `actions` it is read from.
      errors: [
        chain('destructuredHelper', 'destructuredHelper', 'saveThing', 'saveThing', 'withLock'),
      ],
    },
    {
      // `f<T>` without a call, inside a walked declaration.
      filename: CONTENT,
      code: "import { lockStrings } from './instantiation'\nlockStrings('k', async () => '')",
      errors: [chain('lockStrings', 'lockStrings', 'withLockOf')],
    },
    {
      filename: VIEW,
      code: "import { Banner } from './components'\nexport const view = <Banner></Banner>",
      errors: [chain('Banner', 'Banner', 'saveThing', 'withLock')],
    },
    {
      filename: VIEW,
      code: "import * as components from './components'\nexport const view = <components.Banner />",
      errors: [chain('Banner', 'Banner', 'saveThing', 'withLock')],
    },
    {
      filename: CONTENT,
      code: 'navigator.locks!.query()\n;(navigator.locks as LockManager).query()',
      errors: [
        { messageId: 'reachesLock', data: { name: 'locks', chain: 'locks' } },
        { messageId: 'reachesLock', data: { name: 'locks', chain: 'locks' } },
      ],
    },
  ],
})
