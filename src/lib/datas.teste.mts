/* As contas de data em texto ISO.
 *
 * Este arquivo nao tinha teste, e passou a carregar duas funcoes que decidem
 * coisa seria:
 *
 *   `idadeDe`  alimenta o calculo de gasto energetico. Existiam DUAS, com a
 *              mesma forma `(string, Date) => number`, diferindo so no que
 *              faziam com entrada torta -- e a que a tela usava devolvia `NaN`,
 *              que passa por `idade !== null` e vira uma caloria NaN sem nada
 *              reclamar.
 *   `segundaDa` decide em que semana cai um dia, e domingo e o caso que quase
 *              todo calendario erra.
 *
 * Rode com: node --experimental-strip-types src/lib/datas.teste.mts */

import { ehDataReal, emDias, idadeDe, paraISO, doISO, segundaDa, somandoDias, diaDaSemana } from './datas.ts'

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

const EM = (iso: string) => new Date(iso + 'T12:00:00')

/* == A IDADE, QUE VIRA CALORIA ========================================== */
{
  console.log('\n1. idadeDe: o caso comum')
  ok('antes do aniversario', idadeDe('1990-04-27', EM('2026-04-26')) === 35,
     String(idadeDe('1990-04-27', EM('2026-04-26'))))
  ok('NO dia do aniversario ja conta', idadeDe('1990-04-27', EM('2026-04-27')) === 36,
     String(idadeDe('1990-04-27', EM('2026-04-27'))))
  ok('depois', idadeDe('1990-04-27', EM('2026-04-28')) === 36)
  /* Quem faz anos em dezembro apareceria um ano mais velho durante onze meses
     sem o ajuste do mes. */
  ok('nasceu em dezembro, hoje e janeiro', idadeDe('1990-12-15', EM('2026-01-10')) === 35,
     String(idadeDe('1990-12-15', EM('2026-01-10'))))
  ok('nasceu em janeiro, hoje e dezembro', idadeDe('1990-01-15', EM('2026-12-10')) === 36)
}

{
  console.log('\n2. idadeDe: o que NAO pode virar NaN')
  /* Este era o defeito: a versao antiga devolvia NaN, e `NaN !== null` libera o
     calculo de gasto energetico -- que entao produz uma caloria NaN. */
  for (const torto of ['', 'nao e data', '27/04/1990', '1990-4-27', '2026-02-31', '2026-13-01']) {
    const r = idadeDe(torto, EM('2026-09-09'))
    ok('"' + torto + '" vira null', r === null, String(r))
  }
  ok('null vira null', idadeDe(null, EM('2026-09-09')) === null)
  ok('undefined vira null', idadeDe(undefined, EM('2026-09-09')) === null)

  /* Fora da faixa tambem: uma data de 1850 nao e um paciente, e "176 anos"
     entrando na equacao de Harris-Benedict e pior do que recusar. */
  ok('nascimento no futuro vira null', idadeDe('2030-01-01', EM('2026-09-09')) === null,
     String(idadeDe('2030-01-01', EM('2026-09-09'))))
  ok('1850 vira null', idadeDe('1850-01-01', EM('2026-09-09')) === null)

  /* E o bebe de meses continua sendo ZERO, e nao null: zero anos e uma idade. */
  ok('bebe de meses e 0, e nao null', idadeDe('2026-03-01', EM('2026-09-09')) === 0,
     String(idadeDe('2026-03-01', EM('2026-09-09'))))
}

{
  console.log('\n3. idadeDe: ano bissexto')
  /* Contada na mao justamente por isto: diferenca em milissegundos erra aqui. */
  ok('nasceu em 29/02 e hoje e 28/02', idadeDe('2000-02-29', EM('2026-02-28')) === 25,
     String(idadeDe('2000-02-29', EM('2026-02-28'))))
  ok('e em 01/03 ja fez', idadeDe('2000-02-29', EM('2026-03-01')) === 26)
  ok('num ano bissexto, no proprio dia', idadeDe('2000-02-29', EM('2028-02-29')) === 28)
}

/* == A SEMANA COMECA NA SEGUNDA ========================================= */
{
  console.log('\n4. segundaDa')
  ok('terca volta para a segunda', segundaDa('2026-09-08') === '2026-09-07')
  ok('segunda e ela mesma', segundaDa('2026-09-07') === '2026-09-07')
  /* O caso que erra: `getUTCDay()` da 0 para domingo, e domingo pertence a
     semana que COMECOU seis dias atras -- nao a que comeca amanha. */
  ok('domingo fica na semana que ja passou', segundaDa('2026-09-13') === '2026-09-07',
     segundaDa('2026-09-13'))
  ok('sabado tambem', segundaDa('2026-09-12') === '2026-09-07')
  ok('atravessa o mes', segundaDa('2026-10-01') === '2026-09-28', segundaDa('2026-10-01'))
  ok('atravessa o ano', segundaDa('2027-01-01') === '2026-12-28', segundaDa('2027-01-01'))
  ok('data torta volta igual', segundaDa('2026-02-31') === '2026-02-31')
}

/* == O RESTO DO ARQUIVO ================================================= */
{
  console.log('\n5. as contas antigas')
  ok('data real', ehDataReal('2026-09-08'))
  /* O formato bater nao basta: `Date.parse('2026-02-31')` NAO da erro, escorrega
     para 3 de marco. A volta e a prova. */
  ok('31 de fevereiro nao existe', !ehDataReal('2026-02-31'))
  ok('mes 13 tambem nao', !ehDataReal('2026-13-01'))
  ok('formato errado', !ehDataReal('08/09/2026'))
  ok('numero nao e data', !ehDataReal(20260908))

  ok('somando dias', somandoDias('2026-09-30', 1) === '2026-10-01')
  ok('subtraindo', somandoDias('2026-01-01', -1) === '2025-12-31')
  ok('bissexto', somandoDias('2028-02-28', 1) === '2028-02-29')
  ok('data torta sai igual', somandoDias('2026-02-31', 1) === '2026-02-31')

  ok('emDias', emDias('2026-09-01', '2026-09-08') === 7)
  ok('emDias ao contrario', emDias('2026-09-08', '2026-09-01') === -7)
  ok('emDias com torta da zero', emDias('xx', '2026-09-01') === 0)

  ok('diaDaSemana: terca e 2', diaDaSemana('2026-09-08') === 2)
  ok('domingo e 0', diaDaSemana('2026-09-13') === 0)
  ok('torta e -1', diaDaSemana('2026-02-31') === -1)

  ok('doISO e paraISO fecham', paraISO(doISO('2026-09-08')) === '2026-09-08')
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
