/* A soma da lista de compras.
 *
 * A parte que erra não é a leitura: é o que acontece quando três sessões pedem
 * o mesmo item com unidades diferentes, ou com a quantidade em branco. No
 * supermercado, um total errado é uma compra errada.
 *
 * Rode com: node --experimental-strip-types src/lib/comprasDaSemana.teste.mts */

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

import { somar, quantidadePorExtenso, type ItemDeCompra } from './somaDasCompras.ts'

const linha = (nome: string, quantidade: unknown, unidade: unknown, atividade_id = 1) =>
  ({ nome, quantidade, unidade, atividade_id })

// ──── A soma que a lista existe para fazer ────
{
  const r = somar([
    linha('Iogurte', 1, 'un', 1),
    linha('Iogurte', 1, 'un', 2),
    linha('Iogurte', 1, 'un', 3),
  ])
  ok('três sessões com um iogurte viram uma linha', r.length === 1)
  ok('e a quantidade soma', r[0]?.quantidade === 3)
  ok('e conta as sessões', r[0]?.sessoes === 3)
}
{
  /* A mesma atividade pedindo duas vezes conta UMA sessão -- "sessoes" é
     quantas ocasiões, não quantas linhas. */
  const r = somar([linha('Bolacha', 1, 'pacote', 5), linha('Bolacha', 2, 'pacote', 5)])
  ok('duas linhas da mesma sessão somam a quantidade', r[0]?.quantidade === 3)
  ok('e continuam sendo uma sessão só', r[0]?.sessoes === 1)
}

// ──── UNIDADES DIFERENTES NÃO SOMAM ────
/* "2 unidades" e "500 g" do mesmo alimento somariam em 502, que é um número
   inventado com cara de certo. Saem duas linhas, e ela decide. */
{
  const r = somar([linha('Queijo', 2, 'un'), linha('Queijo', 500, 'g')])
  ok('unidades diferentes viram duas linhas', r.length === 2)
  ok('e nenhuma soma virou 502', r.every(x => x.quantidade !== 502))
}

// ──── Maiúscula não cria item novo ────
{
  const r = somar([linha('Iogurte', 1, 'un'), linha('iogurte', 1, 'un'), linha('IOGURTE', 1, 'un')])
  ok('maiúscula não duplica o item', r.length === 1)
  ok('e a soma pega os três', r[0]?.quantidade === 3)
  /* O que aparece na tela é o PRIMEIRO nome que ela escreveu, e não uma versão
     em caixa baixa do que ela digitou. */
  ok('o nome mostrado é o que ela escreveu', r[0]?.nome === 'Iogurte')
}
{
  const r = somar([linha('  Maçã  ', 1, 'un')])
  ok('espaço em volta é aparado', r[0]?.nome === 'Maçã')
}

// ──── Quantidade que não dá para somar ────
/* `null` diz "não sei quanto", e é mais honesto do que somar o que deu e
   mostrar um total a que falta pedaço. */
{
  const r = somar([linha('Aveia', 2, 'kg'), linha('Aveia', null, 'kg')])
  ok('uma quantidade ilegível apaga o total', r[0]?.quantidade === null)
  ok('mas o item continua na lista', r[0]?.nome === 'Aveia' && r.length === 1)
}
{
  const r = somar([linha('Aveia', 'muito', 'kg'), linha('Aveia', 2, 'kg')])
  ok('texto no lugar do número também apaga', r[0]?.quantidade === null)
}
{
  const r = somar([linha('Aveia', 0, 'kg'), linha('Aveia', 2, 'kg')])
  ok('zero não conta como quantidade', r[0]?.quantidade === null)
}

// ──── Entrada torta ────
ok('lista vazia devolve lista vazia', somar([]).length === 0)
ok('linha sem nome é descartada', somar([linha('', 1, 'un')]).length === 0)
ok('nome só de espaço é descartado', somar([linha('   ', 1, 'un')]).length === 0)
{
  const r = somar([linha('Sal', 1, null), linha('Sal', 1, '')])
  ok('unidade nula e vazia são a mesma coisa', r.length === 1 && r[0]?.quantidade === 2)
}
{
  const r = somar([linha('Sal', 1, 'un', Number.NaN)])
  ok('atividade sem id não quebra a contagem', r[0]?.sessoes === 0)
}

// ──── A ordem ────
/* Alfabética: no supermercado ela procura pelo nome. Ordenar por quantidade
   não ajuda a achar nada. */
{
  const r = somar([linha('Uva', 9, 'un'), linha('Abacate', 1, 'un'), linha('Éclair', 1, 'un')])
  ok('sai em ordem alfabética', r.map(x => x.nome).join(',') === 'Abacate,Éclair,Uva')
}

// ──── quantidadePorExtenso ────
ok('inteiro com unidade', quantidadePorExtenso({ nome: 'x', quantidade: 3, unidade: 'un', sessoes: 1 }) === '3 un')
ok('inteiro sem unidade', quantidadePorExtenso({ nome: 'x', quantidade: 3, unidade: null, sessoes: 1 }) === '3')
ok('decimal usa vírgula', quantidadePorExtenso({ nome: 'x', quantidade: 1.5, unidade: 'kg', sessoes: 1 }) === '1,5 kg')
/* A coluna é `numeric(10,3)`, então 3,000 chega assim -- e "3,000 potes" numa
   lista de compras é ruído. */
ok('decimal redondo não vira 3,000', quantidadePorExtenso({ nome: 'x', quantidade: 3.0, unidade: 'un', sessoes: 1 }) === '3 un')
ok('sem quantidade devolve vazio', quantidadePorExtenso({ nome: 'x', quantidade: null, unidade: 'un', sessoes: 1 }) === '')
ok('nada de NaN na saída',
  !/NaN|undefined|null/.test(quantidadePorExtenso({ nome: 'x', quantidade: 2.25, unidade: 'kg', sessoes: 1 })))

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
