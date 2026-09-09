/* O dia da nutricionista, dividido em torno do relogio.
 *
 * O que este arquivo protege: comparacao de horario e onde este projeto mais
 * errou -- o cartao da proxima refeicao, o descanso do treino, a janela da
 * agua, todos deram defeito numa virada de hora que ninguem tinha exercitado.
 * Aqui da para colocar o relogio onde quiser.
 *
 * Rode com: node --experimental-strip-types src/lib/diaDaNutri.teste.mts */

import {
  ANTECEDENCIA_MIN,
  DURACAO_SUPOSTA_MIN,
  dividirODia,
  hhmm,
  resumoDaAgenda,
  emQuanto,
  type ConsultaDoDia,
} from './diaDaNutri.ts'

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

/* Um dia de trabalho de verdade, em 8 de setembro de 2026. */
const T = (hhmm: string) => `2026-09-08T${hhmm}:00-03:00`
const ms = (hhmm: string) => Date.parse(T(hhmm))

const c = (
  id: number,
  hora: string,
  nome: string,
  status = 'pendente',
  duracao: number | null = null,
): ConsultaDoDia => ({ id, quando: T(hora), nome, duracao, status, tipo: 'consulta' })

const DIA: ConsultaDoDia[] = [
  c(1, '09:00', 'Marina Alves', 'realizada'),
  c(2, '10:30', 'Carlos Menezes', 'realizada'),
  c(3, '14:00', 'Juliana Prado'),
  c(4, '15:30', 'Rafael Souza', 'confirmada'),
  c(5, '17:00', 'Beatriz Lima'),
  c(6, '11:00', 'Pedro Nunes', 'cancelada'),
  c(7, '16:00', 'Ana Clara', 'solicitada'),
]

/* == O QUE CONTA COMO AGENDA ============================================ */
{
  console.log('\n1. cancelada e solicitada ficam de fora')
  const d = dividirODia(DIA, ms('08:00'))
  ok('conta 5 das 7', d.total === 5, String(d.total))
  const nomes = [...d.jaForam, ...d.aindaHoje].map(x => x.nome)
  ok('a cancelada nao aparece', !nomes.includes('Pedro Nunes'))
  ok('a solicitada tambem nao', !nomes.includes('Ana Clara'), nomes.join(','))
  ok('e a realizada aparece', nomes.includes('Marina Alves'))
}

/* == O RELOGIO DIVIDE O DIA ============================================= */
{
  console.log('\n2. antes de tudo comecar')
  const d = dividirODia(DIA, ms('07:30'))
  ok('ninguem esta com ela', d.agora === null)
  ok('as 5 ainda vem', d.aindaHoje.length === 5, String(d.aindaHoje.length))
  ok('nenhuma passou', d.jaForam.length === 0)
  ok('em ordem de horario', d.aindaHoje[0].nome === 'Marina Alves' && d.aindaHoje[4].nome === 'Beatriz Lima')
}

{
  console.log('\n3. no meio da tarde')
  const d = dividirODia(DIA, ms('14:20'))
  ok('a das 14h e a de agora', d.agora?.nome === 'Juliana Prado', d.agora?.nome ?? 'nenhuma')
  ok('duas ainda vem', d.aindaHoje.length === 2, d.aindaHoje.map(x => x.nome).join(','))
  ok('duas ja passaram', d.jaForam.length === 2, d.jaForam.map(x => x.nome).join(','))
}

{
  console.log('\n4. depois da ultima')
  const d = dividirODia(DIA, ms('19:00'))
  ok('ninguem agora', d.agora === null)
  ok('nada mais hoje', d.aindaHoje.length === 0)
  ok('as 5 passaram', d.jaForam.length === 5)
}

/* == A JANELA DO "AGORA" ================================================ */
{
  console.log('\n5. a antecedencia')
  // Dez minutos antes das 14h ela ja esta na sala de espera.
  const antes = dividirODia([c(1, '14:00', 'Juliana')], ms('13:51'))
  ok('9 min antes ja e "agora"', antes.agora?.nome === 'Juliana')

  const bemAntes = dividirODia([c(1, '14:00', 'Juliana')], ms('13:45'))
  ok('15 min antes ainda nao e', bemAntes.agora === null)
  ok('e ela esta no "ainda hoje"', bemAntes.aindaHoje.length === 1)

  ok('a antecedencia e de 10 min', ANTECEDENCIA_MIN === 10, String(ANTECEDENCIA_MIN))
}

