/* O embrulho do modulo nativo que perdeu pedacos.
 *
 * Existe porque a primeira versao dele reintroduziu, escondido, o travamento
 * que ela consertava: fingia ter `then`, o motor concluiu que era uma promessa,
 * e o `await` esperou para sempre.
 *
 * Rode com: node --experimental-strip-types src/lib/moduloProtegido.teste.mts */

import { NUNCA_FINJA, moduloProtegido } from './moduloProtegido.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, extra = '') {
  if (condicao) {
    passou++
    console.log('  ok   ', nome)
  } else {
    falhou++
    console.log('  FALHOU', nome, extra)
  }
}

/* ══ O QUE EXISTE PASSA INTACTO ═══════════════════════════════════════════ */
{
  const real = {
    agendar: async (q: string) => 'agendei ' + q,
    LIMITE: 64,
    ligado: false,
  }
  const p = moduloProtegido(real)

  ok('funcao que existe e a mesma', p.agendar === real.agendar)
  ok('constante numerica passa', p.LIMITE === 64)
  ok('booleano FALSE passa, e nao vira funcao', p.ligado === false, String(p.ligado))
}

/* ══ O `then` — o caso que custou um build ════════════════════════════════ */
{
  const p = moduloProtegido({} as Record<string, unknown>)

  ok('`then` NAO e fingido', (p as { then?: unknown }).then === undefined)
  ok('`catch` NAO e fingido', (p as { catch?: unknown }).catch === undefined)
  ok('`finally` NAO e fingido', (p as { finally?: unknown }).finally === undefined)

  ok('NUNCA_FINJA cobre os tres', NUNCA_FINJA.length === 3)
}

/* ══ E a prova de verdade: dá para AGUARDAR sem travar ════════════════════ */
{
  /* O teste que teria pego o defeito. Se `then` for fingido, este `await`
     nunca volta -- entao a prova e uma corrida contra um relogio: quem chegar
     primeiro conta. Sem o limite, um teste quebrado travaria a suite inteira
     em vez de reprovar, que e a pior forma de falhar. */
  const correndo = async () => {
    const p = moduloProtegido({ nome: 'notificacoes' } as Record<string, unknown>)
    const resolvido = await Promise.resolve(p)
    return (resolvido as { nome?: string }).nome
  }
  const limite = new Promise<string>(r => setTimeout(() => r('TRAVOU'), 1500))
  const quem = await Promise.race([correndo(), limite])

  ok('`await` no modulo embrulhado RESOLVE', quem === 'notificacoes', String(quem))

  /* E dentro de uma cadeia de `.then`, que e como `lembretes` o devolve. */
  const daCadeia = await Promise.race([
    Promise.resolve().then(() => moduloProtegido({ nome: 'da cadeia' } as Record<string, unknown>)),
    limite,
  ])
  ok(
    'devolvido de dentro de um `.then` tambem resolve',
    (daCadeia as { nome?: string }).nome === 'da cadeia',
    String(daCadeia),
  )
}

/* ══ O QUE FALTA VIRA FUNCAO QUE NAO FAZ NADA ═════════════════════════════ */
{
  const faltaram: string[] = []
  const p = moduloProtegido({} as Record<string, unknown>, n => faltaram.push(n))

  const f = (p as Record<string, () => Promise<unknown>>).cancelarTudo
  ok('nome ausente vira funcao', typeof f === 'function')

  const r = await f()
  ok('e ela responde vazio', Array.isArray(r) && r.length === 0, JSON.stringify(r))
  ok('e o aviso saiu com o nome', faltaram.includes('cancelarTudo'), faltaram.join(','))

  /* O aviso NAO pode sair para `then`: seria ruido em toda espera, e foi
     justamente essa linha no terminal que denunciou o defeito. */
  faltaram.length = 0
  void (p as { then?: unknown }).then
  ok('`then` nao gera aviso', faltaram.length === 0, faltaram.join(','))
}

/* ══ SIMBOLOS ════════════════════════════════════════════════════════════ */
{
  const p = moduloProtegido({} as Record<string, unknown>)
  ok(
    'Symbol.toPrimitive nao e fingido',
    (p as unknown as Record<symbol, unknown>)[Symbol.toPrimitive] === undefined,
  )
  ok(
    'Symbol.iterator nao e fingido',
    (p as unknown as Record<symbol, unknown>)[Symbol.iterator] === undefined,
  )
  /* Sem isto, `String(modulo)` e `[...modulo]` fariam coisas inventadas em vez
     de falhar de forma reconhecivel. */
  ok('e da para virar texto sem explodir', typeof String(p) === 'string')
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
