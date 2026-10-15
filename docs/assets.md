# Assets de terceiros

Todos CC0 (domínio público): uso livre, inclusive comercial, sem atribuição obrigatória. A lista que o script baixa está em `assets/manifest.json`; este documento explica as escolhas. IDs verificados na API do Poly Haven em 14/10/2026 — **a aparência ainda precisa ser conferida pelas prévias** (largura das tábuas, cor exata).

Download: `npm run assets:fetch` (= `node scripts/fetch-assets.mjs`). Idempotente, confere md5, grava `assets/source/<key>/meta.json` e `assets/source/_report.json`. Opções: `--only floor_wood,chandelier`, `--res 2k`, `--dry-run`.

## Escolhas

| Uso | Asset | Fonte | Risco / ajuste |
|-----|-------|-------|----------------|
| Piso | `old_wooden_floor_02` (alt. `wooden_floor_02`) | [Poly Haven](https://polyhaven.com/a/old_wooden_floor_02) | Desgaste certo. Se as tábuas forem estreitas, cortar por tábua no UV |
| Pedra da parede | `castle_wall_slates` (alt. `sandstone_blocks_05`) | [Poly Haven](https://polyhaven.com/a/castle_wall_slates) | Juntas fundas: reduzir displacement |
| Lambri / porta | `wooden_panels` | [Poly Haven](https://polyhaven.com/a/wooden_panels) | Muito próximo do pedido |
| Estante, caixilhos, porta, mesa | `dark_wood` | [Poly Haven](https://polyhaven.com/a/dark_wood) | Mogno acetinado, bate com a paleta |
| Teto | `white_stucco` | [Poly Haven](https://polyhaven.com/a/white_stucco) | — |
| Vigas | `rough_wood` | [Poly Haven](https://polyhaven.com/a/rough_wood) | Tende ao cinza: aquecer e escurecer |
| Cortinas | `rough_linen` (alt. `terlenka`) | [Poly Haven](https://polyhaven.com/a/rough_linen) | **Cor azul**: tingir para linho `#DCCDB0` |
| Tapete (desenho) | Tapete persa do séc. XVIII, Met 452828 (alt. Met 451375) | [The Met Open Access](https://www.metmuseum.org/art/collection/search/452828) | Foto de domínio público: recortar, endireitar, ajustar cores |
| Tapete (relevo) | `dirty_carpet` (só normal + ARM) | [Poly Haven](https://polyhaven.com/a/dirty_carpet) | — |
| Capa dos livros | `leather_red_02` (alt. `brown_leather`); tecido reaproveita `rough_linen` | [Poly Haven](https://polyhaven.com/a/leather_red_02) | Tingir preservando a luminância |
| Lustre | `Chandelier_03` (alt. `Chandelier_02`) | [Poly Haven](https://polyhaven.com/a/Chandelier_03) | Cristais com opacity map; adicionar chamas emissivas |
| Luminária | `vintage_oil_lamp` | [Poly Haven](https://polyhaven.com/a/vintage_oil_lamp) | Vidro da chaminé: cuidado com transmissão |
| Vela | `brass_candleholders` | [Poly Haven](https://polyhaven.com/a/brass_candleholders) | Prop dinâmico |
| Quadro | `fancy_picture_frame_01` | [Poly Haven](https://polyhaven.com/a/fancy_picture_frame_01) | — |
| Planta | `potted_plant_04` | [Poly Haven](https://polyhaven.com/a/potted_plant_04) | Prop dinâmico |
| Céu / janelas | `evening_field` (alt. `wildflower_field`) | [Poly Haven](https://polyhaven.com/a/evening_field) | Alinhar o sol da HDRI com `lighting.sun` |
| Extras opcionais | `ClassicConsole_01`, `brass_vase_01`, `mantel_clock_01`, `book_encyclopedia_set_01` | Poly Haven | Console só como placeholder de escrivaninha |

## Construído por nós (não existe CC0 adequado)

Janelas, porta dupla de almofadas, estante, lambri (geometria), vigas, cortinas (cloth sim), escrivaninha clássica, apoios de livro de latão, globo antigo e o material de latão (procedural: metalness 1, roughness 0,35–0,5, base `#9C7A45`).

## Regras de uso da API

- Poly Haven: API gratuita, inclusive para uso comercial; exige um **User-Agent identificando o software** (o script já envia). Sem limite numérico, mas proibido gerar carga abusiva. Baixar no build e servir do próprio projeto (não usar links diretos do Poly Haven no app). Crédito só é exigido se o produto mostrar conteúdo da API ao vivo.
- ambientCG (reserva, nenhum item usa hoje): CC0, download em zip (`https://ambientcg.com/get?file=<ID>_2K-JPG.zip`); o script descompacta com `fflate`.
- The Met Open Access: imagens marcadas como domínio público são CC0.

Fontes: [Poly Haven API](https://polyhaven.com/our-api), [Termos da API](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md), [Licença Poly Haven](https://polyhaven.com/license), [Licença ambientCG](https://docs.ambientcg.com/license/), [Met Open Access](https://www.metmuseum.org/press/news/2017/open-access).
