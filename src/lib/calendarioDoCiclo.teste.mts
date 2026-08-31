import {
  diasMenstruada,
  fluxoAindaEsperado,
  diasNoMes,
  diasPrevistos,
  marcaDoDia,
  mesDe,
  mesVizinho,
  podeAvancar,
  primeiroDiaDaSemana,
  formaNaFaixa,
  somandoDias,
} from './calendarioDoCiclo.ts'
import type { Ciclo } from './cicloDaPessoa.ts'

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

const c = (comecou: string, terminou: string | null = null): Ciclo => ({ comecou, terminou })

console.log('\n1. quantos dias cada mês tem')

{
  ok('janeiro 31', diasNoMes(2026, 1) === 31)
  ok('abril 30', diasNoMes(2026, 4) === 30)
  ok('fevereiro comum 28', diasNoMes(2026, 2) === 28, String(diasNoMes(2026, 2)))
  ok('fevereiro bissexto 29', diasNoMes(2028, 2) === 29, String(diasNoMes(2028, 2)))
  /* 2100 NÃO é bissexto: divisível por 100 e não por 400. É a regra que quase
     todo cálculo escrito à mão erra. */
  ok('2100 não é bissexto', diasNoMes(2100, 2) === 28, String(diasNoMes(2100, 2)))
  ok('2000 é bissexto', diasNoMes(2000, 2) === 29)
  ok('dezembro 31', diasNoMes(2026, 12) === 31)
}

console.log('\n2. em que dia da semana o mês começa')

{
  /* 1º de agosto de 2026 é um sábado (6). 1º de fevereiro de 2026, domingo (0). */
  ok('agosto/2026 começa no sábado', primeiroDiaDaSemana(2026, 8) === 6,
    String(primeiroDiaDaSemana(2026, 8)))
  ok('fevereiro/2026 começa no domingo', primeiroDiaDaSemana(2026, 2) === 0,
    String(primeiroDiaDaSemana(2026, 2)))
  ok('março/2028 depois do bissexto', primeiroDiaDaSemana(2028, 3) === 3,
    String(primeiroDiaDaSemana(2028, 3)))
}

console.log('\n3. o mês montado')

{
  const m = mesDe(2026, 8, '2026-08-31')
  ok('31 dias', m.length === 31)
  ok('o primeiro é 01', m[0].data === '2026-08-01' && m[0].dia === 1)
  ok('o último é 31', m[30].data === '2026-08-31')
  ok('hoje está marcado', m[30].ehHoje === true)
  ok('e só ele', m.filter(d => d.ehHoje).length === 1)
  ok('nenhum futuro em agosto quando hoje é 31/08', m.every(d => !d.futuro))
}

{
  const m = mesDe(2026, 8, '2026-08-15')
  ok('dia 16 é futuro', m[15].futuro === true)
  ok('dia 15 não é', m[14].futuro === false)
  ok('dia 14 não é', m[13].futuro === false)
  ok('dezesseis dias de futuro', m.filter(d => d.futuro).length === 16)
}

{
  /* Mês inteiro no passado: nada é futuro. Mês inteiro no futuro: tudo é. */
  ok('mês passado inteiro', mesDe(2026, 7, '2026-08-15').every(d => !d.futuro))
  ok('mês que vem inteiro', mesDe(2026, 9, '2026-08-15').every(d => d.futuro))
}

{
  const m = mesDe(2026, 2, '2026-08-15')
  ok('fevereiro tem 28 e para no 28', m.length === 28 && m[27].data === '2026-02-28')
  const b = mesDe(2028, 2, '2028-08-15')
  ok('fevereiro bissexto vai ao 29', b.length === 29 && b[28].data === '2028-02-29')
}

{
  /* Zero à esquerda: '2026-8-1' ordenaria errado e nunca casaria com o ISO do
     banco. É o defeito que faria o dia inteiro parecer vazio. */
  const m = mesDe(2026, 8, '2026-08-01')
  ok('mês com dois dígitos', m[0].data === '2026-08-01')
  ok('dia com dois dígitos', m[8].data === '2026-08-09')
}

console.log('\n4. somar dias atravessa mês, ano e fevereiro')

