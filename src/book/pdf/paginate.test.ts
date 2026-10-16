import { describe, expect, it } from 'vitest'
import { breakLines, paginate, PAGE, SHRINK, STRETCH, type Measure, type PlanItem } from './paginate'
import type { Block } from './types'

// every character half the font size wide: deterministic, close enough to a serif
const measure: Measure = (text, font) => text.length * font.size * 0.5
const ASPECT = 0.16 / 0.23
const meta = { title: 'Livro de Teste' }
const words = (n: number, seed = 0) => Array.from({ length: n }, (_, i) => `palavra${(i + seed) % 7}`).join(' ')
const lines = (items: PlanItem[]) => items.filter((it) => it.kind === 'line')

describe('composição em páginas', () => {
  it('rosto (1), colofão (2), texto a partir da 3, total par', () => {
    const l = paginate({ blocks: [{ type: 'paragraph', text: words(40) }] }, meta, ASPECT, measure)
    expect(l.pages[0].items.some((it) => it.kind === 'text' && it.text === 'Livro de Teste')).toBe(true)
    expect(lines(l.pages[2].items).length).toBeGreaterThan(0)
    expect(l.pageCount % 2).toBe(0)
    expect(l.pageCount).toBe(l.pages.length)
  })

  it('capítulo abre em página ímpar, com número e título, e entra no sumário', () => {
    const blocks: Block[] = [
      { type: 'heading', level: 1, text: 'Primeiro' },
      { type: 'paragraph', text: words(30) },
      { type: 'heading', level: 1, text: 'Segundo' },
      { type: 'paragraph', text: words(30) },
    ]
    const l = paginate({ blocks }, meta, ASPECT, measure)
    const chapters = l.toc.filter((e) => e.chapter !== undefined)
    expect(chapters.map((c) => c.title)).toEqual(['Primeiro', 'Segundo'])
    for (const c of chapters) {
      expect(c.page % 2).toBe(1)
      const p = l.pages[c.page - 1]
      expect(p.head).toBeUndefined()
      expect(p.items.some((it) => it.kind === 'text' && it.text === c.title)).toBe(true)
    }
    // the page before the second chapter is a blank verso (the first chapter fits on one page)
    expect(l.pages[chapters[1].page - 2].items).toHaveLength(0)
  })

  it('cabeço: título do livro na par, do capítulo na ímpar', () => {
    const l = paginate({ blocks: [{ type: 'heading', level: 1, text: 'Capítulo X' }, { type: 'paragraph', text: words(2000) }] }, meta, ASPECT, measure)
    const even = l.pages.find((p) => p.page % 2 === 0 && p.page > 3 && p.head)
    const odd = l.pages.find((p) => p.page % 2 === 1 && p.page > 3 && p.head)
    expect(even?.head).toBe('Livro de Teste')
    expect(odd?.head).toBe('Capítulo X')
  })

  it('linhas nunca passam do pé da página; a última linha do parágrafo não é justificada', () => {
    const l = paginate({ blocks: [{ type: 'paragraph', text: words(3000) }] }, meta, ASPECT, measure)
    for (const p of l.pages) for (const it of lines(p.items)) expect(it.y).toBeLessThanOrEqual(PAGE.bottom + 1e-9)
    const all = l.pages.flatMap((p) => lines(p.items))
    expect(all[all.length - 1].kind === 'line' && all[all.length - 1].justify).toBe(false)
    expect(all.filter((it) => it.kind === 'line' && it.justify).length).toBe(all.length - 1)
  })

  it('viúvas e órfãs: nunca uma linha só de parágrafo no pé ou no topo', () => {
    const blocks: Block[] = Array.from({ length: 60 }, (_, i) => ({ type: 'paragraph' as const, text: words(18 + ((i * 7) % 40), i) }))
    const l = paginate({ blocks }, meta, ASPECT, measure)
    // walk the paragraphs through the pages and count their lines on each page
    let para = -1
    const perPage = new Map<string, number>()
    for (const p of l.pages) {
      for (const it of lines(p.items)) {
        if (it.kind !== 'line') continue
        if (it.x > 0) para++
        const k = `${para}:${p.page}`
        perPage.set(k, (perPage.get(k) ?? 0) + 1)
      }
    }
    const byPara = new Map<number, number[]>()
    for (const [k, n] of perPage) {
      const [pi] = k.split(':').map(Number)
      byPara.set(pi, [...(byPara.get(pi) ?? []), n])
    }
    for (const counts of byPara.values()) if (counts.length > 1) for (const n of counts) expect(n).toBeGreaterThanOrEqual(2)
  })

  it('imagem inteira numa página, dentro da mancha, proporção mantida', () => {
    const blocks: Block[] = [{ type: 'paragraph', text: words(500) }, { type: 'image', id: 'a', aspect: 1.5 }, { type: 'paragraph', text: words(50) }]
    const l = paginate({ blocks }, meta, ASPECT, measure)
    const img = l.pages.flatMap((p) => p.items).find((it) => it.kind === 'image')
    expect(img).toBeDefined()
    if (img?.kind !== 'image') return
    expect(img.y + img.h).toBeLessThanOrEqual(PAGE.bottom)
    expect(img.w / img.h).toBeCloseTo(1.5)
    expect(img.w).toBeLessThanOrEqual(ASPECT * (1 - PAGE.inner - PAGE.outer) + 1e-9)
  })

  it('quebra de linha: cada linha cabe com espaços de no mínimo 80%; o recuo vale só para a primeira', () => {
    const font = { size: 0.02 }
    const ls = breakLines(words(200), 0.5, 0.05, measure, font)
    const space = measure(' ', font)
    ls.forEach((l, i) => {
      const ink = l.reduce((acc, w) => acc + measure(w, font), 0)
      expect(ink + (l.length - 1) * space * (1 - SHRINK)).toBeLessThanOrEqual(0.5 - (i === 0 ? 0.05 : 0) + 1e-9)
    })
  })

  it('quebra por parágrafo: espaçamento mais regular que a gulosa, com hifenização', () => {
    const font = { size: 0.02 }
    const text = 'Recolhi sementes de pitanga, de araçá e de uma palmeira que ainda não consegui identificar. No fim da tarde a luz entra rasante pela mata e cada folha parece acesa por dentro, enquanto os pescadores contavam que a última grande ressaca levou metade da restinga.'
    const width = 0.42
    const space = measure(' ', font)
    const spread = (ls: string[][]) => {
      // worst word-space ratio over the justified lines
      let worst = 0
      ls.slice(0, -1).forEach((l) => {
        const ink = l.reduce((acc, w) => acc + measure(w, font), 0)
        worst = Math.max(worst, Math.abs((width - ink) / ((l.length - 1) * space) - 1))
      })
      return worst
    }
    const kp = breakLines(text, width, 0, measure, font)
    expect(spread(kp)).toBeLessThanOrEqual(STRETCH + 1e-9)
    expect(kp.flat().some((w) => w.endsWith('-'))).toBe(true)
    // the words survive the hyphenation, in order
    expect(kp.flat().join(' ').replace(/- /g, '')).toBe(text)
  })

  it('nunca deixa um pedaço de palavra sozinho numa linha justificada', () => {
    const font = { size: 0.02 }
    const text = 'Choveu à noite e a manhã trouxe cogumelos alaranjados em todos os troncos podres do caminho e vi rastros de um animal pequeno.'
    for (const width of [0.3, 0.35, 0.42, 0.5]) {
      const ls = breakLines(text, width, 0, measure, font)
      ls.slice(0, -1).forEach((l) => expect(l.length).toBeGreaterThan(1))
    }
  })

  it('número do capítulo vem do PDF; introdução não tem número', () => {
    const blocks: Block[] = [
      { type: 'heading', level: 1, text: 'Introdução', number: '' },
      { type: 'paragraph', text: words(20) },
      { type: 'heading', level: 1, text: 'Uso da palavra', number: '3' },
      { type: 'paragraph', text: words(20) },
    ]
    const l = paginate({ blocks }, meta, ASPECT, measure)
    const texts = (n: number) => l.pages[n - 1].items.filter((it) => it.kind === 'text').map((it) => (it.kind === 'text' ? it.text : ''))
    const intro = l.toc.find((e) => e.title === 'Introdução')!
    const ch3 = l.toc.find((e) => e.title === 'Uso da palavra')!
    expect(texts(intro.page).some((t) => t.startsWith('CAPÍTULO'))).toBe(false)
    expect(texts(ch3.page)).toContain('CAPÍTULO 3')
    expect(ch3.chapter).toBe(3)
  })
})
