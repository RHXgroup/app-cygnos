import {
  compararMetades,
  dataCurta,
  diaCurto,
  hojeDoAparelho,
  janelaDeDias,
  maiorDaSerie,
  serieDiaria,
  tetoDoEixo,
  totalDaSerie,
} from './serieDoPainel.ts'

let falhas = 0
const ok = (cond: boolean, nome: string) => {
  console.log(cond ? '  ok    ' + nome : '  FALHOU ' + nome)
  if (!cond) falhas++
}

console.log('\nseries do painel\n')

/* ── janela ── */
{
  const j = janelaDeDias('2026-09-12', 7)
  ok(j.length === 7, 'sete dias')
  ok(j[6] === '2026-09-12', 'o ultimo e hoje')
  ok(j[0] === '2026-09-06', 'o primeiro e seis dias atras')
  ok(j.every((d, i) => i === 0 || d > j[i - 1]), 'em ordem crescente')
}
ok(janelaDeDias('2026-03-01', 3).join() === '2026-02-27,2026-02-28,2026-03-01', 'atravessa a virada de mes')
ok(janelaDeDias('2026-01-01', 2).join() === '2025-12-31,2026-01-01', 'atravessa a virada de ano')
ok(janelaDeDias('2028-03-01', 2).join() === '2028-02-29,2028-03-01', 'inclui 29 de fevereiro de ano bissexto')
ok(janelaDeDias('lixo', 7).length === 0, 'data invalida devolve vazio')
ok(janelaDeDias('2026-09-12', 0).length === 0, 'zero dias devolve vazio')
ok(janelaDeDias('2026-09-12', 5000).length === 400, 'janela absurda e limitada')

/* ── serie ── */
{
  const s = serieDiaria(
    [
      { dia: '2026-09-12', valor: 2 },
      { dia: '2026-09-12', valor: 3 },
      { dia: '2026-09-10', valor: 1 },
    ],
    '2026-09-12',
    3,
  )
  ok(s.length === 3, 'a serie tem um ponto por dia')
  ok(s[0].dia === '2026-09-10' && s[0].valor === 1, 'o dia com uma linha soma 1')
  ok(s[1].dia === '2026-09-11' && s[1].valor === 0, 'dia sem nada vira ZERO, e nao some')
  ok(s[2].valor === 5, 'duas linhas no mesmo dia somam')
}
{
  const s = serieDiaria(
    [
      { dia: '2026-08-01', valor: 99 },
      { dia: 'lixo', valor: 5 },
      { dia: null, valor: 5 },
      { dia: '2026-09-12', valor: 'abc' },
      { dia: '2026-09-12', valor: '7' },
      { dia: '2026-09-12T10:30:00Z', valor: 1 },
    ],
    '2026-09-12',
    3,
  )
  ok(totalDaSerie(s) === 8, 'fora da janela, data torta e valor torto ficam de fora; texto numerico entra')
  ok(s[2].valor === 8, 'o timestamp completo conta no dia dele')
}
ok(serieDiaria([], '2026-09-12', 4).every(p => p.valor === 0), 'sem linha nenhuma, tudo zero')
ok(maiorDaSerie(serieDiaria([{ dia: '2026-09-12', valor: 9 }], '2026-09-12', 2)) === 9, 'maior da serie')
ok(maiorDaSerie([]) === 0, 'maior de serie vazia e zero')

/* ── comparacao ── */
{
  const c = compararMetades([
    { dia: '1', valor: 10 },
    { dia: '2', valor: 10 },
    { dia: '3', valor: 15 },
    { dia: '4', valor: 15 },
  ])
  ok(c.antes === 20 && c.agora === 30, 'metade velha e metade nova')
  ok(c.variacao === 50, 'subiu 50 por cento')
}
{
  const c = compararMetades([
    { dia: '1', valor: 0 },
    { dia: '2', valor: 8 },
  ])
  ok(c.variacao === null, 'sem base de comparacao a variacao e nula, e nao 100 por cento')
}
{
  const c = compararMetades([
    { dia: '1', valor: 10 },
    { dia: '2', valor: 5 },
  ])
  ok(c.variacao === -50, 'caiu metade')
}
ok(compararMetades([]).variacao === null, 'serie vazia nao inventa variacao')
ok(compararMetades([{ dia: '1', valor: 3 }]).agora === 3, 'serie de um ponto conta como agora')
{
  /* Impar: o meio fica para a metade NOVA -- com 7 dias, 3 velhos e 4 novos. */
  const c = compararMetades(Array.from({ length: 7 }, (_, i) => ({ dia: String(i), valor: 1 })))
  ok(c.antes === 3 && c.agora === 4, 'janela impar parte no meio, sobrando para o lado novo')
}

/* ── eixo ── */
ok(tetoDoEixo(7) === 8, 'sete vira oito, e nao 7,5 -- o eixo fala a lingua do consultorio')
ok(tetoDoEixo(10) === 10, 'dez fica dez')
ok(tetoDoEixo(23) === 25, 'vinte e tres vira vinte e cinco')
ok(tetoDoEixo(1240) === 1500, 'mil duzentos e quarenta vira mil e quinhentos')
ok(tetoDoEixo(0) === 1, 'zero vira um, para o grafico ter altura')
ok(tetoDoEixo(-5) === 1, 'negativo tambem')
ok(tetoDoEixo(NaN) === 1, 'NaN tambem')
ok(tetoDoEixo(1) === 1, 'um fica um')
ok(tetoDoEixo(1e6) >= 1e6, 'milhao nao quebra')

/* ── rotulos ── */
ok(diaCurto('2026-09-12') === 'sáb', '12 de setembro de 2026 e sabado')
ok(diaCurto('2026-09-14') === 'seg', 'e 14 e segunda')
ok(diaCurto('lixo') === '', 'data torta nao vira rotulo sujo')
ok(dataCurta('2026-09-12') === '12/09', 'data curta')
ok(dataCurta('') === '', 'data vazia')

/* ── hoje ── */
ok(hojeDoAparelho(new Date(2026, 8, 12, 23, 30)) === '2026-09-12', 'as 23h30 ainda e hoje, e nao amanha em Greenwich')
ok(hojeDoAparelho(new Date(2026, 0, 5)) === '2026-01-05', 'mes e dia com zero a esquerda')
ok(hojeDoAparelho(new Date('lixo')) === '', 'data invalida devolve vazio')

console.log('\n' + (falhas === 0 ? 'todos passaram' : falhas + ' falharam') + '\n')
process.exit(falhas === 0 ? 0 : 1)
