-- Live Book — Fase 7 (docs/specs/fase-7-nuvem.md)
-- Cole tudo no SQL Editor do seu projeto Supabase e clique em "Run". Pode rodar de novo sem estragar nada.
-- Cada usuário só vê e altera os próprios livros e arquivos (Row Level Security).

-- 1. Os livros ---------------------------------------------------------------------------------------
create table if not exists public.books (
  id            text        primary key,
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title         text        not null check (char_length(title) between 1 and 80),
  subtitle      text        check (char_length(subtitle) <= 100),
  description   text        not null default '' check (char_length(description) <= 400),
  color         text        not null check (color in ('bordo', 'verdeGarrafa', 'azulPetroleo', 'tabaco', 'mostardaVelha', 'couroNatural')),
  cover_material text       not null check (cover_material in ('leather', 'cloth')),
  trim_size     text        not null check (trim_size in ('medium', 'large')),
  page_count    integer     not null check (page_count between 2 and 5000),
  pdf_path      text        not null,
  pdf_name      text        not null,
  photo_path    text,
  created_at    bigint      not null,
  updated_at    timestamptz not null default now()
);

create index if not exists books_user_idx on public.books (user_id, created_at);

alter table public.books enable row level security;

drop policy if exists "books: dono lê" on public.books;
drop policy if exists "books: dono cria" on public.books;
drop policy if exists "books: dono altera" on public.books;
drop policy if exists "books: dono apaga" on public.books;

create policy "books: dono lê" on public.books for select to authenticated using (user_id = auth.uid());
create policy "books: dono cria" on public.books for insert to authenticated with check (user_id = auth.uid());
create policy "books: dono altera" on public.books for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "books: dono apaga" on public.books for delete to authenticated using (user_id = auth.uid());

-- 2. Os arquivos (PDF e foto da capa) --------------------------------------------------------------------
-- Bucket privado; caminho de cada arquivo: <user_id>/<book_id>/livro.pdf e <user_id>/<book_id>/foto
insert into storage.buckets (id, name, public, file_size_limit)
values ('books', 'books', false, 52428800) -- 50 MB por arquivo (limite do plano grátis)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "arquivos: dono lê" on storage.objects;
drop policy if exists "arquivos: dono envia" on storage.objects;
drop policy if exists "arquivos: dono substitui" on storage.objects;
drop policy if exists "arquivos: dono apaga" on storage.objects;

create policy "arquivos: dono lê" on storage.objects for select to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arquivos: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arquivos: dono substitui" on storage.objects for update to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arquivos: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
