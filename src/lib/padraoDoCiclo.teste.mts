import { avisoDaSemana, padraoAntesDaMenstruacao, type DiaAnotado, type Padrao } from './padraoDoCiclo.ts'
import type { Ciclo } from './cicloDaPessoa.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { passou++; console.log('  ok    ' + nome) }
  else { falhou++; console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : '')) }
}

const c = (comecou: string): Ciclo => ({ comecou, terminou: null })
const d = (
  data: string,
  sintomas: string[] = [],
  humor: string | null = null,
  desejoAlimentar: string[] = [],
): DiaAnotado => ({ data, sintomas, humor, desejoAlimentar })

/* Três ciclos de 28 dias: 01/06, 29/06, 27/07. */
const CICLOS = [c('2026-06-01'), c('2026-06-29'), c('2026-07-27')]

console.log('\n1. o padrão sai dos ciclos DELA')

{
  /* Cólica nos dias antes de 29/06 e de 27/07: dois ciclos. */
  const dias = [
    d('2026-06-27', ['cólica']),
    d('2026-07-25', ['cólica']),
  ]
  const p = padraoAntesDaMenstruacao(CICLOS, dias)
  ok('cólica virou padrão', p.some(x => x.o_que === 'cólica'), JSON.stringify(p))
  ok('em 2 de 2 ciclos comparáveis', p[0].em === 2 && p[0].de === 2, JSON.stringify(p[0]))
}

{
  /* UMA vez só não é padrão. Um sintoma que aconteceu uma vez é um dia ruim, e
     dizer "você fica assim" com base nisso ensina a não acreditar no aviso. */
  const p = padraoAntesDaMenstruacao(CICLOS, [d('2026-06-27', ['cólica']), d('2026-07-25', ['acne'])])
  ok('uma ocorrência não vira padrão', p.length === 0, JSON.stringify(p))
}

{
  /* Três dias de cólica no MESMO ciclo continuam sendo um ciclo. Contar
     ocorrências faria isso parecer três meses de cólica. */
  const dias = [
    d('2026-06-25', ['cólica']), d('2026-06-26', ['cólica']), d('2026-06-27', ['cólica']),
  ]
  ok('três dias no mesmo ciclo não viram padrão', padraoAntesDaMenstruacao(CICLOS, dias).length === 0)
}

console.log('\n2. a janela é medida de trás para a frente')

{
  /* Ciclo de 35 dias: 01/06 -> 06/07. A janela é 02 a 05/07, e não "do dia 24
     ao 28", que só valeria para ciclo de 28. */
  const ciclos = [c('2026-06-01'), c('2026-07-06'), c('2026-08-10')]
  const dias = [d('2026-07-03', ['inchaço']), d('2026-08-07', ['inchaço'])]
  const p = padraoAntesDaMenstruacao(ciclos, dias)
  ok('acha na janela do ciclo longo', p.some(x => x.o_que === 'inchaço'), JSON.stringify(p))
}

{
  /* Cinco dias antes fica FORA da janela de quatro. */
  const dias = [d('2026-06-24', ['cólica']), d('2026-07-22', ['cólica'])]
  ok('o quinto dia antes fica de fora', padraoAntesDaMenstruacao(CICLOS, dias).length === 0)
}

{
  /* O próprio dia do começo não é "antes". */
  const dias = [d('2026-06-29', ['cólica']), d('2026-07-27', ['cólica'])]
  ok('o dia do começo não conta como antes', padraoAntesDaMenstruacao(CICLOS, dias).length === 0)
}

console.log('\n3. o que NÃO conta como ciclo comparável')

{
  /* O primeiro começo não tem anterior: a "janela antes" dele é tempo sobre o
     qual não se sabe nada. */
  const p = padraoAntesDaMenstruacao([c('2026-06-01')], [d('2026-05-30', ['cólica'])])
  ok('sem ciclo anterior, não compara', p.length === 0)
}

