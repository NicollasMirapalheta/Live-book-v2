# Spec — Fase 0: look dev da sala

Objetivo: um frame do nó N0 que cumpra o critério de aprovação de `docs/direcao-de-arte.md`, rodando no navegador dentro do orçamento de performance. Medidas e posições vêm **sempre** de `config/room.json` (nunca duplicar números no código ou nos scripts; ler as convenções em `$conventions`).

## 1. Pipeline e comandos

```
assets:fetch → blender:build (sala → estante → props → cortinas) → bake (lightmaps + env) → denoise → export glb → optimize → cena R3F → shot → revisão → iterar
```

| Script npm | O que faz |
|------------|-----------|
| `assets:fetch` | Baixa os assets de `assets/manifest.json` para `assets/source/` (idempotente, confere md5) |
| `blender:check` | Imprime versão do Blender e dispositivo de render (GPU/CPU); sai com 0 |
| `blender:build` | `build_room.py` → `build_bookcase.py` → `build_props.py` → `sim_curtains.py` → `blender/out/room.blend`, `public/data/bookcase.json` |
| `blender:preview -- --node N0 [--samples 64]` | Render Cycles de prévia da câmera `cam_<node>` → `shots/blender/<node>.png` (960×540; N0 em 500×542, proporção da referência) |
| `blender:bake -- --quality draft\|final` | Bake de lightmaps + env map → `blender/out/lightmaps/*.exr`, `blender/out/env/*.hdr` |
| `blender:denoise` | Denoise + dilatação dos lightmaps (etapa separada, ver §4) |
| `blender:export` | Exporta `blender/out/room.glb` (sem Draco) e `blender/out/props.glb` |
| `optimize` | gltf-transform → `public/models/`; lightmaps → `public/lightmaps/`; env → `public/env/` |
| `pipeline -- --quality draft\|final` | Encadeia build → bake → denoise → export → optimize |
| `shot` | Screenshots (ver §7) |
| `test` | Testes unitários (`vitest`) |
| `e2e` | Testes Playwright (`playwright test`, com `webServer` no config) |
| `check` | `tsc -b` + lint + build |

**Execução portátil (Windows, macOS, Linux):**
- Scripts Node em TypeScript rodam com `node --env-file-if-exists=.env.local --import tsx scripts/<nome>.ts`.
- O Blender é chamado por um wrapper `scripts/blender.mjs` que lê `BLENDER_BIN` do ambiente (fallback `blender`) e usa `spawn(bin, ['-b', '-P', script, '--', ...args], { shell: false })`. Nunca montar a linha de comando como string (o caminho do Windows tem espaços) e nunca usar `$VAR` dentro do `package.json`.
- **Não usar `--factory-startup`**: ele descarta as preferências salvas de GPU.
- Os scripts Python leem `config/room.json`, recebem argumentos depois de `--`, registram `bpy.app.version` e o dispositivo no log (`logs/blender-<etapa>.log`).
- Blender alvo: **5.2 LTS**. Na 5.x o compositor usa `scene.compositing_node_group` (não `scene.node_tree`); conferir APIs na documentação da versão instalada antes de usar algo do 4.x.
- Exportador glTF **sem Draco** (há regressão conhecida no Linux; a compressão é feita depois com Meshopt).
- Texturas KTX2 exigem o programa **`ktx` (KTX-Software 4.4+)** instalado no sistema (ver `docs/noite/preparo.md`). Se `ktx --version` falhar, usar o fallback do §5 e registrar em `docs/decisoes.md`.

## 2. Montagem da sala (`blender/build_room.py`)

Construída por código, com materiais PBR dos assets baixados. Cada objeto recebe um nome estável em inglês (`floor`, `wall_back`, `wainscot_left`, `beam_0`, `window_left_frame`, `curtain_left_a`, `door_leaf_left`, `rug`, `chandelier`, `desk`, `desk_lamp`, `picture_frame`, `vestibule_*`...) — o app usa esses nomes.

