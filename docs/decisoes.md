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
