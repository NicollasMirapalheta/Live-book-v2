# Spec — Fase 3: livros na estante, seleção, destaque e descrição

Derivada do CLAUDE.md ("Na estante, escolhe um livro, que desliza para fora com capa e descrição; ao confirmar, o livro flutua até a câmera, abre e pode ser folheado"). O voo, a abertura e o folhear são da Fase 4.

## Livros na estante

- `src/book/BookShelf.tsx` posiciona os livros com `layoutShelves()` (`src/book/shelfLayout.ts`) a partir de `public/data/bookcase.json`: de pé, lombada para fora (+Z), da prateleira de cima para baixo, folgas de 2–4 mm, ±5 mm de profundidade, livro inclinado no fim da fileira.
- Os objetos de cena se movem conforme o layout (apoio de livro fecha a fileira; o objeto que não cabe desce para a próxima prateleira). Sem animação nesta fase de carga.
- Livros são dinâmicos: PBR em tempo real com o env da sala, sol e lustre, sombra do sol (shadow map sob demanda: `invalidateShadows()` ao mover).
- Fonte dos livros: fixtures (`src/book/fixtures.ts`) até a Fase 6 (IndexedDB).

## Seleção (só no nó da estante, N2)

- **Hover** (ponteiro): o livro sob o cursor avança 12 mm e ganha um leve realce (rim/emissivo quente ~6%), 0,2 s. Cursor `pointer`.
- **Clique/toque**: o livro desliza para fora da prateleira (avança ~0,6× a largura do livro, 0,6 s, `power2.out`) e gira ~20° mostrando a capa; aparece o painel de descrição (título, subtítulo, descrição, nº de páginas) e os botões **Abrir** (confirma — Fase 4; nesta fase só registra a intenção) e **Voltar**.
- **Voltar**, `Esc` ou clique fora: o livro volta à posição (0,5 s) e o painel some.
- Teclado: com o painel fechado, `←/→` percorre os livros no N2 (foco visível pelo destaque) e `Enter` seleciona.
- Fora do N2 não há seleção; ir ao N2 é o caminho. Durante a seleção a navegação e o olhar ficam bloqueados.
- `prefers-reduced-motion`: deslizar vira fade curto.
- `?shot=1` esconde o painel; `?select=<id>` abre a seleção daquele livro (usado pelo `npm run shot`).

## Estado

`src/book/useSelection.ts` (zustand): `hovered`, `selected`, `select(id)`, `clear()`, `focusNext(dir)`. Exposto em `window.__SEL__` com `?e2e=1`.

## Verificação

- `npm run test`: layout (já existente) + lógica de foco/seleção.
- `npm run e2e` (`e2e/selection.spec.ts`): ir ao N2, selecionar por teclado, conferir painel com o título, `Esc` fecha; clicar num livro abre a seleção.
- `npm run shot -- --node N2` com livros; `--node N2 --query select=fx-natural` com o painel escondido e o livro para fora. Revisão do `art-reviewer` (livros na estante: escala, contato, legibilidade das lombadas).
- Draw calls < 150 em N2 com os 6 livros.
