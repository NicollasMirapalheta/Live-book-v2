# Registro de decisões

Formato de cada entrada:

```
## AAAA-MM-DD — título curto
- Contexto: por que a decisão foi necessária
- Escolha: o que foi feito
- Alternativa descartada: e por quê
- Como reverter: arquivo/parâmetro a mudar
- Precisa do usuário? sim/não
```

## 2026-10-14 — Sol de fim de tarde no lugar da luz branca da referência
- Contexto: a referência tem luz diurna branca; o briefing pede aconchego e tons quentes.
- Escolha: sol ~3200 K entrando pelas janelas do fundo em direção à câmera, lustre sempre aceso como preenchimento da estante.
- Alternativa descartada: luz diurna neutra (fiel à referência, menos aconchegante).
- Como reverter: `config/room.json` → `lighting.sun`.
- Precisa do usuário? não (aprovado na conversa de direção de arte).

## 2026-10-14 — Elevação do sol em ~32°
- Contexto: com sol muito baixo (~14°), as manchas das janelas cairiam além da porta, fora da sala.
- Escolha: elevação inicial de 32°; manchas aproximadamente entre z=-1.6 e z=+1.6.
- Como reverter: `config/room.json` → `lighting.sun.elevationDeg`.
- Precisa do usuário? não.

## 2026-10-14 — Câmera de N0 medida na referência
- Contexto: a referência é retrato, com a parede do fundo ocupando ~90% da largura, horizonte a ~29% do topo e verticais paralelas. Uma câmera inclinada na soleira não reproduz isso (nem mostra o tapete).
- Escolha: N0 num vestíbulo atrás da porta (z=4.6), FOV vertical 46°, sem inclinação, deslocamento de lente `lensShiftY=0.21`. O frame de aprovação é renderizado na proporção da referência (1000×1084).
- Como reverter: `config/room.json` → `nodes.N0` e `screenshot.approval`.
- Precisa do usuário? não.

## 2026-10-14 — Vestíbulo atrás da porta
- Contexto: sem nada atrás da porta, o céu ilumina a sala por +Z no bake, e a câmera de N0 ficaria "no vazio".
- Escolha: corredor curto e escuro (`vestibule`).
- Precisa do usuário? não.

## 2026-10-14 — Lambri e peitoris na altura da referência
- Contexto: medida na imagem, a régua do lambri fica alinhada ao topo da base da estante (~0,8 m) e os peitoris a ~0,85 m.
- Escolha: `wainscot.height = 0.8`, `sillY = 0.85`, janelas com 2,0 m de altura.
- Como reverter: `config/room.json`.
- Precisa do usuário? não.

## 2026-10-14 — Lampião de latão no lugar da luminária com cúpula
- Contexto: a referência mostra uma luminária com cúpula; o melhor asset CC0 encontrado é um lampião vitoriano de latão (`vintage_oil_lamp`).
- Escolha: usar o lampião, luz 2700 K na chaminé.
- Alternativa descartada: modelar uma luminária de cúpula do zero (mais trabalho, risco de parecer procedural).
- Como reverter: trocar o asset em `assets/manifest.json` e em `build_room.py`.
- Precisa do usuário? **sim** — confirmar no relatório da manhã.

## 2026-10-14 — Globo adiado
- Contexto: não há globo CC0 nem textura de mapa antigo em domínio público verificada.
- Escolha: props da estante vazia = apoios de livro (modelados), vela, planta, vaso e relógio de latão. Globo entra quando houver textura.
- Precisa do usuário? não.

## 2026-10-14 — Feixes de luz como malhas com shader, nos dois tiers
- Contexto: volumétrico em pós-processamento é caro e difícil de controlar artisticamente.
- Escolha: volumes por janela com shader aditivo + poeira; o tier low usa menos camadas.
- Alternativa descartada: god rays em pós-processamento.
- Como reverter: `src/scene/LightBeams.tsx`.
- Precisa do usuário? não.

## 2026-10-14 — Dois modos de bake (lightmap e combined)
- Contexto: superfícies grandes precisam de textura nítida de perto; cortinas e peças pequenas precisam de translucidez e custo baixo.
- Escolha: `lightmap` (irradiância em UV2 × PBR em tempo real) para casca, estante, porta e vestíbulo; `combined` (bake completo, material unlit) para cortinas, tapete, caixilhos, quadro e escrivaninha.
- Como reverter: `blender/bake_config.json`.
- Precisa do usuário? não.