- **Casca:** piso, teto, 4 paredes com espessura (faces internas nas coordenadas de `walls`), recortes das janelas e da porta. Piso e teto passam por baixo/por cima das paredes (sem faces coincidentes). Bevel de 5–10 mm em toda quina visível: quina viva é o que mais denuncia "procedural".
- **Vestíbulo:** corredor curto e escuro atrás da porta (`vestibule`), com lambri e reboco, sem janelas. Abriga a câmera de N0 e impede que o céu ilumine a sala pela porta.
- **Piso:** tábuas largas (14–20 cm) com UV por tábua para variar o tom (offset aleatório de UV + leve variação de matiz/valor). Juntas levemente escurecidas. Verniz semibrilho (roughness 0.25–0.4, variando por mapa).
- **Pedra:** textura de pedra com **displacement real** (deslocamento aplicado antes do bake) e mapeamento box/triplanar sem esticar. Quebrar a repetição com uma segunda camada de cor de baixa frequência misturada por ruído.
- **Lambri:** painéis com moldura (rebaixo + frisos), rodapé e régua superior na altura `wainscot.height` (alinhada ao topo da base da estante). Mesma madeira da estante, um tom acima.
- **Teto:** reboco claro levemente irregular + vigas de madeira rústica com quinas gastas.
- **Janelas:** caixilho com mainéis no grid de `panes`, peitoril, vidro como objeto separado `window_*_glass` (fica **fora do bake**; no app vira um plano com leve reflexo e rugosidade irregular).
- **Exterior:** atrás de cada janela, um plano/cilindro grande com a HDRI `exterior_sky` (emissivo). **Visível só para raios de câmera** (desligar visibilidade de sombra, difuso, glossy e transmissão), para não bloquear o sol nem os portais de luz.
- **Porta dupla:** folhas com almofadas (painéis em relevo), maçanetas de latão, abertas para dentro conforme `door.openInwardDeg`. Batentes e guarnição.
- **Tapete persa:** plano com espessura (5–8 mm), albedo da foto do Met (recortada e endireitada), relevo do `rug_pile`, franja simples, leve ondulação.
- **Escrivaninha:** escrivaninha clássica modelada no script (tampo com bisel, gavetas, pés torneados simples) com `dark_wood`. `ClassicConsole_01` só como placeholder registrado se a modelagem travar.
- **Luminária:** o asset `vintage_oil_lamp` (lampião de latão com chaminé de vidro) com luz 2700 K dentro da chaminé. Decisão registrada em `docs/decisoes.md`: a referência mostra cúpula, mas o lampião é CC0 de qualidade e combina com o clima.
- **Quadro e lustre:** assets do manifest. Lustre com chamas emissivas nas velas.
- **Câmeras de referência:** `cam_N0`, `cam_N1`, `cam_N2` nas posições, FOV e `lensShiftY` de `nodes` (ver `$conventions.lensShift`).

## 3. Estante e props

**`blender/build_bookcase.py`:** estante paramétrica a partir de `bookcase`: base com portas de painel, pilastras laterais, `shelfLevels` prateleiras, cornija, fundo de painéis. Mogno/nogueira escura (`dark_wood`), verniz acetinado, desgaste nas quinas (máscara por curvatura/AO clareando e reduzindo o verniz).

Saída obrigatória `public/data/bookcase.json`:

```json
{
  "shelves": [
    { "index": 0, "y": 0.83, "clearHeight": 0.34, "xMin": -0.82, "xMax": 0.82, "zFront": -2.62, "zBack": -2.97 }
  ],
  "propSlots": [
    { "shelf": 1, "x": -0.6, "kind": "bookend_pair" }
  ]
}
```

`y` é o topo da tábua (onde o livro apoia); coordenadas no padrão three.js; valores do exemplo são ilustrativos (calcular a partir de `bookcase`).

**`blender/build_props.py`:** objetos das prateleiras, exportados à parte (`props.glb`) e **fora do bake** (são dinâmicos):
- Apoios de livro de latão: modelados no script (L com ornamento simples, bevel, latão procedural `#9C7A45`, roughness 0.35–0.5 com variação).
- Assets: `brass_candleholders`, `potted_plant_04`, `brass_vase_01`, `mantel_clock_01`.
- Globo antigo: **adiado** (falta textura de mapa antigo em domínio público verificada); registrar em `docs/placeholders.md`.

**`blender/sim_curtains.py`:** simulação de tecido das cortinas **depois** da estante existir, com a caixa da estante, as paredes e o varão como colisão; aplicar o frame final como malha. Material de linho com translucidez leve.

## 4. Iluminação, bake e denoise

