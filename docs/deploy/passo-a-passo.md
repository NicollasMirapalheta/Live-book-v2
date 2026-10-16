# Publicar o Live Book — passo a passo

O que vamos montar: o site na **Vercel** (endereço `https://<nome>.vercel.app`), os livros guardados no **Supabase** (banco + arquivos) e o login com **conta Google**. Cada pessoa que entra tem a sua estante; ninguém vê os livros de outra pessoa.

Tempo estimado: 40–60 minutos na primeira vez. Tudo no plano grátis. Os nomes dos menus podem mudar um pouco com o tempo; se algo não bater, procure pelo nome parecido.

Você vai precisar copiar e colar 4 valores ao longo do caminho. Anote num bloco de notas (só no seu computador):

| Valor | Onde aparece | Onde vai |
|-------|--------------|----------|
| URL do projeto Supabase (`https://xxxx.supabase.co`) | Passo 2 | `.env.local` e Vercel |
| Chave pública do Supabase (`sb_publishable_…` ou a "anon" antiga) | Passo 2 | `.env.local` e Vercel |
| Client ID do Google (`….apps.googleusercontent.com`) | Passo 3 | Supabase |
| Client Secret do Google (`GOCSPX-…`) | Passo 3 | Supabase (**segredo**: nunca no código nem na Vercel) |

---

## 1. GitHub: o repositório (também é o backup)

1. Entre em <https://github.com> e crie um repositório novo: **New repository**, nome `live-book`, **Private**, sem README (o projeto já tem tudo).
2. Me peça "pode fazer o push para o GitHub" e me passe o endereço do repositório (`https://github.com/<você>/live-book.git`). Eu configuro o remoto e envio a branch. O envio tem ~300 MB (modelos, lightmaps e texturas), então pode levar alguns minutos.
   - Se preferir fazer você: no terminal, na pasta do projeto,
     ```bash
     git remote add origin https://github.com/<você>/live-book.git
     ```
     ```bash
     git push -u origin noite-01
     ```
3. Depois que aprovarmos a Fase 7, juntamos a `noite-01` na `main` (a Vercel publica a `main`).

## 2. Supabase: banco e arquivos

1. Entre em <https://supabase.com> → **Start your project** → entre com o GitHub (mais simples) ou e-mail.
2. **New project**:
   - Name: `live-book`
   - Database Password: clique em **Generate a password** e guarde num lugar seguro (não vamos usar no app, mas é a senha-mestra do banco).
   - Region: **South America (São Paulo)**.
   - Plano Free → **Create new project**. Espere ~2 minutos até ficar pronto.
3. **Criar as tabelas e o armazenamento**: no menu da esquerda, **SQL Editor** → **New query**. Abra o arquivo `supabase/schema.sql` do projeto, copie tudo, cole no editor e clique **Run**. Deve aparecer "Success. No rows returned".
   - Confira: **Table Editor** mostra a tabela `books`; **Storage** mostra o bucket `books` (privado).
