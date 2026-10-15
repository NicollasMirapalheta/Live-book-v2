import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __SCENE_READY__?: boolean
    __NAV__?: { readonly currentNode: string; readonly isTransitioning: boolean }
  }
}

async function waitIdle(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => window.__NAV__ && !window.__NAV__.isTransitioning)
}

test('avança N0 → N1 → N2 e volta para N1', async ({ page }, testInfo) => {
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 90_000 })
  expect(await page.evaluate(() => window.__NAV__?.currentNode)).toBe('N0')
  await page.screenshot({ path: testInfo.outputPath('N0.png') })

  const forward = page.getByRole('button', { name: 'Avançar' })
  const back = page.getByRole('button', { name: 'Voltar' })

  await forward.click()
  await waitIdle(page)
  expect(await page.evaluate(() => window.__NAV__?.currentNode)).toBe('N1')
  await page.screenshot({ path: testInfo.outputPath('N1.png') })

  await forward.click()
  await waitIdle(page)
  expect(await page.evaluate(() => window.__NAV__?.currentNode)).toBe('N2')
  await page.screenshot({ path: testInfo.outputPath('N2.png') })

  await back.click()
  await waitIdle(page)
  expect(await page.evaluate(() => window.__NAV__?.currentNode)).toBe('N1')
})

test('__NAV__ só existe com ?e2e=1', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 90_000 })
  expect(await page.evaluate(() => window.__NAV__ === undefined)).toBe(true)
})

test('teclado: ↑ avança e ↓ volta', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 90_000 })
  await page.keyboard.press('ArrowUp')
  await page.waitForFunction(() => window.__NAV__?.currentNode === 'N1' && !window.__NAV__.isTransitioning)
  await page.keyboard.press('KeyS')
  await page.waitForFunction(() => window.__NAV__?.currentNode === 'N0' && !window.__NAV__.isTransitioning)
})
