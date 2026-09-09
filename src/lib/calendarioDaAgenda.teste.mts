/* O calendario da agenda dela: dia, semana e mes.
 *
 * O que este arquivo protege: virada de mes, ano bissexto, semana que atravessa
 * dois meses, e domingo -- que e o dia que quase todo calendario erra, porque
 * `getDay()` devolve 0 para ele e a semana de trabalho comeca na segunda.
 *
 * O fuso e fixado aqui em cima, antes de qualquer `Date`: sem isso, `hojeLocal`
 * e `diaLocalDe` passariam nesta maquina e falhariam na de outra pessoa -- que
 * e a pior forma de teste, porque ele da a impressao de proteger.
 *
 * Rode com: node --experimental-strip-types src/lib/calendarioDaAgenda.teste.mts */

process.env.TZ = 'America/Sao_Paulo'

import {
  CABECALHO_DA_SEMANA,
  contarPorDia,
  diaLocalDe,
  diasDaSemana,
  diasNoMes,
  gradeDoMes,
  hojeLocal,
  mesAndando,
  mesDaData,
  nomeDoMes,
  primeiroDiaDoMes,
  tituloDaSemana,
  tituloDoDia,
} from './calendarioDaAgenda.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, extra = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHOU ' + nome + (extra ? '  -> ' + extra : ''))
  }
}

/* == ANDAR DE MES ======================================================= */
{
  console.log('\n1. mesAndando')
  ok('um mes para frente', mesAndando('2026-09', 1) === '2026-10')
  ok('um mes para tras', mesAndando('2026-09', -1) === '2026-08')
  /* A virada do ano nos dois sentidos: dezembro + 1 e janeiro - 1 sao os dois
     lugares onde uma conta ingenua sobre o numero do mes estoura. */
  ok('dezembro vira janeiro do ano seguinte', mesAndando('2026-12', 1) === '2027-01', mesAndando('2026-12', 1))
  ok('janeiro vira dezembro do anterior', mesAndando('2026-01', -1) === '2025-12', mesAndando('2026-01', -1))
  ok('um ano inteiro', mesAndando('2026-09', 12) === '2027-09')
  ok('treze meses para tras', mesAndando('2026-09', -13) === '2025-08', mesAndando('2026-09', -13))
  ok('zero nao mexe', mesAndando('2026-09', 0) === '2026-09')

  /* `Date.setMonth` daria 3 de marco partindo de 31 de janeiro. A conta aqui e
     sobre ano e mes, e o dia nunca entra -- por isso nao ha o que escorregar. */
  ok('mes torto volta igual', mesAndando('lixo', 1) === 'lixo')
  ok('mes 13 volta igual', mesAndando('2026-13', 1) === '2026-13')
}

/* == QUANTOS DIAS ======================================================= */
{
  console.log('\n2. diasNoMes')
  ok('setembro tem 30', diasNoMes('2026-09') === 30, String(diasNoMes('2026-09')))
  ok('outubro tem 31', diasNoMes('2026-10') === 31)
  ok('fevereiro comum tem 28', diasNoMes('2026-02') === 28, String(diasNoMes('2026-02')))
  /* 2028 e bissexto; 2100 NAO e, apesar de divisivel por 4 -- a regra do
     seculo. Descobrir andando em vez de tabelar e o que faz as duas sairem
     certas sem ninguem escrever a excecao. */
  ok('fevereiro bissexto tem 29', diasNoMes('2028-02') === 29, String(diasNoMes('2028-02')))
  ok('2100 nao e bissexto', diasNoMes('2100-02') === 28, String(diasNoMes('2100-02')))
  ok('dezembro tem 31', diasNoMes('2026-12') === 31)
  ok('mes torto da zero', diasNoMes('nao-e-mes') === 0)
}

/* == A SEMANA COMECA NA SEGUNDA ========================================= */
{
  console.log('\n3. diasDaSemana')
  // 2026-09-08 e uma terca.
  const s = diasDaSemana('2026-09-08')
  ok('sete dias', s.length === 7, String(s.length))
  ok('comeca na segunda', s[0] === '2026-09-07', s[0])
  ok('termina no domingo', s[6] === '2026-09-13', s[6])

  /* O caso que quase todo calendario erra: domingo pertence a semana que
     COMECOU na segunda anterior, seis dias atras -- e nao a que comeca amanha. */
  const domingo = diasDaSemana('2026-09-13')
  ok('domingo fica na semana que ja passou', domingo[0] === '2026-09-07', domingo[0])
  ok('e e o ultimo dela', domingo[6] === '2026-09-13')

  const segunda = diasDaSemana('2026-09-07')
  ok('segunda e o primeiro dia dela mesma', segunda[0] === '2026-09-07')

  // Semana que atravessa o mes.
  const virada = diasDaSemana('2026-10-01')
  ok('atravessa o mes', virada[0] === '2026-09-28' && virada[6] === '2026-10-04',
     virada[0] + '..' + virada[6])

  ok('data torta nao devolve semana', diasDaSemana('2026-02-31').length === 0)
  ok('o cabecalho tem sete', CABECALHO_DA_SEMANA.length === 7)
}

