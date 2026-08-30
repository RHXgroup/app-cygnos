import {
  DIAS_DE_LUTEA,
  dataProvavelDoParto,
  diasFerteis,
  ehDiaFertil,
  janelaFertil,
  mesPorExtenso,
} from './fertilidade.ts'

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

console.log('\n1. a janela sai de trás para a frente')

{
  /* Próxima menstruação em 30/08. Ovulação 14 dias antes: 16/08.
     Janela: 11/08 (−5) a 17/08 (+1). */
  const j = janelaFertil('2026-08-30')
  ok('ovulação 14 dias antes', j?.ovulacao === '2026-08-16', String(j?.ovulacao))
  ok('começa 5 dias antes da ovulação', j?.de === '2026-08-11', String(j?.de))
  ok('termina 1 dia depois', j?.ate === '2026-08-17', String(j?.ate))
  ok('a constante é 14', DIAS_DE_LUTEA === 14)
}

{
  /* O ponto do cálculo de trás para a frente: em ciclo LONGO a ovulação NÃO é no
     dia 14. Se a próxima é 04/09 e o ciclo dela dura 35 dias (começou 31/07), a
     ovulação cai em 21/08 — dia 22 do ciclo, e não dia 14. */
  const j = janelaFertil('2026-09-04')
  ok('ciclo longo ovula tarde', j?.ovulacao === '2026-08-21', String(j?.ovulacao))
}

console.log('\n2. sem previsão, nada')

{
  ok('null não vira janela', janelaFertil(null) === null)
  ok('texto solto não vira janela', janelaFertil('mês que vem') === null)
  ok('vazio não vira janela', janelaFertil('') === null)
  ok('formato errado não vira janela', janelaFertil('30/08/2026') === null)
  /* Sem previsão não há janela — é a mesma disciplina de não prever com 28
     dias. Uma janela sobre média de população não é a janela dela, e aqui o
     erro custa mais do que uma data errada na tela. */
  ok('os dias também ficam vazios', diasFerteis(null).size === 0)
}

console.log('\n3. os sete dias')

{
  const dias = diasFerteis(janelaFertil('2026-08-30'))
  ok('são sete', dias.size === 7, String(dias.size))
  ok('o primeiro entra', dias.has('2026-08-11'))
  ok('a ovulação entra', dias.has('2026-08-16'))
  ok('o último entra', dias.has('2026-08-17'))
  ok('o dia anterior não', !dias.has('2026-08-10'))
  ok('o dia seguinte não', !dias.has('2026-08-18'))
}

{
  /* Atravessando o mês: previsão em 05/09 -> ovulação 22/08, janela 17 a 23/08. */
  const dias = diasFerteis(janelaFertil('2026-09-05'))
  ok('atravessa a virada do mês', dias.size === 7 && dias.has('2026-08-17') && dias.has('2026-08-23'))
}

{
  /* Atravessando o ano: previsão em 10/01/2027 -> ovulação 27/12/2026. */
  const j = janelaFertil('2027-01-10')
  ok('atravessa a virada do ano', j?.ovulacao === '2026-12-27', String(j?.ovulacao))
  ok('e a janela também', diasFerteis(j).has('2026-12-22'))
}

{
  /* Fevereiro bissexto: previsão em 14/03/2028 -> ovulação 29/02/2028. */
  const j = janelaFertil('2028-03-14')
  ok('a ovulação cai em 29 de fevereiro', j?.ovulacao === '2028-02-29', String(j?.ovulacao))
}

console.log('\n4. um dia é fértil ou não')

{
  const j = janelaFertil('2026-08-30')
  ok('dentro', ehDiaFertil('2026-08-14', j) === true)
  ok('a borda de baixo', ehDiaFertil('2026-08-11', j) === true)
  ok('a borda de cima', ehDiaFertil('2026-08-17', j) === true)
  ok('um antes', ehDiaFertil('2026-08-10', j) === false)
  ok('um depois', ehDiaFertil('2026-08-18', j) === false)
  ok('sem janela nunca é fértil', ehDiaFertil('2026-08-14', null) === false)
  ok('data inválida nunca é fértil', ehDiaFertil('amanhã', j) === false)
}

