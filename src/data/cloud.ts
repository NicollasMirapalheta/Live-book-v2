// Supabase for the user's books (spec Fase 7): Google sign-in, the `books` table and the `books` bucket.
// Loaded only when the project's keys are set (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY); without them
// the app keeps working with the books in this browser (Fase 6).
import type { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { BookRow, CloudDb } from './cloudBooks'
import { getCachedFile, putCachedFile } from './db'

const SUPABASE_URL = projectUrl(import.meta.env.VITE_SUPABASE_URL)
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const cloudConfigured = !!(SUPABASE_URL && KEY)
if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL !== 'off' && !SUPABASE_URL) {
  console.error('[nuvem] VITE_SUPABASE_URL inválida (use https://<projeto>.supabase.co); os livros ficam só neste navegador')
}

/**
 * The project URL from the env value: a full http(s) URL, or just the project ref (what the Supabase
 * dashboard shows first, and an easy paste by mistake). "off" (the e2e build) or anything else: undefined
 * (cloud off, app still runs).
 */
export function projectUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '')
  if (!value) return undefined
  if (/^[a-z0-9]{20}$/.test(value)) return `https://${value}.supabase.co`
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined
  } catch {
    return undefined
  }
}

let clientPromise: Promise<SupabaseClient> | null = null
export function getClient(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }),
  )
  return clientPromise
}

export interface Account {
  id: string
  name: string
  email: string
  avatar?: string
}

interface AccountState {
  /** off: no keys (local only); loading: reading the session; out/in: signed out / in */
  status: 'off' | 'loading' | 'out' | 'in'
  account: Account | null
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAccount = create<AccountState>((set) => ({
  status: cloudConfigured ? 'loading' : 'off',
  account: null,
  error: null,
  signIn: async () => {
    const client = await getClient()
    // back to this same page after Google (the Vercel address in production, localhost in dev)
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } })
    if (error) set({ error: error.message })
  },
  signOut: async () => {
    const client = await getClient()
    await client.auth.signOut()
  },
}))

function accountOf(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined): Account | null {
  if (!user) return null
  const meta = user.user_metadata ?? {}
  const email = user.email ?? ''
  return {
    id: user.id,
    email,
    name: String(meta.full_name ?? meta.name ?? email.split('@')[0] ?? 'Você'),
    avatar: typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined,
  }
}

let started: Promise<void> | null = null
/** Reads the session (also finishing a Google sign-in that just came back) and follows its changes. */
export function startAccount(): Promise<void> {
  if (!cloudConfigured) return Promise.resolve()
  started ??= getClient().then(async (client) => {
    const { data } = await client.auth.getSession()
    const account = accountOf(data.session?.user)
    useAccount.setState({ status: account ? 'in' : 'out', account })
    client.auth.onAuthStateChange((_event, session) => {
      const next = accountOf(session?.user)
      const prev = useAccount.getState().account
      if (next?.id !== prev?.id) useAccount.setState({ status: next ? 'in' : 'out', account: next })
    })
  })
  return started
}

/** The table and the bucket, behind the small interface cloudBooks.ts is written against. */
export async function cloudDb(): Promise<CloudDb> {
  const client = await getClient()
  const bucket = client.storage.from('books')
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`)
  }
  return {
    listRows: async () => {
      const { data, error } = await client.from('books').select('*').order('created_at')
      fail('listar livros', error)
      return (data ?? []) as BookRow[]
    },
    upsertRow: async (row) => fail('gravar livro', (await client.from('books').upsert(row)).error),
    deleteRow: async (id) => fail('remover livro', (await client.from('books').delete().eq('id', id)).error),
    upload: async (path, file) => fail('enviar arquivo', (await bucket.upload(path, file, { upsert: true, contentType: file.type || undefined })).error),
    download: async (path) => {
      // downloaded once, then read from this browser
      const cached = await getCachedFile(path)
      if (cached) return cached
      const { data, error } = await bucket.download(path)
      fail('baixar arquivo', error)
      await putCachedFile(path, data!)
      return data!
    },
    removeFiles: async (paths) => fail('apagar arquivos', (await bucket.remove(paths)).error),
  }
}
