# Spec — Fase 3: livros na estante, seleção, destaque e descrição

Derivada do CLAUDE.md ("Na estante, escolhe um livro, que desliza para fora com capa e descrição; ao confirmar, o livro flutua até a câmera, abre e pode ser folheado"). O voo, a abertura e o folhear são da Fase 4.

## Livros na estante

- `src/book/BookShelf.tsx` posiciona os livros com `layoutShelves()` (`src/book/shelfLayout.ts`) a partir de `public/data/bookcase.json`: de pé, lombada para fora (+Z), da prateleira de cima para baixo, folgas de 2–4 mm, ±5 mm de profundidade, livro inclinado no fim da fileira.
- Os objetos de cena se movem conforme o layout (apoio de livro fecha a fileira; o objeto que não cabe desce para a próxima prateleira). Sem animação nesta fase de carga.
- Livros são dinâmicos: PBR em tempo real com o env da sala, sol e lustre, sombra do sol (shadow map sob demanda: `invalidateShadows()` ao mover).
- Fonte dos livros: fixtures (`src/book/fixtures.ts`) até a Fase 6 (IndexedDB).

## Seleção (só no nó da estante, N2) — revisada após o teste do usuário (15/10)

- **Hover** (ponteiro) ou foco de teclado: o livro avança 12 mm, ganha realce quente leve e aparece um **popover com o título** (mesmo estilo do painel lateral), ancorado acima da lombada. Só o título — sem mais dados.
- **Clique/toque ou `Enter`:** o livro **sai reto da fileira** (desliza para fora no eixo da prateleira, sem tocar vizinhos nem apoios, ~0,35 s) e **voa até a mão do usuário** (~0,9 s, `power2.inOut`, arco suave): ≈0,45 m à frente da câmera, um pouco abaixo do centro, de pé, **capa fechada voltada para o usuário**, leve inclinação para trás. A navegação trava.
- **Só quando o livro chega à mão** aparece o painel à direita (cor · material · páginas, título, subtítulo, descrição, **Abrir** e **Voltar**).
- **Voltar**, `Esc` ou clique fora: o painel some, o livro faz o caminho inverso e entra na fileira.
- **Abrir:** Fase 4 (abre a capa na mão e permite folhear).
- `prefers-reduced-motion`: mesma trajetória em ~60% do tempo, sem arco.
- `?shot=1` esconde painel e popover; `?select=<id>` leva o livro direto à mão (screenshots).

## Estado

`src/book/useSelection.ts` (zustand): `hovered`, `focused`, `selected`, `phase` (`out` → `hand` → `back`), `select(id)`, `arrived()`, `clear()`, `returned()`, `focusNext(dir)`. Exposto em `window.__SEL__` com `?e2e=1`.

## Verificação

- `npm run test`: layout (já existente) + lógica de foco/seleção.
- `npm run e2e` (`e2e/selection.spec.ts`): ir ao N2, selecionar por teclado, conferir painel com o título, `Esc` fecha; clicar num livro abre a seleção.
- `npm run shot -- --node N2` com livros; `--node N2 --query select=fx-natural` com o painel escondido e o livro para fora. Revisão do `art-reviewer` (livros na estante: escala, contato, legibilidade das lombadas).
- Draw calls < 150 em N2 com os 6 livros.
