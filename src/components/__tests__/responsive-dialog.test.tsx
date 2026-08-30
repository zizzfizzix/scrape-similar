// @vitest-environment jsdom
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { render as renderComponent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Report whether the desktop breakpoint matches, and let tests flip it. */
const setDesktop = (matches: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

const fullDialog = (open = true) => (
  <ResponsiveDialog.Root open={open} onOpenChange={() => {}}>
    <ResponsiveDialog.Content>
      <ResponsiveDialog.Header>
        <ResponsiveDialog.Title>Import presets</ResponsiveDialog.Title>
        <ResponsiveDialog.Description>Current presets will be lost.</ResponsiveDialog.Description>
      </ResponsiveDialog.Header>
      <ResponsiveDialog.Footer>
        <ResponsiveDialog.Close>
          <button type="button">Cancel</button>
        </ResponsiveDialog.Close>
        <button type="button">Import</button>
      </ResponsiveDialog.Footer>
    </ResponsiveDialog.Content>
  </ResponsiveDialog.Root>
)

/** Content is portalled to the body, outside the render container. */
const portalled = () => document.body.textContent ?? ''

describe('ResponsiveDialog on desktop', () => {
  beforeEach(() => setDesktop(true))

  it('renders every part of the dialog', async () => {
    renderComponent(fullDialog())

    expect(portalled()).toContain('Import presets')
    expect(portalled()).toContain('Current presets will be lost.')
    expect(portalled()).toContain('Cancel')
    expect(portalled()).toContain('Import')
  })

  it('uses the dialog role rather than the drawer', async () => {
    renderComponent(fullDialog())

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('[data-vaul-drawer]')).toBeNull()
  })

  it('shows a close button by default', async () => {
    renderComponent(fullDialog())

    expect(document.querySelector('[data-slot="dialog-close"]')).not.toBeNull()
  })

  it('hides the close button when asked', async () => {
    renderComponent(
      <ResponsiveDialog.Root open onOpenChange={() => {}}>
        <ResponsiveDialog.Content showCloseButton={false}>
          <ResponsiveDialog.Title>Import presets</ResponsiveDialog.Title>
        </ResponsiveDialog.Content>
      </ResponsiveDialog.Root>,
    )

    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull()
  })

  it('renders nothing while closed', async () => {
    renderComponent(fullDialog(false))

    expect(portalled()).not.toContain('Import presets')
  })

  it('renders the cancel action unwrapped', async () => {
    renderComponent(fullDialog())

    const cancel = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cancel',
    )
    expect(cancel?.getAttribute('data-slot')).toBeNull()
  })

  it('applies extra classes to each part', async () => {
    renderComponent(
      <ResponsiveDialog.Root open onOpenChange={() => {}}>
        <ResponsiveDialog.Content className="content-class">
          <ResponsiveDialog.Header className="header-class">
            <ResponsiveDialog.Title className="title-class">Title</ResponsiveDialog.Title>
            <ResponsiveDialog.Description className="description-class">
              Body
            </ResponsiveDialog.Description>
          </ResponsiveDialog.Header>
          <ResponsiveDialog.Footer className="footer-class">Footer</ResponsiveDialog.Footer>
        </ResponsiveDialog.Content>
      </ResponsiveDialog.Root>,
    )

    for (const className of [
      'content-class',
      'header-class',
      'title-class',
      'description-class',
      'footer-class',
    ]) {
      expect(document.querySelector(`.${className}`), className).not.toBeNull()
    }
  })
})

describe('ResponsiveDialog on mobile', () => {
  beforeEach(() => setDesktop(false))

  it('renders every part of the drawer', async () => {
    renderComponent(fullDialog())

    expect(portalled()).toContain('Import presets')
    expect(portalled()).toContain('Current presets will be lost.')
    expect(portalled()).toContain('Cancel')
  })

  it('wraps the cancel action so it closes the drawer', async () => {
    renderComponent(fullDialog())

    const cancel = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cancel',
    )
    expect(cancel?.getAttribute('data-slot')).toBe('drawer-close')
  })

  it('applies extra classes to each part', async () => {
    renderComponent(
      <ResponsiveDialog.Root open onOpenChange={() => {}}>
        <ResponsiveDialog.Content className="content-class">
          <ResponsiveDialog.Header className="header-class">
            <ResponsiveDialog.Title className="title-class">Title</ResponsiveDialog.Title>
            <ResponsiveDialog.Description className="description-class">
              Body
            </ResponsiveDialog.Description>
          </ResponsiveDialog.Header>
          <ResponsiveDialog.Footer className="footer-class">Footer</ResponsiveDialog.Footer>
        </ResponsiveDialog.Content>
      </ResponsiveDialog.Root>,
    )

    for (const className of [
      'content-class',
      'header-class',
      'title-class',
      'description-class',
      'footer-class',
    ]) {
      expect(document.querySelector(`.${className}`), className).not.toBeNull()
    }
  })

  it('honours a custom breakpoint query', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia')

    renderComponent(
      <ResponsiveDialog.Root open onOpenChange={() => {}} breakpointQuery="(min-width: 1200px)">
        <ResponsiveDialog.Content>
          <ResponsiveDialog.Title>Title</ResponsiveDialog.Title>
        </ResponsiveDialog.Content>
      </ResponsiveDialog.Root>,
    )

    expect(matchMedia).toHaveBeenCalledWith('(min-width: 1200px)')
  })
})

describe('ResponsiveDialog subcomponents outside a root', () => {
  beforeEach(() => {
    // React reports the thrown error through its own logging.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  const expectedError = 'ResponsiveDialog subcomponents must be used within ResponsiveDialog.Root'

  it('refuses to render Content', async () => {
    expect(() =>
      renderComponent(<ResponsiveDialog.Content>Body</ResponsiveDialog.Content>),
    ).toThrow(expectedError)
  })

  it('refuses to render Header', async () => {
    expect(() => renderComponent(<ResponsiveDialog.Header />)).toThrow(expectedError)
  })

  it('refuses to render Title', async () => {
    expect(() => renderComponent(<ResponsiveDialog.Title />)).toThrow(expectedError)
  })

  it('refuses to render Description', async () => {
    expect(() => renderComponent(<ResponsiveDialog.Description />)).toThrow(expectedError)
  })

  it('refuses to render Footer', async () => {
    expect(() => renderComponent(<ResponsiveDialog.Footer />)).toThrow(expectedError)
  })

  it('refuses to render Close', async () => {
    expect(() =>
      renderComponent(
        <ResponsiveDialog.Close>
          <button type="button">Cancel</button>
        </ResponsiveDialog.Close>,
      ),
    ).toThrow(expectedError)
  })
})
