# Spec — Fase 6: identidade visual da interface + persistência

Derivada do CLAUDE.md ("6. Identidade visual da interface + persistência"; "Persistência: IndexedDB no MVP; Supabase depois da validação"). Ponto de partida: os livros são os 6 de teste (fixtures), o conteúdo vem de um PDF (Fase 5) e soltar um PDF troca o conteúdo só até recarregar.

## Persistência (IndexedDB)

- Banco `live-book`, store `books`: um registro por livro do usuário com os dados de `BookData` (título, subtítulo, descrição, cor, material, formato, data) + `pdf` (Blob, o arquivo original) + `coverPhoto` (Blob, opcional) + `pageCount` (da composição, define a espessura) + `pdfName`.
- O PDF é guardado como o usuário mandou; a composição (Fase 5) roda de novo quando o livro é aberto (rápida) — não se guarda página desenhada.
- Sem dependência nova: um invólucro pequeno sobre a API nativa (`src/data/db.ts`).
- Se o IndexedDB falhar (navegação privada, cota), o livro existe só na sessão e o painel avisa.

## Livros na estante

- A estante mostra os livros do usuário. Enquanto ele não tem nenhum, mostra os livros de exemplo (os de teste), marcados como exemplo no painel; o primeiro livro criado os substitui.
- Livro novo entra no fim da fileira; a estante se recompõe (os objetos das prateleiras se ajustam como na Fase 3). Se não couber, o painel de criação avisa ("a estante está cheia").

## Criar, editar, remover

- **Novo livro**: botão na estante (nó N2) e também soltar um PDF em qualquer lugar da sala (abre o formulário já com o arquivo e o título vindo do nome do arquivo).
- Formulário (mesmo vidro do painel): Título\*, Subtítulo, Descrição, PDF\* (arquivo), Foto da capa (imagem, vira a polaroid), Cor (6 amostras da paleta), Material (couro/tecido), Formato (16 × 23 / 19 × 26). Prévia: a lombada e a capa do livro em 3D ao lado do formulário (o próprio livro, girando devagar), atualizada a cada mudança.
- Ao salvar: o PDF é composto (barra de progresso se demorar), o número de páginas é gravado, o livro aparece na estante e vem para a mão.
- No painel do livro do usuário: **Editar** (o mesmo formulário) e **Remover** (confirmação; o livro volta para a estante e some).
- Exemplos não são editáveis.

## Identidade visual da interface

- Uma folha de tokens (`src/ui/tokens.css`): cores (tinta, papel, ouro, vidro), raios, sombra, desfoque, tipografia (Georgia para títulos e texto; versalete espaçado para rótulos), tamanhos de toque (≥ 44 px), foco visível em ouro. Todos os componentes (painel, barra de leitura, sumário, popover, navegação, formulário) passam a usar os tokens.
- Componentes: botão principal (ouro), secundário (contorno), ícone redondo; campo de texto; seletor de amostras; zona de arquivo (arrastar ou escolher).
- **Tela de abertura**: enquanto a sala carrega, fundo escuro com o nome "Live Book" e uma barra fina de progresso (dos assets); some com um fade quando a cena está pronta (o que hoje é tela preta).
- Dica discreta na primeira visita ("arraste para olhar · ↑ para andar"), some na primeira interação e não volta (preferência local).
- Tudo responde a `prefers-reduced-motion` e funciona com teclado.

## Verificação

- `npm run test`: o invólucro do banco (com IndexedDB falso em memória, `fake-indexeddb` só em teste) e a regra exemplos × livros do usuário.
- `npm run e2e`: criar um livro com um PDF → aparece na estante → recarregar → continua lá → abrir mostra o conteúdo do PDF → editar o título → remover.
- `npm run shot`: formulário de criação, painel com Editar/Remover, tela de abertura; revisão do `art-reviewer` da interface ("a interface pertence à sala?").

## Implementação (2026-10-16)

- `src/data/db.ts` (IndexedDB nativo), `src/data/library.ts` (store: livros do usuário, exemplos enquanto não há nenhum, livro recém-criado vai para a mão).
- `src/ui/creator.ts` (estado do formulário; Editar devolve o livro à estante antes; Remover espera o livro voltar), `src/ui/BookForm.tsx` (formulário com prévia 3D iluminada pelo env map da sala), `src/ui/LibraryUI.tsx` ("Novo livro" e PDF solto em qualquer lugar), `src/ui/LoadingScreen.tsx` (tela de abertura + dica de primeira visita), `src/ui/tokens.css` + `src/ui/ui.css`.
- O modo de teste da Fase 5 ("soltar o PDF troca o conteúdo até recarregar") saiu: soltar um PDF agora abre o formulário.
- Livro sem foto não tem polaroid (um cartão em branco parecia adesivo).
- `?form=new` abre o formulário (screenshots).
- Testes: 3 unitários do banco (`fake-indexeddb`), 3 e2e (`e2e/library.spec.ts`: criar → recarregar → abrir; editar e remover; soltar PDF).
