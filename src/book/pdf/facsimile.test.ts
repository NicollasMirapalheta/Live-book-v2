import { describe, expect, it } from 'vitest'
import { classifyPages, facsimileUnits, gutterOf, headingsToc, outlineToc, paginateFacsimile } from './facsimile'
import type { FacsimileDoc, FacsimilePage, RawItem } from './types'

const item = (str: string, x: number, y: number, size = 10): RawItem => ({ str, x, y, w: str.length * size * 0.45, size, bold: false, italic: false })

/** A text page of a scanned book: running head, then lines every 12 pt; `x` is where its text block starts. */
function scanHalf(x: number, top: number, lines: number, head = 'EM DEFESA DA SOCIEDADE'): RawItem[] {
  const items = [item(head, x + 60, top, 8)]
  for (let i = 0; i < lines; i++) items.push(item('linha de texto corrido de um livro escaneado aqui', x, top - 24 - i * 12))
  return items
}

/** A spread: two book pages on one landscape PDF page. */
const spread = (left: RawItem[], right: RawItem[]): FacsimilePage => ({ width: 840, height: 600, items: [...left, ...right] })

const stats = (cover: number, chars: number, invisible = false) => ({ cover, imageArea: cover, chars, invisible })

describe('tipo do PDF', () => {
  it('texto corrido, mesmo com alguns desenhos, é rediagramado', () => {
    expect(classifyPages([stats(0, 2000), stats(0.3, 1500), stats(0, 1800), stats(0, 2100)])).toBe('reflow')
  })
  it('escaneamento: uma imagem por página, com OCR invisível ou sem texto', () => {
    expect(classifyPages([stats(0.95, 1800, true), stats(0.95, 1700, true), stats(0.9, 0), stats(0.95, 1600, true)])).toBe('scan')
  })
  it('livro diagramado: fundo ou arte sob texto visível', () => {
    expect(classifyPages([stats(1, 3000), stats(1, 2800), stats(0.2, 3000), stats(1, 0)])).toBe('designed')
  })
})

describe('fac-símile escaneado', () => {
  const doc: FacsimileDoc = {
    mode: 'scan',
    outline: [],
    pages: [
      spread(scanHalf(50, 545, 34), scanHalf(450, 545, 34)),
      spread(scanHalf(52, 547, 34), scanHalf(452, 547, 12)),
      // a chapter opening on the left half (no running head, sink), a full page on the right
      spread([item('AULA DE 7 DE JANEIRO DE 1976', 90, 500, 13), ...scanHalf(50, 470, 28).slice(1)], scanHalf(450, 545, 34)),
    ],
  }

  it('a dobra da folha dupla fica no vão entre as duas páginas', () => {
    const g = gutterOf(840, doc.pages[0].items)
    expect(g).toBeGreaterThan(370)
    expect(g).toBeLessThan(450)
  })

  it('cada folha dupla vira duas páginas, todas recortadas no mesmo tamanho (uma escala só)', () => {
    const units = facsimileUnits(doc)
    expect(units.map((u) => [u.page, u.side])).toEqual([
      [1, 'left'],
      [1, 'right'],
      [2, 'left'],
      [2, 'right'],
      [3, 'left'],
      [3, 'right'],
    ])
    const sizes = units.map((u) => [Math.round(u.x1 - u.x0), Math.round(u.y1 - u.y0)].join('×'))
    expect(new Set(sizes).size).toBe(1)
    // the short page keeps its text at the top (blank space below, as printed)
    const short = units[3]
    expect(short.y1).toBeGreaterThan(547)
    // every crop stays inside its half
    for (const u of units) expect(u.side === 'left' ? u.x1 <= 450 : u.x0 >= 380).toBe(true)
  })

  it('a esquerda da folha dupla cai numa página par, a direita numa ímpar; impressa no papel', () => {
    const layout = paginateFacsimile(doc, { title: 'Em defesa da sociedade' }, 0.7)
    const pdfPage = (n: number) => layout.pages.filter((p) => p.items.some((it) => it.kind === 'pdfpage')).map((p) => p.page)[n]
    expect(pdfPage(0) % 2).toBe(0)
    expect(pdfPage(1) % 2).toBe(1)
    const first = layout.pages[pdfPage(0) - 1].items[0]
    expect(first.kind === 'pdfpage' && first.blend).toBe('multiply')
    expect(layout.pageCount % 2).toBe(0)
    expect(layout.mode).toBe('scan')
  })

  it('sem sumário no PDF, os títulos em caixa alta viram o sumário (cabeço não conta)', () => {
    const units = facsimileUnits(doc)
    expect(headingsToc(doc, units)).toEqual([{ title: 'AULA DE 7 DE JANEIRO DE 1976', unit: 4 }])
    const layout = paginateFacsimile(doc, { title: 'Em defesa da sociedade' }, 0.7)
    expect(layout.toc.map((e) => e.title)).toEqual(['Página de rosto', 'AULA DE 7 DE JANEIRO DE 1976', 'Última página'])
  })

  it('linha de texto que o OCR leu maior não vira título', () => {
    const noisy: FacsimileDoc = { ...doc, pages: [spread([...scanHalf(50, 545, 30), item('para me fazer. Mas há uma à qual eu gostaria', 50, 150, 17)], scanHalf(450, 545, 34))] }
    expect(headingsToc(noisy, facsimileUnits(noisy))).toEqual([])
  })
})

