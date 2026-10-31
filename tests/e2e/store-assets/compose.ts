import type { Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '../../..')

const svgDataUri = (file: string) =>
  `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, file)).toString('base64')}`

const pngDataUri = (file: string) =>
  `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`

/** Black tile, white mark: the store icon and the context menu entry. */
export const LOGO_LIGHT = svgDataUri('public/icons/logo-light.svg')

/** White tile, black mark: reads on the dark backgrounds of the store images. */
const LOGO_DARK = svgDataUri('public/icons/logo-dark.svg')

const GEIST_WOFF2 = path.join(
  ROOT,
  'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
)

/**
 * The extension's own font, inlined, for everything drawn around the captures:
 * a platform font would make the images differ between machines.
 */
export const FONT_FACE_CSS = `@font-face { font-family: 'Store Geist'; font-weight: 100 900;
  src: url(data:font/woff2;base64,${fs.readFileSync(GEIST_WOFF2).toString('base64')}) format('woff2'); }`

export const FONT_FAMILY = `'Store Geist', sans-serif`

const BASE_CSS = `
  ${FONT_FACE_CSS}
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body { font-family: ${FONT_FAMILY};
         background: #0a0a0a; color: #fafafa; -webkit-font-smoothing: antialiased; }
  h1 { font-weight: 700; letter-spacing: -0.025em; line-height: 1.08; }
  p { color: #a3a3a3; line-height: 1.45; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; }
  .brand img { width: 40px; height: 40px; }
  .shot { border-radius: 14px; overflow: hidden; outline: 1px solid #262626;
          box-shadow: 0 30px 80px rgba(0, 0, 0, .6); background: #fff; }
  .shot img { display: block; }
`

const render = async (
  page: Page,
  [width, height]: [number, number],
  body: string,
  css: string,
  out: string,
  options: { isTransparent?: boolean } = {},
) => {
  await page.setViewportSize({ width, height })
  await page.setContent(
    `<!doctype html><html><head><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`,
  )
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: out, omitBackground: options.isTransparent })
}

interface ShotCopy {
  name: string
  title: string
  text: string
  /** Path of the raw capture to frame. */
  shot: string
  out: string
}

/** Side panel capture size {@link sideShot} frames. */
export const SIDE_SHOT_SIZE = { width: 400, height: 720 }

/** Capture size {@link wideShot} frames; the bottom edge bleeds off the image. */
export const WIDE_SHOT_SIZE = { width: 1088, height: 680 }

/** Page and side panel capture sizes {@link browserShot} frames side by side. */
export const BROWSER_SHOT_SIZES = {
  page: { width: 696, height: 660 },
  panel: { width: 440, height: 660 },
}

/** 1280×800: headline on the left, a side panel capture on the right. */
export const sideShot = (page: Page, o: ShotCopy) =>
  render(
    page,
    [1280, 800],
    `<main>
      <div class="copy">
        <div class="brand"><img src="${LOGO_DARK}" alt="">${o.name}</div>
        <h1>${o.title}</h1>
        <p>${o.text}</p>
      </div>
      <div class="shot"><img src="${pngDataUri(o.shot)}" alt=""></div>
    </main>`,
    `main { display: flex; align-items: center; justify-content: space-between; height: 100%; padding: 0 96px 0 88px; }
     .copy { width: 560px; display: flex; flex-direction: column; gap: 28px; }
     h1 { font-size: 54px; } p { font-size: 22px; }
     .shot { width: ${SIDE_SHOT_SIZE.width}px; height: ${SIDE_SHOT_SIZE.height}px; }`,
    o.out,
  )

const topCopy = (o: ShotCopy) => `<div class="copy"><h1>${o.title}</h1><p>${o.text}</p></div>`

const TOP_COPY_CSS = `
  main { display: flex; flex-direction: column; align-items: center; height: 100%; padding-top: 44px; gap: 28px; }
  .copy { text-align: center; display: flex; flex-direction: column; gap: 14px; max-width: 960px; }
  h1 { font-size: 46px; } p { font-size: 21px; }
  .shot { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
`

/** 1280×800: headline on top, a wide capture bleeding off the bottom edge. */
export const wideShot = (page: Page, o: ShotCopy) =>
  render(
    page,
    [1280, 800],
    `<main>${topCopy(o)}<div class="shot"><img src="${pngDataUri(o.shot)}" alt=""></div></main>`,
    `${TOP_COPY_CSS}
     .shot { width: ${WIDE_SHOT_SIZE.width}px; height: ${WIDE_SHOT_SIZE.height}px; }`,
    o.out,
  )

/**
 * 1280×800: headline on top, then the page and the side panel next to each
 * other the way Chrome lays them out, bleeding off the bottom edge.
 */
export const browserShot = (
  page: Page,
  o: Omit<ShotCopy, 'shot'> & { pageShot: string; panelShot: string },
) =>
  render(
    page,
    [1280, 800],
    `<main>
      ${topCopy({ ...o, shot: o.pageShot })}
      <div class="shot window">
        <img src="${pngDataUri(o.pageShot)}" alt="">
        <img class="panel" src="${pngDataUri(o.panelShot)}" alt="">
      </div>
    </main>`,
    `${TOP_COPY_CSS}
     .window { display: flex; height: ${BROWSER_SHOT_SIZES.page.height}px; }
     .window .panel { border-left: 1px solid #d4d4d4; }`,
    o.out,
  )

/** 440×280 small promo tile and 1400×560 marquee. */
export const promo = async (
  page: Page,
  o: { name: string; tagline: string; small: string; marquee: string },
) => {
  const body = (variant: string) => `<main class="${variant}">
      <img class="mark" src="${LOGO_DARK}" alt="">
      <div><h1>${o.name}</h1><p>${o.tagline}</p></div>
    </main>`
  const css = `main { height: 100%; display: flex; align-items: center; }
     main.small { flex-direction: column; justify-content: center; gap: 22px; text-align: center; padding: 0 28px; }
     main.small .mark { width: 88px; } main.small h1 { font-size: 30px; } main.small p { font-size: 16px; margin-top: 8px; }
     main.marquee { gap: 64px; padding: 0 140px; }
     main.marquee .mark { width: 240px; } main.marquee h1 { font-size: 76px; } main.marquee p { font-size: 30px; margin-top: 18px; }`
  await render(page, [440, 280], body('small'), css, o.small)
  await render(page, [1400, 560], body('marquee'), css, o.marquee)
}

/**
 * 128×128 store icon: 96×96 artwork with 16px of transparent padding, per the
 * Chrome Web Store icon guidelines.
 */
export const storeIcon = (page: Page, out: string) =>
  render(
    page,
    [128, 128],
    `<img class="icon" src="${LOGO_LIGHT}" alt="">`,
    `html, body { background: transparent; }
     .icon { display: block; width: 96px; height: 96px; margin: 16px; }`,
    out,
    { isTransparent: true },
  )