## 2026-10-15 — Mapa de cor do couro dos livros (`leather_red_02`)
- Contexto: o Poly Haven não publica mapa `Diffuse` para `leather_red_02`; as cores vêm como variantes `coll1`/`coll2`. O `assets:fetch` falhava num asset obrigatório.
- Escolha: `assets/manifest.json` → `book_leather.maps` usa `coll1` (vermelho) no lugar de `Diffuse`. Como a capa é tingida preservando a luminância, a cor original da variante não importa.
- Alternativa descartada: trocar pelo `book_leather_alt` (`brown_leather`), que é mais fosco e vintage do que a direção de arte pede para a capa.
- Como reverter: voltar `"Diffuse"` no manifest ou apontar `src/book/materials.ts` para `book_leather_alt`.
- Precisa do usuário? não.

## 2026-10-15 — Sem `ktx`: texturas em WebP e lightmaps em RGBM PNG
- Contexto: o KTX-Software não está instalado nesta máquina (`ktx --version` falha) e o runbook proíbe instalar software global.
- Escolha: fallback do §5 da spec da Fase 0 — texturas via `gltf-transform webp`, lightmaps em RGBM PNG com o fator de escala em `public/lightmaps/manifest.json`.
- Alternativa descartada: KTX2 (exige o programa `ktx`).
- Como reverter: instalar o KTX-Software 4.4+ e rodar `npm run optimize` de novo; o script detecta o `ktx` sozinho.
- Precisa do usuário? sim (instalar o KTX-Software quando quiser texturas KTX2).

## 2026-10-15 — Trocas de assets na revisão da folha de contato (T1)
- Contexto: o `art-reviewer` avaliou `shots/latest/assets_contact.png`. Bloqueantes: tábuas do piso com ~8 cm (spec pede 14–20 cm), pedra de ardósia escura (direção pede pedra clara bege-acinzentada), tapete com pouco marinho, escrivaninha placeholder quase preta.
- Escolha:
  - Piso → `wood_floor` (Poly Haven, tábuas largas envernizadas). O antigo `old_wooden_floor_02` virou `floor_wood_alt`.
  - Pedra → `white_sandstone_bricks` (arenito claro em fiadas irregulares). `sandstone_blocks_05` segue como alternativa.
  - Tapete → Met 451375 (vermelho/marinho/creme), recortando o fundo cinza do museu.
  - Escrivaninha → modelada no script (já previsto na spec); `ClassicConsole_01` não será usado.
  - Ajustes de material previstos: estante/lambri −25% de saturação; vigas tingidas para #4A2A1C–#6B3E2A; teto tingido para ~#D6C9AE (nunca branco puro); linho só normal/rugosidade + cor #DCCDB0; vaso de latão ×0,42; só os castiçais pequenos na estante; quadro ×1,5; chaminé do lampião em vidro; vaso da planta em terracota; lambri com uma única fileira de almofadas.
- Alternativa descartada: manter os assets originais e corrigir só por UV/cor (largura das tábuas e cor da ardósia não se resolvem bem assim).
- Como reverter: `assets/manifest.json` (trocar `id`/`page` de volta) e `npm run assets:fetch`.
- Precisa do usuário? não. Observação do revisor: na referência, o teto entre as vigas parece de madeira, não reboco — mantido o reboco claro da spec; listado no relatório.

## 2026-10-15 — Tapete 2,4 × 1,8 m (proporção do Met 451375)
- Contexto: o tapete escolhido na revisão T1 (Met 451375, com vermelho/marinho/creme) tem proporção ~4:3, não 2:1 como o 452828. Esticar distorceria o desenho.
- Escolha: `config/room.json` → `rug.size = [2.4, 1.8]`, `rug.center z = 2.0` (de z=1.1 a 2.9, sem encostar na parede da porta em z=3.0). Textura `blender/out/textures/rug_color.jpg` recortada do fundo do museu e girada 90°.
- Alternativa descartada: Met 452828 (2:1, mas campo pictórico com pouco marinho) ou recortar o 451375 para 2:1 (perde a borda).
- Como reverter: voltar `rug` em `room.json` e trocar as chaves no `assets/manifest.json`.
- Precisa do usuário? não.