**Modelo de luz (Cycles):**
- World = HDRI `exterior_sky` (força ajustada) + **Sun** com a direção de `lighting.sun.travelDirectionFormula` (cor 3200 K, ângulo 1–2° para sombra suave). Alinhar a rotação da HDRI com o sol.
- **Portais de luz** (area lights com portal) nas aberturas das janelas.
- Lustre: emissão nas chamas + luzes pontuais pequenas 2400 K. Lampião: luz 2700 K na chaminé.
- Prévias no Blender com AgX; o bake grava **irradiância linear**.

**Dois modos de bake por objeto** (lista em `blender/bake_config.json`):

| Modo | Para quê | O que grava | Material no app |
|------|----------|-------------|-----------------|
| `lightmap` | Superfícies grandes com textura detalhada: piso, paredes, lambri, teto, vigas, estante, porta, vestíbulo | Difuso **direto + indireto, sem cor** (irradiância) em UV2 | PBR (`MeshStandardMaterial`/reflector) com `lightMap` |
| `combined` | Peças pequenas ou translúcidas: cortinas, tapete, caixilhos, quadro, escrivaninha | Combined (luz × cor) em UV2 | `MeshBasicMaterial` com a textura assada (+ normal fraco opcional) |

**UV2:** canal `lightmap` (Lightmap Pack/Smart Project), margem ≥ 4 px na resolução final. Atlas compartilhados: `atlas_shell` (2048), `atlas_bookcase` (1024), `atlas_props` (1024). Densidade de texels uniforme dentro de cada atlas. Garantir que o canal `lightmap` seja exportado (atribuir a um nó de UV no material, se preciso) e conferir `TEXCOORD_1` com `gltf-transform inspect`.

**Qualidade:** `draft` = 64 amostras, atlas na metade da resolução. `final` = 512+ amostras, resolução cheia. GPU se houver (OptiX/CUDA/HIP/Metal), senão CPU; registrar dispositivo e tempo.

**Denoise (`blender:denoise`, etapa separada):** o bake não passa pelo compositor. Carregar cada EXR num node group de compositor (API 5.x) com o nó Denoise e renderizar o resultado na mesma resolução; depois **dilatar** as bordas das ilhas. Se o denoise falhar, compensar com mais amostras no `final` (1024) e registrar.

**Environment map:** panorama equirretangular HDR renderizado de dentro da sala a partir de N1 → `blender/out/env/room_N1.hdr`.

## 5. Export e otimização

- `export.py`: `room.glb` com UV2, sem luzes nem câmeras; `props.glb` separado.
- `optimize` grava **tudo que o app usa dentro de `public/`** (o Vite não serve `blender/out/`):
  - `public/models/room.glb`, `public/models/props.glb` (+ `.low.glb` com texturas 1K): dedup, weld, Meshopt, texturas KTX2 (UASTC para normal maps, ETC1S para cor/ARM), máx. 2K.
  - `public/lightmaps/<atlas>.<ext>` + `public/lightmaps/manifest.json` (objeto → atlas, modo, intensidade, escala RGBM se houver).
  - `public/env/room_N1.hdr` (ou KTX2/EXR equivalente).
- Lightmaps: manter HDR. KTX2 half float se couber no orçamento; senão **RGBM** em PNG (ou KTX2) com o fator de escala no manifest.
- **Fallback sem `ktx`:** texturas em WebP (via `gltf-transform webp`) e lightmaps em RGBM PNG. Registrar em `docs/decisoes.md` e no relatório.
- Orçamento: download inicial < 30 MB no tier high. Registrar os tamanhos no relatório.

## 6. Cena no R3F

Arquivos em `src/scene/`: `Room.tsx`, `Lightmaps.ts`, `Bookcase.tsx`, `ShelfProps.tsx`, `WindowGlass.tsx`, `LightBeams.tsx`, `Dust.tsx`, `Effects.tsx`, `Camera.ts` (FOV + `lensShiftY`). Estado de qualidade em `src/state/quality.ts`.

