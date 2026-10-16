import { describe, expect, it } from 'vitest'
import { layoutPages, layoutRiffle, riffleBounds, sheetToTurn, spreadLabel, stackSplit, type Riffle } from './pages'

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

describe('riffle (sumário)', () => {
  it('divide o salto em no máximo N voos, do início ao alvo', () => {
    const b = riffleBounds(0, 100, 14)
    expect(b).toHaveLength(15)
    expect(b[0]).toBe(0)
    expect(b[14]).toBe(100)
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1])
  })

  it('salto curto: uma folha por voo; para trás, decrescente', () => {
    expect(riffleBounds(10, 3, 14)).toEqual([10, 9, 8, 7, 6, 5, 4, 3])
  })

  it('para a frente: o que pousou fica à esquerda, o que não saiu à direita, os voos levam o primeiro e o último lado', () => {
    const r: Riffle = { bounds: [0, 10, 20, 30], dir: 1, launched: 2, landed: 1, inAir: [{ index: 1, t: 0.4 }], clock: 0 }
    const l = layoutRiffle(50, r)
    expect([l.left, l.right]).toEqual([20, 41])
    expect(l.flights).toEqual([{ front: 21, back: 40, t: 0.4 }])
    expect(l.leftSheets).toBe(10)
    expect(l.turned).toBe(10)
  })

  it('para trás: espelhado', () => {
    const r: Riffle = { bounds: [30, 20, 10], dir: -1, launched: 1, landed: 0, inAir: [{ index: 0, t: 0.7 }], clock: 0 }
    const l = layoutRiffle(50, r)
    expect([l.left, l.right]).toEqual([40, 61])
    expect(l.flights).toEqual([{ front: 41, back: 60, t: 0.7 }])
    expect(l.leftSheets).toBe(20)
  })

  it('no fim do livro a direita é a guarda', () => {
    const r: Riffle = { bounds: [0, 50], dir: 1, launched: 1, landed: 1, inAir: [], clock: 0 }
    expect(layoutRiffle(50, r).right).toBeNull()
  })
})
