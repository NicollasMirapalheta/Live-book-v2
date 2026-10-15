# Relatório da noite 01 — 15/10/2026

Início: 00:02 (relógio da máquina). Branch `noite-01`, sem push.

## Resumo

1. **Pipeline completo e automático:** Blender 5.2 (GPU OptiX, RTX 4060) monta a sala, a estante, os props e as cortinas (simulação de tecido), assa os lightmaps, faz o denoise, exporta e otimiza para o navegador com um comando (`npm run pipeline -- --quality draft|final`, ~3 min em draft).
2. **Sala no navegador:** lightmaps RGBM, reflexo planar borrado das janelas no piso, quadriculado do sol, feixes e poeira, props em PBR com sombra, AgX. Cerca de 105 draw calls no N0, dentro do orçamento.
3. **Look dev:** 6 iterações em draft com o `art-reviewer` mais o bake final. Notas da última revisão estão abaixo. **A Fase 0 não está aprovada:** há candidatos prontos para a sua avaliação.
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

## Última avaliação do art-reviewer

_(preenchido após o bake final)_

## Orçamento

_(preenchido após o bake final)_

## Decisões que precisam de você

_(preenchido após o bake final)_

## Bloqueios e placeholders

_(preenchido após o bake final)_

## Próximos passos sugeridos

_(preenchido após o bake final)_
