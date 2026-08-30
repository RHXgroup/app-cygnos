import {
  compararAntesDaMenstruacao,
  duracoes,
  faseDoDia,
  situacaoDoCiclo,
  type Ciclo,
  type DiaDoDiario,
} from './cicloDaPessoa.ts'

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

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\n1. sem registro nenhum, o app diz que não sabe')

{
  const s = situacaoDoCiclo([], '2026-08-30')
  ok('dia do ciclo é null', s.diaDoCiclo === null)
  ok('fase é null', s.fase === null)
  ok('duração típica é null', s.duracaoTipica === null)
  ok('não prevê nada', s.proximaPrevista === null)
  ok('não chama de irregular', s.irregular === false)
  ok('não inventa atraso', s.atrasoEmDias === null)
}

console.log('\n2. um registro só: sabe o dia, não prevê')

{
  const s = situacaoDoCiclo([c('2026-08-25')], '2026-08-30')
  ok('dia 6 do ciclo', s.diaDoCiclo === 6, String(s.diaDoCiclo))
  ok('sem duração típica', s.duracaoTipica === null)
  ok('sem previsão', s.proximaPrevista === null)
  /* Um registro só não permite dizer folicular, lútea nem nada — mas ela
     ESTAVA menstruada nos primeiros dias, e isso ela observou. */
  ok('fase null fora do fluxo', s.fase === null, String(s.fase))
}

{
  const s = situacaoDoCiclo([c('2026-08-28')], '2026-08-30')
  ok('dentro do fluxo padrão, diz menstrual', s.fase === 'menstrual')
}

console.log('\n3. o primeiro dia é 1, e não 0')

{
  const s = situacaoDoCiclo([c('2026-08-30')], '2026-08-30')
  ok('mesmo dia é dia 1', s.diaDoCiclo === 1, String(s.diaDoCiclo))
}

console.log('\n4. nada de 28 dias por omissão')

{
  /* Ciclos de 34 dias. Prever com 28 erraria seis dias e chamaria isso de
     previsão — é o defeito que este arquivo existe para não ter. */
  const ciclos = [c('2026-05-04'), c('2026-06-07'), c('2026-07-11')]
  const s = situacaoDoCiclo(ciclos, '2026-07-20')
  ok('duração típica 34', s.duracaoTipica === 34, String(s.duracaoTipica))
  ok('próxima em 14/08 e não em 08/08', s.proximaPrevista === '2026-08-14', String(s.proximaPrevista))
}

console.log('\n5. mediana e não média')

{
  /* Um mês em que ela esqueceu de registrar: o intervalo sai dobrado. A média
     de (28, 28, 56) é 37; a mediana é 28. */
  const ciclos = [c('2026-01-01'), c('2026-01-29'), c('2026-02-26'), c('2026-04-23')]
  const ds = duracoes(ciclos)
  ok('o intervalo de 56 dias é descartado por ser impossível', ds.every(d => d <= 45), ds.join(','))
  const s = situacaoDoCiclo(ciclos, '2026-04-25')
  ok('duração típica continua 28', s.duracaoTipica === 28, String(s.duracaoTipica))
}

{
  /* Dentro da faixa possível, a mediana ainda protege do valor solto:
     (26, 27, 28, 29, 44) tem média 30,8 e mediana 28. */
  const ciclos = [
    c('2026-01-01'), c('2026-01-27'), c('2026-02-23'),
    c('2026-03-23'), c('2026-04-21'), c('2026-06-04'),
  ]
  ok('mediana 28, não a média 30', situacaoDoCiclo(ciclos, '2026-06-05').duracaoTipica === 28,
    String(situacaoDoCiclo(ciclos, '2026-06-05').duracaoTipica))
}

console.log('\n6. ciclo irregular não ganha previsão')

