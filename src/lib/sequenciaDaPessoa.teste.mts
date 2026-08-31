/* A sequência da pessoa: dias seguidos, perdão limitado, e o número que não
 * mente.
 *
 * Rode com: node --experimental-strip-types src/lib/sequenciaDaPessoa.teste.mts
 */

import {
  MARCOS,
  fraseDaSequencia,
  sequenciaDaPessoa,
  type Sequencia,
} from './sequenciaDaPessoa.ts'

let passaram = 0
let falharam = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passaram++
    console.log('  ok    ' + nome)
  } else {
    falharam++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

/* Datas seguidas a partir de uma, para trás. */
const seguidos = (fim: string, quantos: number): string[] => {
  const fora: string[] = []
  const d = new Date(Date.parse(fim + 'T00:00:00Z'))
  for (let i = 0; i < quantos; i++) {
    fora.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return fora
}

const HOJE = '2026-08-31'

console.log('\n1. o basico')

{
  const s = sequenciaDaPessoa(seguidos(HOJE, 5), HOJE)
  ok('cinco dias seguidos', s.dias === 5, String(s.dias))
  ok('hoje esta feito', s.hojeFeito)
  ok('e nao esta em risco', !s.emRisco)
  ok('proximo marco e 7', s.proximoMarco === 7)
  ok('faltam 2', s.faltamParaOMarco === 2)
}

{
  const s = sequenciaDaPessoa([], HOJE)
  ok('sem nada, zero', s.dias === 0)
  ok('e nao inventa risco', !s.emRisco)
  ok('o primeiro marco continua sendo 7', s.proximoMarco === 7)
}

console.log('\n2. o dia nao acabou: hoje pendente NAO quebra')

{
  /* Registrou ate ontem, hoje ainda nao. Quem vai jantar as 21h nao pode perder
     a sequencia as 00h01 porque o relogio virou. */
  const s = sequenciaDaPessoa(seguidos('2026-08-30', 10), HOJE)
  ok('conta os 10 de ontem para tras', s.dias === 10, String(s.dias))
  ok('hoje nao esta feito', !s.hojeFeito)
  ok('e ESTA em risco', s.emRisco)
}

{
  /* Nem hoje nem ontem: acabou mesmo. */
  const s = sequenciaDaPessoa(seguidos('2026-08-29', 10), HOJE)
  ok('dois dias sem registro zera', s.dias === 0, String(s.dias))
  ok('e nao fica "em risco", porque nao ha o que perder', !s.emRisco)
}

console.log('\n3. o perdao: pular UM nao quebra, pular DOIS quebra')

{
  /* 31, 30, [pula 29], 28, 27, 26. Um dia de buraco: perdoado.
     Cinco dias registrados de verdade -- e e cinco que aparece, nao seis. */
  const datas = [...seguidos(HOJE, 2), ...seguidos('2026-08-28', 3)]
  const s = sequenciaDaPessoa(datas, HOJE)
  ok('buraco de um dia nao quebra', s.dias === 5, String(s.dias))
}

{
  /* 31, 30, [pula 29 e 28], 27, 26. Dois seguidos quebram. */
  const datas = [...seguidos(HOJE, 2), ...seguidos('2026-08-27', 2)]
  const s = sequenciaDaPessoa(datas, HOJE)
  ok('buraco de dois dias quebra', s.dias === 2, String(s.dias))

  /* E o de tres, com mais razao. */
  ok('buraco de tres dias tambem quebra',
    sequenciaDaPessoa([...seguidos(HOJE, 2), ...seguidos('2026-08-26', 2)], HOJE).dias === 2)

  /* Dois buracos de UM dia cada, separados: os dois sao perdoados.
     31, 30, [29], 28, [27], 26, 25 -> cinco dias registrados. */
  ok('dois buracos de um dia cada continuam perdoados',
    sequenciaDaPessoa(
      [...seguidos(HOJE, 2), '2026-08-28', ...seguidos('2026-08-26', 2)], HOJE,
    ).dias === 5)
}

{
  /* O perdao NAO infla: dia sim, dia nao por um mes.
     A pessoa apareceu 15 vezes; o numero mostrado tem de ser 15. Dizer 30 seria
     bajular, e bajulacao e descoberta na primeira conferida. */
  const alternados: string[] = []
  const d = new Date(Date.parse(HOJE + 'T00:00:00Z'))
  for (let i = 0; i < 15; i++) {
    alternados.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 2)
  }
  const s = sequenciaDaPessoa(alternados, HOJE)
  ok('dia sim dia nao conta os dias REAIS, e nao os do calendario',
    s.dias === 15, String(s.dias))
}

console.log('\n4. marcos')

{
  const s = sequenciaDaPessoa(seguidos(HOJE, 7), HOJE)
  ok('sete dias fecha marco', s.marcoHoje, JSON.stringify(s))
  ok('e o proximo vira 14', s.proximoMarco === 14)
}

{
  /* Fechou 7 ontem e registrou hoje: sao 8, nao e marco. A comemoracao acontece
     UMA vez -- repetida, deixa de ser comemoracao. */
  const s = sequenciaDaPessoa(seguidos(HOJE, 8), HOJE)
  ok('oito dias nao comemora de novo', !s.marcoHoje, String(s.dias))
}

{
  /* Marco so conta quando HOJE fechou. Com hoje pendente, o numero pode bater
     num marco por acaso da contagem de ontem -- e nao ha o que comemorar. */
  const s = sequenciaDaPessoa(seguidos('2026-08-30', 7), HOJE)
  ok('marco nao dispara com hoje pendente', !s.marcoHoje)
  ok('mas o numero esta certo', s.dias === 7)
}

{
  const s = sequenciaDaPessoa(seguidos(HOJE, 400), HOJE)
  ok('passou do ultimo marco: proximo e nulo', s.proximoMarco === null, String(s.proximoMarco))
  ok('e faltam tambem', s.faltamParaOMarco === null)
  ok('o numero continua certo', s.dias === 400, String(s.dias))
}

console.log('\n5. entrada torta nao inventa dia')

{
  /* '2026-02-31' passa no formato, nao existe no calendario, e o JavaScript
     escorrega para 3 de marco. Entraria como um dia que nunca houve. */
  const s = sequenciaDaPessoa(['2026-02-31', 'nao e data', '', '2026-13-01'], HOJE)
  ok('data impossivel nao vira dia', s.dias === 0, String(s.dias))
}

{
  /* Data no futuro nao conta: o dia ainda nao aconteceu. */
  const s = sequenciaDaPessoa([...seguidos(HOJE, 3), '2026-09-05'], HOJE)
  ok('futuro e ignorado', s.dias === 3, String(s.dias))
}

{
  ok('hoje invalido devolve vazio', sequenciaDaPessoa(seguidos('2026-08-30', 5), 'lixo').dias === 0)
}

{
  /* Repetido nao conta duas vezes. */
  const s = sequenciaDaPessoa([HOJE, HOJE, HOJE, '2026-08-30'], HOJE)
  ok('data repetida conta uma vez', s.dias === 2, String(s.dias))
}

{
  /* Fora de ordem da o mesmo resultado: o Set nasce do conteudo. */
  const embaralhado = ['2026-08-28', HOJE, '2026-08-29', '2026-08-30']
  ok('ordem nao importa', sequenciaDaPessoa(embaralhado, HOJE).dias === 4)
}

console.log('\n6. a frase: convite, nunca ameaca')

{
  const proibidas = [
    'falhou', 'perdeu', 'perigo', 'nao perca', 'você vai perder',
    'cuidado', 'atenção', 'alerta', 'errou', 'preguiça', 'desistiu',
  ]
  const casos: Sequencia[] = [
    sequenciaDaPessoa([], HOJE),
    sequenciaDaPessoa(seguidos(HOJE, 1), HOJE),
    sequenciaDaPessoa(seguidos(HOJE, 5), HOJE),
    sequenciaDaPessoa(seguidos(HOJE, 6), HOJE),
    sequenciaDaPessoa(seguidos(HOJE, 7), HOJE),
    sequenciaDaPessoa(seguidos(HOJE, 30), HOJE),
    sequenciaDaPessoa(seguidos(HOJE, 100), HOJE),
    sequenciaDaPessoa(seguidos('2026-08-30', 1), HOJE),
    sequenciaDaPessoa(seguidos('2026-08-30', 12), HOJE),
  ]

  let limpas = 0
  for (const c of casos) {
    const f = fraseDaSequencia(c).toLowerCase()
    const suja = proibidas.find(p => f.includes(p))
    if (suja) {
      falharam++
      console.log(`  FALHA frase com ameaca ("${suja}"): ${fraseDaSequencia(c)}`)
    } else limpas++
  }
  ok(`as ${casos.length} frases sao convite, e nenhuma ameaca`, limpas === casos.length)

  /* E nenhuma sai vazia, que na tela seria um espaco em branco sem explicacao. */
  ok('nenhuma frase vazia', casos.every(c => fraseDaSequencia(c).trim().length > 10))
}

{
  const emRisco = sequenciaDaPessoa(seguidos('2026-08-30', 12), HOJE)
  const f = fraseDaSequencia(emRisco)
  /* Quem esta prestes a pular um dia nao vai preencher formulario. A frase tem
     de oferecer o caminho mais barato que existe. */
  ok('a frase de risco oferece a saida mais barata', f.toLowerCase().includes('água'), f)
  ok('e cita o numero que ela tem a manter', f.includes('12'), f)
}

{
  const marco = sequenciaDaPessoa(seguidos(HOJE, 7), HOJE)
  ok('a frase dos 7 dias fala de habito', fraseDaSequencia(marco).toLowerCase().includes('hábito'),
    fraseDaSequencia(marco))
}

{
  const zero = sequenciaDaPessoa([], HOJE)
  ok('sem sequencia, a frase diz COMO comecar',
    fraseDaSequencia(zero).toLowerCase().includes('água'), fraseDaSequencia(zero))
}

console.log('\n7. os marcos estao em ordem e comecam no 7')

{
  ok('o primeiro marco e 7, que e o previsor', MARCOS[0] === 7)
  ok('estao em ordem crescente', MARCOS.every((m, i) => i === 0 || m > MARCOS[i - 1]))
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
