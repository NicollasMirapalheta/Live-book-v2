# Relatório da noite 01 — 15/10/2026

Início: 00:02 · fim: ~02:50 (relógio da máquina). Branch `noite-01`, sem push. Todas as tarefas T0–T10 marcadas `[x]` (T7 com as notas abaixo de 4 explicadas). Verificação final: `npm run check` limpo, `npm run test` 15/15, `npm run e2e` 5/5.

## Resumo

1. **Pipeline completo e automático:** Blender 5.2 (GPU OptiX, RTX 4060) monta a sala, a estante, os props e as cortinas (simulação de tecido), assa os lightmaps, faz o denoise, exporta e otimiza para o navegador com um comando (`npm run pipeline -- --quality draft|final`, ~3 min em draft).
2. **Sala no navegador:** lightmaps RGBM, reflexo planar borrado das janelas no piso, quadriculado do sol, feixes e poeira, props em PBR com sombra, AgX. Cerca de 105 draw calls no N0, dentro do orçamento.
3. **Look dev:** 6 iterações em draft com o `art-reviewer` mais o bake final. Depois da última revisão, a costura de luz no vestíbulo e o moiré do tecido foram corrigidos num segundo bake final. Notas da última revisão estão abaixo. **A Fase 0 não está aprovada:** há candidatos prontos para a sua avaliação.
4. **Navegação (Fase 1):** pronta e testada (5/5 e2e). Arrastar, roda, teclado, botões, marcadores no piso, tween de 1,4 s e `prefers-reduced-motion`.
5. **Livro (Fase 2):** livro paramétrico em cena isolada (`?dev=book`) com 6 livros de teste e 15 testes unitários (geometria e layout da estante). O livro **não** entrou na sala, como manda o runbook.

## Como ver

```bash
npm install
```

```bash
npm run dev
```

- Sala: `http://localhost:5173/` (N0), `http://localhost:5173/?node=N1`, `http://localhost:5173/?node=N2`
- Tier baixo: `http://localhost:5173/?quality=low`
- Livro isolado (com painel `leva` em dev): `http://localhost:5173/?dev=book`
- Depuração: `?debug=lightmap` mostra só os lightmaps; `?off=beams,reflect,effects` desliga partes.

Os arquivos gerados (`public/models`, `public/lightmaps`, `public/env`, `public/textures`) ficam fora do git. Se faltarem:

```bash
npm run pipeline -- --quality final
```

Screenshots: `npm run shot` (sala) e `npm run shot -- --dev book` (livro).

## Screenshots (`shots/latest/`)

- `compare_N0.png`: referência × N0 lado a lado (frame de aprovação)
- `N0.png`, `N0_approval.png`, `N1.png`, `N2.png` e `stats.json`
- `book/book_48_bordo_couro.png`, `book/book_220_verde_tecido.png`, `book/book_640_couro_natural.png`
- `assets_contact.png`: folha de contato dos assets
- `blender_N0.png`, `blender_N2.png`: prévias do Cycles

## ✅ Fase 7 aprovada — nuvem (login Google, Supabase, Vercel)

- No ar em https://live-book-v2.vercel.app; aprovada pelo usuário em 16/10 depois de testar login e livros.

- Com as chaves do Supabase, canto superior direito: **Entrar com Google**. Logado, a estante é só sua (nome/foto e **Sair**); em outro navegador, entrando com a mesma conta, os livros estão lá. Deslogado, "Novo livro" pede para entrar primeiro.
- Primeiro login com livros criados neste navegador: aviso para **levar para a sua conta**.
- O PDF de cada livro desce na primeira abertura e fica guardado no navegador; abrir de novo não baixa.
- Avisos novos no formulário: arquivo acima de 50 MB (limite do plano grátis) e **estante cheia** (o livro não caberia).
- Sem as chaves, tudo continua como na Fase 6. Testes: 82 unitários, 23 e2e.
- Para publicar: `docs/deploy/passo-a-passo.md` (GitHub → Supabase → Google Cloud → Vercel → testar com duas contas).

## Fase 6 — interface e livros do usuário

- **Novo livro** na estante (ou soltar um PDF em qualquer lugar da sala): formulário com título, subtítulo, descrição, PDF, foto da capa (vira a polaroid), cor, material e formato, com o próprio livro girando ao lado na cor escolhida. Ao guardar, o PDF é composto, o livro entra na estante e vem para a mão.
- Os livros ficam guardados neste navegador (IndexedDB): continuam lá depois de recarregar. Enquanto você não tem nenhum, a estante mostra os 6 de exemplo; o primeiro livro seu os substitui.
- No painel de um livro seu: **Editar** e **Remover** (com confirmação).
- Interface unificada (vidro esfumado, Georgia, rótulos em versalete, dourado), tela de abertura com progresso, dica de primeira visita, alvos de toque ≥ 44 px.
- `art-reviewer`: 3 rodadas, terminou em 5 · 4 · 4 · 4, "pronto para o usuário". Testes: 75 unitários, 23 e2e.
- Exemplos somem com o primeiro livro seu (confirmado por você em 16/10).

