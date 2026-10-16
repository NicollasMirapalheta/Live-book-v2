# Spec — Fase 5: PDF → páginas rediagramadas

Derivada do CLAUDE.md ("o conteúdo vem de um PDF rediagramado na identidade visual do projeto"). Ponto de partida: a Fase 4 já abre e folheia o livro com páginas provisórias desenhadas em canvas (`pageContent.ts`) e um sumário provisório (`toc.ts`).

## O que "rediagramar" quer dizer aqui

O PDF do usuário **não é fotografado** página a página. O conteúdo dele (títulos, parágrafos, imagens) é extraído e **composto de novo** no formato e na tipografia do livro: margens de livro, texto justificado, capítulos abrindo em página ímpar, cabeço e fólio. Um PDF A4 de 20 páginas pode virar 60 páginas de livro 16 × 23 cm; o número de páginas que define a espessura é o da composição.

Alternativa descartada: rasterizar as páginas do PDF como texturas. É mais fiel ao original, mas não parece um livro (margens, tamanho e tipografia de cada PDF) e contradiz o CLAUDE.md.

## Pipeline (no navegador)

1. **Extração** (`src/book/pdf/extract.ts`, pdf.js carregado sob demanda): por página, os trechos de texto com posição, tamanho e fonte; as imagens com posição e tamanho; o sumário do PDF (outline), se houver.
2. **Estrutura** (`structure.ts`, função pura): de trechos para blocos `heading` (nível 1–2), `paragraph` e `image`.
   - Linhas por posição vertical; parágrafos por recuo da primeira linha ou espaço maior entre linhas.
   - Títulos por tamanho de fonte acima do corpo (mediana) ou negrito isolado.
   - Remove cabeço e rodapé repetidos e números de página; junta palavras hifenizadas no fim da linha.
3. **Composição** (`paginate.ts`, função pura com medição de texto injetada): blocos → páginas.
   - Mancha, margens e corpo iguais aos das páginas provisórias: Georgia, justificado, recuo de parágrafo, ~26 linhas por página.
   - Capítulo (título nível 1) abre em página ímpar, com número e título; a página anterior termina curta.
   - Imagens na largura da mancha (ou menores), sem cortar, nunca divididas; legenda não é tratada.
   - Viúvas e órfãs: no mínimo 2 linhas de um parágrafo em cada página.
   - Página de rosto (1), verso em branco com colofão (2), conteúdo a partir da 3.
4. **Desenho** (`render.ts`): uma página composta → canvas → textura (mesmo cache e resoluções da Fase 4: 1,5K no high, 1K no low, 768 px no folhear rápido). Cabeço: título do livro na página par, título do capítulo na ímpar.
5. **Sumário**: os títulos de nível 1 com a página composta (ou o outline do PDF, se existir e bater com os títulos).

## De onde vem o PDF nesta fase

- **Livros de teste**: PDFs de exemplo gerados por nós (`scripts/make-sample-pdfs.ts`, pdf-lib, texto próprio — sem material de terceiros) em `public/books/`, com cabeço, rodapé, numeração, hifenização, títulos e imagens geradas, para exercitar a extração. Cada livro de teste aponta para um PDF (`pdfUrl`).
- **Testar com um PDF seu**: arrastar um PDF para a janela com um livro na mão ou aberto troca o conteúdo daquele livro **até recarregar a página** (sem persistência: Fase 6).
- A espessura (`pageCount`) dos livros de teste é a da composição; um teste confere que bate.
- Livros sem PDF continuam com as páginas provisórias.

## Desempenho

- pdf.js (~1 MB) só carrega quando um livro com PDF é aberto; o worker do pdf.js faz a leitura.
- A composição roda quando o livro chega à mão (enquanto o painel está aberto); um livro de 300 páginas compõe em < 1 s.
- Só as páginas visíveis viram textura (como na Fase 4).

## Verificação

- `npm run test`: estrutura (cabeço/rodapé/numeração removidos, hifenização, parágrafos, títulos) e composição (capítulo em página ímpar, viúvas/órfãs, imagem inteira numa página, sumário) com medição falsa determinística.
- `npm run e2e`: abrir um livro de teste com PDF → a página de rosto tem o título do PDF; o sumário lista os capítulos do PDF; ir a um capítulo mostra o título dele.
- `npm run shot -- --node N2 --query select=<id>&open=1&page=N`: páginas de texto, abertura de capítulo e página com imagem; revisão do `art-reviewer` ("parece um livro impresso, não um PDF?").

## Implementação (2026-10-16)

- `src/book/pdf/`: `extract.ts` (pdf.js, sem carregar faces de fonte; imagens copiadas para canvas próprio), `structure.ts` (puro), `paginate.ts` (puro), `content.ts` (store por livro: `ensure`, `useFile`; `window.__CONTENT__` com `?e2e=1`).
- O desenho da página composta fica em `reader/pageContent.ts` (`drawPlan`), com o mesmo papel, calha e transparência do verso das páginas provisórias; tamanhos fracionários (a página desenha igual em 768, 1024 e 1536 px).
- `npm run books:samples` gera os PDFs de exemplo em `public/books/`.
- Medido nos exemplos (navegador com GPU): 19 páginas A4 → 48 páginas em 0,55 s; 68 páginas A4 com 5 desenhos → 208 páginas em 0,6 s.
- Testes: 13 unitários (estrutura e composição), 4 e2e (`e2e/pdf.spec.ts`: espessura, sumário do PDF, ir ao capítulo, soltar um PDF).