describe('fac-símile diagramado', () => {
  const page = (n: number): FacsimilePage => ({ width: 600, height: 800, items: [item(`Texto da página ${n}`, 60, 700)] })
  const doc: FacsimileDoc = {
    mode: 'designed',
    pages: Array.from({ length: 6 }, (_, i) => page(i + 1)),
    outline: [
      { title: 'Introdução', page: 2, depth: 0 },
      { title: 'O que é RPG', page: 2, depth: 1 },
      { title: 'Capítulo 1: Personagem', page: 3, depth: 0 },
      { title: 'Capítulo 2: Perícias', page: 5, depth: 0 },
    ],
  }

  it('página inteira, sangrando quando a proporção é parecida com a do livro', () => {
    const layout = paginateFacsimile(doc, { title: 'Livro de regras' }, 0.73)
    expect(facsimileUnits(doc)).toHaveLength(6)
    const it0 = layout.pages[2].items[0]
    expect(it0.kind).toBe('pdfpage')
    if (it0.kind !== 'pdfpage') return
    expect(it0.blend).toBe('normal')
    // covers the page: as tall as the page or taller, as wide or wider
    expect(it0.h).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(it0.w).toBeGreaterThanOrEqual(0.73 - 1e-9)
  })

  it('a página ímpar do PDF fica numa página ímpar do livro', () => {
    const layout = paginateFacsimile(doc, { title: 'Livro de regras' }, 0.73)
    const unitOfPage = (p: number) => {
      const it0 = layout.pages[p - 1].items[0]
      return it0?.kind === 'pdfpage' ? it0.unit : null
    }
    expect(unitOfPage(3)).toBe(0)
    expect(unitOfPage(4)).toBe(1)
  })

  it('o sumário vem do outline do PDF, no nível de cima', () => {
    expect(outlineToc(doc.outline)?.map((e) => e.title)).toEqual(['Introdução', 'Capítulo 1: Personagem', 'Capítulo 2: Perícias'])
    const layout = paginateFacsimile(doc, { title: 'Livro de regras' }, 0.73)
    expect(layout.toc).toEqual([
      { title: 'Página de rosto', page: 1 },
      { title: 'Introdução', page: 4 },
      { title: 'Capítulo 1: Personagem', page: 5 },
      { title: 'Capítulo 2: Perícias', page: 7 },
      { title: 'Última página', page: 8 },
    ])
  })

  it('outline curto demais (só o arquivo da capa) não serve de sumário', () => {
    expect(outlineToc([{ title: 'capa.pdf', page: 1, depth: 0 }, { title: 'Livro', page: 2, depth: 0 }])).toBeNull()
  })
})
