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

test('arrastar a página: passou da metade completa, pouco arrasto volta', async ({ page }) => {
  await bookInHand(page)
  await page.getByRole('button', { name: 'Abrir' }).click()
  await settled(page)
  const vp = page.viewportSize()!
  const y = vp.height * 0.5
  // short drag (well under half a page): the sheet falls back
  await page.mouse.move(vp.width * 0.7, y)
  await page.mouse.down()
  await page.mouse.move(vp.width * 0.66, y, { steps: 6 })
  await page.waitForTimeout(200)
  await page.mouse.up()
  await page.waitForFunction(() => !window.__READER__!.turning)
  expect(await page.evaluate(() => window.__READER__!.turned)).toBe(0)
  // long drag to the left page: the turn completes
  await page.mouse.move(vp.width * 0.7, y)
  await page.mouse.down()
  await page.mouse.move(vp.width * 0.4, y, { steps: 12 })
  expect(await page.evaluate(() => window.__READER__!.turning)).toBe(true)
  await page.waitForTimeout(200)
  await page.mouse.up()
  await page.waitForFunction(() => window.__READER__!.turned === 1 && !window.__READER__!.turning)
})

test('livro na mão: clicar nele abre; aberto, clicar fora não fecha; clicar na capa fecha', async ({ page }) => {
  await bookInHand(page)
  const vp = page.viewportSize()!
  // the book in the hand is centered: clicking it opens it, like "Abrir"
  await page.mouse.click(vp.width * 0.5, vp.height * 0.55)
  await settled(page)
  // outside the open book: nothing happens
  await page.mouse.click(vp.width * 0.03, vp.height * 0.5)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.__SEL__!.phase)).toBe('open')
  // first spread: the left side is the inside of the cover; clicking it closes the book
  await page.mouse.click(vp.width * 0.36, vp.height * 0.45)
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('sumário: escolher um capítulo folheia até ele (vai e volta)', async ({ page }, testInfo) => {
  await page.goto('/?e2e=1&node=N2')
  await page.waitForFunction(() => window.__SCENE_READY__ === true && (window.__SEL__?.order.length ?? 0) > 0, undefined, {
    timeout: 90_000,
  })
  // the longest test book
  await page.evaluate(() => window.__SEL__!.select('fx-natural'))
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await page.evaluate(() => window.__SEL__!.open())
  await settled(page)
  const toc = page.getByRole('navigation', { name: 'Sumário' })
  await expect(toc).toBeVisible()
  await expect(toc.getByRole('button', { name: /Página de rosto/ })).toHaveAttribute('aria-current', 'true')

  const sheets = await page.evaluate(() => window.__READER__!.sheets)
  await toc.getByRole('button', { name: /Última página/ }).click()
  // mid-riffle: several sheets in the air
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.__READER__!.turning)).toBe(true)
  // budget: < 150 draw calls even with the most sheets in the air
  const calls = (await page.evaluate(() => (window as unknown as { __SCENE_STATS__?: { calls: number } }).__SCENE_STATS__?.calls)) ?? -1
  console.log('draw calls (folheando)', calls)
  expect(calls).toBeLessThan(150)
  await page.screenshot({ path: testInfo.outputPath('riffle.png') })
  await page.waitForFunction(() => !window.__READER__!.turning, undefined, { timeout: 10_000 })
  expect(await page.evaluate(() => window.__READER__!.turned)).toBe(sheets)
  await expect(toc.getByRole('button', { name: /Última página/ })).toHaveAttribute('aria-current', 'true')

  await toc.getByRole('button', { name: /Página de rosto/ }).click()
  await page.waitForFunction(() => !window.__READER__!.turning && window.__READER__!.turned === 0, undefined, { timeout: 10_000 })
})