{
  console.log('\n6. quanto tempo ela segue sendo a de agora')
  const um = [c(1, '14:00', 'Juliana')]
  ok('45 min depois ainda e agora', dividirODia(um, ms('14:45')).agora?.nome === 'Juliana')
  ok('55 min depois ja passou', dividirODia(um, ms('14:55')).agora === null)
  ok('e caiu no "ja foram"', dividirODia(um, ms('14:55')).jaForam.length === 1)
  ok('a duracao suposta e 50 min', DURACAO_SUPOSTA_MIN === 50)

  // Com duracao declarada, o palpite nao vale.
  const curta = [c(1, '14:00', 'Juliana', 'pendente', 20)]
  ok('duracao declarada manda', dividirODia(curta, ms('14:25')).agora === null)
  ok('e vale enquanto dura', dividirODia(curta, ms('14:15')).agora?.nome === 'Juliana')

  // Duracao zero ou negativa nao pode zerar a janela.
  const zero = [c(1, '14:00', 'Juliana', 'pendente', 0)]
  ok('duracao zero cai no palpite', dividirODia(zero, ms('14:30')).agora?.nome === 'Juliana')
}

/* == DUAS COLADAS, QUE E O CASO REAL ==================================== */
{
  console.log('\n7. consultas sobrepostas')
  // Sem duracao declarada, as 14h e as 14h30 se sobrepoem pelo palpite.
  const coladas = [c(1, '14:00', 'Primeira'), c(2, '14:30', 'Segunda')]
  const d = dividirODia(coladas, ms('14:35'))
  ok('quem esta na sala e a PRIMEIRA', d.agora?.nome === 'Primeira', d.agora?.nome ?? 'nenhuma')
  ok('a segunda continua por vir', d.aindaHoje.map(x => x.nome).join(',') === 'Segunda')
}

/* == A VIRADA DA MEIA-NOITE ============================================= */
{
  console.log('\n8. a virada')
  // 23h59 de um dia com consulta de manha: tudo ja passou, nada quebra.
  const d = dividirODia(DIA, ms('23:59'))
  ok('nada agora', d.agora === null)
  ok('nada por vir', d.aindaHoje.length === 0)
  ok('e o total continua certo', d.total === 5)
}

/* == ENTRADA TORTA NAO DERRUBA ========================================== */
{
  console.log('\n9. dado torto')
  const tortas: ConsultaDoDia[] = [
    { id: 1, quando: 'nao e data', nome: 'X', duracao: null, status: 'pendente', tipo: null },
    { id: 2, quando: '', nome: 'Y', duracao: null, status: 'pendente', tipo: null },
    c(3, '14:00', 'Boa'),
  ]
  const d = dividirODia(tortas, ms('10:00'))
  ok('data ilegivel e descartada', d.total === 1, String(d.total))
  ok('e a boa sobrevive', d.aindaHoje[0]?.nome === 'Boa')

  ok('lista vazia nao quebra', dividirODia([], ms('10:00')).total === 0)

  // Status que o app nunca viu (armadilha 10): nao entra, e nao derruba.
  const novo = [{ ...c(1, '14:00', 'Z'), status: 'reagendada_pelo_paciente' }]
  ok('status desconhecido fica de fora', dividirODia(novo, ms('10:00')).total === 0)
}

