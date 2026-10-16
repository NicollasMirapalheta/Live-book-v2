import { describe, expect, it } from 'vitest'
import { layoutPages, sheetToTurn, spreadLabel, stackSplit } from './pages'

describe('layoutPages', () => {
  it('livro recém-aberto: guarda à esquerda, página 1 à direita', () => {
    expect(layoutPages(50, 0, null)).toEqual({ left: null, right: 1, turning: null, leftSheets: 0 })
  })

  it('depois de virar 2 folhas: páginas 4 e 5', () => {
    const l = layoutPages(50, 2, null)
    expect([l.left, l.right]).toEqual([4, 5])
  })

  it('fim do livro: última verso à esquerda, guarda de trás à direita', () => {
    const l = layoutPages(50, 50, null)
    expect([l.left, l.right]).toEqual([100, null])
  })

  it('durante a virada: a folha mostra frente e verso, as pilhas mostram o que fica embaixo', () => {
    const l = layoutPages(50, 2, { sheet: 2, t: 0.25, target: 1, dragging: false })
    expect(l.turning).toEqual({ sheet: 2, front: 5, back: 6, t: 0.25 })
    expect([l.left, l.right]).toEqual([4, 7])
    expect(l.leftSheets).toBe(2.25)
  })

  it('virando a primeira folha: nada à esquerda além da guarda', () => {
    expect(layoutPages(3, 0, { sheet: 0, t: 0.5, target: 1, dragging: true }).left).toBeNull()
  })

  it('virando a última folha: nada à direita além da guarda', () => {
    expect(layoutPages(3, 2, { sheet: 2, t: 0.5, target: 1, dragging: false }).right).toBeNull()
  })
})

describe('stackSplit', () => {
  it('as duas pilhas somam o miolo', () => {
    const s = stackSplit(0.01, 100, 30)
    expect(s.left).toBeCloseTo(0.003)
    expect(s.right).toBeCloseTo(0.007)
  })

  it('não passa dos limites', () => {
    expect(stackSplit(0.01, 100, -2)).toEqual({ left: 0, right: 0.01 })
    expect(stackSplit(0.01, 100, 120)).toEqual({ left: 0.01, right: 0 })
  })
})

describe('sheetToTurn', () => {
  it('não vira antes da primeira nem depois da última', () => {
    expect(sheetToTurn(10, 0, -1)).toBeNull()
    expect(sheetToTurn(10, 10, 1)).toBeNull()
    expect(sheetToTurn(10, 0, 1)).toBe(0)
    expect(sheetToTurn(10, 10, -1)).toBe(9)
  })
})

describe('spreadLabel', () => {
  it('omite a guarda e as páginas em branco depois do fim', () => {
    expect(spreadLabel({ left: null, right: 1 }, 99)).toBe('1')
    expect(spreadLabel({ left: 4, right: 5 }, 99)).toBe('4–5')
    expect(spreadLabel({ left: 100, right: null }, 99)).toBe('')
  })
})
