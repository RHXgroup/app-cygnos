import { coresDaEscada, escadaLegivel } from './coresDaEscada.ts'
import { contraste, hexDeHsl, hslDe, luminancia } from './cor.ts'

/* As cores da escada, exercitadas nos 360 matizes.
 *
 * A pessoa escolhe o acento do app, e a escada nasce dele. Isso quer dizer que
 * o defeito aqui não aparece no acento que eu testei à mão — aparece no que
 * alguém escolheu seis meses depois, e some a escada inteira num degrau só.
 *
 * Por isso quase tudo aqui é varredura, e não caso. */

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

/* Os fundos reais das duas paletas, de src/theme.ts. Escritos à mão de
   propósito: importar o tema puxaria o React Native e nada disto rodaria. */
const ESCURO = '#0C0F0B'
const CLARO = '#F4EFE4'
const CARTAO_ESCURO = '#161A14'
const CARTAO_CLARO = '#FBF8F1'

const FUNDOS = [
  ['escuro', ESCURO],
  ['claro', CLARO],
  ['cartão escuro', CARTAO_ESCURO],
  ['cartão claro', CARTAO_CLARO],
] as const

console.log('\ncoresDaEscada\n')

/* ── Forma ─────────────────────────────────────────────────────────────────*/
{
  const c = coresDaEscada('#15803D', CLARO)
  ok('sete degraus por padrão', c.length === 7)
  ok('cada um tem traço e leve', c.every(d => /^#[0-9a-f]{6}$/i.test(d.traco) && /^#[0-9a-f]{6}$/i.test(d.leve)))

  ok('aceita outra quantidade', coresDaEscada('#15803D', CLARO, 3).length === 3)
  ok('um degrau só não estoura', coresDaEscada('#15803D', CLARO, 1).length === 1)
  ok('zero degraus devolve lista vazia', coresDaEscada('#15803D', CLARO, 0).length === 0)
}

/* ── A subida se lê ────────────────────────────────────────────────────────
 *
 * O degrau alto tem que parecer MAIS presente que o baixo. Se a saturação não
 * subir, os sete viram sete cinzas e a escada deixa de comunicar. */
{
  for (const [nome, fundo] of FUNDOS) {
    const c = coresDaEscada('#15803D', fundo)
    const sats = c.map(d => hslDe(d.traco).s)
    const sobe = sats[6] > sats[0]
    ok(`a saturação sobe do 1 ao 7 (${nome})`, sobe, sats.map(Math.round).join(' → '))
  }
}

{
  /* E o afastamento do fundo também sobe: o degrau 7 contrasta mais que o 1.
     É o que faz "comeu" saltar da tela sem precisar de cor diferente. */
  for (const [nome, fundo] of FUNDOS) {
    const c = coresDaEscada('#15803D', fundo)
    const primeiro = contraste(c[0].traco, fundo)
    const ultimo = contraste(c[6].traco, fundo)
    ok(`o topo se destaca mais que a base (${nome})`, ultimo >= primeiro, `${primeiro.toFixed(2)} → ${ultimo.toFixed(2)}`)
  }
}

/* ── A varredura dos 360 matizes ───────────────────────────────────────────
 *
 * A promessa central: qualquer acento que a pessoa escolha produz sete degraus
 * legíveis, nos dois temas e também sobre o cartão. */
{
  const ruins: string[] = []
  const apagados: string[] = []

  for (let h = 0; h < 360; h += 1) {
    for (const s of [30, 55, 80, 100]) {
      for (const l of [22, 40, 58, 76]) {
        const acento = hexDeHsl({ h, s, l })
        for (const [nome, fundo] of FUNDOS) {
          const c = coresDaEscada(acento, fundo)
          if (!escadaLegivel(c, fundo)) {
            if (ruins.length < 4) ruins.push(`${acento} sobre ${nome}`)
          }
          /* Nenhum degrau pode coincidir com outro: sete degraus com a mesma
             cor não é escada, é uma barra. */
          const distintos = new Set(c.map(d => d.traco)).size
          if (distintos < 4 && apagados.length < 4) {
            apagados.push(`${acento} sobre ${nome}: ${distintos} cores distintas`)
          }
        }
      }
    }
  }

  ok('todo degrau se lê sobre o fundo, em 360 matizes', ruins.length === 0, ruins.join(' · '))
  ok('e a escada nunca vira uma barra só', apagados.length === 0, apagados.join(' · '))
}

/* ── Entrada torta não derruba a tela ──────────────────────────────────────
 *
 * O acento vem do armazenamento do aparelho, escrito por uma versão anterior do
 * app. Ele é `string`, e string do disco pode ser qualquer coisa. */
{
  let quebrou = ''
  let saida: string[] = []
  try {
    saida = [
      ...coresDaEscada('', CLARO).map(c => c.traco),
      ...coresDaEscada('#zzz', CLARO).map(c => c.traco),
      ...coresDaEscada('#fff', CLARO).map(c => c.traco),
      ...coresDaEscada('#000000', ESCURO).map(c => c.traco),
      ...coresDaEscada('#FFFFFF', CLARO).map(c => c.traco),
      ...coresDaEscada('não é cor', ESCURO).map(c => c.traco),
    ]
  } catch (e) {
    quebrou = (e as Error).message
  }
  ok('acento torto não estoura', quebrou === '', quebrou)
  ok('e nada sai como undefined ou NaN', !/undefined|NaN/.test(saida.join(' ')), saida.join(' ').slice(0, 120))
  ok('toda saída é hex de seis dígitos', saida.every(c => /^#[0-9a-f]{6}$/i.test(c)), saida.slice(0, 3).join(' '))
}

/* ── Os extremos do acento ─────────────────────────────────────────────────
 *
 * Branco e preto são escolhas legítimas de quem quer o app sem cor, e são os
 * dois casos em que uma derivação ingênua produz sete degraus idênticos. */
{
  for (const [nome, fundo] of FUNDOS) {
    for (const acento of ['#FFFFFF', '#000000', '#808080']) {
      const c = coresDaEscada(acento, fundo)
      ok(
        `acento ${acento} continua legível (${nome})`,
        escadaLegivel(c, fundo),
        c.map(d => contraste(d.traco, fundo).toFixed(1)).join(' '),
      )
    }
  }
}

/* ── O preenchimento acompanha o traço ─────────────────────────────────────
 *
 * O `leve` é fundo de ícone e barra. Ele precisa ficar do lado do FUNDO da
 * tela, senão o ícone escuro sobre preenchimento escuro desaparece. */
{
  const problemas: string[] = []
  for (let h = 0; h < 360; h += 5) {
    const acento = hexDeHsl({ h, s: 70, l: 45 })
    for (const [nome, fundo] of FUNDOS) {
      const claro = luminancia(fundo) > 0.5
      for (const c of coresDaEscada(acento, fundo)) {
        const lTraco = luminancia(c.traco)
        const lLeve = luminancia(c.leve)
        /* No tema claro o leve é MAIS claro que o traço; no escuro, mais
           escuro. Nos dois, ele se aproxima do fundo. */
        const certo = claro ? lLeve > lTraco : lLeve < lTraco
        if (!certo && problemas.length < 4) problemas.push(`${acento} em ${nome}`)
      }
    }
  }
  ok('o preenchimento fica do lado do fundo', problemas.length === 0, problemas.join(' · '))
}

/* ── escadaLegivel diz a verdade ───────────────────────────────────────────*/
{
  ok('lista vazia é legível por vacuidade', escadaLegivel([], CLARO) === true)
  ok(
    'e uma cor invisível é reprovada',
    escadaLegivel([{ traco: '#F4EFE4', leve: '#fff' }], CLARO) === false,
  )
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
