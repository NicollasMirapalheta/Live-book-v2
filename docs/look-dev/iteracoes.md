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

### S7 — 2026-10-15 ~02:35 (**bake FINAL**: 512 amostras, casca 2048 px / 106 px/m, props 2048 px / 337 px/m)
- Também: faixa RGBM dos lightmaps limitada a 12 (precisão nos escuros), env map 1024×512, texturas WebP q72 (download ~27 MB).
- **art-reviewer:** composição 3 · luz 3 · reflexo **4** · estante **4** · nada plástico **3** (S5: 3/3/3/3/2). Livro **3/5** (era 2). Veredito "iterar"; mostrar ao usuário como checkpoint de progresso, não como candidato à aprovação.
- Divergências restantes (viraram próximos passos no relatório): dominante vermelho-laranja; vestíbulo escuro e profundo no N0 16:9; fim de tarde pouco legível (céu cinza, feixes fracos no N0); faixa fria no fundo do piso; props/têxteis genéricos (cúpulas do lustre, abraçadeiras baixas, quadro e lampião fora do quadro do N0).
- Defeitos técnicos corrigidos depois desta revisão (re-bake final): costura de luz nas quinas do vestíbulo; moiré da trama do livro de tecido.
- Limite de iterações: 6 drafts + final (runbook: até 8). Parei aqui porque os itens restantes de maior impacto (temperatura geral da luz, elevação do sol, posição do N0) contradizem decisões anteriores do próprio revisor ou da direção de arte e precisam da sua escolha — ver "Decisões que precisam de você".

### S8 + L4 — 2026-10-15 (continuação pedida pelo usuário)
- Sala: recomendações 1–2 do relatório aplicadas (céu do bake mais frio/forte, sol 22°, força 14), pedra #A8A08E (sat 0,4), madeiras sat 0,32, abraçadeiras a 1,4 m, velas do lustre creme, feixes mais fortes, latão dos apoios com menos reflexo do céu.
- Livro: polaroid com cartão creme texturizado, foto com verniz brilhante (clearcoat) e sombra de contato no rebaixo; dourado menos acobreado; desgaste mais forte nas quinas; face interna das placas com o material da capa (a "dobra" do couro) — o degrau creme apontado pelo revisor era a guarda de papel aparecendo na seixa.
- **art-reviewer (S8/L4):** sala 3 · 3 · 4 · 4 · 3; livro 3/5 — "iterar".