## 2026-10-15 — N0 recua para z=5.2 (porta enquadrando a imagem)
- Contexto: com a câmera em z=4.6 e o frame retrato (FOV vertical 46°), a meia-largura visível no plano da porta (z=3.0) é ~0,63 m, menor que a abertura (±0,8 m): as folhas abertas ficariam fora do quadro, e o critério 1 da aprovação (porta enquadrando) falharia.
- Escolha: `nodes.N0.position.z = 5.2` (ainda dentro do vestíbulo, que vai até 5.5). As folhas passam a ocupar ~6% da largura em cada lateral, como na referência; a parede do fundo cai para ~86% da largura (antes ~92%).
- Alternativa descartada: aumentar o FOV (diminui a parede do fundo e distorce) ou abrir menos as folhas (elas cobririam a estante).
- Como reverter: `config/room.json` → `nodes.N0.position`.
- Precisa do usuário? não.

## 2026-10-15 — Lampião no canto do fundo da escrivaninha; quadro em paisagem
- Contexto: com a escrivaninha modelada (0,8 m de profundidade), o `lamp.offset` antigo `[0, 0.76, -0.35]` deixava a base do lampião (raio 0,11 m) atravessando a parede. O quadro CC0 (`fancy_picture_frame_01`) é paisagem (0,60 × 0,46 m), não retrato como em `picture.size`.
- Escolha: `desk.lamp.offset = [-0.35, 0.76, -0.2]` (canto da escrivaninha voltado para a parede do fundo, como na referência); `picture.size = [0.9, 0.69]` (asset ×1,5, sugestão do `art-reviewer`).
- Como reverter: `config/room.json` → `desk.lamp.offset`, `picture.size`.
- Precisa do usuário? não.

## 2026-10-15 — Folhas da porta abertas a 105°
- Contexto: na primeira prévia do Blender (N0 em z=5.2), as folhas abertas a 95° ocupavam ~13% da largura de cada lado; na referência, ~6%.
- Escolha: `door.openInwardDeg = 105` (a folha fica quase de perfil, como na referência).
- Como reverter: `config/room.json` → `door.openInwardDeg`.
- Precisa do usuário? não.

## 2026-10-15 — Ajustes de composição da revisão T3 (art-reviewer, nota 3/5)
- Contexto: na prévia do Blender, o tapete ocupava 25% do quadro (ref. ~10%), as folhas cobriam as quinas da sala, uma viga escondia o topo da parede do fundo e as janelas ficavam altas, com folga sobre o lambri.
- Escolha (`config/room.json`):
  - Tapete de volta ao Met 452828 (2:1), `rug.size = [2.2, 1.1]`, `rug.center z = 2.4` (borda de trás em z=1.85, ~14% do quadro). Um tapete maior com a borda nessa posição atravessaria a parede da porta.
  - `door.openingWidth = 1.8` e `door.openInwardDeg = 100`: folhas com ~6% da largura de cada lado.
  - `ceiling.beams.zPositions = [-1.5, 0.3, 2.1]`: a viga em z=-1.8 escondia o topo da pedra. Mãos-francesas nas quinas superiores da parede do fundo (como na referência).
  - Janelas: `sillY = 0.8` (peitoril assentado no lambri) e `height = 1.9`.
  - `bookcase.width = 2.0` (na referência a estante ocupa ~33% da largura do quadro).
- Alternativa descartada: mexer em FOV ou posição da câmera (horizonte, escala da parede e janelas já batem com a referência).
- Como reverter: valores anteriores no histórico do git (`git log -p config/room.json`).
- Precisa do usuário? não.

## 2026-10-15 — Segunda revisão T3 (nota 4/5): N0 em z=5.35, lens shift 0.23, janelas com bandeira
- Contexto: faltava ver uma fatia das paredes laterais, a faixa de teto no topo ocupava ~6% do quadro, o tapete encostava nas folhas e a grade das janelas não seguia o desenho da referência (duas folhas + bandeira).
- Escolha: `nodes.N0.position.z = 5.35` e `door.openInwardDeg = 105` (folhas ~5% de cada lado, parede lateral ~3%); `nodes.N0.lensShiftY = 0.23` (faixa do teto ~4%, horizonte a ~27% do topo, ref. 28%); `rug.size = [1.9, 0.95]`, `rug.center z = 2.5`; `windows[].panes = { cols: 4, rows: 6, transomFromTop: 0.3 }` — bandeira com travessa a 30% do topo, duas folhas embaixo com montante central mais largo.
- Como reverter: `config/room.json` (histórico no git).
- Precisa do usuário? não.

