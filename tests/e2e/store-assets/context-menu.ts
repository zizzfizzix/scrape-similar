import type { Locator, Page } from '@playwright/test'
import { FONT_FAMILY } from './compose'

/**
 * Titles of the context menu entries, in order, read by running the extension's
 * own `initializeContextMenus` against a stub of the `browser` global it uses.
 * The store images then name exactly what the build registers.
 */
export const readContextMenuTitles = async (): Promise<string[]> => {
  const titles: string[] = []
  const stub = {
    runtime: { id: 'store-assets' },
    contextMenus: {
      create: (item: { title: string }) => {
        titles.push(item.title)
      },
    },
  }
  // The module reads `browser` at import time, so the stub goes in first.
  Object.assign(globalThis, { browser: stub })
  try {
    const { initializeContextMenus } =
      await import('@/entrypoints/background/utils/context-menu-setup')
    initializeContextMenus()
  } finally {
    Reflect.deleteProperty(globalThis, 'browser')
  }
  return titles
}

/**
 * Draws Chrome's context menu over `target`, opened on it and hovering the
 * extension's entry. Chrome renders that menu natively, outside the page, so no
 * screenshot of the page can contain it.
 *
 * With more than one entry Chrome groups them under a submenu named and iconned
 * after the extension; `extensionName`, `iconSrc` and `titles` fill that in.
 */
export const drawContextMenu = async (
  page: Page,
  target: Locator,
  o: { extensionName: string; iconSrc: string; titles: string[] },
) => {
  const box = await target.boundingBox()
  if (!box) throw new Error('Context menu target is not visible')

  await page.evaluate(
    ({ x, y, extensionName, iconSrc, titles, fontFamily }) => {
      const style = document.createElement('style')
      style.textContent = `
        .ss-menu { position: absolute; z-index: 2147483647; min-width: 236px; padding: 8px 0;
                   background: #fff; border-radius: 8px; color: #1f1f1f;
                   font: 13px/1 ${fontFamily};
                   box-shadow: 0 2px 6px 2px rgba(60, 64, 67, .15), 0 1px 2px rgba(60, 64, 67, .3); }
        .ss-item { display: flex; align-items: center; gap: 10px; height: 28px; padding: 0 16px 0 40px; white-space: nowrap; }
        .ss-item.ss-icon { padding-left: 14px; }
        .ss-item img { width: 16px; height: 16px; }
        .ss-item .ss-arrow { margin-left: auto; padding-left: 24px; }
        .ss-item.ss-hover { background: #e8eaed; }
        .ss-item.ss-disabled { color: #9aa0a6; }
        .ss-sep { height: 1px; margin: 8px 0; background: #e3e3e3; }
        .ss-target { background: #b4d5fe; }`
      document.head.append(style)

      const menu = (left: number, top: number) => {
        const element = document.createElement('div')
        element.className = 'ss-menu'
        element.style.left = `${left}px`
        element.style.top = `${top}px`
        document.body.append(element)
        return element
      }
      const item = (parent: HTMLElement, label: string, classes: string[] = []) => {
        const element = document.createElement('div')
        element.className = ['ss-item', ...classes].join(' ')
        element.append(label)
        parent.append(element)
        return element
      }
      const separator = (parent: HTMLElement) => {
        const element = document.createElement('div')
        element.className = 'ss-sep'
        parent.append(element)
      }

      const main = menu(x + window.scrollX, y + window.scrollY)
      item(main, 'Back')
      item(main, 'Forward', ['ss-disabled'])
      item(main, 'Reload')
      separator(main)
      item(main, 'Save as…')
      item(main, 'Print…')
      item(main, 'Cast…')
      separator(main)
      const entry = item(main, '', ['ss-icon', 'ss-hover'])
      const icon = document.createElement('img')
      icon.src = iconSrc
      const arrow = document.createElement('span')
      arrow.className = 'ss-arrow'
      arrow.textContent = '▸'
      entry.replaceChildren(icon, extensionName, arrow)
      separator(main)
      item(main, 'View page source')
      item(main, 'Inspect')

      const entryBox = entry.getBoundingClientRect()
      const mainBox = main.getBoundingClientRect()
      const submenu = menu(mainBox.right + window.scrollX - 4, entryBox.top + window.scrollY - 8)
      titles.forEach((title, index) => item(submenu, title, index === 0 ? ['ss-hover'] : []))
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, fontFamily: FONT_FAMILY, ...o },
  )
  await target.evaluate((element) => element.classList.add('ss-target'))
}
