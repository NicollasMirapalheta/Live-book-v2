import { describe, expect, it } from 'vitest'
import { buildStructure, joinLines } from './structure'
import type { RawItem, RawPage } from './types'

const H = 842
const it_ = (str: string, x: number, y: number, size = 11, bold = false): RawItem => ({ str, x, y, w: str.length * size * 0.45, size, bold, italic: false })

/** A body page: header and folio in the bands, lines every 15 pt from y0. */
function page(n: number, lines: [string, number?][], extra: RawItem[] = [], y0 = 770): RawPage {
  const items: RawItem[] = [it_('Meu documento — rascunho', 64, H - 40, 8), it_(String(n), 290, 32, 9), ...extra]
  lines.forEach(([s, x], i) => items.push(it_(s, x ?? 64, y0 - i * 15)))
  return { width: 595, height: H, items, images: [] }
}

const titlePage: RawPage = { width: 595, height: H, items: [it_('Cartas de Verão', 64, 520, 30, true), it_('Correspondência, 1998–2004', 64, 486, 15)], images: [] }

describe('estrutura do PDF', () => {
  it('título e subtítulo vêm da página de rosto, que sai do fluxo', () => {
    const s = buildStructure({ pages: [titlePage, page(2, [['Primeira linha do texto.']])] })
    expect(s.title).toBe('Cartas de Verão')
    expect(s.subtitle).toBe('Correspondência, 1998–2004')
    expect(s.blocks).toEqual([{ type: 'paragraph', text: 'Primeira linha do texto.' }])
  })

  it('cabeço repetido e número de página somem', () => {
    const pages = [2, 3, 4].map((n) => page(n, [[`Texto da página ${n}.`]]))
    const text = buildStructure({ pages }).blocks.map((b) => (b.type === 'paragraph' ? b.text : '')).join(' ')
    expect(text).not.toMatch(/rascunho/)
    expect(text).not.toMatch(/^\d|\s\d\s/)
  })

  it('títulos pelo tamanho; parágrafo novo pelo recuo; palavra hifenizada é reunida', () => {
    const p = page(2, [
      ['Uma lembrança antiga que começa aqui e conti-'],
      ['nua na linha de baixo até o ponto final.'],
      ['Outro parágrafo começa recuado.', 82],
      ['E segue sem recuo.'],
    ], [it_('O jardim', 64, 790, 18, true)])
    const s = buildStructure({ pages: [p] })
    expect(s.blocks[0]).toEqual({ type: 'heading', level: 1, text: 'O jardim' })
    expect(s.blocks[1]).toEqual({ type: 'paragraph', text: 'Uma lembrança antiga que começa aqui e continua na linha de baixo até o ponto final.' })
    expect(s.blocks[2]).toEqual({ type: 'paragraph', text: 'Outro parágrafo começa recuado. E segue sem recuo.' })
  })

  it('parágrafos separados por espaço (sem recuo) e parágrafo que continua na página seguinte', () => {
    const a = page(2, [['Primeiro parágrafo inteiro numa linha só que vai até a margem direita do texto'], ['termina aqui.']])
    // a blank line before the next paragraph
    a.items.push(it_('Segundo parágrafo começa depois de um espaço e continua', 64, 770 - 3 * 15 - 8))
    const b = page(3, [['na página seguinte sem quebrar.']])
    const s = buildStructure({ pages: [a, b] })
    expect(s.blocks.map((x) => x.type)).toEqual(['paragraph', 'paragraph'])
    expect(s.blocks[1]).toEqual({ type: 'paragraph', text: 'Segundo parágrafo começa depois de um espaço e continua na página seguinte sem quebrar.' })
  })

  it('imagens entram na ordem em que aparecem; enfeites pequenos são ignorados', () => {
    const p = page(2, [['Antes da imagem.']])
    p.images.push({ id: 'img1', x: 100, y: 400, w: 400, h: 200 }, { id: 'rule', x: 64, y: 300, w: 400, h: 2 })
    p.items.push(it_('Depois da imagem.', 64, 380))
    const s = buildStructure({ pages: [p] })
    expect(s.blocks).toEqual([
      { type: 'paragraph', text: 'Antes da imagem.' },
      { type: 'image', id: 'img1', aspect: 2 },
      { type: 'paragraph', text: 'Depois da imagem.' },
    ])
  })

  it('hífen no fim da linha é desfeito; frase nova ganha espaço', () => {
    expect(joinLines('guarda-', 'chuva')).toBe('guardachuva')
    expect(joinLines('fim.', 'Começo')).toBe('fim. Começo')
  })
})