{
  /* Intervalo impossível: 01/06 para 01/09 são 92 dias. */
  const ciclos = [c('2026-06-01'), c('2026-09-01'), c('2026-09-29')]
  const dias = [d('2026-08-30', ['cólica']), d('2026-09-27', ['cólica'])]
  const p = padraoAntesDaMenstruacao(ciclos, dias)
  ok('intervalo de 92 dias não vira ciclo comparável', p.length === 0, JSON.stringify(p))
}

{
  /* Ciclo em que ela não anotou nada não conta nem a favor nem contra:
     incluí-lo como "não teve" inventaria uma ausência. */
  const dias = [d('2026-06-27', ['cólica']), d('2026-07-25', ['cólica'])]
  const p = padraoAntesDaMenstruacao([...CICLOS, c('2026-08-24')], dias)
  ok('ciclo sem anotação não entra no denominador', p[0].de === 2, JSON.stringify(p[0]))
}

console.log('\n4. humor e vontade entram junto, com o texto legível')

{
  const dias = [
    d('2026-06-27', [], 'irritada', ['doce']),
    d('2026-07-25', [], 'irritada', ['doce']),
  ]
  const p = padraoAntesDaMenstruacao(CICLOS, dias)
  ok('o humor vira padrão legível', p.some(x => x.o_que === 'humor irritada'), JSON.stringify(p))
  ok('a vontade também', p.some(x => x.o_que === 'vontade de doce'))
}

{
  /* Ordenado do mais frequente para o menos. */
  const dias = [
    d('2026-06-27', ['cólica', 'inchaço']),
    d('2026-07-25', ['cólica']),
    d('2026-05-30', ['cólica', 'inchaço']),
  ]
  const ciclos = [c('2026-05-04'), ...CICLOS]
  const p = padraoAntesDaMenstruacao(ciclos, dias)
  ok('o mais frequente vem primeiro', p[0].o_que === 'cólica', JSON.stringify(p))
}

console.log('\n5. o que NUNCA entra')

{
  /* A função nem recebe os campos privados. Este teste guarda a decisão: se
     alguém acrescentar `relacao` ao tipo `DiaAnotado`, ele para de compilar
     antes de alguém escrever o aviso. */
  const chaves = Object.keys(d('2026-06-27'))
  ok('DiaAnotado não tem relacao', !chaves.includes('relacao'), chaves.join(','))
  ok('nem relacaoProtegida', !chaves.includes('relacaoProtegida'))
  ok('nem notaPrivada', !chaves.includes('notaPrivada'))
  ok('e nem observacao (é recado para a nutri, não sintoma)', !chaves.includes('observacao'))
}

console.log('\n6. o aviso da semana')

const P: Padrao[] = [
  { o_que: 'cólica', em: 3, de: 3 },
  { o_que: 'inchaço', em: 2, de: 3 },
]

{
  const a = avisoDaSemana('2026-09-01', false, P, '2026-08-28')
  ok('sai a 4 dias', a !== null)
  ok('diz quando', a?.texto.includes('daqui a 4 dias'), a?.texto)
  ok('diz quantos ciclos', a?.texto.includes('últimos 3 ciclos'), a?.texto)
  ok('e lista o que ela anotou', a?.texto.includes('cólica e inchaço'), a?.texto)
  /* "Você anotou", e não "você vai ter": o app relata, não prevê o corpo dela. */
  ok('relata, não prevê', a?.texto.includes('você anotou') && !a?.texto.includes('você vai'),
    a?.texto)
}

{
  ok('a 1 dia diz "amanhã"', avisoDaSemana('2026-09-01', false, P, '2026-08-31')?.texto.includes('amanhã'))
  ok('a 2 dias diz "em 2 dias"', avisoDaSemana('2026-09-01', false, P, '2026-08-30')?.texto.includes('em 2 dias'))
}

