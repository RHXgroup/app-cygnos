/* A situação de cada paciente, com o relógio parado.
 *
 * Rode com: node --experimental-strip-types src/lib/situacaoDoPaciente.teste.mts */

import { situacaoDoPaciente } from './situacaoDoPaciente.ts'

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

const AGORA = new Date(2026, 8, 9, 13, 42, 0)  // 09/09/2026, 13:42, local
const emDias = (n: number, h = 10, m = 0) =>
  new Date(2026, 8, 9 + n, h, m, 0).toISOString()

// ──── Inativo ganha de tudo ────
{
  const s = situacaoDoPaciente({ status: 'inativo', proxima: emDias(3), ultima: emDias(-30) }, AGORA)
  ok('inativo com consulta marcada continua inativo', s.selo === 'inativo')
  ok('inativo não vira pendência', s.detalhe === '')
}

// ──── Hoje ────
{
  const s = situacaoDoPaciente({ status: 'ativo', proxima: emDias(0, 16, 30), ultima: emDias(-40) }, AGORA)
  ok('consulta hoje tem selo próprio', s.selo === 'hoje')
  ok('e diz a hora', s.detalhe.includes('16:30'))
  ok('e não diz a data, que é hoje', !s.detalhe.includes('09/09'))
}
{
  /* Já passou HOJE: a leitura de "próxima" filtra por `>= agora`, então isto
     não chega da base -- mas a função é pública e não pode depender disso. */
  const s = situacaoDoPaciente({ status: 'ativo', proxima: emDias(0, 8, 0), ultima: null }, AGORA)
  ok('hoje de manhã ainda é hoje', s.selo === 'hoje')
}

// ──── Em dia ────
{
  const s = situacaoDoPaciente({ status: 'ativo', proxima: emDias(3), ultima: emDias(-28) }, AGORA)
  ok('retorno marcado é "em dia"', s.selo === 'emDia')
  ok('e mostra a data', s.detalhe === 'retorno em 12/09')
}
{
  /* O que ganha de quê: retorno marcado vence uma última consulta antiga. */
  const s = situacaoDoPaciente({ status: 'ativo', proxima: emDias(20), ultima: emDias(-300) }, AGORA)
  ok('marcado ganha de "faz tempo que não vem"', s.selo === 'emDia')
}
{
  const s = situacaoDoPaciente({ status: 'ativo', proxima: emDias(120), ultima: null }, AGORA)
  ok('virada de mês na data', s.detalhe === 'retorno em 07/01')
}

// ──── Sem retorno ────
{
  const s = situacaoDoPaciente({ status: 'ativo', proxima: null, ultima: emDias(-28) }, AGORA)
  ok('sem próxima e com última é "sem retorno"', s.selo === 'semRetorno')
  ok('e diz quando foi', s.detalhe === 'última em 12/08')
}

// ──── Nada ────
{
  const s = situacaoDoPaciente({ status: 'ativo', proxima: null, ultima: null }, AGORA)
  ok('sem nada é "sem consulta"', s.selo === 'novo')
  ok('e não afirma história nenhuma', s.detalhe === '')
}

// ──── Entrada torta: nada pode virar frase pela metade ────
for (const lixo of ['', 'amanhã', 'null', 'undefined', '2026-13-45T99:99', 'NaN']) {
  const a = situacaoDoPaciente({ status: 'ativo', proxima: lixo, ultima: null }, AGORA)
  ok('próxima torta "' + lixo + '" não vira frase quebrada',
    a.selo === 'novo' && a.detalhe === '')

  const b = situacaoDoPaciente({ status: 'ativo', proxima: null, ultima: lixo }, AGORA)
  ok('última torta "' + lixo + '" não vira frase quebrada',
    b.selo === 'novo' && b.detalhe === '')
}

/* Nenhuma saída pode carregar podridão de JavaScript: ela lê isto ao lado do
   nome de uma pessoa. */
for (const status of ['ativo', 'inativo', '', 'arquivado']) {
  for (const px of [null, '', 'lixo', emDias(0), emDias(5), emDias(-5)]) {
    for (const ul of [null, '', 'lixo', emDias(-5)]) {
      const s = situacaoDoPaciente({ status, proxima: px, ultima: ul }, AGORA)
      ok('sem podridão',
        !/undefined|NaN|Invalid|\[object|null/.test(s.rotulo + ' ' + s.detalhe) &&
        s.rotulo.length > 0)
    }
  }
}

console.log(passou + ' passaram, ' + falhas.length + ' falharam')
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
