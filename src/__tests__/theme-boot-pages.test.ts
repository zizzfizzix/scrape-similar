import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ENTRYPOINTS = join(import.meta.dirname, '../entrypoints')

const pages = readdirSync(ENTRYPOINTS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(entry.name, 'index.html'))
  .filter((page) => existsSync(join(ENTRYPOINTS, page)))

// Without the tag, a page paints in the default theme before React applies the
// stored one.
describe('extension pages', () => {
  it('are found', () => {
    expect(pages).toContain('options/index.html')
  })

  it.each(pages)('%s loads theme-boot as a classic script in <head>', (page) => {
    const html = readFileSync(join(ENTRYPOINTS, page), 'utf8')
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))

    expect(head).toContain('<script src="/theme-boot.js"></script>')
  })
})