4. **Pegar as chaves**: **Project Settings** (engrenagem) → **API Keys** (ou **Data API**/**API**):
   - **Project URL** → é o `VITE_SUPABASE_URL`.
   - **Publishable key** (`sb_publishable_…`; em projetos antigos, a **anon public**) → é o `VITE_SUPABASE_ANON_KEY`.
   - Essa chave é pública por desenho (vai para o navegador). Quem protege os livros são as regras do `schema.sql` (cada usuário só enxerga os próprios). **Não use** a `secret`/`service_role`.
5. Ainda no Supabase, anote o endereço de retorno do login: **Authentication** → **Sign In / Providers** → **Google** → copie o **Callback URL (for OAuth)**. É `https://xxxx.supabase.co/auth/v1/callback`. Não ative ainda: falta o Google.

## 3. Google Cloud: a credencial do "Entrar com Google"

1. Entre em <https://console.cloud.google.com> com a sua conta Google. Aceite os termos se pedir.
2. No topo, seletor de projetos → **New project** → nome `live-book` → **Create**. Selecione o projeto criado.
3. Menu → **APIs & Services** → **OAuth consent screen** (em contas novas aparece como **Google Auth Platform** → **Get started**):
   - App name: `Live Book`; User support email: o seu.
   - Audience: **External**.
   - Contact email: o seu → **Create**.
4. **Audience** (ou "Test users"): deixe em **Testing** e em **Test users** → **Add users**: o seu e-mail e o da sua namorada. Só quem está nessa lista consegue entrar (até 100 pessoas). É o mais simples e não precisa de verificação do Google.
   - Alternativa: **Publish app**. Como o app só pede nome, e-mail e foto, não precisa de verificação, e qualquer conta Google consegue entrar (cada uma com a sua estante, vazia). Em "Testing", o Google pode pedir login de novo a cada 7 dias.
5. **Clients** (ou **Credentials** → **Create credentials** → **OAuth client ID**):
   - Application type: **Web application**; Name: `live-book`.
   - **Authorized JavaScript origins**: `http://localhost:5173` (e, depois do passo 5, o endereço da Vercel).
   - **Authorized redirect URIs**: cole o **Callback URL** do Supabase (passo 2.5): `https://xxxx.supabase.co/auth/v1/callback`.
   - **Create**. Copie o **Client ID** e o **Client secret** (o secret só aparece inteiro agora; se perder, crie outro).

## 4. Supabase: ligar o Google

1. **Authentication** → **Sign In / Providers** → **Google** → ative (**Enable**).
2. Cole o **Client ID** e o **Client Secret** do passo 3 → **Save**.
3. **Authentication** → **URL Configuration**:
   - **Site URL**: por enquanto `http://localhost:5173`. No passo 5 você troca pelo endereço da Vercel.
   - **Redirect URLs** → **Add URL**: `http://localhost:5173/**` (e, depois do passo 5, `https://<nome>.vercel.app/**`).

## 5. Vercel: o site

1. Entre em <https://vercel.com> → **Sign up** → **Continue with GitHub** (plano **Hobby**, grátis).
2. **Add New…** → **Project** → autorize a Vercel a ver o repositório `live-book` → **Import**.
3. Configuração (a Vercel detecta o Vite sozinha; confira):
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install` (padrão)
4. **Environment Variables**: adicione as duas, para todos os ambientes:
   - `VITE_SUPABASE_URL` = a Project URL (passo 2.4)
   - `VITE_SUPABASE_ANON_KEY` = a publishable key (passo 2.4)
5. **Deploy**. Em ~2 minutos sai o endereço, algo como `https://live-book-xxxx.vercel.app`. Em **Settings** → **Domains** dá para trocar por um nome mais bonito, ainda terminando em `.vercel.app` (ex.: `nossa-estante.vercel.app`).
6. Volte e complete com o endereço final:
   - **Supabase** → Authentication → URL Configuration: **Site URL** = `https://<nome>.vercel.app`; em **Redirect URLs** adicione `https://<nome>.vercel.app/**` (mantenha a do localhost para testar no seu computador).
   - **Google Cloud** → o cliente OAuth → **Authorized JavaScript origins**: adicione `https://<nome>.vercel.app` → **Save**.
7. A partir daí, cada envio para a `main` no GitHub publica sozinho.

## 6. No seu computador (desenvolvimento)

No arquivo `.env.local` (na pasta do projeto, já existe por causa do Blender), acrescente:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Rode `npm run dev` de novo. Sem essas duas linhas o app continua funcionando como antes (livros só neste navegador).

## 7. Testar

1. Abra o site da Vercel → canto superior direito, **Entrar com Google** → escolha a sua conta.
   - Se você já tinha livros criados neste navegador, aparece "Levar para a sua conta?" → **Levar**.
2. Crie um livro. Abra o site em outro navegador (ou no celular), entre com a mesma conta: o livro está lá.
3. Peça para a sua namorada entrar com a conta dela: a estante dela começa vazia (com os exemplos) e ela não vê os seus.
4. Se der erro no login:
   - "redirect_uri_mismatch" → o Callback URL do Supabase não está igual no Google (passo 3.5).
   - "Access blocked: app is in testing" → o e-mail não está nos Test users (passo 3.4).
   - Volta para o localhost em vez da Vercel → Site URL / Redirect URLs do Supabase (passo 5.6).

## Limites e cuidados

- **Plano grátis do Supabase**: 500 MB de banco (sobra), **1 GB de arquivos** (≈ 100–200 livros, conforme o tamanho dos PDFs), arquivo de até **50 MB** (o formulário avisa).
- **Pausa**: projeto grátis sem nenhum acesso por **7 dias** é pausado. Os dados não se perdem; é só entrar no painel do Supabase e clicar **Restore project**. Combinamos de fazer depois um acesso automático agendado para evitar isso.
- **Backup**: o código e os modelos estão no GitHub. Os livros (PDFs e fotos) ficam no Supabase. Para guardar uma cópia, use Storage → bucket `books` → baixar.
- **Segredos**: o Client Secret do Google só fica no painel do Supabase. A senha do banco não é usada pelo app. Nenhum dos dois vai para o código, o GitHub ou a Vercel.
