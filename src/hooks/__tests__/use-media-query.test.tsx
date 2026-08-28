// @vitest-environment jsdom
import { useMediaQuery } from '@/hooks/use-media-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A controllable stand-in for a MediaQueryList. */
interface FakeMediaQueryList {
  matches: boolean
  media: string
  listeners: Set<(event: MediaQueryListEvent) => void>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  /** Flip `matches` and notify every registered listener. */
  emit: (matches: boolean) => void
}

const createFakeMediaQueryList = (media: string, matches: boolean): FakeMediaQueryList => {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const list: FakeMediaQueryList = {
    matches,
    media,
    listeners,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    }),
    emit: (next: boolean) => {
      list.matches = next
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent)
    },
  }
  return list
}

describe('useMediaQuery', () => {
  let container: HTMLDivElement
  let root: Root
  let observed: boolean[]
  let lists: Map<string, FakeMediaQueryList>

  const Probe = ({ query }: { query: string }) => {
    observed.push(useMediaQuery(query))
    return null
  }

  const render = async (query: string) => {
    await act(async () => {
      root.render(<Probe query={query} />)
    })
  }

  beforeEach(() => {
    observed = []
    lists = new Map()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => {
        const existing = lists.get(media)
        if (existing) return existing
        const created = createFakeMediaQueryList(media, false)
        lists.set(media, created)
        return created
      }),
    )
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  it('starts false before the effect has run', async () => {
    await render('(min-width: 768px)')

    expect(observed[0]).toBe(false)
  })

  it('adopts the query result on mount', async () => {
    lists.set('(min-width: 768px)', createFakeMediaQueryList('(min-width: 768px)', true))

    await render('(min-width: 768px)')

    expect(observed.at(-1)).toBe(true)
  })

  it('stays false when the query does not match on mount', async () => {
    await render('(min-width: 768px)')

    expect(observed.at(-1)).toBe(false)
  })

  it('subscribes to change events for the query', async () => {
    await render('(min-width: 768px)')

    const list = lists.get('(min-width: 768px)')!
    expect(list.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('updates when the query starts matching', async () => {
    await render('(min-width: 768px)')
    const list = lists.get('(min-width: 768px)')!

    await act(async () => {
      list.emit(true)
    })

    expect(observed.at(-1)).toBe(true)
  })

  it('updates when the query stops matching', async () => {
    lists.set('(min-width: 768px)', createFakeMediaQueryList('(min-width: 768px)', true))
    await render('(min-width: 768px)')
    const list = lists.get('(min-width: 768px)')!

    await act(async () => {
      list.emit(false)
    })

    expect(observed.at(-1)).toBe(false)
  })

  it('resubscribes when the query changes', async () => {
    await render('(min-width: 768px)')
    const first = lists.get('(min-width: 768px)')!

    await render('(min-width: 1024px)')

    expect(first.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(lists.get('(min-width: 1024px)')!.addEventListener).toHaveBeenCalled()
  })

  it('unsubscribes on unmount', async () => {
    await render('(min-width: 768px)')
    const list = lists.get('(min-width: 768px)')!

    await act(async () => {
      root.unmount()
    })
    root = createRoot(container)

    expect(list.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(list.listeners.size).toBe(0)
  })
})