{
  ok('dentro do mês', somandoDias('2026-08-10', 5) === '2026-08-15')
  ok('vira o mês', somandoDias('2026-08-30', 3) === '2026-09-02')
  ok('vira o ano', somandoDias('2026-12-30', 3) === '2027-01-02')
  ok('atravessa 29/02', somandoDias('2028-02-27', 3) === '2028-03-01',
    somandoDias('2028-02-27', 3))
  ok('ano comum pula o 29', somandoDias('2027-02-27', 3) === '2027-03-02')
  ok('para trás', somandoDias('2026-01-02', -3) === '2025-12-30')
}

console.log('\n5. os dias em que ela estava menstruada')

{
  const d = diasMenstruada([c('2026-08-10', '2026-08-14')])
  ok('cinco dias', d.size === 5, String(d.size))
  ok('o primeiro entra', d.has('2026-08-10'))
  ok('o último entra', d.has('2026-08-14'))
  ok('o seguinte não', !d.has('2026-08-15'))
  ok('o anterior não', !d.has('2026-08-09'))
}

{
  /* Sem fim marcado, pinta os cinco dias de fluxo.
     Já pintou UM, com o argumento de que cinco mostraria como fato o que ela não
     disse. O argumento estava certo e o calendário estava errado: quase ninguém
     volta para marcar o fim, então na prática TODO ciclo virava um quadradinho
     solto — parecia que ela menstruou cinco vezes por um dia. */
  const d = diasMenstruada([c('2026-08-10')])
  ok('sem fim, pinta os cinco', d.size === 5, String(d.size))
  ok('do começo', d.has('2026-08-10'))
  ok('ao quinto dia', d.has('2026-08-14'))
  ok('e não o sexto', !d.has('2026-08-15'))
}

{
  /* A honestidade fica no `hoje`: o que ainda não aconteceu não vira faixa
     cheia. O resto sai por `fluxoAindaEsperado`, no tom fraco. */
  const d = diasMenstruada([c('2026-08-10')], '2026-08-12')
  ok('nada além de hoje', d.size === 3, String(d.size))
  ok('hoje entra', d.has('2026-08-12'))
  ok('amanhã não', !d.has('2026-08-13'))
}

{
  /* O tamanho informado por ela chega até o desenho. Sem isto, quem respondeu
     "6 dias" via uma faixa de 5: o número dela mudava a previsão e não mudava o
     calendário, e não havia como ligar uma coisa à outra. */
  const seis = diasMenstruada([c('2026-08-10')], undefined, 6)
  ok('fluxo informado de 6 pinta seis', seis.size === 6, String(seis.size))
  ok('e vai até o dia 15', seis.has('2026-08-15'))
  ok('resto do fluxo também respeita o 6',
    fluxoAindaEsperado([c('2026-08-10')], '2026-08-12', 6).size === 3)
  ok('e o previsto também',
    diasPrevistos('2026-09-10', [c('2026-08-10')], 6).size === 6)

  /* Valor absurdo não desenha faixa de trezentos dias. Ele já é recusado em
     `situacaoDoCiclo`, mas chamada antiga e teste também chegam aqui. */
  ok('300 dias é aparado', diasMenstruada([c('2026-08-10')], undefined, 300).size === 15)
  ok('zero vira um', diasMenstruada([c('2026-08-10')], undefined, 0).size === 1)
  ok('NaN cai no padrão', diasMenstruada([c('2026-08-10')], undefined, NaN).size === 5)
}

{
  const f = fluxoAindaEsperado([c('2026-08-10')], '2026-08-12')
  ok('o que falta do fluxo são dois dias', f.size === 2, String(f.size))
  ok('amanhã', f.has('2026-08-13'))
  ok('e depois', f.has('2026-08-14'))
  ok('sem repetir o que já passou', !f.has('2026-08-12'))

  /* Ciclo com fim marcado não tem "resto esperado": ela já disse quando acabou,
     e o app não discute com ela. */
  ok('com fim marcado não sobra nada',
    fluxoAindaEsperado([c('2026-08-10', '2026-08-11')], '2026-08-12').size === 0)
  /* Fluxo já terminado não deixa resto, e o começo no futuro não conta. */
  ok('fluxo vencido não sobra nada',
    fluxoAindaEsperado([c('2026-08-10')], '2026-08-30').size === 0)
  ok('começo no futuro é ignorado',
    fluxoAindaEsperado([c('2026-09-10')], '2026-08-30').size === 0)
  ok('sem ciclo nenhum', fluxoAindaEsperado([], '2026-08-30').size === 0)
  ok('hoje inválido não estoura', fluxoAindaEsperado([c('2026-08-10')], 'lixo').size === 0)
}

