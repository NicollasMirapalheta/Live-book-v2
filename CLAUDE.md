# Live Book

Experiência web 3D em primeira pessoa: uma sala realista com uma estante onde ficam livros criados pelo usuário. Ele olha 360° a partir de pontos fixos e avança em passos (estilo Street View). Na estante, escolhe um livro, que desliza para fora com capa e descrição; ao confirmar, o livro flutua até a câmera, abre e pode ser folheado. Cada livro é um objeto físico (espessura pelo número de páginas, capa com textura na cor escolhida, polaroid na capa) e o conteúdo vem de um PDF rediagramado na identidade visual do projeto.

## Princípio número 1

**IMPORTANT: a qualidade visual vem de assets, materiais e iluminação, não de código.** Nunca entregar cena com geometria primitiva e cor chapada. Placeholders só marcados com `// PLACEHOLDER` e listados em `docs/placeholders.md`.

## Documentos (leia antes de trabalhar na área correspondente)

| Arquivo | Conteúdo |
|---------|----------|
| `docs/direcao-de-arte.md` + `docs/referencia.jpg` | Fonte de verdade visual: composição, materiais, paleta, luz, critério de aprovação |
| `config/room.json` | **Única** fonte de medidas, posições, nós de navegação e parâmetros de luz. Nunca duplicar esses números |
| `docs/specs/fase-0-sala.md` | Pipeline Blender → bake → glb → R3F, screenshot e revisão |
| `docs/specs/fase-1-navegacao.md` | Navegação por nós |
| `docs/specs/fase-2-livro.md` | Livro paramétrico |
| `docs/assets.md` + `assets/manifest.json` | Assets CC0 (origem, licença, uso) e download automático |
| `docs/decisoes.md` | Registro de decisões (contexto, escolha, alternativa, como reverter) |
| `docs/noite/runbook.md` | Regras do modo autônomo (execução sem o usuário) |

## Stack

- Node 22.12+ · Vite + React 19 + TypeScript strict
- `three`, `@react-three/fiber` 9, `@react-three/drei` 10, `@react-three/postprocessing` 3 (+ `postprocessing`)
- `zustand`, `gsap`, `leva` (só em dev)
- Blender **5.2 LTS** em modo background, sempre via `scripts/blender.mjs` (caminho do executável em `BLENDER_BIN`, no `.env.local`)
- `@gltf-transform/cli` (Meshopt + KTX2; KTX2 exige o programa `ktx` do KTX-Software 4.4+ no sistema), Playwright (screenshots e e2e), `vitest`, `tsx` para os scripts (`node --env-file-if-exists=.env.local --import tsx`)
- Persistência: IndexedDB no MVP; Supabase depois da validação

Combinação de versões verificada em 14/10/2026: three 0.186, fiber 9.8, drei 10.7, postprocessing 6.39 / @react-three/postprocessing 3.2, React 19.3, Vite 8, TypeScript 6.0 (o template do Vite fixa `~6.0`; não subir para o 7 sem necessidade).

## Arquitetura de render

- **Sala estática:** luz pré-calculada no Blender (lightmaps em UV2 + peças pequenas com bake completo). Nenhuma luz em tempo real ilumina a sala. O env map da sala entra só como especular nos materiais estáticos.
- **Objetos dinâmicos** (livros, objetos das prateleiras): PBR em tempo real com o env map da sala + 1 luz de sol e 1 do lustre; sombras em tempo real só neles.
- **Efeitos:** piso refletor borrado, feixes de luz + poeira, AgX, bloom seletivo, vinheta, DOF só no modo livro.
- **Tiers:** store `quality` (`'high' | 'low'`) por detecção de aparelho + `PerformanceMonitor`; `?quality=low` força. Todo efeito caro lê do store. Protótipo mira desktop, mas nada pode impedir o tier low depois.

## Orçamento (desktop, tier high)

60 fps em notebook intermediário · < 150 draw calls · download inicial < 30 MB · texturas ≤ 2K (1K no low), em KTX2 (WebP só como fallback registrado se o `ktx` faltar).

## Comandos

`npm run dev` · `npm run check` (tsc + lint + build) · `npm run test` · `npm run e2e` · `npm run shot` (screenshots, ver spec da Fase 0) · `npm run pipeline -- --quality draft|final` · `npm run assets:fetch` · `npm run pdf:probe -- <arquivo.pdf>` (pipeline de PDF real no Chromium: páginas originais × compostas). O Blender é sempre chamado pelo wrapper `scripts/blender.mjs` (nunca `$BLENDER_BIN` no `package.json`).

## Fluxo de trabalho

1. Toda mudança visual termina com `npm run shot` e revisão do subagente `art-reviewer` contra a referência, registrando o que ainda diverge em `docs/look-dev/iteracoes.md`.
2. Uma mudança visual só está "aprovada" quando o usuário aprova o screenshot.
3. Integração na sala segue as fases em ordem, com gate de aprovação. Trabalho sem impacto visual na sala (navegação, livro em cena isolada `?dev=book`) pode avançar em paralelo.
4. Assets de terceiros só CC0 ou compatível, registrados em `docs/assets.md`.
5. Código e identificadores em inglês; documentação, commits e comunicação em português.
6. Commits pequenos e frequentes; nunca push sem pedido do usuário. Nunca rodar geradores com `--overwrite` na raiz.

## Fases

0. **Look dev da sala** (gate) · 1. Navegação por nós · 2. Estante + livros de teste · 3. Seleção, destaque e descrição · 4. Voo, abertura e folhear · 5. PDF → páginas rediagramadas · 6. Identidade visual da interface + persistência

## Compactação de contexto

Ao compactar, preservar: tarefa atual de `docs/noite/tarefas.md`, último resultado do `art-reviewer`, decisões ainda não registradas e comandos que falharam com a causa.