/* == A GRADE DO MES ===================================================== */
{
  console.log('\n4. gradeDoMes')
  const vazio = new Map<string, number>()

  const set = gradeDoMes('2026-09', vazio)
  ok('linhas inteiras de sete', set.length % 7 === 0, String(set.length))
  // 1/09/2026 e terca: a grade abre na segunda 31/08.
  ok('abre na segunda anterior', set[0].iso === '2026-08-31', set[0].iso)
  ok('e a sobra vem marcada', set[0].doMes === false)
  ok('o dia 1 vem logo depois', set[1].iso === '2026-09-01' && set[1].doMes === true)
  ok('fecha no domingo', set[set.length - 1].iso === '2026-10-04', set[set.length - 1].iso)
  ok('tem os 30 dias do mes', set.filter(c => c.doMes).length === 30,
     String(set.filter(c => c.doMes).length))

  /* O numero de linhas VARIA. Fevereiro de 2027 comeca numa segunda e tem 28
     dias: quatro linhas exatas, sem sobra nenhuma. Uma grade fixa em seis
     mostraria duas linhas inteiras de outro mes. */
  const fev = gradeDoMes('2027-02', vazio)
  ok('fevereiro de 2027 cabe em 4 linhas', fev.length === 28, String(fev.length))
  ok('e nao tem sobra', fev.every(c => c.doMes))

  /* E o contrario: maio de 2027 comeca no sabado e tem 31 dias -- seis linhas. */
  const maio = gradeDoMes('2027-05', vazio)
  ok('maio de 2027 precisa de 6 linhas', maio.length === 42, String(maio.length))

  ok('mes torto da grade vazia', gradeDoMes('nao-e-mes', vazio).length === 0)
}

/* == A CONTAGEM ENTRA NA GRADE ========================================== */
{
  console.log('\n5. contarPorDia')
  const conta = contarPorDia([
    { diaISO: '2026-09-08' },
    { diaISO: '2026-09-08' },
    { diaISO: '2026-09-10' },
    { diaISO: 'nao e data' },
    { diaISO: '2026-02-31' },   // formato bate, dia nao existe
  ])
  ok('duas no dia 8', conta.get('2026-09-08') === 2, String(conta.get('2026-09-08')))
  ok('uma no dia 10', conta.get('2026-09-10') === 1)
  ok('dia sem consulta nao entra', conta.get('2026-09-09') === undefined)
  ok('lixo nao vira dia', conta.get('nao e data') === undefined)
  ok('data que nao existe tambem nao', conta.get('2026-02-31') === undefined)
  ok('lista vazia', contarPorDia([]).size === 0)

  const grade = gradeDoMes('2026-09', conta)
  const dia8 = grade.find(c => c.iso === '2026-09-08')
  ok('a grade recebe a contagem', dia8?.quantas === 2, String(dia8?.quantas))
  ok('e zera onde nao ha', grade.find(c => c.iso === '2026-09-09')?.quantas === 0)
}

/* == OS TITULOS ========================================================= */
{
  console.log('\n6. os titulos')
  ok('nome do mes', nomeDoMes('2026-09') === 'setembro de 2026', nomeDoMes('2026-09'))
  ok('marco com cedilha', nomeDoMes('2026-03') === 'março de 2026', nomeDoMes('2026-03'))
  ok('mes torto volta igual', nomeDoMes('xx') === 'xx')

  /* Mes repetido nas duas pontas e ruido; omitido quando muda e mentira. */
  ok('semana dentro do mes',
     tituloDaSemana('2026-09-08') === '7 – 13 de setembro', tituloDaSemana('2026-09-08'))
  ok('semana que atravessa',
     tituloDaSemana('2026-10-01') === '28 de setembro – 4 de outubro', tituloDaSemana('2026-10-01'))
  ok('semana de data torta', tituloDaSemana('2026-02-31') === '')

  ok('titulo do dia', tituloDoDia('2026-09-08') === 'Terça, 8 de setembro', tituloDoDia('2026-09-08'))
  ok('domingo', tituloDoDia('2026-09-13') === 'Domingo, 13 de setembro', tituloDoDia('2026-09-13'))
  ok('sabado com acento', tituloDoDia('2026-09-12') === 'Sábado, 12 de setembro', tituloDoDia('2026-09-12'))
  ok('data torta nao vira titulo', tituloDoDia('2026-02-31') === '')

  ok('mesDaData recorta', mesDaData('2026-09-08') === '2026-09')
  ok('primeiro dia', primeiroDiaDoMes('2026-09') === '2026-09-01')
  ok('mes que nao existe', primeiroDiaDoMes('2026-13') === '')
}

/* == O FUSO, QUE E ONDE A AGENDA ABRE NO DIA ERRADO ===================== */
{
  console.log('\n7. o fuso')
  /* 22h de 8 de setembro no Brasil ja e dia 9 em UTC. `toISOString().slice(0,10)`
     -- que e o jeito obvio -- faria a agenda abrir no dia seguinte toda noite. */
  ok('22h continua sendo hoje',
     hojeLocal(new Date('2026-09-08T22:00:00-03:00')) === '2026-09-08',
     hojeLocal(new Date('2026-09-08T22:00:00-03:00')))
  ok('meia-noite e um ja e amanha',
     hojeLocal(new Date('2026-09-09T00:01:00-03:00')) === '2026-09-09')

  ok('consulta das 22h e do dia dela',
     diaLocalDe('2026-09-08T22:00:00-03:00') === '2026-09-08',
     diaLocalDe('2026-09-08T22:00:00-03:00'))
  /* O mesmo instante escrito em UTC tem de dar o MESMO dia local. */
  ok('mesmo instante em UTC da o mesmo dia',
     diaLocalDe('2026-09-09T01:00:00Z') === '2026-09-08',
     diaLocalDe('2026-09-09T01:00:00Z'))
  ok('consulta das 8h da manha', diaLocalDe('2026-09-08T08:00:00-03:00') === '2026-09-08')
  ok('data ilegivel vira vazio', diaLocalDe('nao e data') === '')
  ok('vazio vira vazio', diaLocalDe('') === '')
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
