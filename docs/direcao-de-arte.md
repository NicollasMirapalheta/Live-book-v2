# Direção de Arte — Live Book (v1.1)

> Fonte de verdade visual do projeto. Toda mudança de cena deve ser comparada com este documento e com a referência principal antes de ser aceita.

## Referência principal

Sala com estante central entre duas janelas, vista a partir de uma porta dupla aberta. Arquivo: `docs/referencia.jpg`.

**Status: aprovada pelo usuário como referência definitiva.** O único ajuste pedido é a execução realista no lugar do traço ilustrado.

- Usar como referência de **composição, materiais e clima**.
- Execução **realista (PBR)**, não o traço ilustrado da imagem.
- Referências secundárias (bibliotecas clássicas): aproveitar a riqueza da madeira escura, lombadas de couro com dourado e luminárias quentes pontuais. **Não** copiar a escala de biblioteca pública, mezanino ou piso de cerâmica.

## Composição e layout

- Sala retangular, aprox. 5,5 m (largura) × 6 m (profundidade) × 3,2 m (pé-direito), vigas de madeira aparentes no teto. Medidas exatas em `config/room.json`.
- **Vista inicial:** de um vestíbulo logo atrás da porta dupla aberta; as folhas da porta enquadram a imagem nas laterais; verticais paralelas (deslocamento de lente, sem inclinar a câmera).
- **Parede do fundo:** estante central (~1,8 m × 2,4 m, 4 prateleiras + base com portas de painel), ladeada por duas janelas altas de vidro quadriculado com cortinas de linho presas por abraçadeiras.
- **Teto:** lustre de latão com velas no centro.
- **Primeiro plano:** tapete persa próximo à porta.
- **Laterais:** escrivaninha com lampião de latão à direita; quadro na parede à esquerda.

### Nós de navegação

| Nó | Posição | Função |
|----|---------|--------|
| N0 | Soleira da porta | Vista de entrada (frame de aprovação da Fase 0) |
| N1 | Meio da sala, após o tapete | Transição |
| N2 | ~1,6 m da estante (enquadra a estante inteira) | Interação com os livros |

## Materiais

| Elemento | Material | Notas |
|----------|----------|-------|
| Piso | Tábuas largas de carvalho/nogueira, verniz semibrilho | **Reflexo borrado das janelas é obrigatório** (assinatura da referência). Variação de tom entre tábuas. |
| Parede superior | Pedra irregular clara (calcário/arenito bege-acinzentado) | Rugosidade alta, sem brilho. |
| Lambri | Madeira escura em painéis, até ~0,8 m (alinhado ao topo da base da estante, como na referência) | Mesma família de tom da estante. |
| Estante | Mogno/nogueira escura, verniz acetinado | Leve desgaste nas bordas e quinas. |
| Cortinas | Linho cru | Translúcidas: deixam passar luz (transmission leve). |
| Metais | Latão envelhecido | Lustre, varões, maçanetas, apoios de livro. |
| Janelas | Caixilho quadriculado, vidro levemente irregular | Podem estourar levemente na exposição. |

## Paleta

**Madeira**
- Mogno sombra `#4A2A1C` · base `#6B3E2A` · luz `#8A5638`
- Piso base `#7A4E32` · realce `#A0703F`

**Pedra e tecido**
- Pedra `#A89A84` · pedra clara `#C8BBA2`
- Linho `#DCCDB0`

**Metais**
- Latão envelhecido `#9C7A45` · brilho `#C9A35A`

**Lombadas (paleta permitida para os livros do usuário)**
- Bordô `#6E2320` · Verde-garrafa `#2F4A40` · Azul-petróleo `#24394A`
- Tabaco `#5B3A26` · Mostarda velha `#A07A2E` · Couro natural `#8B5A3C`

**Tapete**
- Vermelho `#8E2F2A` · Marinho `#22304A` · Creme `#E3D5B8`

**Luz**
- Sol de fim de tarde (~3200 K) `#FFBB78`
- Lustre (~2400 K) `#FF9E40`
- Sombra mais escura permitida `#2A1A12` (nunca preto puro)

## Iluminação

- **Hora:** fim de tarde, sol baixo entrando pelas duas janelas do fundo **em direção à câmera**. (Diferença intencional da referência, que tem luz diurna branca: o briefing pede aconchego e tons quentes.)
- **Sol:** projeta o desenho quadriculado das janelas no piso, com manchas de luz alongadas vindo na direção do usuário.
- **Lustre:** sempre aceso. Funciona como **luz de preenchimento** da frente da estante, que está em contraluz entre as janelas. Sem ele, as lombadas ficam ilegíveis.
- **Lampião da escrivaninha:** acento quente secundário (~2700 K).
- **Volumétrico:** feixes de luz visíveis nas janelas + partículas de poeira flutuando dentro dos feixes.
- **Sombras:** suaves, com oclusão marcada nos cantos, sob a estante e entre os livros.
- **Exposição:** janelas podem estourar levemente; o interior nunca fica preto — a sombra mais profunda é marrom.

## Pós-processamento

- Tone mapping AgX (alternativa: ACES).
- Bloom sutil, só em janelas, velas do lustre e luminária.
- Vinheta leve; grão de filme muito sutil.
- Profundidade de campo apenas no modo livro (fundo desfocado).

## Estante e livros

- Livros com capa de couro/tecido e gravação dourada na lombada.
- Cores escolhidas pelo usuário ficam **restritas à paleta de lombadas**, para nunca destoar da sala.
- **Estante vazia:** prateleiras com objetos de cena (apoios de livro de latão, vela, planta, vaso e relógio de latão; globo pequeno quando houver textura de mapa antigo em domínio público) para não parecer abandonada. Esses objetos se reorganizam para abrir espaço quando livros entram.

## O que evitar

- Aparência de render de arquitetura "novo e limpo": tudo tem leve desgaste e variação.
- Saturação alta / laranja chapado. O quente vem da **luz**, não de pintar os materiais de laranja.
- Preto puro e branco puro (exceto o estouro das janelas).
- Repetição visível de textura no piso e na pedra.
- Iluminação uniforme e sem direção.

## Desktop × mobile

| Recurso | Desktop | Mobile |
|---------|---------|--------|
| Reflexo do piso | Reflexo planar com desfoque | Reflexo pré-calculado / probe |
| Feixes de luz | Volumes com shader + poeira (mais camadas e partículas) | Mesma técnica, simplificada |
| Texturas | 2K | 1K |
| Bloom / DOF | Ligados | Reduzidos ou desligados |

## Critério de aprovação da Fase 0

Screenshot do N0 lado a lado com a referência principal. Aprovado quando:

1. A composição bate (porta enquadrando, estante central entre janelas).
2. A luz tem direção legível (sol vindo do fundo, manchas no piso).
3. O piso reflete as janelas.
4. A estante é legível apesar do contraluz.
5. Nada parece "plástico" ou procedural.