{
  /* 22, 34 e 26 dias: 12 de variação, acima do limite de 9. */
  const ciclos = [c('2026-04-01'), c('2026-04-23'), c('2026-05-27'), c('2026-06-22')]
  const s = situacaoDoCiclo(ciclos, '2026-06-30')
  ok('marcado como irregular', s.irregular === true)
  ok('nenhuma data prevista', s.proximaPrevista === null)
  ok('e nenhum atraso, que só existiria contra uma previsão', s.atrasoEmDias === null)
}

{
  /* 27, 29, 28: 2 de variação. Regular. */
  const ciclos = [c('2026-04-01'), c('2026-04-28'), c('2026-05-27'), c('2026-06-24')]
  const s = situacaoDoCiclo(ciclos, '2026-06-30')
  ok('variação pequena não vira irregular', s.irregular === false)
  ok('e a previsão sai', s.proximaPrevista === '2026-07-22', String(s.proximaPrevista))
}

console.log('\n7. atraso')

{
  const ciclos = [c('2026-05-01'), c('2026-05-29'), c('2026-06-26')]
  const antes = situacaoDoCiclo(ciclos, '2026-07-20')
  ok('antes da data prevista, atraso é null', antes.atrasoEmDias === null, String(antes.atrasoEmDias))

  const noDia = situacaoDoCiclo(ciclos, '2026-07-24')
  ok('no dia previsto ainda não é atraso', noDia.atrasoEmDias === null, String(noDia.atrasoEmDias))

  const depois = situacaoDoCiclo(ciclos, '2026-07-27')
  ok('três dias depois, atraso 3', depois.atrasoEmDias === 3, String(depois.atrasoEmDias))
}

console.log('\n8. a fase é contada DE TRÁS para a frente')

{
  /* Ciclo de 35 dias. Contar para a frente poria a ovulação no dia 14; a
     fisiologia põe perto de 14 dias ANTES da próxima, ou seja, no dia 21. */
  ok('dia 14 de um ciclo de 35 é folicular', faseDoDia(14, 35, 5) === 'folicular',
    String(faseDoDia(14, 35, 5)))
  ok('dia 21 de um ciclo de 35 é ovulatória', faseDoDia(21, 35, 5) === 'ovulatoria',
    String(faseDoDia(21, 35, 5)))
  ok('dia 30 de um ciclo de 35 é lútea', faseDoDia(30, 35, 5) === 'lutea')

  /* No de 28 as duas contas coincidem, e é por isso que o erro passa despercebido
     em quem tem ciclo médio. */
  ok('dia 14 de um ciclo de 28 é ovulatória', faseDoDia(14, 28, 5) === 'ovulatoria')
}

{
  ok('dia 1 é menstrual', faseDoDia(1, 28, 5) === 'menstrual')
  ok('último dia do fluxo ainda é menstrual', faseDoDia(5, 28, 5) === 'menstrual')
  ok('o seguinte não é mais', faseDoDia(6, 28, 5) !== 'menstrual')
  ok('fluxo de 7 dias estende o rótulo', faseDoDia(7, 28, 7) === 'menstrual')
  /* Fluxo zero não existe, e um registro com fim igual ao começo daria 1. */
  ok('fluxo 0 ainda considera o dia 1 menstrual', faseDoDia(1, 28, 0) === 'menstrual')
}

{
  ok('sem duração conhecida, só a menstrual é afirmada', faseDoDia(10, null, 5) === null)
  ok('e a menstrual continua valendo', faseDoDia(2, null, 5) === 'menstrual')
}

console.log('\n9. o fim do fluxo, quando ela registra')

{
  const s = situacaoDoCiclo([c('2026-08-25', '2026-08-27')], '2026-08-28')
  ok('fluxo de 3 dias: o dia 4 não é mais menstrual', s.fase !== 'menstrual', String(s.fase))

  const dentro = situacaoDoCiclo([c('2026-08-25', '2026-08-27')], '2026-08-27')
  ok('o dia 3 ainda é', dentro.fase === 'menstrual')
}

