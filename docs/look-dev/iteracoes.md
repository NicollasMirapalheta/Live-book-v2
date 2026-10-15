# Iterações de look dev

Cada entrada: data/hora, o que mudou, notas por critério (art-reviewer), divergências e onde estão os shots.

## Livro (Fase 2, cena isolada `?dev=book`)

### L1 — 2026-10-15 ~01:45
- Shots: `shots/latest/book/book_48_bordo_couro.png`, `book_220_verde_tecido.png`, `book_640_couro_natural.png`.
- Primeira versão completa: lombada arredondada, seixas de 3 mm, canaletas da dobradiça, bisel, couro/tecido tingidos preservando a luminância, desgaste nas bordas, gravação dourada (título, nervos e frisos na lombada, quadro na capa) com relevo via normal, corte das páginas, polaroid em rebaixo de 1 mm (proporção 88×107, borda inferior larga, ±2°).
- **art-reviewer: nota 2/5** ("parece livro de capa dura real de perto? não ainda"). Proporções 3 · material da capa 2 · gravação 2 · corte das páginas 1 · polaroid 2.
- Divergências (ordem de impacto): corte das páginas liso; degrau creme na placa traseira; tecido sem trama; quinas vivas sem desgaste; polaroid "adesivo" (sem sombra de contato); título da lombada invertido (ABNT pede de cima para baixo); dourado acobreado e frisos pontilhados; grão do couro grande demais; canaletas imperceptíveis; luz laranja demais e mesa borrada.

### L2 — 2026-10-15 ~01:55 (correções aplicadas, sem nova revisão formal)
- Título da lombada de cima para baixo (ABNT NBR 12225); corte das páginas com uma linha por folha, cadernos de 8 folhas e creme #E3D5B8 escurecendo nas bordas; grão do couro 45% menor; trama do tecido em escala de encadernação e contraste maior; frisos sólidos (sem pontos/rebites); dourado menos acobreado; canaleta 1 mm, bisel 1,2 mm; desgaste mais claro e despigmentado; luz-chave menos saturada (#FFDDB8) e env mais forte; mesa com textura em escala e DOF mais suave.
- Pendências para a próxima rodada: tecido ainda liso a 40 cm (buckram CC0 com trama própria seria melhor); fotos de exemplo são ilustrações (a spec proíbe imagens de terceiros — trocar por fotos do usuário na Fase 6); sombra de contato da polaroid sutil.

## Sala (Fase 0, frame de aprovação N0)

### S1 — 2026-10-15 ~01:47 (draft)
- Shots: `shots/latest/compare_N0.png`, `N1.png`, `N2.png`; 107/93/56 draw calls.
- **art-reviewer:** composição 3 · luz 2 · reflexo do piso 3 · estante legível 3 · nada plástico 2 — "iterar".
- Divergências: imagem laranja/vermelha saturada (madeira ~#7A2A1A); sol fraco e só uma mancha no N0; piso espelhado demais; folhas da porta finas e escuras; tapete borrado (bake combined de baixa resolução); estante sem leitura no N0; lampião/quadro fora do quadro; varões atravessando as mãos-francesas; bases dos apoios de latão estourando; sombras travadas no piso de cor.

### S2 — 2026-10-15 ~01:53 (draft)
- Mudanças: madeiras com saturação 0,5 e média marrom; pedra bege-acinzentada; balanço de branco mais frio e dessaturação leve pós-AgX (0,86); sol 28°/5°, força 11 (duas manchas no N0); tapete e escrivaninha em modo `lightmap` (textura 2K própria); reflexo do piso só planar, mais borrado e mais fraco; latão dos props acetinado; varões mais curtos e mãos-francesas menores; folhas da porta a 98°; céu e feixes mais fortes.
- A faixa clara no piso junto à parede do fundo vem do lightmap (luz do céu das janelas), não do reflexo: conferido com `?off=reflect`.

### S3 — 2026-10-15 ~01:58 (draft)
- Mudanças: céu do bake mais frio e forte (preenchimento), médias de albedo na paleta, exposição +0,3 EV, estante/parede projetam sombra nos props, anisotropia 8, piso menos saturado.
- **art-reviewer:** composição 3 · luz 3 · reflexo 3 · estante 3 · nada plástico 2 — "iterar". (Na S2 a nota do reflexo foi dada sobre um shot de depuração sem reflexo; o `shot.ts` não sobrescreve mais `shots/latest` em execuções de depuração.)
- Divergências: véu especular frio nas superfícies horizontais (env sem oclusão); fim de tarde pouco legível (céu cinza, quadriculado fraco, feixes invisíveis no N0); tapete monocromático, veio repetido no fundo da estante e lambri, bases dos apoios chapadas.

### S4 — 2026-10-15 ~02:06 (draft)
- Mudanças: oclusão especular pelo lightmap nos estáticos (o env não sabe das sombras da sala); sol com penumbra 0,8° (quadriculado das janelas nítido e alongado no piso); céu das janelas quente e estourado no app; feixes mais fortes; tapete com o contraste original do Met; deslocamento aleatório de UV por peça (quebra a repetição do veio).
- **art-reviewer (S4):** composição 3 · luz 3 (melhorou: quadriculado nítido) · reflexo 3 · estante 3 · nada plástico 2 — "iterar"; bake final só depois de resolver o encontro piso/parede.

### S5 — 2026-10-15 ~02:15 (draft)
- **Bug estrutural corrigido:** `MeshBuilder.finish()` recalculava normais em caixas abertas (face junto à parede omitida) e invertia faces do lambri/rodapé — o bake as iluminava por dentro (rodapé quase preto, "estante flutuando"). Agora as faces saem orientadas por construção, sem recálculo.
- Reflexo do piso: alongamento 0,11 → 0,06 e ganho 1,25 → 1,0 (o véu cinza-azulado no fundo do piso era o reflexo das janelas espalhado em ângulo rasante, conferido com `debug=reflect-clear`); saturação global 0,8; latão dos props menos fosco.
- **art-reviewer (S5):** 3 · 3 · 3 · 3 · 2 — "iterar". Encontro piso/parede: bug de geometria resolvido, restava shading; madeira ainda vermelha (afeta o rebatimento: corrigir antes do final).

### S6 — 2026-10-15 ~02:20 (draft → base do bake final)
- Madeiras com saturação 0,4 e matiz ~26° (médias #5F432F estante, #6B4A34 lambri, #785236 piso); velas do lustre 9 → 14 W (preenchimento da frente da estante); reflexo do piso atenuado nos 50 cm junto às paredes e à base da estante (contato).
- Próximo passo: bake `final` (512 amostras, resolução cheia) + shot + revisão.

### L3 (livro) — 2026-10-15 ~02:30
- Capa de tecido com trama de buckram procedural (~0,4 mm por fio) como normal map, no lugar do normal grosso do linho das cortinas. Lâmpadas-vela do lustre como emissores quentes (antes refletiam o céu e saíam azuladas).
