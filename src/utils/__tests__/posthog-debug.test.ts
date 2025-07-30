import { describe, expect, it, vi } from 'vitest'

type Env = 'development' | 'test' | 'production'

type Scenario = {
  env: Env
  debugMode: boolean | null
}

async function runScenario({ env, debugMode }: Scenario): Promise<boolean[]> {
  vi.resetModules()

  const isDev = env === 'development'
  const isTest = env === 'test'
  const modeMock = { isDev, isTest, isDevOrTest: isDev || isTest }
  vi.doMock('@/utils/modeTest', () => modeMock)

  if (debugMode !== null) storage.setItem('local:debugMode', debugMode)

  vi.doMock('@/utils/consent', () => ({ getConsentState: () => Promise.resolve(true) }))
  vi.doMock('@/utils/distinct-id', () => ({ getOrCreateDistinctId: () => Promise.resolve('id') }))

  const debugHistory: boolean[] = []
  vi.doMock('posthog-js/dist/module.no-external', () => {
    class PostHog {
      init(_: any, cfg: any) {
        debugHistory.push(!!cfg.debug)
      }
      set_config(cfg: any) {
        if ('debug' in cfg) debugHistory.push(!!cfg.debug)
      }
    }
    return { PostHog }
  })

  const { getPostHogBackground } = await import('@/utils/posthog-background')
  await getPostHogBackground()

  return debugHistory
}

describe('PostHog debug flag wiring', () => {
  it('forces debug TRUE in development', async () => {
    const history = await runScenario({ env: 'development', debugMode: false })
    expect(history[0]).toBe(true)
  })

  it('forces debug TRUE in test', async () => {
    const history = await runScenario({ env: 'test', debugMode: false })
    expect(history[0]).toBe(true)
  })

  it('uses storage flag in production – false', async () => {
    const history = await runScenario({ env: 'production', debugMode: false })
    expect(history[0]).toBe(false)
  })

  it('uses storage flag in production – true', async () => {
    const history = await runScenario({ env: 'production', debugMode: true })
    expect(history[0]).toBe(true)
  })
})
