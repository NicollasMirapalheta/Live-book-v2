import { describe, expect, it } from 'vitest'
import { syllabify } from './hyphenate'

describe('hifenização em português', () => {
  it.each([
    ['caminho', 'ca-mi-nho'],
    ['problema', 'pro-blema'],
    ['transporte', 'trans-porte'],
    ['excelente', 'ex-ce-lente'],
    ['esperando', 'es-pe-rando'],
    ['fotografia', 'fo-to-gra-fia'],
    ['pessoa', 'pes-soa'],
    ['amadureceram', 'ama-du-re-ce-ram'],
    ['quando', 'quando'],
    ['aquele', 'aquele'],
    ['carro', 'carro'],
    ['companhia', 'com-pa-nhia'],
    ['enquanto', 'en-quanto'],
    ['cobertores,', 'co-ber-to-res,'],
    ['(lembrança)', '(lem-brança)'],
  ])('%s → %s', (word, expected) => {
    expect(syllabify(word)).toBe(expected)
  })

  it('não mexe em números, palavras compostas nem palavras curtas', () => {
    expect(syllabify('1998–2004')).toBe('1998–2004')
    expect(syllabify('guarda-chuva')).toBe('guarda-chuva')
    expect(syllabify('casa')).toBe('casa')
  })
})
