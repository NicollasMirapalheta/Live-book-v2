# Placeholders em uso

Todo placeholder no código é marcado com `// PLACEHOLDER` e listado aqui. A Fase 0 só pode ser aprovada sem placeholders visíveis no N0.

| Onde | O quê | Por quê | Como substituir |
|------|-------|---------|-----------------|
| Estante (props) | Globo antigo ausente | Sem globo CC0 nem textura de mapa antigo em domínio público verificada | Encontrar mapa antigo em domínio público, modelar esfera + suporte de latão em `build_props.py` |
| `src/scene/PlaceholderRoom.tsx` | Sala em cor chapada (planos + caixa da estante) | Permitir navegação e screenshots antes de existir `public/models/room.glb` | Some sozinho quando o pipeline gerar o `room.glb` (`Room.tsx` passa a carregar o modelo) |
| `src/book/reader/pageContent.ts` | Conteúdo das páginas do livro aberto: rosto, cabeço, texto de exemplo e fólio gerados em canvas | O PDF rediagramado é a Fase 5 | Fase 5: as páginas vêm do PDF processado; `PageTextures` passa a carregar essas imagens |
| `src/book/reader/toc.ts` | Sumário provisório: capítulos espalhados pelo livro com títulos de exemplo | A estrutura real vem do PDF na Fase 5 | Fase 5: o sumário sai dos marcadores/títulos do PDF processado |