## 2026-10-15 — Saídas do pipeline fora do git
- Contexto: `public/models/*.glb`, lightmaps e env somam ~15 MB e mudam a cada iteração de look dev; versioná-los incha o repositório.
- Escolha: ignorados no `.gitignore` (regeráveis com `npm run pipeline -- --quality final`). `public/data/bookcase.json` continua versionado (pequeno, lido pela Fase 2/3).
- Como reverter: remover as linhas do `.gitignore` e dar `git add`.
- Precisa do usuário? não.

## 2026-10-15 — UV2 por objeto + empacotamento próprio; lightmaps RGBM em WebP sem perdas
- Contexto: `smart_project`/`pack_islands` em todo o atlas gerava milhares de ilhas (tábuas, pedra decimada, lustre) e ocupava ~15% do atlas.
- Escolha: cada objeto é desembrulhado sozinho (planar em metros para piso, teto, tapete e pedra; grade do tecido nas cortinas; `lightmap_pack` no resto) e os retângulos dos objetos são empacotados em prateleiras com densidade de texel única (busca binária). Pesos menores para vestíbulo e corpos das paredes. Resultado draft: shell 55 px/m, estante 61 px/m, props 127 px/m (final: o dobro). Lightmaps em RGBM (alpha = multiplicador) gravados como WebP lossless e carregados com `ImageBitmap` sem pré-multiplicação.
- Como reverter: `blender/bake.py` → `unwrap()`.
- Precisa do usuário? não.

## 2026-10-15 — Pós: balanço de branco antes do AgX e piso de sombra #2A1A12
- Contexto: com sol a 3200 K e velas a 2400 K a imagem saía "laranja chapado" (proibido na direção de arte) e alguns cantos do vestíbulo chegavam a preto puro.
- Escolha: `src/scene/Grade.tsx` — balanço de branco em luz linear (ganhos 0,9 / 1,0 / 1,18, luminância preservada), como uma câmera a ~4000 K; depois do AgX, as sombras são erguidas até #2A1A12. As luzes continuam com as temperaturas da direção de arte.
- Alternativa descartada: esfriar as luzes no Blender (mudaria o bake e contrariaria a direção de luz quente).
- Como reverter: remover `<WhiteBalance />`/`<ShadowFloor />` de `src/scene/Effects.tsx`.
- Precisa do usuário? não.

## 2026-10-15 — Reflexo do piso próprio (não `MeshReflectorMaterial`)
- Contexto: o material do drei mistura o reflexo na cor difusa (multiplicado pelo lightmap) e não combina com o patch de lightmap RGBM.
- Escolha: `src/scene/FloorReflection.tsx` — câmera espelhada em y=0 (com plano de corte oblíquo) renderiza só a camada de objetos que vale refletir, a meia resolução; Kawase blur; o shader do piso troca a radiância especular do env por esse reflexo com amostras verticais (borrado e alongado) — o Fresnel/rugosidade do material modulam o resultado. Só re-renderiza quando a câmera se move. Céu como cúpula (hemisfério superior), para não vazar no reflexo sob as paredes.
- Como reverter: `quality=low` desliga; ou `reflect` em `src/scene/Room.tsx`.
- Precisa do usuário? não.

## 2026-10-15 — Look dev it.2: sol mais baixo e centrado, mais forte; madeiras menos saturadas
- Contexto: `art-reviewer` (it.1) — luz sem direção legível (nota 2), manchas fracas e só uma visível no N0; imagem laranja/vermelha saturada.
- Escolha: `lighting.sun.elevationDeg` 32 → 28 (manchas mais longas, vindo para a câmera), `lateralDeg` 15 → 5 (as duas manchas entram no quadro do N0); força do sol no Blender 7 → 11 (e a luz dinâmica dos props igual). Albedos de madeira com saturação 0,5–0,55 e média mais marrom; pedra mais bege-acinzentada; balanço de branco um pouco mais frio. Tapete e escrivaninha passam a `lightmap` (PBR com textura própria em 2K, desenho persa nítido) no atlas da casca. `curtains.rodOverhang` 0,2 → 0,12 e mãos-francesas menores (o varão atravessava a mão-francesa). `door.openInwardDeg` 105 → 98 (face das folhas um pouco mais visível).
- Como reverter: `config/room.json`, `blender/build_room.py` (`sun_data.energy`), `scripts/prepare-textures.ts`, `blender/bake_config.json`.
- Precisa do usuário? não.

