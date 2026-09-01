import {
  DEGRAUS,
  REACOES,
  apoioDoRegistro,
  comArtigo,
  convitePraCrianca,
  degrauDe,
  fraseDoRegistro,
  porMes,
  proximoDegrau,
  reacaoDoBanco,
  resumoDoAlimento,
  type Registro,
} from './escadaDaAceitacao.ts'
import { coresDaEscada, escadaLegivel } from './coresDaEscada.ts'
import { contraste } from './cor.ts'

/* Sonda da escada: entrada hostil e aleatória, PROPRIEDADES em vez de casos.
 *
 * ── Por que aqui, especificamente ─────────────────────────────────────────
 * Tudo o que entra nestas funções vem de fora e chega torto por caminhos que
 * ninguém escolheu: `aceitacao` tem valores legados de antes da Escalada
 * completa; `data_exposicao` vem de importação de outra ferramenta; o nome do
 * alimento vem de uma base pública; e o acento é uma cor que a pessoa escolheu
 * e ficou guardada no aparelho.
 *
 * Caso de mesa prova o que eu pensei em testar. A sonda pega o que eu nem
 * imaginei — e neste app ela já achou dois defeitos que trinta arquivos de
 * teste não acharam.
 *
 * ── Semente, e não Math.random ────────────────────────────────────────────
 * Falha de sonda precisa ser reproduzível: sem semente, o defeito aparece uma
 * vez, some na execução seguinte, e vira "deve ter sido coisa minha". */

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

let semente = 20260901
const sorteio = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648
  return semente / 2147483648
}
const inteiro = (min: number, max: number) => Math.floor(min + sorteio() * (max - min + 1))
const umDe = <T,>(xs: T[]): T => xs[inteiro(0, xs.length - 1)]

/* Os valores que quebram coisa, e que ninguém escreve num caso de mesa. */
const ACEITACOES = [
  'recusou', 'tolerar', 'interagir', 'cheirar', 'tocar', 'provar', 'comer',
  'aceitou', 'tolerou', 'provou', 'interacao_parcial',
  '', ' ', 'COMER', 'comeu', 'categoria_nova', 'null', '0', '32',
]
const REACOES_CRUAS = ['positiva', 'neutra', 'negativa', 'agitada', '', 'retraida', 'NEUTRA', '1']
const DATAS = [
  '2026-03-02', '2026-12-31', '2024-02-29', '2026-02-31', '2026-13-45',
  '', 'ontem', 'nao é data', '0000-00-00', '99999-01-01',
]
const NOMES = [
  'cenoura', 'Brócolis no vapor', '', '   ', 'maçã-verde', 'ARROZ',
  'iogurte  natural', 'ovo', '🥕', 'a', 'á', '123', 'batata doce assada em cubos pequenos',
]

const N = 4000

console.log('\nsonda da escada\n')

/* ── resumoDoAlimento ──────────────────────────────────────────────────────*/
{
  let quebrou = ''
  let incoerente = ''
  let contagemRuim = ''

  for (let i = 0; i < N && !quebrou; i++) {
    const quantos = inteiro(0, 9)
    const registros: Registro[] = Array.from({ length: quantos }, () => ({
      data: umDe(DATAS),
      aceitacao: sorteio() < 0.12 ? null : umDe(ACEITACOES),
      reacao: sorteio() < 0.3 ? null : umDe(REACOES_CRUAS),
    }))

    try {
      const r = resumoDoAlimento(registros)

      if (!Number.isInteger(r.ofertas) || r.ofertas < 0 || r.ofertas > quantos) {
        contagemRuim = `${r.ofertas} de ${quantos}`
      }

      /* O recorde nunca pode ser MENOR que o atual: recorde é o mais alto que
         já se alcançou, e o atual é um dos alcançados. */
      if (r.atual && r.recorde && r.recorde.nivel < r.atual.nivel) {
        incoerente = `atual ${r.atual.chave} > recorde ${r.recorde.chave}`
      }
      /* Um sem o outro é impossível: se há atual, houve pelo menos um degrau. */
      if (!!r.atual !== !!r.recorde) incoerente = 'atual e recorde discordam sobre existir'

      /* Sem dois degraus não há como afirmar direção. */
      if (r.passo !== null && !r.atual) incoerente = 'passo sem degrau nenhum'

      if (r.jaDaParaSaber !== r.ofertas >= 5) contagemRuim = `jaDaParaSaber com ${r.ofertas}`
    } catch (e) {
      quebrou = `${(e as Error).message} em ${JSON.stringify(registros)}`
    }
  }

  ok('resumoDoAlimento nunca estoura', quebrou === '', quebrou)
  ok('a contagem nunca passa do que entrou', contagemRuim === '', contagemRuim)
  ok('atual, recorde e passo nunca se contradizem', incoerente === '', incoerente)
}

