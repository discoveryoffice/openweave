/** Generate OpenWeave application, website, welcome, and installer artwork from shared ribbons. */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { BRAND_NAME, BRAND_RIBBONS } from '@deepseek-ai/dsh-client-ui-primitives/src/brand-artwork.ts'
import { packIco, renderTrayIconEntries } from './render-tray-icon.ts'

const root = new URL('../../../', import.meta.url)
const ribbons = BRAND_RIBBONS.map(ribbon => `<path d="${ribbon.path}" stroke="${ribbon.color}"/>`).join('')
const mark = `<g fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${ribbons}</g>`
const bare = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">${mark}</svg>\n`
const defs = '<defs><linearGradient id="tile" x1="40" y1="32" x2="1064" y2="1056" gradientUnits="userSpaceOnUse"><stop stop-color="#f0fdfa"/><stop offset="0.5" stop-color="#fafbff"/><stop offset="1" stop-color="#ede9fe"/></linearGradient><filter id="tile-shadow" x="0" y="0" width="1104" height="1104" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.12"/></filter></defs>'
const tile = `<g filter="url(#tile-shadow)"><rect id="app-tile" x="40" y="32" width="1024" height="1024" rx="192" fill="url(#tile)"/><g id="app-mark"><g transform="translate(232 224) scale(20)">${mark}</g></g></g>`
const svg = (edge: number, body: string) => `<svg width="${edge}" height="${edge}" viewBox="0 0 ${edge} ${edge}" xmlns="http://www.w3.org/2000/svg">${body}</svg>\n`
const variants = [
  ['icon', svg(1104, tile + defs)],
  ['icon-windows', svg(1024, `<g transform="translate(32 32) scale(0.9375) translate(-40 -32)">${tile.replace('<g id="app-mark">', '<g id="tray-glyph">')}</g>${defs}`)],
  ['icon-macos', svg(1024, `<g transform="translate(100 100) scale(0.8046875) translate(-40 -32)">${tile}</g>${defs}`)],
] as const
for (const [name, source] of variants) {
  await writeFile(new URL(`apps/desktop/resources/${name}.svg`, root), source)
  await sharp(Buffer.from(source)).resize(1024, 1024).png().toFile(fileURLToPath(new URL(`apps/desktop/resources/${name}.png`, root)))
}
for (const path of ['apps/web/public/favicon.svg', 'apps/web/public/favicon-dark.svg', 'website/public/favicon.svg']) {
  await writeFile(new URL(path, root), bare)
}
const font = await readFile(new URL('packages/client/ui-theme/src/styles/montserrat-medium.woff2', root))
const wordmarkStyle = `<style>@font-face{font-family:OpenWeaveBrand;src:url(data:font/woff2;base64,${font.toString('base64')})}.openweave-wordmark-text{font-family:OpenWeaveBrand,sans-serif;font-weight:500}</style>`
const welcomeTextTheme = '<style>.openweave-wordmark-text{fill:#182c32}@media(prefers-color-scheme:dark){.openweave-wordmark-text{fill:#f4f5fa}}</style>'
const welcome = `<svg width="244" height="40" viewBox="0 0 244 40" fill="none" xmlns="http://www.w3.org/2000/svg">${wordmarkStyle}${welcomeTextTheme}<g transform="translate(0 2) scale(1.125)">${mark}</g><text class="openweave-wordmark-text" x="50" y="31" fill="currentColor" font-size="32" letter-spacing="-1">${BRAND_NAME}</text></svg>\n`
await writeFile(new URL('apps/desktop/renderer/assets/welcome-brand.svg', root), welcome)
await writeFile(new URL('website/public/wordmark.svg', root), welcome.replace(welcomeTextTheme, ''))
for (const dark of [false, true]) {
  const name = `brand${dark ? '-dark' : ''}`
  const banner = `<svg width="600" height="196" viewBox="0 0 600 196" xmlns="http://www.w3.org/2000/svg">${wordmarkStyle}<g transform="translate(48 58) scale(2.5)">${mark}</g><text class="openweave-wordmark-text" x="152" y="118" fill="${dark ? '#f4f5fa' : '#182c32'}" font-size="48" letter-spacing="-1.5">${BRAND_NAME}</text></svg>`
  for (const scale of [1, 2]) {
    const suffix = `${dark ? '-dark' : ''}${scale === 2 ? '-2x' : ''}`
    await sharp(Buffer.from(banner)).resize(600 * scale, 196 * scale).png().toFile(fileURLToPath(new URL(`apps/desktop/installer/assets/brand${suffix}.png`, root)))
  }
  console.info(`brand artwork: rendered ${name}`)
}
const sidebar = '<rect width="164" height="314" fill="#f0fdfa"/><path d="M-30 314L190 94" stroke="#ede9fe" stroke-width="100"/>' + `<g transform="translate(34 42) scale(3)">${mark}</g>`
await sharp(Buffer.from(`<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">${sidebar}</svg>`)).png().toFile(fileURLToPath(new URL('apps/desktop/installer/assets/uninstaller-sidebar.png', root)))
const windows = variants[1][1]
await writeFile(new URL('apps/desktop/resources/tray-windows.ico', root), packIco(await renderTrayIconEntries(Buffer.from(windows))))