console.log('\n10. entrada torta não derruba nem envenena a média')

{
  const sujos: Ciclo[] = [
    c('2026-08-25'),
    c('nao é data'),
    c('25/08/2026'),
    c(''),
    c('2026-8-5'),
    c('2026-08-25T10:00:00Z'),
  ]
  const s = situacaoDoCiclo(sujos, '2026-08-30')
  ok('sobrevive ao lixo', s.diaDoCiclo === 6, String(s.diaDoCiclo))
  ok('e não tira duração de nada', s.duracaoTipica === null)
}

{
  /* Ano trocado no dedo: 2025 no lugar de 2026. O intervalo dá 358 dias e cai
     fora da faixa possível, então não entra na mediana. */
  const ciclos = [c('2025-09-01'), c('2026-08-25'), c('2026-09-22')]
  const ds = duracoes(ciclos)
  ok('o ano errado não vira ciclo', ds.length === 1 && ds[0] === 28, ds.join(','))
}

{
  /* Duas anotações no mesmo dia: intervalo zero, abaixo do mínimo. */
  const ds = duracoes([c('2026-08-01'), c('2026-08-01'), c('2026-08-29')])
  ok('registro duplicado não vira ciclo de 0 dia', ds.length === 1 && ds[0] === 28, ds.join(','))
}

{
  const ds = duracoes([c('2026-08-29'), c('2026-08-01'), c('2026-07-04')])
  ok('a ordem em que chega não importa', ds.length === 2 && ds.every(d => d === 28), ds.join(','))
}

console.log('\n11. data no futuro não conta como início')

{
  /* O aparelho com o relógio adiantado, ou o dedo no mês seguinte. Sem o
     filtro, o "último ciclo" seria o de setembro e o dia do ciclo sairia
     negativo. */
  const s = situacaoDoCiclo([c('2026-08-25'), c('2026-09-20')], '2026-08-30')
  ok('o futuro é ignorado', s.diaDoCiclo === 6, String(s.diaDoCiclo))
  ok('e o dia nunca é negativo', (s.diaDoCiclo ?? 1) > 0)
}

console.log('\n12. datas que só existem no calendário')

{
  /* 2028 é bissexto. Fevereiro tem 29, e a conta tem de atravessar isso. */
  ok('atravessa 29 de fevereiro', duracoes([c('2028-02-05'), c('2028-03-04')])[0] === 28,
    String(duracoes([c('2028-02-05'), c('2028-03-04')])[0]))
  ok('atravessa a virada do ano', duracoes([c('2026-12-20'), c('2027-01-17')])[0] === 28)
  /* 2027 NÃO é bissexto: 05/02 + 28 cai em 05/03. */
  ok('ano comum conta certo', duracoes([c('2027-02-05'), c('2027-03-05')])[0] === 28)
}

{
  /* Horário de verão foi extinto no Brasil, mas o aparelho pode estar em
     qualquer fuso. As contas usam meia-noite UTC justamente para o dia não
     escorregar. */
  const s = situacaoDoCiclo([c('2026-10-17')], '2026-10-19')
  ok('mudança de fuso não move o dia do ciclo', s.diaDoCiclo === 3, String(s.diaDoCiclo))
}

console.log('\n13. o cruzamento com o diário')

{
  /* Dois ciclos de 28 dias, com o diário preenchido todo dia. Nos quatro dias
     antes de cada menstruação ela comeu 2500; no resto, 2000. */
  const ciclos = [c('2026-06-01'), c('2026-06-29'), c('2026-07-27')]
  const diario: DiaDoDiario[] = []
  for (let i = 0; i < 56; i++) {
    const d = new Date(Date.parse('2026-06-01T00:00:00Z') + i * 86400000)
      .toISOString()
      .slice(0, 10)
    const noFim = i % 28 >= 24
    diario.push({ data: d, calorias: noFim ? 2500 : 2000 })
  }

  const r = compararAntesDaMenstruacao(ciclos, diario)
  ok('comparou dois ciclos', r.ciclosComparados === 2, String(r.ciclosComparados))
  ok('média nos dias antes é 2500', r.mediaNosDiasAntes === 2500, String(r.mediaNosDiasAntes))
  ok('média no resto é 2000', r.mediaNoResto === 2000, String(r.mediaNoResto))
  ok('diz quantos dias antes considerou', r.diasAntes === 4)
}

