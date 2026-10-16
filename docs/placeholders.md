# Placeholders em uso

Todo placeholder no código é marcado com `// PLACEHOLDER` e listado aqui. A Fase 0 só pode ser aprovada sem placeholders visíveis no N0.

| Onde | O quê | Por quê | Como substituir |
|------|-------|---------|-----------------|
| Estante (props) | Globo antigo ausente | Sem globo CC0 nem textura de mapa antigo em domínio público verificada | Encontrar mapa antigo em domínio público, modelar esfera + suporte de latão em `build_props.py` |
| `src/scene/PlaceholderRoom.tsx` | Sala em cor chapada (planos + caixa da estante) | Permitir navegação e screenshots antes de existir `public/models/room.glb` | Some sozinho quando o pipeline gerar o `room.glb` (`Room.tsx` passa a carregar o modelo) |
| `src/book/reader/pageContent.ts` (`drawContent` sem `layout`) | Páginas provisórias (texto de exemplo) dos livros de teste **sem PDF** | Só 2 dos 6 livros de teste têm PDF de exemplo | Some quando todo livro tiver PDF (livros do usuário, Fase 6); com PDF a página já vem da composição (Fase 5) |
| `src/book/reader/toc.ts` | Sumário provisório dos livros de teste **sem PDF** | Idem | Com PDF o sumário sai dos títulos do PDF (Fase 5) |
| `src/data/library.ts` (`EXAMPLES`) | Os 6 livros de teste aparecem como exemplos enquanto o usuário não tem livros | Estante nunca vazia na primeira visita | Decidir com o usuário (ver `docs/decisoes.md`, Fase 6) |
