import { expect, test, type Page } from '@playwright/test'

const PDF = 'public/books/fx-bordo.pdf'

async function atShelf(page: Page) {
  await page.goto('/?e2e=1&node=N2')
  await page.waitForFunction(() => window.__SCENE_READY__ === true && (window.__SEL__?.order.length ?? 0) > 0, undefined, { timeout: 90_000 })
}

test('criar um livro com PDF: entra na estante no lugar dos exemplos, vem para a mão e continua depois de recarregar', async ({ page }) => {
  await atShelf(page)
  expect(await page.evaluate(() => window.__SEL__!.order.length)).toBe(6)

  await page.getByRole('button', { name: 'Novo livro' }).click()
  const form = page.getByRole('dialog', { name: 'Um livro para a estante' })
  await expect(form).toBeVisible()
  await form.locator('input[type=file][accept*=pdf]').setInputFiles(PDF)
  // the title comes from the file name until the user writes one
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue('fx-bordo')
  await form.getByLabel('Título', { exact: true }).fill('Meu Livro de Teste')
  await form.getByRole('radio', { name: 'Verde-garrafa' }).click()
  await expect(form).toContainText('28 páginas', { timeout: 20_000 })
  await form.getByRole('button', { name: 'Pôr na estante' }).click()
  await expect(form).toHaveCount(0)

  // the new book replaces the samples and comes to the hand
  await page.waitForFunction(() => window.__SEL__!.order.length === 1)
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand', undefined, { timeout: 15_000 })
  const panel = page.getByRole('dialog', { name: 'Meu Livro de Teste' })
  await expect(panel).toContainText('28 páginas')
  await expect(panel).not.toContainText('Exemplo')

  // stored: still there after a reload, with its PDF
  await atShelf(page)
  const id = await page.evaluate(() => window.__SEL__!.order[0])
  expect(await page.evaluate(() => window.__SEL__!.order.length)).toBe(1)
  await page.evaluate((bookId) => window.__SEL__!.select(bookId), id)
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await page.waitForFunction((bookId) => (window as unknown as { __CONTENT__: { status: (i: string) => string | null } }).__CONTENT__.status(bookId) === 'ready', id)
  await page.getByRole('button', { name: 'Abrir' }).click()
  await page.waitForFunction(() => window.__SEL__!.phase === 'open')
  await expect(page.getByRole('navigation', { name: 'Sumário' })).toContainText('Carta de janeiro')
})

test('editar o título e remover: os exemplos voltam quando a estante fica vazia', async ({ page }) => {
  await atShelf(page)
  await page.getByRole('button', { name: 'Novo livro' }).click()
  const form = page.getByRole('dialog', { name: 'Um livro para a estante' })
  await form.locator('input[type=file][accept*=pdf]').setInputFiles(PDF)
  await expect(form).toContainText('28 páginas', { timeout: 20_000 })
  await form.getByRole('button', { name: 'Pôr na estante' }).click()
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand', undefined, { timeout: 15_000 })

  // edit: the book goes back to the shelf, the form opens with its data
  await page.getByRole('button', { name: 'Editar' }).click()
  const edit = page.getByRole('dialog', { name: 'fx-bordo' })
  await expect(edit.getByLabel('Título', { exact: true })).toHaveValue('fx-bordo')
  await edit.getByLabel('Título', { exact: true }).fill('Título Novo')
  await edit.getByRole('button', { name: 'Salvar' }).click()
  await expect(edit).toHaveCount(0)
  await page.waitForFunction(() => window.__SEL__!.selected === null)
  const id = await page.evaluate(() => window.__SEL__!.order[0])
  await page.evaluate((bookId) => window.__SEL__!.select(bookId), id)
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await expect(page.getByRole('dialog', { name: 'Título Novo' })).toBeVisible()

  // remove, with a confirmation
  await page.getByRole('button', { name: 'Remover' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click()
  await page.waitForFunction(() => window.__SEL__!.order.length === 6, undefined, { timeout: 15_000 })
})

test('soltar um PDF na sala abre o formulário com ele', async ({ page }) => {
  await atShelf(page)
  await page.evaluate(async () => {
    const blob = await (await fetch('/books/fx-verde.pdf')).blob()
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'Meu_caderno de campo.pdf', { type: 'application/pdf' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }))
  })
  const form = page.getByRole('dialog', { name: 'Um livro para a estante' })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Meu caderno de campo')
  await expect(form).toContainText('58 páginas', { timeout: 20_000 })
})
