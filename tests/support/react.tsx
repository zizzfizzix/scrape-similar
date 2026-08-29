import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * A minimal React test harness.
 *
 * The project has no `@testing-library/react`, so mount through `createRoot`
 * directly and wrap every interaction in `act` so effects and state updates are
 * flushed before assertions run.
 */
export interface RenderResult {
  container: HTMLElement
  /** Render (or re-render) `ui` into the same root. */
  render: (ui: ReactNode) => Promise<void>
  /** Run `callback` inside `act`, flushing anything it schedules. */
  act: (callback: () => void | Promise<void>) => Promise<void>
  cleanup: () => Promise<void>
}

/** Mount `ui` into a fresh container appended to `document.body`. */
export const renderComponent = async (ui: ReactNode): Promise<RenderResult> => {
  const container = document.createElement('div')
  document.body.append(container)
  let root: Root | null = createRoot(container)

  const render = async (next: ReactNode) => {
    await act(async () => {
      root?.render(next)
    })
  }

  await render(ui)

  return {
    container,
    render,
    act: async (callback) => {
      await act(async () => {
        await callback()
      })
    },
    cleanup: async () => {
      await act(async () => {
        root?.unmount()
        root = null
      })
      container.remove()
    },
  }
}

/** Query the mounted container, failing loudly when nothing matches. */
export const querySelector = <T extends Element = HTMLElement>(
  container: HTMLElement,
  selector: string,
): T => {
  const element = container.querySelector<T>(selector)
  if (!element) throw new Error(`No element matched ${selector}`)
  return element
}

/**
 * Type a value into a controlled input or textarea the way a user would.
 *
 * React remembers the last value it rendered, so assigning `field.value`
 * directly makes it treat the following `input` event as a no-op. Going through
 * the prototype's setter updates the value React is tracking too.
 */
export const setInputValue = (
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void => {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Open a Radix trigger.
 *
 * Radix primitives open on `pointerdown` rather than `click`, and jsdom's
 * `click()` dispatches neither pointer event, so send the full sequence.
 */
export const openRadixTrigger = (trigger: HTMLElement): void => {
  trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  trigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
  trigger.click()
}

/**
 * Wait for `assertion` to stop throwing.
 *
 * The components under test schedule work through `requestAnimationFrame`,
 * `setTimeout` and callback-style `browser.*` APIs, so an assertion often needs
 * a few macrotasks before it can hold. Each attempt runs inside `act` so React
 * flushes whatever the previous one scheduled.
 */
export const waitFor = async (
  assertion: () => void | Promise<void>,
  { timeout = 1000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> => {
  const deadline = Date.now() + timeout
  let lastError: unknown
  for (;;) {
    try {
      await act(async () => {
        await assertion()
      })
      return
    } catch (error) {
      lastError = error
      if (Date.now() >= deadline) throw lastError
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }
}

/**
 * Stub the layout methods jsdom leaves unimplemented.
 *
 * `scrollIntoView` and `scrollTo` throw rather than no-op, and the autosuggest
 * and the columns strip both call them while keeping the selection in view.
 */
export const stubScrolling = (): void => {
  Element.prototype.scrollIntoView ??= function scrollIntoView() {}
  Element.prototype.scrollTo ??= function scrollTo() {}
}

/**
 * Report a fixed `offsetWidth` for every element.
 *
 * jsdom has no layout engine, so every element measures 0 and code that sizes
 * itself off a rendered child never sees a width.
 */
export const stubOffsetWidth = (width: number): void => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => width,
  })
}

/**
 * Find a portalled Radix item by its visible label.
 *
 * Menu, dialog and drawer content is rendered into `document.body`, outside the
 * container the tree was mounted in.
 */
export const findByRole = (role: string, label: string): HTMLElement => {
  const candidates = [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)]
  const match = candidates.find((candidate) => candidate.textContent?.trim() === label)
  if (!match) {
    throw new Error(
      `No ${role} labelled "${label}"; saw ${JSON.stringify(candidates.map((c) => c.textContent?.trim()))}`,
    )
  }
  return match
}
