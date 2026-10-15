# Tarefas da noite

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` feita (com evidência) · `[!]` bloqueada (ver `bloqueios.md`)

Início da execução (preencher no T0 com a saída de `date`): `____`

## Trilha A — look dev da sala

- [ ] **T0 — Ambiente e scaffold**
  - Rodar `date` e anotar o horário de início acima. Criar a branch `noite-01`.
  - Scaffold **sem apagar o kit**: `npm create vite@latest _scaffold -- --template react-ts --no-interactive`, mover os arquivos de `_scaffold/` para a raiz (renomear `_gitignore` e mesclar com o `.gitignore` existente; não sobrescrever `CLAUDE.md`, `docs/`, `config/`, `assets/`, `scripts/`, `.claude/`) e apagar `_scaffold/`. **Nunca usar `--overwrite`.**
  - Dependências da stack (ver `CLAUDE.md`), mais `vitest`, `@playwright/test`, `tsx`, `leva`, `fflate`. `npx playwright install chromium`.
  - Scripts npm da tabela da spec da Fase 0 (os de etapas futuras podem começar como stubs que falham com mensagem clara). `playwright.config.ts` com `webServer` (`vite preview`).
  - Cena mínima com `__SCENE_READY__` e `__SCENE_STATS__`; `scripts/shot.ts` funcionando.
  - Conferir `ktx --version` (KTX-Software 4.4+). Se faltar, registrar e usar o fallback do §5 da spec.
  - **Pronto quando:** `npm run check` passa e `npm run shot -- --node N0` gera um PNG; GPU do screenshot registrada (não SwiftShader, ou contorno documentado).

- [ ] **T1 — Assets**
  - `npm run assets:fetch` baixa tudo de `assets/manifest.json` para `assets/source/`.
  - Montar uma folha de contato (`shots/latest/assets_contact.png`) com as texturas principais e os modelos, e pedir ao `art-reviewer` para checar cor e escala contra a paleta (largura das tábuas, cor da pedra). Se um asset não servir, trocar pela alternativa do manifest e registrar em `docs/decisoes.md`.
  - **Pronto quando:** `assets/source/_report.json` sem falhas obrigatórias; folha de contato revisada; trocas registradas.

- [ ] **T2 — Blender operacional**
  - `scripts/blender.mjs` (wrapper portátil) e `blender/common.py` (lê `room.json`, conversão de eixos, fórmula do sol, log, detecção de GPU, args depois de `--`).
  - **Pronto quando:** `npm run blender:check` imprime versão do Blender e dispositivo de render (GPU ou CPU) e sai com código 0.

- [ ] **T3 — Sala no Blender** (`build_room.py`)
  - Casca, vestíbulo, piso em tábuas, pedra com displacement, lambri, vigas, janelas, exterior (só visível à câmera), porta dupla aberta, tapete, escrivaninha + lampião, quadro, lustre, câmeras `cam_N*` com `lensShiftY`.
  - **Pronto quando:** `npm run blender:preview -- --node N0` gera `shots/blender/N0.png` (proporção da referência), revisado pelo `art-reviewer` só no critério 1 (composição) com nota ≥ 4.

- [ ] **T4 — Estante, props e cortinas** (`build_bookcase.py`, `build_props.py`, `sim_curtains.py`)
  - **Pronto quando:** `public/data/bookcase.json` válido (4 níveis, coerente com `room.json`); apoios de livro de latão modelados; cortinas sem atravessar a estante; prévia `npm run blender:preview -- --node N2` salva.

- [ ] **T5 — Bake, denoise, export e otimização**
  - **Pronto quando:** `npm run pipeline -- --quality draft` roda de ponta a ponta sem erro; `public/models/room.glb`, `public/lightmaps/manifest.json` e `public/env/room_N1.*` existem; `gltf-transform inspect` mostra `TEXCOORD_1` nas malhas com lightmap; tamanhos registrados.

- [ ] **T6 — Cena no navegador**
  - Room com lightmaps, especular só do env nos estáticos, piso refletor, vidro, feixes, poeira, props dinâmicos, pós AgX, tiers, câmera com `lensShiftY`.
  - **Pronto quando:** `npm run shot` gera N0/N1/N2 + `N0_approval.png` + `compare_N0.png` + `stats.json`; draw calls < 150 em todos os nós; sem alerta de preto puro; nenhum erro no console.

- [ ] **T7 — Laço de look dev**
  - Até 8 iterações `draft` + 1 `final` (ver runbook).
  - **Pronto quando:** notas ≥ 4 nos 5 critérios **ou** iterações esgotadas com o que falta registrado; iterações em `docs/look-dev/iteracoes.md`.

## Trilha B — sem dependência visual

- [ ] **T8 — Navegação (Fase 1)** — spec `docs/specs/fase-1-navegacao.md`
  - **Pronto quando:** `npm run e2e` passa (`e2e/navigation.spec.ts`); shots dos 3 nós via `?node=`; `npm run check` limpo.

- [ ] **T9 — Livro isolado (Fase 2)** — spec `docs/specs/fase-2-livro.md`
  - **Pronto quando:** `?dev=book` funciona; `npm run test` passa (testes de `geometry.ts`); `npm run shot -- --dev book` gera os 3 shots, revisados pelo `art-reviewer` e registrados.

## Encerramento

- [ ] **T10 — Relatório** — `docs/noite/relatorio.md` conforme o runbook, commit final, `git status` limpo.
