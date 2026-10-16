// npm run books:samples — writes the sample PDFs of the test books (spec Fase 5) to public/books/.
//
// The text is ours (no third-party material): sentence pools written for this project, combined with a
// seeded random so the output is stable. The PDFs deliberately look like ordinary documents (A4, running
// header, page numbers, hyphenated line ends, two paragraph styles, a few drawings) so the extraction has
// something real to undo.
import { mkdirSync, writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import sharp from 'sharp'

const OUT = 'public/books'

function rand(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const LETTERS = [
  'Aqui na serra o frio chegou mais cedo este ano, e a lareira já fica acesa desde o fim da tarde.',
  'Sua irmã aprendeu a fazer pão sozinha e agora quer ensinar a todo mundo que passa pela cozinha.',
  'Recebi sua carta na terça-feira, com aquele desenho do farol que você prometeu no verão passado.',
  'O jardim está cheio de hortênsias azuis, e o vizinho jura que o segredo é a ferrugem dos pregos.',
  'Guardei para você as conchas que encontramos na praia, numa caixa de biscoitos forrada de algodão.',
  'Seu avô continua consertando o relógio da sala, que atrasa dez minutos todas as manhãs.',
  'Choveu três dias seguidos, e as crianças inventaram um teatro de sombras no corredor.',
  'Escreva contando como foi a primeira semana de aulas e se a professora nova é mesmo tão brava.',
  'A estrada nova encurtou a viagem, mas eu ainda prefiro o caminho antigo, que passa pela represa.',
  'Ontem achei uma fotografia de nós quatro na varanda, todos de chapéu, rindo de alguma coisa.',
  'As goiabas amadureceram de uma vez e passamos a tarde inteira fazendo doce no tacho de cobre.',
  'Mande lembranças para sua mãe e diga que a receita do bolo de fubá finalmente deu certo.',
  'O cachorro do sítio vizinho resolveu que mora aqui e dorme todas as noites no tapete da entrada.',
  'Ficamos esperando a chuva de estrelas até depois da meia-noite, enrolados nos cobertores.',
  'Plantei as sementes de girassol que você mandou, e elas já passaram da altura da cerca.',
  'Na feira de domingo encontrei aquele senhor que vende mel e perguntou de você pelo nome.',
  'A casa parece grande demais quando vocês vão embora, e o silêncio demora a ir junto.',
  'Comecei a escrever um caderno de receitas para deixar com vocês, com as histórias de cada prato.',
  'Lembra do balanço na mangueira? A corda arrebentou, mas seu tio já prometeu trocar por uma nova.',
  'O correio aqui demora, então não se preocupe se a resposta chegar depois do aniversário.',
  'Hoje o céu ficou cor de laranja no fim da tarde, igual àquele dia em que chegamos da praia.',
  'Estou aprendendo a mexer no computador, mas confesso que ainda prefiro papel e caneta.',
  'As andorinhas voltaram para o beiral do celeiro, e isso quer dizer que o calor vem aí.',
  'Seu primo passou de ano com notas boas e ganhou uma bicicleta vermelha de presente.',
  'Mandei junto com esta carta um ramo de alecrim seco, para a gaveta das suas roupas.',
  'Não esqueça de levar o casaco de lã na próxima viagem, porque as noites aqui continuam geladas.',
  'A professora de piano mudou para a cidade, e agora as tardes de quinta ficaram compridas demais.',
  'Encontrei no sótão a mala de couro do seu bisavô, ainda com as etiquetas dos navios.',
  'O rio subiu com as chuvas e levou a pinguela, então voltamos a atravessar pela estrada.',
  'Sua mãe ligou no domingo e a ligação caiu três vezes antes de conseguirmos rir juntas.',
  'As jabuticabas deram tanto que distribuímos baldes para a rua inteira.',
  'Ganhei de presente um caderno de capa verde e resolvi copiar nele as cartas mais bonitas.',
  'O padeiro novo faz um pão de milho que lembra o da sua avó, mas ninguém tem coragem de dizer a ela.',
  'Quando a luz acaba, acendemos o lampião e as paredes parecem mais perto umas das outras.',
  'Aprendi a fazer crochê com a vizinha e já comecei uma colcha de quadrados coloridos.',
  'O trem das cinco agora só passa às terças, e o apito faz falta no fim da tarde.',
  'Seu irmão mandou um desenho do castelo de areia que vocês construíram, com bandeira e tudo.',
  'Guardei o jornal do dia em que você nasceu; está amarelado, mas as letras ainda se leem bem.',
  'Na festa da colheita dançamos até tarde, e seu avô tirou para dançar até a dona Cida.',
  'As cartas que você escreve têm um cheiro de lápis que me faz lembrar da escola.',
]

const FIELD = [
  'A trilha começa atrás da capela, sobe pela encosta e termina num mirante sobre a enseada.',
  'Anotei onze espécies de aves antes das oito horas, entre elas um casal de saíras-sete-cores.',
  'A maré baixa deixou à mostra as pedras cobertas de mexilhões e pequenas poças cheias de vida.',
  'O vento nordeste soprou forte durante toda a manhã, levantando areia fina sobre as dunas.',
  'Encontrei uma bromélia florida presa a um tronco caído, com a água do centro ainda cristalina.',
  'O mapa antigo marca uma fonte que não existe mais; no lugar dela cresce um bambuzal fechado.',
  'A neblina desceu de repente e precisei esperar sentado numa pedra até o caminho reaparecer.',
  'Os pescadores contaram que a última grande ressaca levou metade da restinga para dentro do mar.',
  'Medi a largura do riacho em três pontos e desenhei o perfil da margem no caderno quadriculado.',
  'Perto da ponte velha há uma figueira enorme, com raízes que descem pelas pedras até a água.',
  'Recolhi sementes de pitanga, de araçá e de uma palmeira que ainda não consegui identificar.',
  'No fim da tarde a luz entra rasante pela mata e cada folha parece acesa por dentro.',
  'O caminho pela praia só é possível na maré vazante, então anotei os horários na primeira página.',
  'Vi rastros de um animal pequeno na areia molhada, provavelmente um mão-pelada voltando do rio.',
  'Choveu à noite e a manhã trouxe cogumelos alaranjados em todos os troncos podres do caminho.',
  'Desenhei o contorno da baía visto do alto do morro, com as ilhas numeradas da esquerda para a direita.',
  'Um guarda-parque me mostrou onde as tartarugas desovam e pediu para não iluminar a areia à noite.',
  'As samambaias gigantes do vale úmido chegam a quatro metros e formam um teto verde e silencioso.',
  'Encontrei conchas de caramujo empilhadas sob uma pedra, sinal de que algum pássaro come ali.',
  'O farol acende às seis e meia, e de onde estou dá para contar o intervalo entre os lampejos.',
  'A areia da praia do norte é grossa e dourada; a do sul, fina e quase branca, range ao pisar.',
  'Passei a manhã copiando as folhas de uma planta rasteira que cobre as dunas mais antigas.',
  'O barqueiro me levou até a ilha pequena, onde só há pedras, gaivotas e um coqueiro inclinado.',
  'Na volta, a lua nasceu enorme e vermelha sobre o mar, e o caminho ficou claro como de dia.',
  'Registrei a temperatura da água em cinco pontos da lagoa; o mais frio fica junto à nascente.',
  'Uma família de quatis atravessou a trilha em fila, sem pressa, olhando para mim de lado.',
  'A ponte de cordas balança mais do que parece, e o melhor é atravessar olhando para a outra margem.',
  'Achei uma garrafa antiga enterrada na areia, de vidro verde, com bolhas presas dentro.',
  'Os liquens nas pedras do costão formam manchas laranja que parecem tinta derramada.',
  'O vigia da fazenda velha me deixou subir na caixa d’água para ver a planície inteira.',
  'Contei vinte e três canoas puxadas para a areia, todas pintadas com nomes de santas.',
  'A chuva fina da madrugada deixou as teias de aranha bordadas de gotas na beira da trilha.',
  'Medi o passo com uma corda de dez metros e refiz as distâncias do primeiro mapa.',
  'As formigas cortadeiras abriram uma estrada própria no meio do capim, larga como uma mão.',
  'O sol nasce atrás da ilha grande nesta época, e a sombra dela alcança a praia por um minuto.',
  'Perdi o lápis no mangue e terminei as anotações do dia com um carvão da fogueira.',
  'Um velho pescador desenhou na areia os canais que só aparecem na maré de lua.',
  'O musgo cresce do lado sul dos troncos, mas nesta mata isso não serve para se orientar.',
  'Ouvi o canto do inhambu ao entardecer, três notas descendentes que se repetem sem pressa.',
  'Encontrei um ninho abandonado feito de crina de cavalo e fios de rede de pesca.',
]

const LETTER_TITLES = [
  'Carta de janeiro',
  'As férias na serra',
  'O doce de goiaba',
  'Chuva de estrelas',
  'O relógio da sala',
  'Os girassóis',
  'Notícias da feira',
  'Antes do aniversário',
  'O caderno de receitas',
  'Até o próximo verão',
]

const FIELD_TITLES = [
  'A trilha da capela',
  'Maré vazante',
  'O riacho e a ponte velha',
  'Sementes',
  'Neblina no morro',
  'A ilha pequena',
  'Dunas do norte',
  'O vale das samambaias',
  'Noites de desova',
  'O farol',
  'A lagoa',
  'Caminhos de volta',
  'Mapas e medidas',
  'Inverno no litoral',
]

/**
 * A chapter's paragraphs (3–5 sentences each), dealt from a shuffled deck of the pool: no sentence repeats
 * within a chapter (the deck must be larger than a chapter).
 */
function paragraphs(pool: string[], r: () => number, count: number): string[] {
  const deck = [...pool]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const out: string[] = []
  for (let i = 0; i < count && deck.length; i++) out.push(deck.splice(0, 3 + Math.floor(r() * 3)).join(' '))
  return out
}

// ---------------------------------------------------------------------------
// Drawings (embedded images): generated SVG → PNG, warm sepia like the polaroids
// ---------------------------------------------------------------------------

async function drawing(kind: 'map' | 'leaf' | 'coast', seed: number): Promise<Buffer> {
  const r = rand(seed)
  const W = 900
  const H = 600
  let body = ''
  if (kind === 'map') {
    let d = `M 60 ${300 + r() * 80}`
    for (let x = 120; x <= 840; x += 60) d += ` Q ${x - 30} ${200 + r() * 200} ${x} ${250 + r() * 120}`
    body += `<path d="${d}" fill="none" stroke="#5a4232" stroke-width="5"/>`
    for (let i = 0; i < 6; i++) body += `<circle cx="${100 + r() * 700}" cy="${120 + r() * 380}" r="${10 + r() * 30}" fill="none" stroke="#7a5a40" stroke-width="3" stroke-dasharray="8 6"/>`
    body += `<path d="M 80 520 L 200 520 M 80 510 L 80 530 M 140 515 L 140 525 M 200 510 L 200 530" stroke="#3d2c1f" stroke-width="3"/>`
  } else if (kind === 'leaf') {
    for (let i = 0; i < 5; i++) {
      const cx = 150 + i * 150
      const h = 200 + r() * 200
      body += `<path d="M ${cx} 560 C ${cx - 70} ${560 - h * 0.6} ${cx - 40} ${560 - h} ${cx} ${560 - h} C ${cx + 40} ${560 - h} ${cx + 70} ${560 - h * 0.6} ${cx} 560 Z" fill="#a08660" stroke="#3d2c1f" stroke-width="3"/>`
      body += `<path d="M ${cx} 560 L ${cx} ${560 - h + 10}" stroke="#3d2c1f" stroke-width="2"/>`
    }
  } else {
    body += `<rect x="0" y="0" width="${W}" height="${H * 0.55}" fill="#e8d6b4"/>`
    let d = `M 0 ${H * 0.55}`
    for (let x = 0; x <= W; x += 45) d += ` L ${x} ${H * 0.5 - r() * 120}`
    d += ` L ${W} ${H} L 0 ${H} Z`
    body += `<path d="${d}" fill="#8a6a4a"/>`
    body += `<rect x="0" y="${H * 0.72}" width="${W}" height="${H * 0.28}" fill="#b89a74"/>`
    body += `<circle cx="${650 + r() * 120}" cy="${110 + r() * 40}" r="40" fill="#f3e6cf"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#efe3c8"/>${body}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

// ---------------------------------------------------------------------------
// A plain A4 document
// ---------------------------------------------------------------------------

interface DocSpec {
  file: string
  title: string
  subtitle: string
  header: string
  chapters: { title: string; paragraphs: string[]; image?: Buffer }[]
  /** first-line indent (true) or a blank gap between paragraphs (false) */
  indent: boolean
}

const A4 = { w: 595.28, h: 841.89 }
const M = { left: 64, right: 64, top: 72, bottom: 64 }
const BODY = 11
const LEAD = 15

async function writeDoc(spec: DocSpec) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(spec.title)
  const times = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const width = A4.w - M.left - M.right

  let page: PDFPage = pdf.addPage([A4.w, A4.h])
  // title page
  page.drawText(spec.title, { x: M.left, y: A4.h * 0.62, size: 30, font: bold })
  page.drawText(spec.subtitle, { x: M.left, y: A4.h * 0.62 - 34, size: 15, font: italic })
  let y = 0
  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h])
    const n = pdf.getPageCount()
    page.drawText(spec.header, { x: M.left, y: A4.h - 40, size: 8, font: sans, color: rgb(0.4, 0.4, 0.4) })
    const label = String(n)
    page.drawText(label, { x: A4.w / 2 - sans.widthOfTextAtSize(label, 9) / 2, y: 32, size: 9, font: sans })
    y = A4.h - M.top
  }
  const need = (h: number) => {
    if (y - h < M.bottom) newPage()
  }
  const line = (text: string, x: number, font: PDFFont, size: number) => {
    page.drawText(text, { x, y, size, font })
    y -= size === BODY ? LEAD : size * 1.35
  }

  for (const ch of spec.chapters) {
    newPage()
    need(60)
    line(ch.title, M.left, bold, 18)
    y -= 10
    if (ch.image) {
      const img = await pdf.embedPng(ch.image)
      const w = width * 0.8
      const h = (w * img.height) / img.width
      need(h + 20)
      page.drawImage(img, { x: M.left + (width - w) / 2, y: y - h, width: w, height: h })
      y -= h + 18
    }
    for (const p of ch.paragraphs) {
      const words = p.split(' ')
      let cur = ''
      let first = true
      const flush = () => {
        need(LEAD)
        const x = M.left + (first && spec.indent ? 18 : 0)
        line(cur, x, times, BODY)
        cur = ''
        first = false
      }
      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        const avail = width - (first && spec.indent ? 18 : 0)
        const test = cur ? `${cur} ${w}` : w
        if (times.widthOfTextAtSize(test, BODY) <= avail) {
          cur = test
          continue
        }
        // a long word that does not fit: hyphenate it, like a word processor would
        if (w.length >= 9 && /^[a-zà-ú]+[.,;:]?$/i.test(w)) {
          const cut = Math.floor(w.length / 2)
          const head = `${cur ? `${cur} ` : ''}${w.slice(0, cut)}-`
          if (times.widthOfTextAtSize(head, BODY) <= avail) {
            cur = head
            flush()
            cur = w.slice(cut)
            continue
          }
        }
        flush()
        cur = w
      }
      if (cur) flush()
      if (!spec.indent) y -= 8
    }
  }
  const bytes = await pdf.save()
  writeFileSync(`${OUT}/${spec.file}`, bytes)
  console.log(`[samples] ${spec.file}: ${pdf.getPageCount()} páginas A4, ${(bytes.length / 1024).toFixed(0)} KB`)
}

mkdirSync(OUT, { recursive: true })

{
  const r = rand(11)
  await writeDoc({
    file: 'fx-bordo.pdf',
    title: 'Cartas de Verão',
    subtitle: 'Correspondência, 1998–2004',
    header: 'Cartas de Verão — transcrição',
    indent: true,
    chapters: LETTER_TITLES.map((title) => ({ title, paragraphs: paragraphs(LETTERS, r, 5 + Math.floor(r() * 3)) })),
  })
}

{
  const r = rand(23)
  const chapters = []
  for (let i = 0; i < FIELD_TITLES.length; i++) {
    const image = i % 3 === 0 ? await drawing((['map', 'leaf', 'coast'] as const)[(i / 3) % 3], 100 + i) : undefined
    chapters.push({ title: FIELD_TITLES[i], paragraphs: paragraphs(FIELD, r, 7 + Math.floor(r() * 3)), image })
  }
  await writeDoc({
    file: 'fx-verde.pdf',
    title: 'Diário de Campo',
    subtitle: 'Três anos de caminhadas pelo litoral',
    header: 'Diário de Campo — caderno 2',
    indent: false,
    chapters,
  })
}

// Regression fixture (e2e): the same image on every page. pdf.js stores images used on several pages in
// commonObjs ("g_…" ids); reading those from page.objs waited forever ("Preparando páginas…" with a user's PDF).
{
  const pdf = await PDFDocument.create()
  const times = await pdf.embedFont(StandardFonts.TimesRoman)
  const logo = await pdf.embedPng(await drawing('leaf', 7))
  for (let n = 0; n < 3; n++) {
    const page = pdf.addPage([A4.w, A4.h])
    page.drawImage(logo, { x: A4.w - 140, y: A4.h - 110, width: 90, height: 60 })
    let y = A4.h - 160
    for (let i = 0; i < 20; i++, y -= LEAD) page.drawText(`Linha ${i + 1} da página ${n + 1} de um documento com logotipo repetido.`, { x: M.left, y, size: BODY, font: times })
  }
  writeFileSync(`${OUT}/test-shared-image.pdf`, await pdf.save())
  console.log('[samples] test-shared-image.pdf: 3 páginas com a mesma imagem')
}