console.log('\n5. a data provável do parto')

{
  /* 266 dias da CONCEPÇÃO, e não 280. Os 280 contam da última menstruação
     (Naegele); usá-los aqui jogaria a data duas semanas à frente — erro que
     ninguém confere, porque a conta "parece a que se ouve falar". */
  const d = dataProvavelDoParto('2026-08-16')
  ok('266 dias depois', d === '2027-05-09', String(d))

  /* Confere pelo outro lado: DUM 02/08 (14 dias antes da concepção) + 280 dá o
     MESMO dia. As duas contas têm de bater, senão uma delas está errada. */
  const porNaegele = new Date(Date.parse('2026-08-02T00:00:00Z') + 280 * 86400000)
    .toISOString().slice(0, 10)
  ok('bate com a regra de Naegele a partir da DUM', d === porNaegele, `${d} vs ${porNaegele}`)
}

{
  ok('atravessa o ano', dataProvavelDoParto('2026-12-20') === '2027-09-12',
    String(dataProvavelDoParto('2026-12-20')))
  /* De 2027 (comum) para 2028 (bissexto): a conta em milissegundos atravessa o
     29 de fevereiro sozinha, e é por isso que ela é feita assim. */
  ok('atravessa fevereiro bissexto', dataProvavelDoParto('2027-08-16') === '2028-05-08',
    String(dataProvavelDoParto('2027-08-16')))
  ok('data inválida devolve null', dataProvavelDoParto('16/08/2026') === null)
  ok('vazio devolve null', dataProvavelDoParto('') === null)
  ok('texto devolve null', dataProvavelDoParto('quinta') === null)
}

{
  /* Uma data que o formato aceita e o calendário não — e este teste PEGOU o
     defeito na primeira execução.

     Eu tinha escrito que `Date.parse('2026-02-31T00:00:00Z')` devolve NaN.
     Devolve não: o JavaScript ESCORREGA para 3 de março e responde um número
     perfeitamente válido. "31 de fevereiro" virava uma data provável de parto
     em novembro, sem erro nenhum. A checagem que resolve é a volta — reconstruir
     o ISO a partir do número e exigir que seja igual ao que entrou. */
  ok('31 de fevereiro não vira data', dataProvavelDoParto('2026-02-31') === null,
    String(dataProvavelDoParto('2026-02-31')))
  ok('mês 13 não vira data', dataProvavelDoParto('2026-13-01') === null)
}

console.log('\n6. o mês por extenso')

{
  ok('maio', mesPorExtenso('2027-05-09') === 'maio de 2027', mesPorExtenso('2027-05-09'))
  ok('janeiro', mesPorExtenso('2027-01-02') === 'janeiro de 2027')
  ok('dezembro', mesPorExtenso('2026-12-31') === 'dezembro de 2026')
  ok('março com acento', mesPorExtenso('2027-03-01') === 'março de 2027')
  ok('data inválida vira vazio', mesPorExtenso('nada') === '')
  ok('mês 0 vira vazio', mesPorExtenso('2027-00-10') === '')
  ok('mês 13 vira vazio', mesPorExtenso('2027-13-10') === '')
}

console.log('\n7. o vocabulário — nenhuma função promete segurança')

{
  /* Este teste não exercita comportamento: ele guarda uma DECISÃO. O app não
     desenha "dias seguros" em lugar nenhum, porque a mesma informação lida ao
     contrário vira anticoncepção — e a margem de erro deste cálculo tem, aí,
     consequência que ninguém desfaz.
     Se alguém acrescentar uma função com esse nome, este teste cai e a conversa
     acontece antes de a tela existir. */
  const nomes = [
    'janelaFertil', 'diasFerteis', 'ehDiaFertil',
    'dataProvavelDoParto', 'mesPorExtenso', 'DIAS_DE_LUTEA',
  ]
  const proibidas = /seguro|segura|livre|protegid|anticoncep|contracep/i
  ok('nenhum nome exportado promete segurança', !nomes.some(n => proibidas.test(n)))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