### S9 — 2026-10-15 (draft; usuário escolheu "seguir o revisor")
- Madeiras com saturação 0,25 (estante #5A4232, lambri #66503C, piso #7A5A40); céu das janelas âmbar estourado; feixes mais fortes; N0 0,4 m à frente (z=4,95): as folhas com maçanetas enquadram as laterais e o tapete fica no pé do quadro, como na referência.
- **art-reviewer (S9):** 4 · 4 · 4 · 4 · 3 — "iterar"; com 3 ajustes pequenos (matiz âmbar, contraste do veio, latão/lustre) pode ir ao usuário como candidata.

### S10 — 2026-10-15 (draft → final)
- Madeira mais âmbar e menos contrastada, balanço de branco anti-magenta, lustre 0,25 m mais baixo (maior no quadro), latão dos props mais reflexivo, cúpulas do lustre em vidro âmbar escuro.
- **art-reviewer (S10, bake final): 4 · 4 · 4 · 4 · 4 — "pronto para o usuário"** como candidata à aprovação da Fase 0.
- Pendências pós-aprovação: cúpulas do lustre (porcelana do asset Chandelier_03, assada no lightmap — separar o material no Blender); faixa fria no rodapé do fundo; franja do tapete muito contrastada; veio repetido no fundo da estante; reflexo próprio das janelas na metade de trás do piso; vestíbulo escuro nas laterais e escrivaninha cortada no N0.

## Fase 3 — livros na estante e seleção

### E1 — 2026-10-15
- Os 6 livros de teste na prateleira de cima (`shelfLayout.ts`), com o par de apoios de latão fechando a fileira e o último livro inclinado; seleção desliza o livro para fora e gira a capa; painel HTML de descrição.
- **art-reviewer:** assentamento 2 · lombadas 2 · luz 3 · gesto 2 — livro inclinado sem apoio, fileira no canto, sem sombra de contato, seleção pouco legível.

### E2
- Fileira centralizada no vão, livro inclinado encostado no apoio na altura dele, sombras de contato (prateleira + fundo), seleção maior. **art-reviewer:** 3 · 3 · 3 · 2 — seleção flutuando e capa lavada; apoios vazios nas outras prateleiras.

### E3
- Seleção 0,7× a largura e 28° (base apoiada), realce 3–4%, apoios só na prateleira com livros e trazidos para a frente.

### E4 — 2026-10-15 (Fase 3 revisada: livro na mão)
- Re-bake final sem os objetos das prateleiras (somem os retângulos escuros da prateleira de baixo); sombras de contato com borda suave (o `alphaMap` lê o canal verde, as texturas guardavam a queda só no alfa).
- **art-reviewer (antes dos ajustes):** estante 3 · livro na mão 2 · integração 2 — "iterar". Pose de painel chapado na altura dos olhos, capa lavada (bordô e natural saíam com a mesma cor), dourado com pontos brilhando.
- Ajustes: pose na altura do peito (0,085 m abaixo do centro da vista), inclinação de 20° em torno da largura do livro (sem rolagem na tela), giro de 11° mostrando a lombada, distância 2,5× a altura. Causa da capa lavada: o lustre fica atrás e acima do leitor, então a capa virada para a câmera fica no pico especular dele. Na mão, albedo, reflexo e especular descem (exposição 0,5; especular ao quadrado). Dourado com rugosidade 0,42 e relevo 0,2; verniz do couro 0,1.
- Medido na capa: bordô passou de 148/99/69 para 121/64/44 (alvo #6E2320); natural voltou a ser marrom.
- Pendente: DOF/escurecer o fundo quando o livro está aberto (Fase 4); veio repetido no fundo da estante; estante com poucos livros (fase de teste).

## Fase 4 — abrir e folhear (livro na mão)

### R1 — 2026-10-15
- Capa gira na dobradiça (shader), miolo em duas pilhas, folha com curvatura, páginas provisórias em canvas, DOF na leitura, barra de leitura.
- **art-reviewer:** abertura 3 · livro aberto 2 · folha 3 · integração 3 — "iterar". Páginas planas como cartão, calha sem vale, livro de frente sem espessura, papel chapado e claro, guarda igual ao miolo, perto demais, DOF fraco.

### R2
- Páginas sobem da calha 8 mm, pose inclinada 14° com yaw de 4°, livro a ~55% da largura, papel #E6DAC0 com queda de luz de cima para baixo, folha no ar escurece a página de baixo, guarda #D6C29C com 13 mm de dobra de couro, bokeh 5,5. Corrigido o NaN de MSAA (`pow` de base negativa) que deixava o quadro preto depois do bloom.
- **art-reviewer:** 4 · 3 · 3 · 4 — "iterar": pontos claros na calha, folha sem marca, papel rígido.

### R3
- Páginas continuam 1,8 mm além da costura, sombra da folha mais forte, contraluz na folha, ondulação de 0,7 mm, transparência do verso, papel #DDD0B4, guarda em papel vergê #CBB386, livro recua 7 cm no meio da abertura.
- **art-reviewer:** 4 · 4 · 4 · 4 — "iterar" só pelos traços claros perto da calha. A causa eram letras do dourado da lombada atravessando a margem esquerda; o dourado agora some com o livro aberto e a lombada recua mais. Transparência do verso a 4%, meia linha deslocada.
- Pendências: serrilhado das bordas no tier low (sem AA), sulco da dobradiça, corte do bloco visível na borda de baixo, sombra projetada real da folha (o sol vem de trás do livro).
- **Conferência pós-correção (art-reviewer):** traços sumiram, nada regrediu — **4 · 4 · 4 · 4, "pronto para o usuário"**.

### R4 — 2026-10-15 (ajustes do teste do usuário)
- Livro na mão centralizado e de frente (12° para trás); a primeira folha não mostra mais papel no lugar da guarda; a folha no ar parte da mesma ondulação das páginas (sem letras misturadas); tinta e cabeço mais escuros, páginas a 1,5K.
- **art-reviewer:** nada regrediu — "pronto para o usuário". Acabamento aplicado: transparência do verso 3%, linhas-corrente do vergê com metade do contraste. Opção para o usuário: 2–3° de giro no livro na mão devolve a lombada à vista.

### R5 — 2026-10-16 (sumário e folhear rápido, pedidos do usuário)
- Livro aberto sem giro próprio (só a inclinação para a estante, "V" dividido igualmente); curvatura das páginas cresce com o ângulo da capa (sem atravessar a capa na abertura); sumário à esquerda; ir a um capítulo folheia rápido (até 14 voos, até 7 folhas no ar, 142 draw calls); páginas de abertura de capítulo.
- **art-reviewer:** nada regrediu — "pronto para o usuário". Aplicado depois: sumário mais estreito (encostava na página esquerda a 1280 px), destaque do destino durante o folhear, página anterior a um capítulo termina curta.

### R6 — 2026-10-16 (teste do usuário: contracapa e folhear rápido)
- Virando a última folha, a direita mostrava papel no lugar da guarda de trás: a folha no ar ainda contava na pilha direita. Agora ela não conta em nenhuma das duas (a dobradiça fica onde estava, as páginas de baixo não pulam).
- No folhear rápido o texto "mudava de estilo" e voltava ao parar: os tamanhos de fonte eram arredondados por resolução, e a textura pequena quebrava as linhas em outros lugares. Tamanhos e margens agora são frações exatas da página (mesmas quebras em qualquer resolução, conferido lado a lado a 768 e 1536 px); texturas do voo a 768 px; a página de destino é desenhada em tamanho cheio quando o folhear começa.

## Fase 5 — PDF → páginas rediagramadas

### P1 — 2026-10-16
- Extração (pdf.js), estrutura e composição na tipografia do livro; PDFs de exemplo com texto próprio.
- **art-reviewer:** texto 3 · capítulo/imagem 3 · "não parece PDF" 3 · integração 4 — "iterar": linhas frouxas e rios (quebra gulosa, sem hifenização), imagem como caixa colada, recuo depois da imagem, espaço entre parágrafos somado ao recuo, colofão pobre, texto de teste repetido.

### P2
- Hifenização em português por sílabas + quebra por parágrafo inteiro (Knuth–Plass simplificado, espaços 80–133%); imagem recortada, fundo levado ao branco e impressa com multiply; sem recuo depois da imagem; só recuo entre parágrafos; grade de linhas; colofão completo. Corrigido um pedaço de palavra sozinho numa linha ("to-").
- **art-reviewer:** 4 · 4 · 4 · 4 — "pronto para o usuário" quanto à composição; pediu antes: texto de teste sem repetição, menos hífens, nenhum hífen no pé da página, colofão sem nome de arquivo.

### P3
- Frases sorteadas sem reposição por capítulo (bancos maiores); hífen nunca em palavra com menos de 6 letras nem na 1ª linha do parágrafo, penalidade maior; parágrafo que terminaria a página com hífen é recomposto sem hifenização; colofão com o título do PDF ou nome legível, omitido quando repete o título do livro.
- Os livros de teste ficaram com 28 e 58 páginas compostas (fixtures e e2e atualizados).
- Pendências: viúva absorvida por recomposição do parágrafo (hoje a página fica 1 linha mais curta); poesia (quebras de verso); tabelas e notas; PDF só de imagens.

## Fase 6 — interface

### I1 — 2026-10-16
- Tokens da interface, formulário Novo livro com prévia 3D, painel com Editar/Remover, tela de abertura, dica de primeira visita.
- **art-reviewer:** coerência 4 · legibilidade 3 · consistência 3 · formulário 3 — "iterar": prévia de frente e com outra cor (azul na prévia, verde-oliva na sala), dourado turvo no primário, versalete fraco, tamanhos soltos fora dos tokens, alvos < 44 px, Editar/Remover sumindo.

### I2
- Prévia a 32°/8° com a luz quente do sol da sala; primário em ouro; rótulos 12 px com 0,14 em; título 26 px em token; foto como zona com miniatura; obrigatórios marcados; overlay mais leve; alvos ≥ 44 px; nome da cor visível; seta sem destino escondida; fade de navegação no mesmo escuro da abertura.

### I3
- **art-reviewer (I2):** 4 · 4 · 4 · 3 — "iterar": azul-petróleo virava verde-oliva (na sala e na prévia), prévia ainda de frente e pequena, sumário cortando item, "tirar a foto" solto, PDF sem rótulo.
- Luzes em tempo real dos livros/objetos levadas 30% (sol) e 40% (lustre) ao branco — o lustre a 2400 K tirava quase todo o azul; bake e env map intocados. Prévia com luz-chave quase neutra na frente da capa (a sala tem balanço de branco, a prévia não): azul-petróleo mede (73, 81, 89) na prévia e (72, 73, 77) na mão. Prévia a 40° com a lombada para a câmera, FOV 22, ~65% da altura. Sumário com linhas de 36 px no mouse e fade no pé. Botão × para tirar a foto; rótulo do PDF.