## Fase 5 — PDF → páginas rediagramadas

- O conteúdo do PDF (títulos, parágrafos, imagens) é extraído e recomposto como livro impresso: hifenização em português, capítulos em página ímpar com o número do PDF, cabeço e fólio, sumário pelos títulos do PDF, colunas e texto espaçado tratados. Aprovada pelo usuário em 16/10.

## Fase 4 — abrir e folhear (com o livro na mão)

- Clique no livro → ele sai reto da fileira e vem até a mão, de capa fechada; o painel aparece quando ele chega. **Abrir** → o livro centraliza, a capa gira na dobradiça e mostra a guarda e a página de rosto; o fundo desfoca.
- Folhear: clique na página direita/esquerda, arrastar (passou da metade completa, pouco arrasto volta), `←/→`, roda do mouse. Barra no rodapé: ‹ p. 4–5 › **Fechar**. `Esc` fecha o livro; outro `Esc` devolve à estante.
- Páginas provisórias (texto de exemplo em canvas, `// PLACEHOLDER`) até a Fase 5.
- Shots: `shots/latest/N2_selected.png` (na mão), `N2_opening.png`, `N2_open.png`, `N2_turn.png`, `N2_open_low.png`. Para ver: `?node=N2&select=fx-bordo&open=1&page=3` (`&turn=0.4` congela uma folha virando).
- `art-reviewer`: 3 rodadas, terminou em **4 · 4 · 4 · 4, "pronto para o usuário"**. Pendências: serrilhado das bordas no tier low, sulco da dobradiça, corte do bloco visível, sombra real da folha.
- Testes: 26 unitários, 13 e2e (4 de leitura). Draw calls com o livro aberto: 138 (high), 88 (low).

## Fase 3 — livros na estante e seleção (depois da aprovação)

- Os 6 livros de teste ficam de pé na prateleira de cima, centralizados entre o par de apoios de latão, com o último livro inclinado encostado no apoio e sombras de contato. Os outros objetos se reorganizam pelo `shelfLayout.ts`. Pares de apoios sem livros ficam escondidos.
- Seleção no N2: passar o mouse puxa o livro 12 mm. Clique ou `←/→` + `Enter` faz o livro deslizar para fora e girar 28° mostrando a capa e a polaroid, e abre o painel de descrição com **Abrir** e **Voltar**. `Esc` ou clique fora fecha. A navegação fica travada durante a seleção. **Abrir** só registra a intenção: o voo e a abertura são da Fase 4.
- Spec: `docs/specs/fase-3-selecao.md`. Testes: 16 unitários e 8 e2e (3 de seleção). Draw calls: N2 102, selecionado 107, N0 115.
- Shots: `shots/latest/N2.png` e `shots/latest/N2_selected.png`. `art-reviewer`: 3 · 3 · 3 · 2 na 2ª revisão; a pose da seleção foi corrigida depois disso (base apoiada, sem flutuar).
- Pendências: com só 6 livros a fileira fica pequena vista do N1; lombadas mais legíveis de longe; a capa do livro selecionado sai um pouco lavada pela luz do lustre.

## ✅ Fase 0 aprovada pelo usuário (S10, bake final)

Depois da sua escolha de "seguir o revisor" (S9–S10: madeira menos saturada e mais âmbar, céu âmbar, N0 0,4 m à frente, lustre mais baixo, anti-magenta), o `art-reviewer` deu **4 · 4 · 4 · 4 · 4** com o veredito **"pronto para o usuário"**. **Aprovada pelo usuário em 15/10/2026.**

- Orçamento: draw calls N0 70 · N1 64 · N2 57; download ~27 MB (room 12,6 · props 2,5 · lightmaps 8,1 · env 2,1 · céu 0,35 · JS 1,6).
- Pendências para depois da aprovação:
  - cúpulas claras do lustre (é material do asset, assado);
  - faixa fria no rodapé do fundo;
  - franja do tapete muito contrastada;
  - veio repetido no fundo da estante;
  - reflexo próprio das janelas na metade de trás do piso;
  - vestíbulo escuro nas laterais e escrivaninha cortada no N0.

## Continuação (a pedido do usuário, ~06:40–07:00)

- Iteração 8 (o limite do runbook): as recomendações 1 e 2 abaixo foram **aplicadas** (preenchimento mais frio, sol 22°, pedra e madeiras menos saturadas, abraçadeiras a 1,4 m). Também: velas do lustre em tom creme, feixes mais fortes e latão dos apoios menos espelhado. Bake final refeito e screenshots atualizados.
- Livro: polaroid com verniz e sombra de contato no rebaixo, dourado menos acobreado, quinas gastas, luz-chave neutra. O "degrau creme" era a guarda de papel aparecendo na seixa; agora a placa mostra a dobra do couro.
- `art-reviewer` (S8/L4): sala **3 · 3 · 4 · 4 · 3**, livro **3/5**. Ainda não é candidata à aprovação. O que segura: ainda puxa para o vermelho, céu das janelas cinza em vez de âmbar, e o enquadramento do N0. As decisões 1 e 3 continuam abertas: o revisor quer ainda menos saturação e a câmera do N0 0,3–0,5 m mais à frente.