{
  ok('começo e fim no mesmo dia conta um', diasMenstruada([c('2026-08-10', '2026-08-10')]).size === 1)
  /* Fim impossível cai na regra do "sem fim", que agora são cinco dias. O que
     importa aqui é que ele não pinta de agosto a maio. */
  ok('fim ANTES do começo é tratado como sem fim',
    diasMenstruada([c('2026-08-10', '2026-08-01')]).size === 5)
  ok('data inválida é ignorada', diasMenstruada([c('nao é data', '2026-08-14')]).size === 0)
  ok('fim inválido vira sem fim', diasMenstruada([c('2026-08-10', 'lixo')]).size === 5)
  ok('lista vazia', diasMenstruada([]).size === 0)
}

{
  /* Fim com o mês errado: sem o teto, seriam centenas de dias pintados e o laço
     percorreria todos. */
  const d = diasMenstruada([c('2026-08-10', '2027-08-14')])
  ok('fim absurdo é limitado a 31 dias', d.size === 31, String(d.size))
}

{
  const d = diasMenstruada([c('2026-08-29', '2026-09-02')])
  ok('atravessa a virada do mês', d.size === 5 && d.has('2026-09-01') && d.has('2026-09-02'))
  const a = diasMenstruada([c('2026-12-30', '2027-01-02')])
  ok('atravessa a virada do ano', a.size === 4 && a.has('2027-01-01'))
}

console.log('\n6. os dias previstos')

{
  /* A duração pintada é a MEDIANA dos fluxos registrados: (4, 5, 6) -> 5. */
  const ciclos = [
    c('2026-05-01', '2026-05-04'),
    c('2026-05-29', '2026-06-02'),
    c('2026-06-26', '2026-07-01'),
  ]
  const p = diasPrevistos('2026-07-24', ciclos)
  ok('pinta a mediana dos fluxos', p.size === 5, String(p.size))
  ok('começa na data prevista', p.has('2026-07-24'))
  ok('e termina no quinto', p.has('2026-07-28') && !p.has('2026-07-29'))
}

{
  /* Ela nunca marcou fim: cinco é a duração mais comum, e o único chute que
     este arquivo faz — sobre PINTURA, não sobre data. */
  const p = diasPrevistos('2026-07-24', [c('2026-05-01'), c('2026-05-29')])
  ok('sem fim registrado, pinta cinco', p.size === 5)
}

{
  ok('sem previsão não pinta nada', diasPrevistos(null, []).size === 0)
  ok('previsão inválida não pinta', diasPrevistos('amanhã', []).size === 0)
  ok('previsão vazia não pinta', diasPrevistos('', []).size === 0)
}

{
  /* Fluxo impossível (20 dias) não entra na mediana. */
  const p = diasPrevistos('2026-07-24', [
    c('2026-05-01', '2026-05-21'),
    c('2026-05-29', '2026-06-01'),
    c('2026-06-26', '2026-06-29'),
  ])
  ok('fluxo de 20 dias é descartado da mediana', p.size === 4, String(p.size))
}

{
  const p = diasPrevistos('2026-12-30', [c('2026-05-01', '2026-05-04')])
  ok('previsão atravessa o ano', p.has('2027-01-01') && p.has('2027-01-02'))
}

console.log('\n7. o que ela registrou vence o que o app previu')

{
  const menstruada = new Set(['2026-08-10'])
  const previstos = new Set(['2026-08-10', '2026-08-11'])
  const anotados = new Set(['2026-08-10', '2026-08-12'])

  ok('registrado ganha do previsto', marcaDoDia('2026-08-10', menstruada, previstos, anotados) === 'menstruada')
  ok('previsto ganha da anotação', marcaDoDia('2026-08-11', menstruada, previstos, anotados) === 'previsto')
  ok('anotação sozinha aparece', marcaDoDia('2026-08-12', menstruada, previstos, anotados) === 'anotado')
  ok('dia sem nada', marcaDoDia('2026-08-20', menstruada, previstos, anotados) === 'nada')
}

console.log('\n8. navegar entre meses')

{
  ok('agosto -> setembro', JSON.stringify(mesVizinho(2026, 8, 1)) === '{"ano":2026,"mes":9}')
  ok('agosto -> julho', JSON.stringify(mesVizinho(2026, 8, -1)) === '{"ano":2026,"mes":7}')
  ok('dezembro -> janeiro do ano seguinte',
    JSON.stringify(mesVizinho(2026, 12, 1)) === '{"ano":2027,"mes":1}',
    JSON.stringify(mesVizinho(2026, 12, 1)))
  ok('janeiro -> dezembro do ano anterior',
    JSON.stringify(mesVizinho(2026, 1, -1)) === '{"ano":2025,"mes":12}',
    JSON.stringify(mesVizinho(2026, 1, -1)))
}