/* ── As frases, que são a promessa central ─────────────────────────────────
 *
 * Nada devolve derrota. É a propriedade que protege a criança de uma tela mal
 * escrita, e por isso é varrida com entrada aleatória e não só com casos. */
{
  let quebrou = ''
  let culpa = ''
  let vazia = ''
  let comLixo = ''

  const PROIBIDO = /fracass|falh|que pena|não conseguiu|nao conseguiu|perdeu|errou|tente de novo|insist|deveria|precisa se esforçar/i

  for (let i = 0; i < N && !quebrou; i++) {
    const registros: Registro[] = Array.from({ length: inteiro(0, 8) }, () => ({
      data: umDe(DATAS),
      aceitacao: umDe(ACEITACOES),
      reacao: sorteio() < 0.4 ? null : umDe(REACOES_CRUAS),
    }))
    const degrau = umDe(DEGRAUS)

    try {
      const r = resumoDoAlimento(registros)
      const textos = [
        fraseDoRegistro(degrau, r),
        apoioDoRegistro(degrau, r),
        convitePraCrianca(degrau),
        convitePraCrianca(r.atual),
      ]

      for (const t of textos) {
        if (typeof t !== 'string' || t.trim() === '') vazia = JSON.stringify(textos)
        if (PROIBIDO.test(t)) culpa = t
        if (/undefined|NaN|\[object|null/.test(t)) comLixo = t
      }
    } catch (e) {
      quebrou = `${(e as Error).message}`
    }
  }

  ok('as frases nunca estouram', quebrou === '', quebrou)
  ok('NENHUMA frase culpa alguém', culpa === '', culpa)
  ok('nenhuma frase sai vazia', vazia === '', vazia)
  ok('nenhuma frase sai com undefined, NaN ou null', comLixo === '', comLixo)
}

/* ── A fala com a criança ──────────────────────────────────────────────────*/
{
  let comNumero = ''
  for (const d of [...DEGRAUS, null]) {
    const texto = `${convitePraCrianca(d)} ${d?.paraFilho ?? ''}`
    if (/\d/.test(texto)) comNumero = texto
  }
  ok('nunca há número na fala com a criança', comNumero === '', comNumero)

  /* O topo não tem próximo, e nenhum degrau aponta para trás. */
  let ordemRuim = ''
  for (const d of DEGRAUS) {
    const p = proximoDegrau(d)
    if (p && p.nivel !== d.nivel + 1) ordemRuim = `${d.chave} → ${p.chave}`
  }
  ok('o próximo degrau é sempre o de cima', ordemRuim === '', ordemRuim)
  ok('e o topo não inventa um próximo', proximoDegrau(DEGRAUS[DEGRAUS.length - 1]) === null)
}

/* ── porMes ────────────────────────────────────────────────────────────────*/
{
  let quebrou = ''
  let foraDeOrdem = ''
  let mesInvalido = ''

  for (let i = 0; i < N && !quebrou; i++) {
    const registros: Registro[] = Array.from({ length: inteiro(0, 10) }, () => ({
      data: umDe(DATAS),
      aceitacao: umDe(ACEITACOES),
      reacao: null,
    }))

    try {
      const meses = porMes(registros)
      for (let k = 1; k < meses.length; k++) {
        if (meses[k - 1].mes >= meses[k].mes) foraDeOrdem = meses.map(m => m.mes).join(',')
      }
      for (const m of meses) {
        if (!/^\d{4}-\d{2}$/.test(m.mes)) mesInvalido = m.mes
        if (!m.degrau) mesInvalido = `${m.mes} sem degrau`
      }
    } catch (e) {
      quebrou = (e as Error).message
    }
  }

  ok('porMes nunca estoura', quebrou === '', quebrou)
  ok('os meses saem em ordem, sem repetir', foraDeOrdem === '', foraDeOrdem)
  ok('todo mês tem forma de mês e um degrau', mesInvalido === '', mesInvalido)
}

/* ── degrauDe e reacaoDoBanco ──────────────────────────────────────────────*/
{
  let quebrou = ''
  let inventou = ''
  const validos = new Set(DEGRAUS.map(d => d.chave))

  for (let i = 0; i < N && !quebrou; i++) {
    const cru = sorteio() < 0.5 ? umDe(ACEITACOES) : String(inteiro(-99, 99))
    try {
      const d = degrauDe(cru)
      if (d && !validos.has(d.chave)) inventou = `${cru} → ${d.chave}`
      if (d && (d.nivel < 1 || d.nivel > 7)) inventou = `${cru} → altura ${d.nivel}`
      const r = reacaoDoBanco(umDe(REACOES_CRUAS))
      if (r !== null && !['tranquilo', 'indiferente', 'dificil'].includes(r)) inventou = String(r)
    } catch (e) {
      quebrou = `${(e as Error).message} em ${cru}`
    }
  }

  ok('degrauDe nunca estoura', quebrou === '', quebrou)
  ok('e nunca inventa degrau nem reação', inventou === '', inventou)
}

/* ── comArtigo ─────────────────────────────────────────────────────────────*/
{
  let quebrou = ''
  let ruim = ''
  for (let i = 0; i < N && !quebrou; i++) {
    const nome = sorteio() < 0.2 ? umDe(NOMES) + umDe(NOMES) : umDe(NOMES)
    try {
      const s = comArtigo(nome)
      if (!/^[oa] \S/.test(s)) ruim = `${JSON.stringify(nome)} → ${JSON.stringify(s)}`
      if (/undefined|NaN| {2,}/.test(s)) ruim = s
    } catch (e) {
      quebrou = `${(e as Error).message} em ${nome}`
    }
  }
  ok('comArtigo nunca estoura', quebrou === '', quebrou)
  ok('e sempre devolve artigo mais palavra', ruim === '', ruim)
}

/* ── As cores, contra fundo e acento aleatórios ────────────────────────────
 *
 * O acento sai do armazenamento do aparelho: é `string`, escrita por uma versão
 * anterior do app, e pode ser qualquer coisa. */
{
  const HEX = '0123456789abcdefABCDEF'
  const corAleatoria = () =>
    '#' + Array.from({ length: 6 }, () => HEX[inteiro(0, HEX.length - 1)]).join('')

  const FUNDOS = ['#0C0F0B', '#F4EFE4', '#161A14', '#FBF8F1']

  let quebrou = ''
  let ilegivel = ''
  let malformada = ''

  for (let i = 0; i < N && !quebrou; i++) {
    const acento = sorteio() < 0.1 ? umDe(['', '#', '#zz', 'verde', '#fff']) : corAleatoria()
    const fundo = umDe(FUNDOS)
    try {
      const c = coresDaEscada(acento, fundo, umDe([7, 7, 7, 1, 3, 12]))
      for (const d of c) {
        if (!/^#[0-9a-f]{6}$/i.test(d.traco) || !/^#[0-9a-f]{6}$/i.test(d.leve)) {
          malformada = `${acento} → ${d.traco} / ${d.leve}`
        }
      }
      if (c.length > 0 && !escadaLegivel(c, fundo)) {
        const pior = Math.min(...c.map(d => contraste(d.traco, fundo)))
        ilegivel = `${acento} sobre ${fundo}: pior contraste ${pior.toFixed(2)}`
      }
    } catch (e) {
      quebrou = `${(e as Error).message} em ${acento}`
    }
  }

  ok('coresDaEscada nunca estoura', quebrou === '', quebrou)
  ok('toda cor sai como hex de seis dígitos', malformada === '', malformada)
  ok('e todo degrau se lê sobre o fundo', ilegivel === '', ilegivel)
}

console.log(`\n${passou} ok, ${falhou} falha(s)  ·  ${N} sorteios por propriedade\n`)
if (falhou > 0) process.exit(1)