## Última avaliação do art-reviewer (bake final, S7)

| Critério | S1 | S5 | **Final** |
|---|---|---|---|
| 1. Composição (porta enquadrando, estante entre janelas) | 3 | 3 | **3** |
| 2. Luz com direção legível | 2 | 3 | **3** |
| 3. Piso reflete as janelas | 3 | 3 | **4** |
| 4. Estante legível no contraluz | 3 | 3 | **4** |
| 5. Nada plástico/procedural | 2 | 2 | **3** |

Livro (cena isolada): **3/5** (era 2/5). Proporções 4, couro 3, dourado 3, corte 3, polaroid 2.

Veredito do revisor: **"iterar"**. Dá para mostrar como checkpoint de progresso, mas ainda não como candidato à aprovação da Fase 0. Histórico completo em `docs/look-dev/iteracoes.md`.

## Orçamento

| Item | Medida |
|---|---|
| Draw calls (tier high) | N0 70 · N1 64 · N2 57 · durante o tween ~125 (o reflexo é re-renderizado enquanto a câmera anda) |
| Download inicial (tier high) | ~27 MB: `room.glb` 12,6 · `props.glb` 2,5 · lightmaps 8,1 (shell 3,5 · props 3,8 · estante 0,8) · env 2,1 · céu 0,35 · JS 1,6 |
| Tier low | `room.low.glb` 6,2 MB · `props.low.glb` 1,3 MB (texturas 1K), sem reflexo planar/N8AO/sombras |
| Lightmaps | casca 2048 px (106 px/m) · estante+metais 1024 px (103 px/m) · peças combined 2048 px (337 px/m); RGBM em WebP sem perdas |
| Texturas | WebP (fallback: `ktx` não instalado) |
| GPU do screenshot | NVIDIA GeForce RTX 4060 via ANGLE/D3D11 (headless, sem SwiftShader) |
| Bake final | 512 amostras, OptiX, ~5 min; pipeline final completo ~6 min; draft ~3 min |

## Decisões que precisam de você

1. **Temperatura geral da imagem** (aplicado um passo na iteração 8; o revisor pede mais). O revisor insiste que a imagem está alaranjada e pede o preenchimento (céu) neutro-frio, com o quente só nas manchas de sol. Eu já esfriei duas vezes (balanço de branco e céu do bake), mantendo o sol a 3200 K e o lustre a 2400 K da direção de arte. *Recomendo:* mais um passo de esfriamento no céu do bake (#C8D2DC) e na pedra, e você decide pelo `compare_N0.png`.
2. **Sol mais baixo (15–18°)?** (aplicado 22° na iteração 8) As manchas ficariam mais longas e atravessariam o centro do piso, mais "fim de tarde". Mas a decisão de 14/10 subiu o sol justamente para as manchas não saírem da sala. *Recomendo:* testar 20–22° num draft (3 min).
3. **Posição da câmera N0.** No frame de aprovação (retrato, proporção da referência), a composição bate. Em 16:9, o vestíbulo escuro e as folhas ocupam muito da tela. Uma revisão anterior pediu para recuar a câmera; a última pede para avançar. *Recomendo:* manter o N0 como está para a aprovação e criar um nó de entrada 16:9 na Fase 1, uns 0,6 m à frente.
4. **Teto entre as vigas:** reboco claro (spec) ou tábuas de madeira (como parece na referência)?
5. **KTX-Software:** instalar (`ktx` 4.4+) para texturas KTX2, menores e mais leves na GPU. Hoje o fallback é WebP.

## Bloqueios e placeholders

- Nenhuma tarefa bloqueada. O Blender e a GPU funcionaram a noite toda.
- Placeholders (`docs/placeholders.md`): o globo antigo na estante continua ausente (sem textura de mapa antigo em domínio público verificada). A `PlaceholderRoom` só aparece se o pipeline nunca tiver rodado.
- As fotos de exemplo das polaroids são ilustrações geradas em canvas: a spec proíbe imagens de terceiros, e as fotos reais vêm do usuário.

## Próximos passos sugeridos (próxima noite)

1. Aplicar as decisões 1–3 e rodar mais 2 drafts com o `art-reviewer`, depois o final.
2. Sala: quadro e lampião aceso visíveis no N0 (hoje ficam atrás das folhas da porta); lustre com velas sobre braços de latão (o asset tem cúpulas de vidro claras); abraçadeiras das cortinas mais altas e pano mais franzido; feixes mais visíveis no N0; bases dos apoios de latão com sombra de contato.
3. Livro: polaroid com brilho de papel fotográfico e sombra de contato; dourado menos acobreado; quinas com desgaste visível; corte das páginas do 640 mais legível.
4. Fase 3 (depois da aprovação da Fase 0): livros na estante com `shelfLayout.ts` (já testado), seleção e descrição.
