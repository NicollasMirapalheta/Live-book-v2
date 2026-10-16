import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __CONTENT__?: { status: (id: string) => string | null; pageCount: (id: string) => number | null; toc: (id: string) => string[] }
  }
}

const FIXTURE_PAGES: Record<string, number> = { 'fx-bordo': 28, 'fx-verde': 58 }

async function inHand(page: Page, id: string) {
  await page.goto('/?e2e=1&node=N2')
  await page.waitForFunction(() => window.__SCENE_READY__ === true && (window.__SEL__?.order.length ?? 0) > 0, undefined, { timeout: 90_000 })
  await page.evaluate((bookId) => window.__SEL__!.select(bookId), id)
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await page.waitForFunction((bookId) => window.__CONTENT__!.status(bookId) === 'ready', id, { timeout: 30_000 })
}

for (const id of Object.keys(FIXTURE_PAGES)) {
  test(`${id}: o PDF composto tem a espessura do livro de teste`, async ({ page }) => {
    await inHand(page, id)
    expect(await page.evaluate((bookId) => window.__CONTENT__!.pageCount(bookId), id)).toBe(FIXTURE_PAGES[id])
    // the panel tells the composed count
    await expect(page.getByRole('dialog')).toContainText(`${FIXTURE_PAGES[id]} páginas`)
  })
}

test('sumário vem dos títulos do PDF; ir a um capítulo abre a página dele', async ({ page }) => {
  await inHand(page, 'fx-bordo')
  const chapters = await page.evaluate(() => window.__CONTENT__!.toc('fx-bordo'))
  expect(chapters).toContain('Carta de janeiro')
  expect(chapters).toContain('Chuva de estrelas')
  await page.getByRole('button', { name: 'Abrir' }).click()
  await page.waitForFunction(() => window.__SEL__!.phase === 'open' && !window.__READER__!.turning)
  const toc = page.getByRole('navigation', { name: 'Sumário' })
  const entry = toc.getByRole('button', { name: /Chuva de estrelas/ })
  const target = Number(await entry.locator('.sel-toc-page').textContent())
  // chapters open on a recto
  expect(target % 2).toBe(1)
  await entry.click()
  await page.waitForFunction(() => !window.__READER__!.turning, undefined, { timeout: 10_000 })
  expect(await page.evaluate(() => window.__READER__!.spread)).toBe(`${target - 1}–${target}`)
  await expect(entry).toHaveAttribute('aria-current', 'true')
})

test('soltar um PDF com o livro na mão troca o conteúdo dele nesta sessão', async ({ page }) => {
  await page.goto('/?e2e=1&node=N2')
  await page.waitForFunction(() => window.__SCENE_READY__ === true && (window.__SEL__?.order.length ?? 0) > 0, undefined, { timeout: 90_000 })
  // a book without a PDF of its own
  await page.evaluate(() => window.__SEL__!.select('fx-natural'))
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  expect(await page.evaluate(() => window.__CONTENT__!.status('fx-natural'))).toBeNull()
  await page.evaluate(async () => {
    const blob = await (await fetch('/books/fx-bordo.pdf')).blob()
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'meu-livro.pdf', { type: 'application/pdf' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }))
  })
  await page.waitForFunction(() => window.__CONTENT__!.status('fx-natural') === 'ready', undefined, { timeout: 30_000 })
  expect(await page.evaluate(() => window.__CONTENT__!.toc('fx-natural'))).toContain('Carta de janeiro')
  await expect(page.getByRole('dialog')).toContainText('PDF que você soltou')
  // the book takes the file's name; the test book's description goes away
  await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('meu-livro')
  await expect(page.getByRole('dialog')).not.toContainText('Todas as receitas da família')
})

test('PDF com a mesma imagem em várias páginas não fica preparando para sempre', async ({ page }) => {
  await page.goto('/?e2e=1&node=N2')
  await page.waitForFunction(() => window.__SCENE_READY__ === true && (window.__SEL__?.order.length ?? 0) > 0, undefined, { timeout: 90_000 })
  await page.evaluate(() => window.__SEL__!.select('fx-tabaco'))
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await page.evaluate(async () => {
    const blob = await (await fetch('/books/test-shared-image.pdf')).blob()
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'logotipo.pdf', { type: 'application/pdf' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }))
  })
  await page.waitForFunction(() => window.__CONTENT__!.status('fx-tabaco') === 'ready', undefined, { timeout: 20_000 })
  // and it opens
  await page.getByRole('button', { name: 'Abrir' }).click()
  await page.waitForFunction(() => window.__SEL__!.phase === 'open', undefined, { timeout: 10_000 })
})