- **Carga:** `useGLTF` com KTX2 + Meshopt. Ao carregar, aplicar o lightmap de `public/lightmaps/manifest.json` em cada malha (`texture.channel = 1`, `flipY = false`, espaço de cor linear, `lightMapIntensity` do manifest).
- **Especular nos estáticos:** o env map (`public/env/room_N1.hdr`) entra **só como especular** nos materiais com lightmap (patch com `onBeforeCompile` zerando a contribuição difusa do IBL). Sem isso, a luz dobra.
- **Piso:** `MeshReflectorMaterial` (tier high) com lightmap, blur alto, `mixStrength` moderado: reflexo das janelas **borrado e alongado**, não espelhado. Tier low: só especular do env.
- **Vidro:** plano levemente rugoso com reflexo do env + pequena variação de normal (vidro antigo).
- **Feixes de luz:** malhas de volume por janela, alinhadas com o sol, shader aditivo com ruído lento, fade por profundidade e pelas bordas. Sutil: percebe-se o feixe, não um cone sólido. Mesma técnica nos dois tiers (low com menos camadas).
- **Poeira:** 300–600 partículas (high) dentro dos feixes, movimento browniano lento, brilho só dentro do feixe. Low: 100–150.
- **Props dinâmicos:** PBR em tempo real com o env da sala + 1 luz direcional (sol) e 1 pontual (lustre), sombras só neles. N8AO no tier high.
- **Pós (`Effects.tsx`):** N8AO → Bloom (limiar alto: janelas, velas, lampião) → Vignette → Noise muito sutil → ToneMapping **AgX**. Tone mapping uma única vez (renderer sem tone mapping ou `flat` no Canvas). DOF preparado e desligado fora do modo livro.
- **Qualidade:** `detect-gpu` + `PerformanceMonitor`; `?quality=low` força o tier.
- **Parâmetros de URL:** `?node=`, `?yaw=`, `?pitch=`, `?fov=`, `?shot=1` (esconde UI, congela poeira num tempo fixo), `?e2e=1` (expõe `window.__NAV__` mesmo no build de produção), `?dev=book`.
- **Prontidão:** depois que tudo carregou e 30 quadros renderizaram, `window.__SCENE_READY__ = true`. Expor `window.__SCENE_STATS__ = { calls, triangles, textures, gpu }`.

## 7. Screenshot (`scripts/shot.ts`)

- Sobe o `vite preview` (ou usa um servidor já rodando), abre o Chromium do Playwright, navega com `?shot=1`, espera `__SCENE_READY__` e salva os PNG.
- Argumentos: `--node N0|N1|N2|all` (padrão `all`), `--quality high|low`, `--yaw`, `--pitch`, `--dev book`, `--out`.
- Saídas de uma execução em `shots/<timestamp>/`:
  - `N0.png`, `N1.png`, `N2.png` em 1920×1080.
  - `N0_approval.png` em 1000×1084 (proporção da referência) e `compare_N0.png`: referência e `N0_approval` lado a lado (montado numa página HTML local renderizada pelo próprio Playwright).
  - `stats.json`: `__SCENE_STATS__` de cada nó + **luminância mínima e do percentil 0,5%** de cada imagem (calculada num canvas). Alerta se ficar abaixo da luminância de `#2A1A12` (regra "nunca preto puro").
  - Com `--dev book`: `book/*.png`.
- `shots/latest/` é atualizado **arquivo por arquivo** (uma execução de livro não apaga os shots da sala nem a folha de contato de assets).
- Se o GPU reportado for SwiftShader/software, tentar de novo com `--use-angle=default --enable-gpu` e, se necessário, em modo headed; registrar o que funcionou.

## 8. Revisão visual

Toda iteração de look dev termina com o subagente `art-reviewer` avaliando `shots/latest/compare_N0.png` (e N1/N2, `stats.json`). Registro em `docs/look-dev/iteracoes.md` (data, mudanças, notas, divergências, link dos shots).

**Pronto para pedir aprovação** quando: todos os critérios ≥ 4, N1 e N2 sem defeitos graves (costuras, vazamento de luz, textura esticada, preto puro) e orçamento respeitado (< 150 draw calls, tamanhos registrados).

## 9. Armadilhas conhecidas

- Vazamento de luz: paredes com espessura real, vestíbulo fechado, piso/teto passando sob/sobre as paredes, planos do exterior invisíveis para luz.
- Costuras no lightmap: margem insuficiente ou falta de dilatação.
- Lightmap "lavado": cor incluída no modo `lightmap` ou espaço de cor errado.
- Luz dobrada nos estáticos: env map difuso somado ao lightmap (§6).
- Laranja chapado: o quente vem da luz; albedos ficam próximos da paleta.
- Reflexo do piso nítido demais = cara de render de arquitetura.
- Cortina atravessando a estante: simulação sem colisão (§3).