{
  /* Doze passos para a frente têm de voltar ao mesmo mês, um ano depois. É o
     teste que pega erro de módulo, que é onde essa conta sempre quebra. */
  let a = 2026
  let m = 3
  for (let i = 0; i < 12; i++) ({ ano: a, mes: m } = mesVizinho(a, m, 1))
  ok('doze passos à frente dão um ano', a === 2027 && m === 3, `${a}-${m}`)

  let b = 2026
  let n = 3
  for (let i = 0; i < 12; i++) ({ ano: b, mes: n } = mesVizinho(b, n, -1))
  ok('doze passos atrás dão um ano', b === 2025 && n === 3, `${b}-${n}`)
}

console.log('\n9. até onde dá para avançar')

{
  ok('o mês de hoje pode avançar', podeAvancar(2026, 8, '2026-08-15') === true)
  ok('o mês que vem não', podeAvancar(2026, 9, '2026-08-15') === false)
  ok('o passado pode', podeAvancar(2026, 1, '2026-08-15') === true)
  /* A virada do ano: dezembro de hoje pode ir a janeiro, e janeiro para. */
  ok('dezembro pode ir a janeiro', podeAvancar(2026, 12, '2026-12-20') === true)
  ok('janeiro seguinte para', podeAvancar(2027, 1, '2026-12-20') === false)
}


console.log('\n10. a faixa contínua')

{
  const marcados = new Set(['2026-08-10', '2026-08-11', '2026-08-12'])
  ok('o primeiro abre', formaNaFaixa('2026-08-10', marcados) === 'inicio', formaNaFaixa('2026-08-10', marcados))
  ok('o do meio é reto', formaNaFaixa('2026-08-11', marcados) === 'meio')
  ok('o último fecha', formaNaFaixa('2026-08-12', marcados) === 'fim')
}

{
  ok('dia solto é sozinho', formaNaFaixa('2026-08-10', new Set(['2026-08-10'])) === 'sozinho')
  ok('dois dias: abre e fecha',
    formaNaFaixa('2026-08-10', new Set(['2026-08-10', '2026-08-11'])) === 'inicio' &&
    formaNaFaixa('2026-08-11', new Set(['2026-08-10', '2026-08-11'])) === 'fim')
}

{
  /* 2026-08-29 é SÁBADO e 2026-08-30 é DOMINGO. Eles são vizinhos no
     calendário e ficam em pontas OPOSTAS da grade — a faixa não pode
     atravessar a borda, senão ela sai da tela de um lado e reaparece do outro
     como se fosse contínua. */
  const marcados = new Set(['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31'])
  ok('sábado fecha à direita', formaNaFaixa('2026-08-29', marcados) === 'fim',
    formaNaFaixa('2026-08-29', marcados))
  ok('domingo abre à esquerda', formaNaFaixa('2026-08-30', marcados) === 'inicio',
    formaNaFaixa('2026-08-30', marcados))
  ok('a sexta antes continua abrindo', formaNaFaixa('2026-08-28', marcados) === 'inicio')
  ok('a segunda depois fecha', formaNaFaixa('2026-08-31', marcados) === 'fim')
}

{
  /* Um sábado sozinho no meio de uma sequência que continua no domingo é
     'sozinho' pelos dois lados quando não há sexta. */
  ok('sábado com só o domingo marcado é sozinho',
    formaNaFaixa('2026-08-29', new Set(['2026-08-29', '2026-08-30'])) === 'sozinho')
}

{
  /* Buraco no meio: dia 10 e dia 12 marcados, 11 não. Os dois são sozinhos. */
  const comBuraco = new Set(['2026-08-10', '2026-08-12'])
  ok('buraco separa a faixa', formaNaFaixa('2026-08-10', comBuraco) === 'sozinho' &&
    formaNaFaixa('2026-08-12', comBuraco) === 'sozinho')
}

{
  /* Atravessando o mês: 31/08 é segunda e 01/09 é terça. */
  const virada = new Set(['2026-08-31', '2026-09-01'])
  ok('a faixa atravessa o mês', formaNaFaixa('2026-08-31', virada) === 'inicio',
    formaNaFaixa('2026-08-31', virada))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
