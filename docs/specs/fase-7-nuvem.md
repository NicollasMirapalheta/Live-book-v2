# Spec — Fase 7: nuvem (Supabase + login Google + Vercel)

Pedido do usuário (16/10): publicar o projeto para outra pessoa usar e ter os livros em qualquer navegador. Decisões dele: **cada pessoa tem a sua estante**, **login com conta Google**, **Supabase gerenciado** (projeto novo na conta dele), **Vercel com o domínio gerado por ela**, **tudo no git** (inclusive as saídas do pipeline: a Vercel publica a partir do repositório e o repositório é o backup). Acesso automático agendado contra a pausa de 7 dias do plano grátis: depois.

## Comportamento

- **Sem as chaves do Supabase** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`): o app funciona como na Fase 6 (livros só neste navegador). O botão de entrar não aparece.
- **Com as chaves**: canto superior direito, "Entrar com Google". Sem login, a estante mostra os exemplos e "Novo livro" pede para entrar primeiro (o livro precisa de dono). Logado: a estante é a do usuário (só os livros dele), com o nome/inicial dele e "Sair".
- **Primeiro login com livros locais** (criados na Fase 6 neste navegador): aviso "Você tem N livros só neste navegador — levar para a sua conta?" com **Levar** / **Agora não**. Levar envia cada livro (dados + PDF + foto) e apaga a cópia só-local.
- Criar, editar e remover: iguais à Fase 6; o "guardar" vai para o Supabase. O PDF de cada livro é baixado na primeira vez que o livro é aberto e fica guardado no IndexedDB (cache): abrir de novo não baixa.
- **Limites do plano grátis**: arquivo de até 50 MB (o formulário avisa antes de enviar); 1 GB no total.
- **Estante cheia** (pendência da Fase 6): o formulário avisa quando o livro novo não caberia na estante e não deixa criar.

## Dados (Supabase)

- Tabela `books`: `id` (texto, o mesmo id do app), `user_id` (uuid, dono = `auth.uid()`), título, subtítulo, descrição, cor, material, formato, `page_count`, `pdf_path`, `pdf_name`, `photo_path`, `created_at`.
- Storage: bucket privado `books`, arquivos em `<user_id>/<book_id>/livro.pdf` e `<user_id>/<book_id>/foto`.
- Segurança: Row Level Security em `books` e políticas no bucket — cada usuário só lê, cria, altera e apaga o que é dele. A chave "anon" no navegador é pública por desenho; quem protege os dados são essas regras.
- O SQL fica em `supabase/schema.sql`, para colar no editor SQL do Supabase (passo a passo em `docs/deploy/passo-a-passo.md`).

## Código

- `@supabase/supabase-js` (MIT), carregado só quando as chaves existem.
- `src/data/cloud.ts`: cliente, sessão (login Google, sair), operações de livros e arquivos.
- `src/data/library.ts` passa a escolher o armazenamento: nuvem (logado) ou IndexedDB (sem chaves). A interface não muda.

## Publicação

- Vercel importando o repositório do GitHub; build `npm run build`; variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel da Vercel.
- No Supabase: provedor Google ligado, URL do site da Vercel como "Site URL" e nas "Redirect URLs".
- No Google Cloud: credencial OAuth (Web) com o callback do Supabase; tela de consentimento em "Testing" com os e-mails de quem usa (ou publicada — só pede nome e e-mail).

## Verificação

- `npm run test`: a camada da nuvem com um cliente falso (gravar livro + arquivos, listar só os do usuário, remover tudo, migrar livros locais) e o aviso de estante cheia.
- `npm run e2e`: sem chaves, tudo como antes (23 testes); o botão de entrar não aparece.
- Manual (pelo usuário, com as chaves): entrar com Google em dois navegadores e ver os mesmos livros; segunda conta não vê os livros da primeira.
