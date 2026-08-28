import { injectContentScriptToAllTabs } from '@/entrypoints/background/utils/content-injection'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { spyOnBrowser } from '@@/tests/support/fake-browser'

const setManifest = (contentScripts?: unknown) => {
  spyOnBrowser(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    manifest_version: 3,
    name: 'Scrape Similar',
    version: '0.0.0',
    ...(contentScripts === undefined ? {} : { content_scripts: contentScripts }),
  } as never)
}

describe('injectContentScriptToAllTabs', () => {
  let executeScript: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    executeScript = spyOnBrowser(fakeBrowser.scripting, 'executeScript').mockResolvedValue([])
  })

  it('injects every manifest content script into every injectable tab', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com/a' })
    await fakeBrowser.tabs.create({ url: 'https://example.com/b' })
    setManifest([{ js: ['content-scripts/content.js'] }])

    await injectContentScriptToAllTabs()

    expect(executeScript).toHaveBeenCalledTimes(2)
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ['content-scripts/content.js'],
    })
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 2 },
      files: ['content-scripts/content.js'],
    })
  })

  it('injects each file of each content script entry', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    setManifest([{ js: ['a.js', 'b.js'] }, { js: ['c.js'] }])

    await injectContentScriptToAllTabs()

    expect(executeScript).toHaveBeenCalledTimes(3)
  })

  it('skips manifest entries with no js files', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    setManifest([{ js: undefined }, { js: ['only.js'] }])

    await injectContentScriptToAllTabs()

    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 1 }, files: ['only.js'] })
  })

  it('skips tabs whose URL cannot host a content script', async () => {
    await fakeBrowser.tabs.create({ url: 'chrome://settings' })
    await fakeBrowser.tabs.create({ url: 'https://chromewebstore.google.com/detail/x' })
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    setManifest([{ js: ['content.js'] }])

    await injectContentScriptToAllTabs()

    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 3 }, files: ['content.js'] })
  })

  it('does nothing when the manifest declares no content scripts', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    setManifest(undefined)

    await injectContentScriptToAllTabs()

    expect(executeScript).not.toHaveBeenCalled()
  })

  it('does nothing when the manifest declares an empty content script list', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    setManifest([])

    await injectContentScriptToAllTabs()

    expect(executeScript).not.toHaveBeenCalled()
  })

  it('keeps injecting other tabs when one injection is rejected', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com/a' })
    await fakeBrowser.tabs.create({ url: 'https://example.com/b' })
    setManifest([{ js: ['content.js'] }])
    executeScript.mockRejectedValueOnce(new Error('Cannot access contents of the page'))

    await expect(injectContentScriptToAllTabs()).resolves.toBeUndefined()

    expect(executeScript).toHaveBeenCalledTimes(2)
  })
})
