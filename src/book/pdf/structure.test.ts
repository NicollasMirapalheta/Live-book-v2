import { describe, expect, it } from 'vitest'
import { buildStructure, collapseSpaced, joinLines } from './structure'
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

  it('número do parágrafo um pouco abaixo da linha continua no começo dela', () => {
    const p: RawPage = { width: 595, height: H, items: [it_('1.', 64, 699.6), it_('A guerra de guerrilhas é política.', 80, 700)], images: [] }
    expect(buildStructure({ pages: [p] }).blocks).toEqual([{ type: 'paragraph', text: '1. A guerra de guerrilhas é política.' }])
  })

  it('texto espaçado letra a letra: junta as letras e mantém os espaços entre palavras', () => {
    const items: RawItem[] = []
    let x = 100
    for (const ch of 'DISTRIBUIÇÃO RESTRITA') {
      if (ch === ' ') {
        x += 9 // a wider gap between words
        continue
      }
      items.push({ str: ch, x, y: 700, w: 6, size: 10, bold: false, italic: false })
      x += 6 + 3 // letter-spacing
    }
    const p: RawPage = { width: 595, height: H, items, images: [] }
    expect(buildStructure({ pages: [p] }).blocks).toEqual([{ type: 'paragraph', text: 'DISTRIBUIÇÃO RESTRITA' }])
  })

  it('duas colunas: lê a da esquerda inteira, depois a da direita', () => {
    const items: RawItem[] = []
    const left = ['Esquerda um, primeira linha da coluna', 'esquerda dois, segunda linha e fim.']
    const right = ['Direita um, primeira linha da coluna', 'direita dois, segunda linha e fim.']
    left.forEach((t, i) => items.push(it_(t, 60, 700 - i * 14)))
    right.forEach((t, i) => items.push(it_(t, 320, 700 - i * 14)))
    const p: RawPage = { width: 595, height: H, items, images: [] }
    const text = buildStructure({ pages: [p] }).blocks.map((b) => (b.type === 'paragraph' ? b.text : '')).join(' | ')
    expect(text.indexOf('esquerda dois')).toBeLessThan(text.indexOf('Direita um'))
  })

  it('capa (pouco texto, título grande) sai do fluxo mesmo com várias linhas', () => {
    const cover: RawPage = {
      width: 595,
      height: H,
      items: [it_('TÁTICAS', 200, 600, 28), it_('Departamento', 200, 760, 9), it_('Manual de instrução', 200, 300, 10), it_('Doc. 17/23', 200, 280, 10), it_('Seção S2', 60, 120, 8), it_('Exemplar 02/14', 60, 108, 8)],
      images: [],
    }
    const body = (n: number) => page(n, Array.from({ length: 30 }, (_, i): [string] => [`Linha de texto número ${i} de um parágrafo comum do corpo.`]))
    const s = buildStructure({ pages: [cover, body(2), body(3)] })
    expect(s.title).toBe('TÁTICAS')
    expect(s.blocks.some((b) => b.type !== 'image' && /Departamento|Exemplar/.test(b.text))).toBe(false)
  })

  it('letras separadas por espaços viram palavra; número fica separado', () => {
    expect(collapseSpaced('C A P Í T U L O 3')).toBe('CAPÍTULO 3')
    expect(collapseSpaced('Uma frase normal com a e o')).toBe('Uma frase normal com a e o')
  })

  it('capítulo é o título que abre página; manchete grande no meio da página não é', () => {
    const a = page(2, [['Texto da introdução, primeira página do documento.']], [it_('INTRODUÇÃO', 200, 790, 13, true)])
    const b = page(3, [['O capítulo começa aqui com texto comum.']], [it_('CAPÍTULO 3', 200, 800, 13, true), it_('USO DA PALAVRA', 200, 785, 13, true), it_('Manchete enorme no meio', 64, 500, 20, true)])
    const s = buildStructure({ pages: [a, b] })
    const heads = s.blocks.filter((x) => x.type === 'heading')
    expect(heads).toEqual([
      { type: 'heading', level: 1, text: 'INTRODUÇÃO', number: '' },
      { type: 'heading', level: 1, text: 'USO DA PALAVRA', number: '3' },
      { type: 'heading', level: 2, text: 'Manchete enorme no meio' },
    ])
  })
})