{
  /* Ciclo quase sem nada anotado não entra: dois dias não sustentam uma média. */
  const ciclos = [c('2026-06-01'), c('2026-06-29')]
  const diario: DiaDoDiario[] = [
    { data: '2026-06-02', calorias: 2000 },
    { data: '2026-06-27', calorias: 3000 },
  ]
  const r = compararAntesDaMenstruacao(ciclos, diario)
  ok('ciclo com dois dias anotados não entra', r.ciclosComparados === 0)
  ok('e nenhuma média sai do vazio', r.mediaNosDiasAntes === null && r.mediaNoResto === null)
}

{
  /* Sem ciclo nenhum não há o que comparar, e a função não pode explodir. */
  const r = compararAntesDaMenstruacao([], [])
  ok('sem dado nenhum devolve nulos', r.mediaNosDiasAntes === null && r.mediaNoResto === null)
  ok('e zero ciclos', r.ciclosComparados === 0)
}

{
  /* O diário de OUTRO período não pode vazar para dentro do ciclo. */
  const ciclos = [c('2026-06-01'), c('2026-06-29')]
  const diario: DiaDoDiario[] = []
  for (let i = 0; i < 28; i++) {
    const d = new Date(Date.parse('2026-06-01T00:00:00Z') + i * 86400000)
      .toISOString()
      .slice(0, 10)
    diario.push({ data: d, calorias: 2000 })
  }
  diario.push({ data: '2026-05-15', calorias: 9999 })
  diario.push({ data: '2026-06-29', calorias: 9999 })
  const r = compararAntesDaMenstruacao(ciclos, diario)
  ok('o dia anterior ao ciclo fica de fora', r.mediaNoResto === 2000, String(r.mediaNoResto))
  ok('e o primeiro dia do ciclo seguinte também', r.mediaNosDiasAntes === 2000,
    String(r.mediaNosDiasAntes))
}

{
  /* Intervalo impossível entre dois começos: aquele trecho não vira comparação,
     mesmo com diário cheio. */
  const ciclos = [c('2025-06-01'), c('2026-06-29')]
  const diario: DiaDoDiario[] = []
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.parse('2026-05-15T00:00:00Z') + i * 86400000)
      .toISOString()
      .slice(0, 10)
    diario.push({ data: d, calorias: 2000 })
  }
  ok('intervalo de um ano não vira ciclo comparável',
    compararAntesDaMenstruacao(ciclos, diario).ciclosComparados === 0)
}

console.log('\n14. números que não são números')

{
  const diario = [
    { data: '2026-06-02', calorias: Number.NaN },
    { data: '2026-06-03', calorias: 2000 },
    { data: '2026-06-04', calorias: 2000 },
    { data: '2026-06-05', calorias: 2000 },
    { data: '2026-06-25', calorias: 2000 },
    { data: '2026-06-26', calorias: 2000 },
    { data: '2026-06-27', calorias: 2000 },
  ]
  const r = compararAntesDaMenstruacao([c('2026-06-01'), c('2026-06-29')], diario)
  /* Um NaN contamina a soma inteira. Isto está aqui para DOCUMENTAR que a
     limpeza é de quem monta o diário, e não desta função — se um dia a média
     sair NaN na tela, o teste diz onde procurar. */
  ok('NaN no diário contamina a média do resto',
    r.mediaNoResto === null || Number.isNaN(r.mediaNoResto),
    String(r.mediaNoResto))
  ok('e não derruba a comparação', r.ciclosComparados === 1)
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
