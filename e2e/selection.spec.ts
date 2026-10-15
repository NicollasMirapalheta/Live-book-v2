import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __SCENE_READY__?: boolean
    __NAV__?: { readonly currentNode: string; readonly isTransitioning: boolean; readonly yaw: number; readonly pitch: number; readonly fov: number }
    __SEL__?: {
      readonly selected: string | null
      readonly focused: string | null
      readonly openRequested: string | null
      readonly order: string[]
    }
  }
}

async function atBookcase(page: Page) {
  await page.goto('/?e2e=1&node=N2')
  await page.waitForFunction(() => window.__SCENE_READY__ === true && (window.__SEL__?.order.length ?? 0) > 0, undefined, {
    timeout: 90_000,
  })
}

test('teclado: ← → percorre os livros, Enter abre a descrição, Esc volta', async ({ page }, testInfo) => {
  await atBookcase(page)
  const order = await page.evaluate(() => window.__SEL__!.order)
  expect(order).toHaveLength(6)
  const yaw = await page.evaluate(() => window.__NAV__!.yaw)

  await page.keyboard.press('ArrowRight')
  expect(await page.evaluate(() => window.__SEL__!.focused)).toBe(order[0])
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  expect(await page.evaluate(() => window.__SEL__!.focused)).toBe(order[0])
  // the arrows move the focus at the bookcase, they do not turn the camera
  expect(await page.evaluate(() => window.__NAV__!.yaw)).toBe(yaw)

  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => window.__SEL__!.selected)).toBe(order[0])
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveText('Cartas de Verão')
  // navigation is locked while a book is out
  await expect(page.getByRole('button', { name: 'Avançar' })).toHaveCount(0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: testInfo.outputPath('selected.png') })

  await page.getByRole('button', { name: 'Abrir' }).click()
  expect(await page.evaluate(() => window.__SEL__!.openRequested)).toBe(order[0])

  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  expect(await page.evaluate(() => window.__SEL__!.selected)).toBeNull()
  await expect(page.getByRole('button', { name: 'Voltar' })).toBeVisible()
})

test('clicar num livro abre a seleção; clicar fora fecha', async ({ page }) => {
  await atBookcase(page)
  // without debug hooks, click where the books stand: top shelf, right side (see shots/latest/N2.png)
  const box = (await page.locator('canvas').boundingBox())!
  let selected: string | null = null
  for (const fx of [0.69, 0.7, 0.71, 0.72, 0.68]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * 0.2)
    selected = await page.evaluate(() => window.__SEL__!.selected)
    if (selected) break
  }
  expect(selected).not.toBeNull()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.5)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('fora da estante (N0) não há seleção', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 90_000 })
  await page.keyboard.press('Enter')
  await page.evaluate(() => (window as unknown as { __SEL__: { select: (id: string) => void } }).__SEL__.select('fx-bordo'))
  expect(await page.evaluate(() => window.__SEL__!.selected)).toBeNull()
})
