import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __READER__?: { readonly turned: number; readonly sheets: number; readonly turning: boolean; readonly spread: string }
  }
}

async function bookInHand(page: Page) {
  await page.goto('/?e2e=1&node=N2')
  await page.waitForFunction(() => window.__SCENE_READY__ === true && (window.__SEL__?.order.length ?? 0) > 0, undefined, {
    timeout: 90_000,
  })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
}

const settled = (page: Page) => page.waitForFunction(() => window.__SEL__!.phase === 'open' && !window.__READER__!.turning)

test('abrir, folhear pelo teclado e fechar: o painel volta', async ({ page }, testInfo) => {
  await bookInHand(page)
  await page.getByRole('button', { name: 'Abrir' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await settled(page)
  const bar = page.getByRole('navigation', { name: 'Leitura' })
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('p. 1')
  // the first spread: nothing to go back to
  await expect(bar.getByRole('button', { name: 'Página anterior' })).toBeDisabled()

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => window.__READER__!.turned === 2 && !window.__READER__!.turning)
  expect(await page.evaluate(() => window.__READER__!.spread)).toBe('4–5')
  await expect(bar).toContainText('p. 4–5')
  // the arrows turn pages while reading, they never turn the camera
  expect(await page.evaluate(() => window.__SEL__!.phase)).toBe('open')
  await page.screenshot({ path: testInfo.outputPath('open.png') })

  await page.keyboard.press('ArrowLeft')
  await page.waitForFunction(() => window.__READER__!.turned === 1 && !window.__READER__!.turning)

  await bar.getByRole('button', { name: 'Fechar' }).click()
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await expect(page.getByRole('dialog')).toBeVisible()
  // closed: the next opening starts at the first page again
  expect(await page.evaluate(() => window.__READER__!.turned)).toBe(0)
})

test('Esc fecha o livro aberto e, de novo, devolve à estante', async ({ page }) => {
  await bookInHand(page)
  await page.getByRole('button', { name: 'Abrir' }).click()
  await settled(page)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__SEL__!.selected === null)
})

test('clicar na página direita avança; na esquerda, volta', async ({ page }) => {
  await bookInHand(page)
  await page.getByRole('button', { name: 'Abrir' }).click()
  await settled(page)
  const vp = page.viewportSize()!
  // reading pose: the spread is centered, the gutter in the middle of the view
  await page.mouse.click(vp.width * 0.68, vp.height * 0.5)
  await page.waitForFunction(() => window.__READER__!.turned === 1 && !window.__READER__!.turning)
  await page.mouse.click(vp.width * 0.32, vp.height * 0.5)
  await page.waitForFunction(() => window.__READER__!.turned === 0 && !window.__READER__!.turning)
})
