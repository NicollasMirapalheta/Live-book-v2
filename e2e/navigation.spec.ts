import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __SCENE_READY__?: boolean
    __NAV__?: { readonly currentNode: string; readonly isTransitioning: boolean; readonly yaw: number; readonly pitch: number; readonly fov: number }
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

test('arrastar gira o olhar, a roda muda o FOV dentro dos limites', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 90_000 })
  const before = await page.evaluate(() => ({ yaw: window.__NAV__!.yaw, pitch: window.__NAV__!.pitch }))
  await page.mouse.move(640, 360)
  await page.mouse.down()
  await page.mouse.move(440, 300, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({ yaw: window.__NAV__!.yaw, pitch: window.__NAV__!.pitch }))
  // dragging left turns the view right (grab-and-drag), dragging up looks down
  expect(after.yaw).toBeGreaterThan(before.yaw + 3)
  expect(after.pitch).toBeLessThan(before.pitch)
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 400)
  expect(await page.evaluate(() => window.__NAV__!.fov)).toBeLessThanOrEqual(70)
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -400)
  expect(await page.evaluate(() => window.__NAV__!.fov)).toBeGreaterThanOrEqual(40)
})

test('draw calls: nos nós e durante o tween', async ({ page }) => {
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 90_000 })
  const calls: Record<string, number> = {}
  const sample = async (label: string) => {
    await page.waitForTimeout(300)
    calls[label] = (await page.evaluate(() => (window as unknown as { __SCENE_STATS__?: { calls: number } }).__SCENE_STATS__?.calls)) ?? -1
  }
  await sample('N0')
  await page.getByRole('button', { name: 'Avançar' }).click()
  await page.waitForTimeout(500)
  calls['tween N0→N1'] = (await page.evaluate(() => (window as unknown as { __SCENE_STATS__?: { calls: number } }).__SCENE_STATS__?.calls)) ?? -1
  await page.waitForFunction(() => !window.__NAV__!.isTransitioning)
  await sample('N1')
  console.log('draw calls', JSON.stringify(calls))
  for (const v of Object.values(calls)) expect(v).toBeLessThan(150)
})