/* == O RESUMO DO ALTO DA TELA =========================================== */
{
  console.log('\n10. a frase')
  ok('dia vazio', resumoDaAgenda(dividirODia([], ms('10:00'))) === 'Nenhuma consulta marcada para hoje')

  const cedo = resumoDaAgenda(dividirODia(DIA, ms('07:00')))
  ok('antes de comecar conta o total', cedo === '5 consultas hoje', cedo)

  const uma = resumoDaAgenda(dividirODia([c(1, '14:00', 'X')], ms('07:00')))
  ok('uma so fala no singular', uma === '1 consulta hoje', uma)

  const meio = resumoDaAgenda(dividirODia(DIA, ms('14:20')))
  ok('no meio diz o quanto andou', meio === '2 de 5 já passaram', meio)

  const fim = resumoDaAgenda(dividirODia(DIA, ms('20:00')))
  ok('no fim do dia', fim === 'As 5 consultas de hoje já passaram', fim)

  const fimDeUma = resumoDaAgenda(dividirODia([c(1, '09:00', 'X')], ms('20:00')))
  ok('fim do dia com uma so', fimDeUma === 'A consulta de hoje já passou', fimDeUma)

  /* NUNCA diz "nada para fazer": dia sem consulta e dia de trabalho igual, e o
     app nao sabe o que ela tem pela frente. */
  const todas = [resumoDaAgenda(dividirODia([], ms('10:00'))), cedo, meio, fim]
  ok('nenhuma frase inventa folga', todas.every(f => !/folga|livre|nada para|descans/i.test(f)))
}

/* == O RELOGIO NA TELA ================================================== */
{
  console.log('\n11. hhmm')
  ok('hora com zero a esquerda', hhmm(T('09:05')) === '09:05', hhmm(T('09:05')))
  ok('hora cheia', hhmm(T('14:00')) === '14:00', hhmm(T('14:00')))
  ok('data invalida vira vazio', hhmm('xxx') === '')
  ok('vazio vira vazio', hhmm('') === '')
}

/* ──── A CONTAGEM DO HERÓI ────
 * É a única frase da tela Hoje que muda sozinha enquanto ela olha, e a que
 * mais tem como sair torta: relógio que passou, data que não parseia, consulta
 * de amanhã. */
{
  const AGORA = Date.parse('2026-09-09T13:42:00-03:00')
  const daqui = (min: number) => new Date(AGORA + min * 60000).toISOString()

  ok('18 minutos', emQuanto(daqui(18), AGORA) === 'em 18 min')
  ok('1 minuto', emQuanto(daqui(1), AGORA) === 'em 1 min')
  ok('59 minutos ainda é minuto', emQuanto(daqui(59), AGORA) === 'em 59 min')
  ok('60 minutos vira hora redonda', emQuanto(daqui(60), AGORA) === 'em 1h')
  ok('130 minutos vira 2h10', emQuanto(daqui(130), AGORA) === 'em 2h10')
  ok('125 minutos zera à esquerda', emQuanto(daqui(125), AGORA) === 'em 2h05')
  ok('120 minutos não vira 2h00', emQuanto(daqui(120), AGORA) === 'em 2h')

  /* O caso que acontece sozinho: a tela fica aberta e a consulta começa. */
  ok('exatamente agora', emQuanto(daqui(0), AGORA) === 'agora')
  ok('cinco minutos ATRÁS não vira "em -5 min"', emQuanto(daqui(-5), AGORA) === 'agora')
  ok('ontem também é agora, e não negativo', emQuanto(daqui(-2000), AGORA) === 'agora')

  /* Noutro dia a contagem não ajuda: "em 1512 min" é aritmética, não resposta. */
  ok('amanhã devolve vazio', emQuanto(daqui(60 * 25), AGORA) === '')
  ok('24h em ponto ainda conta', emQuanto(daqui(60 * 24), AGORA) === 'em 24h')

  /* `NaN !== null` é verdadeiro, e foi assim que uma caloria NaN passou o
     guarda neste app. Aqui a data torta não pode virar "em NaN min". */
  ok('data que não parseia devolve vazio', emQuanto('amanhã de tarde', AGORA) === '')
  ok('vazio devolve vazio', emQuanto('', AGORA) === '')
  for (const lixo of ['amanhã de tarde', '', 'null', '2026-13-45T99:99']) {
    const r = emQuanto(lixo, AGORA)
    ok('sem podridão em "' + lixo + '"', r === '' && !/NaN|undefined|Infinity/.test(r))
  }
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
