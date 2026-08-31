import { dataCurta, dataNumerica, dataPorExtenso, horaCurta, rotuloDoDia } from './formatar.ts'

/* O separador de dia da conversa.
 *
 * Lógica de data quebra nas bordas, e as bordas de calendário são as piores:
 * virada de mês, virada de ANO, e a madrugada — em que "há quatro horas" e
 * "ontem" são a mesma coisa e a resposta certa é "ontem".
 *
 * `hoje` entra por parâmetro justamente para isto poder ser exercitado. */

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

const d = (ano: number, mes: number, dia: number, h = 12, m = 0) => new Date(ano, mes - 1, dia, h, m)

console.log('\nrotuloDoDia\n')

/* ── Hoje ──────────────────────────────────────────────────────────────────*/
{
  const hoje = d(2026, 8, 31, 14, 30)
  ok('mesma hora é hoje', rotuloDoDia(hoje, hoje) === 'Hoje')
  ok('de manhã ainda é hoje', rotuloDoDia(d(2026, 8, 31, 0, 1), hoje) === 'Hoje')
  ok('quase meia-noite ainda é hoje', rotuloDoDia(d(2026, 8, 31, 23, 59), hoje) === 'Hoje')
}

/* ── Ontem é pela DATA, não por 24 horas ───────────────────────────────────
 *
 * Às duas da manhã, uma mensagem das dez da noite anterior tem quatro horas —
 * mas é de ontem, e dizer "Hoje" nela faria a pessoa procurar no lugar errado. */
{
  const madrugada = d(2026, 8, 31, 2, 0)
  ok('dez da noite de ontem é "Ontem"', rotuloDoDia(d(2026, 8, 30, 22, 0), madrugada) === 'Ontem')
  ok('uma da manhã de hoje é "Hoje"', rotuloDoDia(d(2026, 8, 31, 1, 0), madrugada) === 'Hoje')

  /* E o contrário: 25 horas atrás, mas ainda do mesmo dia do calendário. */
  const noite = d(2026, 8, 31, 23, 0)
  ok('25 horas atrás pode ser "Ontem"', rotuloDoDia(d(2026, 8, 30, 22, 0), noite) === 'Ontem')
}

/* ── As viradas ────────────────────────────────────────────────────────────*/
{
  /* Primeiro do mês: ontem é o último do mês anterior. */
  const primeiroDeSetembro = d(2026, 9, 1, 10, 0)
  ok('vira o mês', rotuloDoDia(d(2026, 8, 31, 20, 0), primeiroDeSetembro) === 'Ontem')

  /* Primeiro de março: ontem é 28 de fevereiro, e 2026 não é bissexto. */
  const primeiroDeMarco = d(2026, 3, 1, 10, 0)
  ok('vira fevereiro sem inventar dia 29', rotuloDoDia(d(2026, 2, 28, 20, 0), primeiroDeMarco) === 'Ontem')

  /* Ano bissexto: 2024 TEM 29 de fevereiro. */
  const primeiroDeMarcoBissexto = d(2024, 3, 1, 10, 0)
  ok('em ano bissexto, ontem é 29 de fevereiro', rotuloDoDia(d(2024, 2, 29, 20, 0), primeiroDeMarcoBissexto) === 'Ontem')

  /* Ano-novo: ontem é 31 de dezembro do ano anterior. */
  const anoNovo = d(2027, 1, 1, 0, 30)
  ok('vira o ano', rotuloDoDia(d(2026, 12, 31, 23, 50), anoNovo) === 'Ontem')
  ok('e 31/12 de dois anos atrás não é ontem', rotuloDoDia(d(2025, 12, 31, 23, 50), anoNovo) !== 'Ontem')
}

/* ── Mais velho que ontem vira data ────────────────────────────────────────*/
{
  const hoje = d(2026, 8, 31, 14, 0)
  const anteontem = rotuloDoDia(d(2026, 8, 29, 14, 0), hoje)
  ok('anteontem vira data, não "Ontem"', anteontem !== 'Ontem' && anteontem !== 'Hoje', anteontem)
  /* `\w` não casa letra acentuada, e "Sáb" e "Már" são dias e meses de verdade —
     a primeira versão deste teste acusou "Sáb, 29 de Ago." de ilegível. */
  ok('e a data é legível', /^\p{L}{3}, \d{1,2} de \p{L}{3}\.$/u.test(anteontem), anteontem)
}

/* ── Mesmo dia de OUTRO ano não é hoje ─────────────────────────────────────
 *
 * A comparação precisa incluir o ano. Sem ele, 31/08/2025 seria "Hoje" em
 * 31/08/2026 — e a conversa mostraria uma mensagem de um ano atrás como sendo
 * de agora. */
{
  const hoje = d(2026, 8, 31, 14, 0)
  ok('mesmo dia e mês de outro ano NÃO é hoje', rotuloDoDia(d(2025, 8, 31, 14, 0), hoje) !== 'Hoje')
  ok('e nem é ontem', rotuloDoDia(d(2025, 8, 31, 14, 0), hoje) !== 'Ontem')
}

/* ── Futuro ────────────────────────────────────────────────────────────────
 *
 * Relógio do aparelho atrasado faz uma mensagem chegar "do futuro". Não deve
 * quebrar nem virar "Ontem". */
{
  const hoje = d(2026, 8, 31, 14, 0)
  ok('amanhã não vira "Ontem"', rotuloDoDia(d(2026, 9, 1, 10, 0), hoje) !== 'Ontem')
  ok('amanhã não vira "Hoje"', rotuloDoDia(d(2026, 9, 1, 10, 0), hoje) !== 'Hoje')
}

/* ── Data impossível não derruba a conversa ────────────────────────────────
 *
 * Era CRASH: `new Date('lixo')` devolve um Date cujos getters são todos NaN,
 * `MESES[NaN]` é `undefined`, e o `.slice(0, 3)` do `dataCurta` estourava. Uma
 * `criadaEm` nula numa linha derrubava a conversa inteira — e o mesmo caminho
 * serve a lista de pedidos, em `NutricionistasScreen`. */
{
  const hoje = d(2026, 8, 31, 14, 0)
  let quebrou = ''
  let saida: string[] = []
  try {
    saida = [
      rotuloDoDia(new Date(Number.NaN), hoje),
      rotuloDoDia(new Date('nao é data'), hoje),
      rotuloDoDia(new Date(undefined as unknown as number), hoje),
    ]
  } catch (e) {
    quebrou = (e as Error).message
  }
  ok('data inválida não estoura', quebrou === '', quebrou)
  ok('e diz que não sabe, em vez de "undefined"', saida.every(s => s === 'Data desconhecida'), saida.join(' | '))
}

/* ── E as outras que formatam data pelo mesmo caminho ──────────────────────*/
{
  const lixo = new Date('nao é data')
  let quebrou = ''
  let saida: string[] = []
  try {
    saida = [dataCurta(lixo), dataPorExtenso(lixo), horaCurta(lixo), dataNumerica(lixo)]
  } catch (e) {
    quebrou = (e as Error).message
  }
  ok('nenhuma formatadora estoura com data inválida', quebrou === '', quebrou)
  ok('e nenhuma escreve NaN ou undefined', !/NaN|undefined/.test(saida.join(' ')), saida.join(' | '))
  ok('a hora guarda o formato', saida[2] === '--:--', saida[2])
  ok('a data numérica guarda o formato', saida[3] === '--/--/----', saida[3])
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