{
  ok('a 8 dias é cedo demais', avisoDaSemana('2026-09-01', false, P, '2026-08-24') === null)
  ok('a 7 dias ainda sai', avisoDaSemana('2026-09-01', false, P, '2026-08-25') !== null)
  /* No dia e depois ela já está vivendo o que o aviso ia dizer. */
  ok('no dia não sai', avisoDaSemana('2026-09-01', false, P, '2026-09-01') === null)
  ok('depois não sai', avisoDaSemana('2026-09-01', false, P, '2026-09-03') === null)
}

{
  /* Ciclo irregular não ganha aviso: a data em que ele se apoia não vale. */
  ok('irregular não avisa', avisoDaSemana('2026-09-01', true, P, '2026-08-28') === null)
  ok('sem previsão não avisa', avisoDaSemana(null, false, P, '2026-08-28') === null)
  ok('sem padrão não avisa', avisoDaSemana('2026-09-01', false, [], '2026-08-28') === null)
}

{
  /* Padrão fraco (1 de 3) não sustenta aviso. */
  const fraco: Padrao[] = [{ o_que: 'acne', em: 1, de: 3 }]
  ok('padrão de uma vez só não avisa', avisoDaSemana('2026-09-01', false, fraco, '2026-08-28') === null)
}

{
  /* Máximo três coisas na frase: uma lista de oito sintomas deixa de ser aviso
     e vira relatório, e ninguém lê relatório num cartão. */
  const muitos: Padrao[] = ['a','b','c','d','e'].map(o => ({ o_que: o, em: 3, de: 3 }))
  const a = avisoDaSemana('2026-09-01', false, muitos, '2026-08-28')
  /* Conta só dentro da LISTA. A frase inteira tem outra vírgula antes ("Nos
     seus últimos 3 ciclos, você anotou…"), e contá-la fazia o teste acusar
     sozinho — defeito do teste, não do código. */
  const lista = (a?.texto.split('você anotou ')[1] ?? '').split(' nos dias antes')[0]
  ok('no máximo três na lista', (lista.match(/,| e /g) ?? []).length <= 2, lista)
  ok('e são exatamente as três primeiras', lista === 'a, b e c', lista)
}

{
  ok('data inválida não derruba', avisoDaSemana('amanhã', false, P, '2026-08-28') === null)
  ok('hoje inválido não derruba', avisoDaSemana('2026-09-01', false, P, 'hoje') === null)
}

{
  /* Atravessando o mês e o ano. */
  ok('atravessa o mês', avisoDaSemana('2026-09-02', false, P, '2026-08-30')?.faltam === 3)
  ok('atravessa o ano', avisoDaSemana('2027-01-02', false, P, '2026-12-30')?.faltam === 3)
}

console.log('\n7. um caso inteiro, de ponta a ponta')

{
  const ciclos = [c('2026-06-01'), c('2026-06-29'), c('2026-07-27'), c('2026-08-24')]
  const dias = [
    d('2026-06-26', ['cólica'], 'irritada', ['doce']),
    d('2026-06-27', ['inchaço']),
    d('2026-07-24', ['cólica'], 'irritada', ['doce']),
    d('2026-08-21', ['cólica'], null, ['doce']),
  ]
  const p = padraoAntesDaMenstruacao(ciclos, dias)
  ok('cólica em 3 de 3', p.find(x => x.o_que === 'cólica')?.em === 3, JSON.stringify(p))
  ok('vontade de doce em 3 de 3', p.find(x => x.o_que === 'vontade de doce')?.em === 3)
  ok('inchaço em 1 não entra', !p.some(x => x.o_que === 'inchaço'), JSON.stringify(p))

  const a = avisoDaSemana('2026-09-21', false, p, '2026-09-18')
  ok('e o aviso sai completo', a !== null && a.texto.includes('cólica'), a?.texto)
  console.log('        ' + a?.texto)
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
