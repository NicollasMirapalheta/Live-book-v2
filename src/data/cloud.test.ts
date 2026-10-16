import { describe, expect, it } from 'vitest'
import { projectUrl } from './cloud'

describe('projectUrl', () => {
  it('aceita a URL completa, com espaços, aspas ou barra no fim', () => {
    expect(projectUrl('https://lrwqgocpkekaamjsfbbb.supabase.co')).toBe('https://lrwqgocpkekaamjsfbbb.supabase.co')
    expect(projectUrl('  "https://lrwqgocpkekaamjsfbbb.supabase.co/" ')).toBe('https://lrwqgocpkekaamjsfbbb.supabase.co')
  })

  it('aceita só o id do projeto (o que o painel mostra primeiro)', () => {
    expect(projectUrl('lrwqgocpkekaamjsfbbb')).toBe('https://lrwqgocpkekaamjsfbbb.supabase.co')
  })

  it('valor inválido ou ausente: sem nuvem, em vez de travar o app', () => {
    expect(projectUrl(undefined)).toBeUndefined()
    expect(projectUrl('')).toBeUndefined()
    expect(projectUrl('supabase')).toBeUndefined()
    expect(projectUrl('ftp://x.supabase.co')).toBeUndefined()
    expect(projectUrl('off')).toBeUndefined()
  })
})
