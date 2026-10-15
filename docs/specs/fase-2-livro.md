# Spec — Fase 2: livro paramétrico + livros de teste

O livro é o objeto que o usuário mais vai olhar de perto. Ele precisa parecer um livro de capa dura encadernado em couro/tecido, não uma caixa. Até a Fase 0 ser aprovada, o livro é desenvolvido numa **cena isolada** (`?dev=book`) e **não** é integrado à sala.

## Modelo de dados

```ts
type SpineColor = 'bordo' | 'verdeGarrafa' | 'azulPetroleo' | 'tabaco' | 'mostardaVelha' | 'couroNatural'
// valores hex em src/book/palette.ts, idênticos à paleta de lombadas da direção de arte

interface BookData {
  id: string
  title: string
  subtitle?: string
  description: string
  color: SpineColor
  coverMaterial: 'leather' | 'cloth'
  coverPhoto?: Blob          // a "polaroid"
  pageCount: number          // define a espessura
  trim: 'medium' | 'large'   // medium 16×23 cm, large 19×26 cm
  createdAt: number
}
```

Livros de teste em `src/book/fixtures.ts`: 6 livros cobrindo as 6 cores, `pageCount` de 48 a 640, os dois formatos e os dois materiais, com fotos de exemplo geradas (sem imagens de terceiros).

## Geometria (`src/book/geometry.ts`)

Medidas em metros, todas derivadas de `pageCount` e `trim`:

- **Folhas:** `sheets = ceil(pageCount / 2)`, papel com 0,1 mm por folha. `blockThickness = sheets × 0.0001` (mínimo 4 mm).
- **Capa dura:** papelão de 2,5 mm por tábua, coberto pelo material. A capa excede o miolo em 3 mm em cima, embaixo e na frente (as "seixas").
- **Espessura total:** `blockThickness + 2 × 0.0025 + 0.001` (folga).
- **Lombada arredondada:** a lombada é um arco (não plano), com o miolo acompanhando a curva e o corte da frente levemente côncavo.
- **Canaletas da dobradiça:** sulco raso na capa, 8 mm da lombada, nas duas faces.
- **Malhas separadas:** `cover` (frente + lombada + verso, uma malha com grupos), `pageBlock` (miolo com corte superior/frontal/inferior), `polaroid`, `spineFoil` (decalque do título). Isso deixa a Fase 4 abrir a capa girando a frente em torno da dobradiça.
- **Bevel** em todas as quinas da capa (raio ~0,8 mm) e cantos levemente gastos.

## Materiais (`src/book/materials.ts`)

- **Capa:** textura PBR de couro (`book_leather`) ou tecido (`curtain_linen`, só normal/roughness) do manifest de assets, **tingida pela cor da lombada preservando a luminância da textura** (não multiplicar cor chapada por cima). Desgaste nas quinas e na lombada: máscara que clareia e aumenta a rugosidade.
- **Gravação dourada:** título e frisos na lombada (e um quadro decorativo na capa), gerados em canvas como máscara → região metálica (metalness 1, roughness 0,3, cor `#C9A35A`) com leve relevo via normal map derivado da máscara.
- **Corte das páginas:** textura de papel creme com estrias finas horizontais (folhas), um pouco mais escuro nas bordas.
- **Polaroid:** rebaixo de 1 mm na capa (geometria inset) onde a foto encaixa; cartão branco-creme com borda inferior mais larga (proporção real de polaroid), foto levemente brilhante, rotação aleatória de ±2°, sombra de contato dentro do rebaixo. Sem foto, o rebaixo mostra o papel do cartão vazio.

## Na estante (preparação para a Fase 3)

`src/book/shelfLayout.ts` posiciona os livros a partir de `public/data/bookcase.json`: da esquerda para a direita, folga de 2–4 mm, pequena variação de profundidade (±5 mm) e um livro inclinado no fim da fileira quando sobra espaço. Os objetos de cena se reorganizam: se o espaço acabar, o apoio de livro se move para o fim da fileira e o objeto mais à direita vai para a próxima prateleira (só a lógica nesta fase; a animação é da Fase 3).

## Cena isolada (`?dev=book`)

- Livro sobre uma superfície neutra de madeira, iluminado pelo env map da sala (`public/env/room_N1.hdr`, quando existir; senão a HDRI `exterior_sky` copiada para `public/env/`), câmera orbital.
- Painel de controles de desenvolvimento (`leva`, só em dev) para `pageCount`, cor, material, formato e foto.
- Screenshot: `npm run shot -- --dev book` gera em `shots/<timestamp>/book/` 3 imagens fixas: 48 páginas bordô couro, 220 páginas verde-garrafa tecido, 640 páginas couro natural, em ângulo de 3/4 mostrando capa, lombada e corte.

## Verificação

- Teste unitário de `geometry.ts` com `vitest` (`npm run test`): espessuras para 48, 220 e 640 páginas; coerência das dimensões.
- Revisão das 3 imagens pelo `art-reviewer` com a pergunta: "parece um livro de capa dura real, de perto?" — nota e divergências registradas em `docs/look-dev/iteracoes.md`.
- `npm run check` limpo.

## Fora de escopo nesta fase

Seleção/destaque (Fase 3), voo, abertura e folhear (Fase 4 — previsão: cada folha como malha com deformação por shader ao virar), conteúdo das páginas (Fase 5).
