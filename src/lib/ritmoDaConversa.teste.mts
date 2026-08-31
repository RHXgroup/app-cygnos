import { comoElaResponde, esperasEmMinutos } from './ritmoDaConversa.ts'

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

/* Um instante, em minutos a partir de um zero arbitrário. */
const T0 = new Date(2026, 7, 30, 8, 0).getTime()
const em = (minutos: number) => new Date(T0 + minutos * 60000).toISOString()

const dele = (minutos: number) => ({ de: 'paciente', criadaEm: em(minutos) })
const dela = (minutos: number) => ({ de: 'nutricionista', criadaEm: em(minutos) })

console.log('\nritmoDaConversa\n')

/* ── As esperas ────────────────────────────────────────────────────────────*/
{
  ok('conversa vazia não tem espera', esperasEmMinutos([]).length === 0)
  ok('só ele falando não tem espera', esperasEmMinutos([dele(0), dele(5)]).length === 0)
  ok('só ela falando não tem espera', esperasEmMinutos([dela(0), dela(5)]).length === 0)

  ok('uma pergunta e uma resposta', esperasEmMinutos([dele(0), dela(30)])[0] === 30)

  /* Ela falando primeiro não conta: não havia ninguém esperando. */
  ok(
    'resposta sem pergunta antes é ignorada',
    esperasEmMinutos([dela(0), dele(10), dela(40)]).length === 1,
  )
}

{
  /* Quem manda três seguidas espera desde a PRIMEIRA. Medir da última faria a
     espera parecer menor do que foi. */
  const e = esperasEmMinutos([dele(0), dele(5), dele(9), dela(60)])
  ok('sequência dele conta desde a primeira', e.length === 1 && e[0] === 60, String(e))
}

{
  /* Ela mandando várias seguidas é uma resposta só. */
  const e = esperasEmMinutos([dele(0), dela(20), dela(21), dela(22)])
  ok('sequência dela conta como uma resposta', e.length === 1 && e[0] === 20, String(e))
}

{
  const e = esperasEmMinutos([dele(0), dela(10), dele(100), dela(130), dele(200), dela(260)])
  ok('três trocas dão três esperas', e.length === 3, String(e))
  ok('as esperas são as certas', e.join(',') === '10,30,60', e.join(','))
}

{
  /* Relógio torto: resposta antes da pergunta. Descarta em vez de somar espera
     negativa, que puxaria a mediana para baixo. */
  const e = esperasEmMinutos([
    { de: 'paciente', criadaEm: em(100) },
    { de: 'nutricionista', criadaEm: em(40) },
  ])
  ok('espera negativa é descartada', e.length === 0)

  const lixo = esperasEmMinutos([
    { de: 'paciente', criadaEm: 'nao é data' },
    { de: 'nutricionista', criadaEm: em(10) },
  ])
  ok('data inválida não derruba', lixo.length === 0)
}

/* ── A frase ───────────────────────────────────────────────────────────────
 *
 * Precisa de três respostas para dizer "costuma". Com uma só não há costume —
 * é um caso; com duas, uma fora do normal domina. */
{
  ok('sem conversa, não diz nada', comoElaResponde([]) === null)
  ok('com uma resposta, não diz nada', comoElaResponde([dele(0), dela(10)]) === null)
  ok(
    'com duas respostas, ainda não diz',
    comoElaResponde([dele(0), dela(10), dele(60), dela(70)]) === null,
  )
}

{
  const rapida = [dele(0), dela(5), dele(60), dela(66), dele(120), dela(128)]
  ok('minutos poucos viram "alguns minutos"', comoElaResponde(rapida) === 'alguns minutos')
}

{
  const meiaHora = [dele(0), dela(30), dele(100), dela(130), dele(300), dela(330)]
  ok('meia hora arredonda para 30', comoElaResponde(meiaHora) === 'cerca de 30 minutos')
}

{
  const duasHoras = [dele(0), dela(120), dele(300), dela(420), dele(600), dela(725)]
  ok('duas horas viram horas', comoElaResponde(duasHoras) === 'cerca de 2 horas')
}

{
  const umDia = [dele(0), dela(1440), dele(2000), dela(3450), dele(5000), dela(6430)]
  ok('um dia vira "1 dia", no singular', comoElaResponde(umDia) === 'cerca de 1 dia')
}

/* ── A mediana ignora o caso isolado ───────────────────────────────────────
 *
 * Uma resposta que demorou três dias porque ela estava de férias jogaria a
 * MÉDIA para cima e a frase mentiria o resto do tempo. */
{
  const comFerias = [
    dele(0), dela(20),
    dele(100), dela(125),
    dele(200), dela(230),
    dele(300), dela(300 + 4320), // três dias
  ]
  const frase = comoElaResponde(comFerias)
  ok('uma demora enorme não domina', frase !== null && frase.includes('minutos'), String(frase))
}

/* ── Silêncio longo demais não vira frase ──────────────────────────────────
 *
 * "Costuma responder em 5 dias" não muda o que a pessoa faz, e soa como
 * acusação a quem talvez tenha respondido rápido nas últimas. */
{
  const semanaInteira = [
    dele(0), dela(7 * 1440),
    dele(20000), dela(20000 + 7 * 1440),
    dele(40000), dela(40000 + 7 * 1440),
  ]
  ok('demora acima de três dias não vira frase', comoElaResponde(semanaInteira) === null)
}

/* ── Uma conversa de verdade ───────────────────────────────────────────────*/
{
  const real = [
    dele(0), dele(2), dela(45),
    dele(1500), dela(1560),
    dele(3000), dela(3100),
    dele(4000),
  ]
  const frase = comoElaResponde(real)
  ok('a última pergunta sem resposta não conta', frase !== null, String(frase))
  ok('e a frase é legível', frase === 'cerca de 60 minutos', String(frase))
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
