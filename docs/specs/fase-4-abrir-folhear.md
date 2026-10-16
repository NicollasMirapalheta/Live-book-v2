# Spec — Fase 4: abrir e folhear (com o livro na mão)

Ponto de partida (Fase 3 revisada): o livro já veio da estante para a mão do usuário, de capa fechada, e o painel de descrição está à direita com **Abrir** e **Voltar**.

## Abrir

- **Abrir** (ou `Enter` com o painel aberto): o painel recolhe; o livro desce um pouco e centraliza (abre para os dois lados, então ocupa o centro), aproxima ~10% e endireita a inclinação.
- A **capa da frente gira na dobradiça** (lado da lombada, à esquerda) 0 → ~175° em ~0,9 s, `power2.inOut`, mostrando a guarda (verso da capa) à esquerda e a primeira página à direita. O miolo acompanha: a lombada arredondada vira o "vale" central.
- O fundo da sala ganha **DOF** (foco no livro), já previsto na direção de arte ("DOF só no modo livro").

## Folhear

- Livro aberto em **página dupla**. Folha = malha subdividida (≈ 24 × 6) com deformação no vertex shader: rotação em torno da lombada + **curvatura** (a ponta lidera, a borda da lombada segue) controlada por um parâmetro 0 → 1.
- **Avançar:** clicar na página direita, arrastar da direita para a esquerda (o progresso segue o ponteiro; ao soltar, completa ou volta conforme passou de 50% ou a velocidade), `→`, roda do mouse para baixo. **Voltar:** o inverso na página esquerda, `←`.
- Só existem em cena a folha que vira e as duas páginas visíveis (mais a de baixo de cada lado); as pilhas esquerda/direita mudam de espessura conforme o progresso (geometria do miolo em duas metades).
- Conteúdo provisório (até a Fase 5): página de rosto com título/subtítulo, páginas creme com número e um bloco de texto de exemplo gerado em canvas, na identidade tipográfica do painel. A textura de cada página é gerada sob demanda (só as visíveis), 1K.
- **Fechar:** `Esc` ou botão **Fechar** → vira as páginas restantes de volta numa só (ou fecha direto a capa), o livro volta à pose da mão e o painel reaparece. **Voltar** no painel devolve o livro à estante (Fase 3).
- `prefers-reduced-motion`: a capa e as páginas viram sem curvatura, em ~60% do tempo.

## Estado

`useSelection.phase` ganha `opening` → `open` → `closing`; `src/book/reader/useReader.ts` guarda a página atual, o progresso da virada e a direção.

## Verificação

- `npm run test`: cálculo das pilhas (espessura por lado), índices de página e limites (não passa da última/primeira).
- `npm run e2e`: selecionar → Abrir → avançar 2 páginas por teclado → conferir página atual → Fechar → painel volta.
- `npm run shot -- --node N2 --query select=<id>&open=1&page=3`: livro aberto na mão; revisão do `art-reviewer` ("parece um livro de verdade aberto?").
- Draw calls < 150 com o livro aberto.