## 2026-10-15 — Look dev it.3: céu mais frio e forte como preenchimento, exposição +0,3 EV
- Contexto: `art-reviewer` (it.2) — tom geral sépia sem neutros; o quente deve vir só de onde o sol bate.
- Escolha: World do Cycles multiplicado por (0,82; 0,93; 1,15) e força 1,0 → 1,7; sol mantido em 3200 K. Médias dos albedos alinhadas à paleta (piso #7A4E32, estante #5C3D2A, lambri #674430, pedra #AA9C86). `toneMappingExposure` 1,23 no app.
- Como reverter: `blender/build_room.py` (bloco World), `scripts/prepare-textures.ts`, `src/scene/SceneRoot.tsx`.
- Precisa do usuário? não.

## 2026-10-15 — Look dev S8: recomendações 1 e 2 do relatório aplicadas (sem resposta do usuário)
- Contexto: o usuário pediu para continuar; as decisões 1–2 do relatório tinham recomendação. Aplicadas e reversíveis.
- Escolha: céu do bake mais frio (×0,74/0,90/1,30, força 2,0) como preenchimento; `lighting.sun.elevationDeg` 28 → 22 (manchas mais longas, sem sair da sala — conferido no shot); pedra #A8A08E com saturação 0,4; madeiras com saturação 0,32; `curtains.tiebackY` 1,0 → 1,4.
- Como reverter: `config/room.json`, `blender/build_room.py` (bloco World), `scripts/prepare-textures.ts`.
- Precisa do usuário? sim, confirmar pelo `compare_N0.png`.

## 2026-10-15 — Look dev S9: seguir o revisor (escolha do usuário)
- Contexto: o usuário escolheu "seguir o revisor" para a próxima rodada da sala.
- Escolha: madeiras com saturação 0,25 e médias #5A4232 (estante), #66503C (lambri), #7A5A40 (piso); céu das janelas âmbar e estourado (tint 1,4/1,0/0,6 × 4,2); feixes mais fortes; `nodes.N0.position.z` 5,35 → 4,95.
- Como reverter: `scripts/prepare-textures.ts`, `src/scene/Sky.tsx`, `config/room.json`.
- Precisa do usuário? não (decidido).

## 2026-10-15 — Look dev S10: madeira mais âmbar, anti-magenta, lustre mais baixo
- Contexto: `art-reviewer` (S9: 4/4/4/4/3) — dominante rosado, veio da estante contrastado, lustre pequeno/alto, latão sem leitura.
- Escolha: médias de madeira com matiz ~26° (#6B4A32 estante, #725238 lambri, #7E5C3E piso) e contraste do veio −15 a −20%; balanço de branco com +4% de verde; `chandelier.bottomY` 2,35 → 2,1; latão dos props mais reflexivo.
- Como reverter: `scripts/prepare-textures.ts`, `src/scene/Grade.tsx`, `config/room.json`, `src/scene/ShelfProps.tsx`.
- Precisa do usuário? não.

## 2026-10-15 — ✅ Fase 0 aprovada pelo usuário
- Contexto: candidata S10 (bake final, `art-reviewer` 4/4/4/4/4), `shots/latest/compare_N0.png`.
- Escolha: o usuário aprovou a Fase 0 no chat. Pendências visuais pós-aprovação listadas em `docs/look-dev/iteracoes.md` (S10) e no relatório.
- Como reverter: n/a (marco).
- Precisa do usuário? não.

## 2026-10-15 — Fase 3 começa pela integração dos livros na estante
- Contexto: CLAUDE.md lista "2. Estante + livros de teste" e "3. Seleção, destaque e descrição"; a Fase 2 (livro paramétrico) foi feita em cena isolada porque o livro não podia entrar na sala antes da aprovação. O usuário pediu "Fase 3 (livros na estante)".
- Escolha: integrar os 6 livros de teste na estante com `shelfLayout.ts` (fecha a Fase 2) e implementar a seleção, o destaque e a descrição (Fase 3). Spec escrita em `docs/specs/fase-3-selecao.md` a partir do CLAUDE.md.
- Precisa do usuário? não.

## 2026-10-15 — Fase 3: pares de apoios vazios escondidos; pose da seleção
- Contexto: `art-reviewer` (2ª revisão da Fase 3) — pares de apoios sem livros nas prateleiras de baixo parecem esquecidos; o livro selecionado flutuava à frente da prateleira (avanço de 20 cm > profundidade do livro) e o realce lavava a capa.
- Escolha: apoios só aparecem nas prateleiras com livros (o par da fileira vem para a frente, junto das lombadas); seleção avança 0,7× a largura do livro e gira 28° (spec: ~0,6× e ~20°); realce 3–4%.
- Como reverter: `src/scene/ShelfProps.tsx`, constantes em `src/book/BookShelf.tsx`.
- Precisa do usuário? não.

## 2026-10-15 — Feedback do usuário após testar (navegação e seleção)
- Contexto: o usuário testou no Windows com "efeitos de animação" desligados, o que o navegador expõe como `prefers-reduced-motion: reduce` (conferido no painel do app). Nesse modo a caminhada entre nós virava um fade de 0,3 s ("teletransporte") e a seleção do livro pulava sem animar (sobrepondo objetos).
- Pedidos: (1) andar até o próximo ponto em vez de teleportar; (2) passar o mouse mostra o título num popover no estilo do painel; (3) ao clicar, o livro sai da estante e vem para a mão do usuário, de capa fechada voltada para ele; só então aparece o painel com material/páginas/descrição; (4) seguir as fases.
- Escolha:
  - Caminhada: mantida em todos os casos; com movimento reduzido ela fica mais curta (0,9 s), sem giro da câmera, em vez do fade. Entra **agora** (é parâmetro). Uma caminhada com passos intermediários/ponto livre fica registrada em `docs/specs/fase-1-navegacao.md` como evolução.
  - Seleção redesenhada na Fase 3 (spec atualizada): popover de título no hover; clique → o livro sai reto da fileira (sem tocar os vizinhos) e voa até a "mão" (≈0,45 m à frente da câmera, um pouco abaixo do centro, capa de frente); painel aparece quando ele chega; Voltar/Esc faz o caminho inverso. Com movimento reduzido: a mesma trajetória em ~60% do tempo.
  - A Fase 4 passa a começar da "mão": **Abrir** abre a capa ali mesmo e permite folhear.
- Precisa do usuário? não.

## 2026-10-15 — Fase 3: livro na mão menos lavado (revisão E4)
- Contexto: `art-reviewer` deu 2/5 ao livro na mão: na altura dos olhos, quase de frente, capa clara demais (bordô e natural saíam com a mesma cor bege-rosada). Medindo, ~2/3 do brilho da capa vinha das luzes em tempo real: o lustre fica atrás e acima do leitor, e a capa virada para a câmera fica no pico especular dele.
- Escolha: pose na altura do peito, inclinada 20° para trás em torno da largura do livro e girada 11° (mostra a lombada); enquanto o livro está fora da estante, albedo, reflexo do ambiente e especular descem (exposição 0,5, especular ao quadrado), como se o corpo do leitor fizesse sombra. Dourado mais acetinado (rugosidade 0,42) e verniz do couro 0,1.
- Alternativa: luz própria para o livro em mãos (rig separado) — mais controle, mais draw calls e uma luz que a sala não tem.
- Como reverter: constantes `HAND_*` e `HAND_EXPOSURE` em `src/book/BookShelf.tsx`.
- Precisa do usuário? não (aprovação visual segue com o usuário).

## 2026-10-15 — Fase 4: como o livro abre
- Contexto: spec `docs/specs/fase-4-abrir-folhear.md`. A capa é uma malha só (placa de trás + lombada + placa da frente) e o miolo é um bloco.
- Escolha:
  - A placa da frente gira no vertex shader da capa (atributo `aPanel` = 2 já existia); a lombada afunda para trás da calha quando o livro abre. Sem malha nova da capa.
  - O miolo vira duas pilhas: o próprio bloco escalado na espessura (direita, na placa de trás) e uma cópia na metade da frente (esquerda). A dobradiça fica na fronteira entre as pilhas, então as duas páginas visíveis ficam sempre no mesmo nível, e a metade da frente para em 175° (o "V" de um livro aberto na mão).
  - Folha virando: malha 24 × 6 com curvatura integrada no vertex shader (a ponta lidera); frente e verso em um material só (`gl_FrontFacing`). Só existem as texturas das páginas visíveis (cache de 10).
  - Fechar: a capa fecha com as pilhas como estão (o livro fecha naquela página); ao terminar, o leitor volta para a página 1.
  - Livro aberto sem sombra do sol (o passe de profundidade não roda o shader da dobradiça); a sombra volta quando fecha.
  - DOF só durante a leitura, tier high, foco na distância de leitura.
- Parâmetros de screenshot: `?select=<id>&open=1&page=N`, `&turn=0..1` (folha parada no meio), `&openAt=0..1` (abertura parada no meio).
- Como reverter: `src/book/reader/`, `setCoverOpen` em `materials.ts`.
- Precisa do usuário? não.

## 2026-10-15 — Ajustes depois do teste do usuário (Fases 3 e 4)
- Contexto: o usuário testou a seleção e a leitura. Aprovou a navegação, o popover, o voo até a mão, a barra de leitura e as animações. Pediu: livro na mão centralizado e reto (só levemente inclinado para a estante); clicar no livro na mão abre; com o livro aberto, clicar fora não fecha; clicar na capa do livro aberto fecha. Relatou dois defeitos ao folhear: uma página aparecia no lugar da capa ao virar a primeira folha, e as letras se embaralhavam no início da virada. Achou o texto, sobretudo o cabeço, fraco.
- Causas e escolhas:
  - Página no lugar da capa: a pilha da esquerda já crescia com a folha no ar, e o topo dela (papel liso) cobria a guarda. Agora a folha no ar não conta em nenhuma pilha até pousar.
  - Letras embaralhadas: as páginas paradas têm ondulação de 0,7 mm e a folha no ar não tinha, então as cristas da página de baixo atravessavam a folha. A folha agora parte da mesma superfície (subida + ondulação, uma semente só para as duas páginas) com 0,6 mm de folga.
  - Cliques: sai o fundo invisível que capturava cliques fora do painel. "Fora" passa a ser `onPointerMissed` do Canvas, que só age com o livro fechado na mão. O clique no livro na mão abre. Com o livro aberto, planos invisíveis das placas fecham o livro.
  - Texto: tinta #1E130B, cabeço #3D2C1F e maior; páginas a 1,5K no tier high (1K no low, dentro do orçamento).
- Como reverter: constantes `HAND_*` em `BookShelf.tsx`; `onPointerMissed` em `SceneRoot.tsx`; `cover_hit_*` em `BookReader.tsx`.
- Precisa do usuário? não.

## 2026-10-16 — Sumário e folhear rápido (pedido do usuário)
- Contexto: o usuário aprovou as correções, pediu o livro aberto só inclinado para a estante, sem o "piscar" da página atravessando a capa na abertura, e um sumário lateral para não precisar clicar página a página até o fim, mantendo a animação de folhear.
- Escolha:
  - Sumário à esquerda no mesmo vidro da barra; capítulos provisórios até a Fase 5.
  - Ir a um capítulo **folheia** em vez de pular: o salto vira até 14 voos (cada voo leva um bloco de folhas), até 7 no ar ao mesmo tempo, ~1,3 s para qualquer distância. Cada voo mostra a frente da primeira folha do bloco e o verso da última, e as páginas paradas mostram exatamente o que está embaixo. Texturas de 512 px durante o voo (a 1,5K, desenhar ~30 páginas travaria a animação).
  - Pose aberta: o giro de 4° saiu; sobra só a compensação do "V" (metade dos 5° para cada lado), que deixa as duas metades simétricas.
  - Piscar na abertura: a página tem 8 mm de curvatura e a capa quase fechada fica a < 1 mm dela; a curvatura agora cresce com o ângulo da capa.
- Alternativa: pular direto para a página (sem animação) — descartada, o usuário pediu a animação de folhear.
- Draw calls: 142 medidos no meio do folhear (e2e do sumário verifica < 150).
- Como reverter: `goTo`/`stepRiffle` em `useReader.ts`, `ReaderToc` em `SelectionPanel.tsx`.
- Precisa do usuário? não.
