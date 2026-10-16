# Medições de desempenho

`npm run perf` (`scripts/perf.ts`) mede o build de produção em local (sem nuvem) com o Chromium do Playwright, tela 1536×864 a 1,25× (1920×1080 a 125%), num roteiro fixo:

- N0 parado e olhando em volta;
- N2;
- livro na mão;
- livro aberto e 10 páginas;
- fechar;
- formulário.

As colunas medem:
- **RAM:** memória privada da árvore de processos do navegador (o que o Gerenciador de Tarefas mostra).
- **Vídeo:** memória dedicada da GPU por processo (contador do Windows).
- **Quadros:** tempo de quadro sem limite de vsync. A máquina de referência tem uma RTX 4060; "CPU 4×" simula um processador quatro vezes mais lento.

Os JSONs completos ficam em `shots/perf/` (fora do git).

## Base — 16/10/2026 (antes de otimizar, commit 8943a29)

### Memória

| Cenário | Tier | N0 | Pior ponto (passo) |
|---|---|---|---|
| Só exemplos | high | RAM 3,6 GB · vídeo 1,8 GB | RAM 4,0 GB · vídeo 2,0 GB (livro fechado) |
| Só exemplos | low | RAM 1,4 GB · vídeo 0,7 GB | RAM 1,6 GB · vídeo 0,8 GB (formulário / livro fechado) |
| 30 livros com foto | high | RAM 5,5 GB · vídeo 2,1 GB | RAM 6,2 GB · vídeo 2,5 GB (depois de 10 páginas) |
| 30 livros com foto | low | RAM 3,5 GB · vídeo 1,1 GB | RAM 3,9 GB · vídeo 1,4 GB (formulário) |

### Tempo de quadro (p50 / p95)

| Cenário | Tier | N0 olhando | Folheando | N2, CPU 4× |
|---|---|---|---|---|
| Só exemplos | high | 3,1 / 4,8 ms | 2,5 / 3,5 ms | 10,7 / 29,1 ms |
| Só exemplos | low | 1,5 / 1,9 ms | 1,6 / 2,1 ms | 6,6 / 9,6 ms |
| 30 livros com foto | high | 3,7 / 5,7 ms | 5,2 / 6,9 ms | **29,2 / 46,1 ms (30 fps)** |
| 30 livros com foto | low | 2,5 / 3,3 ms | 2,5 / 3,1 ms | 12,1 / 14,6 ms |

### Leitura

- Os números batem com o relato do usuário: ~5 GB no computador dele e ~4 GB num notebook mais fraco.
- A memória cresce com os livros: com 30 fotos de 12 MP, a RAM sobe ~2 GB nos dois tiers.
- Com a CPU mais lenta, cada livro na estante pesa no quadro (30 fps com 30 livros no high).
- Na GPU de referência há folga. Num notebook com vídeo integrado, que divide a RAM com o sistema, os 2 GB de vídeo saem da mesma memória.

## Etapa 1 — memória sem mudança visual (16/10)

O que mudou:
- um tier só (a qualidade é decidida antes de carregar);
- os bitmaps das texturas saem da RAM depois do upload;
- os livros compartilham papel, borda, sombra e trama;
- a frente dourada e a foto só existem com o livro na mão, e a foto é decodificada em até 1024 px;
- as texturas de cada livro são liberadas junto com ele;
- os PDFs compostos ficam na memória só para os 3 últimos livros;
- o canvas temporário das páginas é reaproveitado;
- o cache do folhear rápido segue o tier;
- a prévia do formulário espera a digitação parar.

Os shots são idênticos aos do código anterior (diferença só de ruído).

| Cenário | Tier | N0 | Pior ponto | Antes (pior ponto) |
|---|---|---|---|---|
| Só exemplos | high | RAM 3,1 GB · vídeo 1,8 GB | — | 4,0 GB · 2,0 GB |
| 30 livros com foto | high | RAM 3,1 GB · vídeo 1,8 GB | RAM 3,4 GB · vídeo 2,0 GB | 6,2 GB · 2,5 GB |
| 30 livros com foto | low | RAM 1,4 GB · vídeo 0,7 GB | RAM 1,75 GB · vídeo 0,8 GB | 3,9 GB · 1,4 GB |

Quadros, 30 livros, N2 com a CPU 4× mais lenta (p50 / p95):

| Tier | Antes | Depois |
|---|---|---|
| high | 29 / 46 ms | 26 / 43 ms |
| low | 12 / 15 ms | 16 / 33 ms |

A medição de quadro com CPU limitada varia bastante entre rodadas. A Etapa 3 trata o custo por quadro.

O que sobra no high são as texturas 2K da sala (Etapa 2, KTX2) e os buffers do pós-processamento em MSAA 4× (Etapa 3).

## Etapa 3 — custo por quadro sem mudar a imagem aprovada (16/10)

O que mudou:
- a sala para de renderizar enquanto o formulário está aberto (`frameloop="demand"`). O quadro com o formulário aberto caiu de ~5 ms para 0,2 ms;
- as estatísticas de render (`__SCENE_STATS__`) só existem nas ferramentas (`?e2e`, `?shot`, `?debug`);
- "reduzir movimento" usa uma MediaQueryList única, em vez de `matchMedia` por livro a cada quadro;
- **PerformanceMonitor** (`src/scene/AdaptiveQuality.tsx`): no high, quando a média fica abaixo de 45 fps em 5 s, o alívio vem em dois passos, sem recarregar modelos:
  1. pixel ratio 1 e MSAA 2×;
  2. sem MSAA e sem N8AO; a próxima visita já começa no low.
  Teste com a CPU 20× mais lenta: chegou ao passo 2 e guardou `low`. Sem limitação: nada mudou.

### Chamadas de desenho

Com 30 livros, tier high, no N2:

| Configuração | Chamadas de desenho |
|---|---|
| tudo ligado | 270 |
| sem pós | 166 |
| sem livros | 74 |
| sem objetos | 233 |

O N8AO redesenha a cena inteira (cerca de 100 chamadas com 30 livros). Cada livro custa 3,5 chamadas no low e 5,2 no high.

### Próximos candidatos

Esses mudam a imagem e precisam de aprovação:
- N8AO só nos objetos dinâmicos (a sala já tem AO no bake);
- livros da estante agrupados (página e lombada num material só, ou BatchedMesh);
- reflexo do piso em ¼ da tela.

## Etapa 2 — texturas KTX2 (16/10)

A sala e os objetos usam KTX2, com resolução por textura (`docs/decisoes.md`). A imagem foi aprovada pelo `art-reviewer`.

| Cenário | Tier | N0 | Pior ponto | Base (pior ponto) |
|---|---|---|---|---|
| 30 livros com foto | high | RAM 2,1 GB · vídeo 1,1 GB | RAM 2,35 GB · vídeo 1,3 GB | 6,2 GB · 2,5 GB |
| 30 livros com foto | low | RAM 1,3 GB · vídeo 0,6 GB | RAM 1,4 GB · vídeo 0,7 GB | 3,9 GB · 1,4 GB |

O download inicial vai de ~29 para ~33 MB (room.glb 12,0 → 16,4 MB).
