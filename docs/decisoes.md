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
