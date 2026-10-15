# Tarefas da noite

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` feita (com evidência) · `[!]` bloqueada (ver `bloqueios.md`)

Início da execução (preencher no T0 com a saída de `date`): `Thu Oct 15 00:02:55 2026`

## Trilha A — look dev da sala

- [x] **T0 — Ambiente e scaffold** — evidência: `npm run check` ok; `npm run shot -- --node N0` gera N0/N0_approval/compare_N0 (`shots/latest/`); GPU do screenshot: ANGLE D3D11 NVIDIA RTX 4060 (headless, sem SwiftShader); Blender 5.2.2 com OptiX; `ktx` ausente → fallback WebP (ver decisoes.md)
  - Rodar `date` e anotar o horário de início acima. Criar a branch `noite-01`.
  - Scaffold **sem apagar o kit**: `npm create vite@latest _scaffold -- --template react-ts --no-interactive`, mover os arquivos de `_scaffold/` para a raiz (renomear `_gitignore` e mesclar com o `.gitignore` existente; não sobrescrever `CLAUDE.md`, `docs/`, `config/`, `assets/`, `scripts/`, `.claude/`) e apagar `_scaffold/`. **Nunca usar `--overwrite`.**
  - Dependências da stack (ver `CLAUDE.md`), mais `vitest`, `@playwright/test`, `tsx`, `leva`, `fflate`. `npx playwright install chromium`.
  - Scripts npm da tabela da spec da Fase 0 (os de etapas futuras podem começar como stubs que falham com mensagem clara). `playwright.config.ts` com `webServer` (`vite preview`).
  - Cena mínima com `__SCENE_READY__` e `__SCENE_STATS__`; `scripts/shot.ts` funcionando.
  - Conferir `ktx --version` (KTX-Software 4.4+). Se faltar, registrar e usar o fallback do §5 da spec.
  - **Pronto quando:** `npm run check` passa e `npm run shot -- --node N0` gera um PNG; GPU do screenshot registrada (não SwiftShader, ou contorno documentado).

- [x] **T1 — Assets** — evidência: `assets/source/_report.json` 27/27 ok, 0 falhas obrigatórias; `shots/latest/assets_contact.png` revisada pelo `art-reviewer`; trocas (piso `wood_floor`, pedra `white_sandstone_bricks`, tapete Met 451375) em `docs/decisoes.md`
  - `npm run assets:fetch` baixa tudo de `assets/manifest.json` para `assets/source/`.
  - Montar uma folha de contato (`shots/latest/assets_contact.png`) com as texturas principais e os modelos, e pedir ao `art-reviewer` para checar cor e escala contra a paleta (largura das tábuas, cor da pedra). Se um asset não servir, trocar pela alternativa do manifest e registrar em `docs/decisoes.md`.
  - **Pronto quando:** `assets/source/_report.json` sem falhas obrigatórias; folha de contato revisada; trocas registradas.

- [x] **T2 — Blender operacional** — evidência: `npm run blender:check` → Blender 5.2.2 LTS, GPU OPTIX RTX 4060, código 0
  - `scripts/blender.mjs` (wrapper portátil) e `blender/common.py` (lê `room.json`, conversão de eixos, fórmula do sol, log, detecção de GPU, args depois de `--`).
  - **Pronto quando:** `npm run blender:check` imprime versão do Blender e dispositivo de render (GPU ou CPU) e sai com código 0.

- [x] **T3 — Sala no Blender** (`build_room.py`) — evidência: `npm run blender:preview -- --node N0` → `shots/blender/N0.png` (500×542); `art-reviewer` critério 1 = 4/5 na 2ª revisão (condicionado à estante do T4); ajustes em `docs/decisoes.md`. Limitação: o tapete começa a ~84% da altura do quadro (ref. ~90%) — para ir além ele teria de atravessar a parede da porta
  - Casca, vestíbulo, piso em tábuas, pedra com displacement, lambri, vigas, janelas, exterior (só visível à câmera), porta dupla aberta, tapete, escrivaninha + lampião, quadro, lustre, câmeras `cam_N*` com `lensShiftY`.
  - **Pronto quando:** `npm run blender:preview -- --node N0` gera `shots/blender/N0.png` (proporção da referência), revisado pelo `art-reviewer` só no critério 1 (composição) com nota ≥ 4.

- [x] **T4 — Estante, props e cortinas** — evidência: `public/data/bookcase.json` (4 prateleiras, y 0.83→1.887, vão 0.322 m, bate com `room.json`); apoios de latão modelados em `build_props.py`; cortinas com simulação de tecido e colisão (estante, paredes, caixilho) sem atravessar; prévias `shots/blender/N0.png` e `N2.png` (`build_bookcase.py`, `build_props.py`, `sim_curtains.py`)
  - **Pronto quando:** `public/data/bookcase.json` válido (4 níveis, coerente com `room.json`); apoios de livro de latão modelados; cortinas sem atravessar a estante; prévia `npm run blender:preview -- --node N2` salva.

- [x] **T5 — Bake, denoise, export e otimização** — evidência: `npm run pipeline -- --quality draft` ponta a ponta em ~2,6 min (RTX 4060/OptiX); `public/models/room.glb` (10,1 MB), `props.glb` (3,2 MB), `public/lightmaps/manifest.json` + 3 atlas WebP RGBM (2,3 MB), `public/env/room_N1.hdr` (1,3 MB) + `sky.jpg`; `gltf-transform inspect` mostra `TEXCOORD_1` em todas as malhas assadas; denoise via compositor 5.x ok; tamanhos em `public/data/sizes.json`
  - **Pronto quando:** `npm run pipeline -- --quality draft` roda de ponta a ponta sem erro; `public/models/room.glb`, `public/lightmaps/manifest.json` e `public/env/room_N1.*` existem; `gltf-transform inspect` mostra `TEXCOORD_1` nas malhas com lightmap; tamanhos registrados.

- [x] **T6 — Cena no navegador** — evidência: `npm run shot` gera N0/N1/N2 + `N0_approval.png` + `compare_N0.png` + `stats.json`; draw calls N0 107 · N1 93 · N2 56 (< 150); luminância mínima p0,5% = #2A1A12 (sem preto puro); 0 erros no console; GPU RTX 4060 (ANGLE D3D11). Lightmaps RGBM, especular só do env, piso com reflexo planar borrado/alongado (tier high), vidro, feixes + poeira, props PBR com sombra do sol (shadow map sob demanda), pós N8AO/Bloom/Vinheta/Grão/balanço de branco/AgX/piso de sombra, tiers `?quality=low`, `lensShiftY`
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
