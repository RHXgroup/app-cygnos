import { comoElaResponde, esperasEmMinutos } from './ritmoDaConversa.ts'
import { copoDoAviso, ACAO_COPO } from './copoDoAviso.ts'
import { montarAvisos, marcaDe, quantosNovos } from './montarAvisos.ts'

/* Sonda: joga entrada aleatória e HOSTIL contra as libs puras e confere
 * PROPRIEDADES, não casos.
 *
 * ── Por que isto existe além dos casos de mesa ─────────────────────────────
 * Caso de mesa prova o que eu pensei em testar. Ele não pega o que eu nem
 * imaginei — nutriente negativo, peso zero no denominador, data impossível — e
 * é justamente aí que mora o defeito que chega na mão de alguém.
 *
 * A ideia veio da outra sessão do app, cuja sonda achou dois defeitos que
 * trinta arquivos de teste não acharam.
 *
 * ── Sorteio com semente, e não Math.random ────────────────────────────────
 * Falha de sonda precisa ser REPRODUZÍVEL: sem semente, o defeito aparece uma
 * vez, some na execução seguinte, e vira "deve ter sido coisa minha". */

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

/* Gerador linear congruente. Feio, curto, e determinístico. */
let semente = 20260831
const sorteio = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648
  return semente / 2147483648
}
const inteiro = (min: number, max: number) => Math.floor(min + sorteio() * (max - min + 1))
const umDe = <T,>(xs: T[]): T => xs[inteiro(0, xs.length - 1)]

/* Os valores que quebram coisa, e que ninguém escreve num caso de mesa. */
const HOSTIS = [
  0, -1, -0, 0.1, -0.1, 1e-9, 1e15, -1e15,
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
  Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
]
const TEXTOS_HOSTIS = ['', ' ', 'x', 'null', 'undefined', 'NaN', '1e400', '2026-13-45T99:99:99Z', '💧']

const N = 4000

console.log('\nsonda das libs puras\n')

/* ── ritmoDaConversa ───────────────────────────────────────────────────────*/
{
  let quebrou = ''
  let esperaRuim = ''
  let fraseRuim = ''

  for (let i = 0; i < N && !quebrou; i++) {
    const quantas = inteiro(0, 12)
    const msgs = Array.from({ length: quantas }, () => ({
      de: umDe(['paciente', 'nutricionista', 'sistema', '', 'PACIENTE']),
      criadaEm:
        sorteio() < 0.15
          ? umDe(TEXTOS_HOSTIS)
          : new Date(Date.UTC(2026, 7, inteiro(1, 28), inteiro(0, 23), inteiro(0, 59))).toISOString(),
    }))

    try {
      const esperas = esperasEmMinutos(msgs)
      for (const e of esperas) {
        if (!Number.isFinite(e) || e < 0) esperaRuim = `${e} em ${JSON.stringify(msgs)}`
      }

      const frase = comoElaResponde(msgs)
      if (frase !== null && /NaN|Infinity|undefined|-\d/.test(frase)) {
        fraseRuim = `${frase} em ${JSON.stringify(msgs)}`
      }
    } catch (e) {
      quebrou = `${(e as Error).message} em ${JSON.stringify(msgs)}`
    }
  }

  ok('ritmoDaConversa nunca estoura', quebrou === '', quebrou)
  ok('espera é sempre finita e não negativa', esperaRuim === '', esperaRuim)
  ok('a frase nunca sai com NaN, Infinity ou número negativo', fraseRuim === '', fraseRuim)
}

/* ── copoDoAviso ───────────────────────────────────────────────────────────
 *
 * Entra objeto montado pelo Android e pelo iOS, sem tipo e sem garantia. É o
 * lugar do app onde o dado externo é mais cru. */
{
  let quebrou = ''
  let mlRuim = ''
  let dataRuim = ''
  const agora = new Date(2026, 7, 31, 12, 0)

  for (let i = 0; i < N && !quebrou; i++) {
    const entrada = umDe<unknown>([
      null,
      undefined,
      0,
      'texto',
      [],
      {},
      { actionIdentifier: umDe([ACAO_COPO, 'outra', '', null, 42]) },
      {
        actionIdentifier: umDe([ACAO_COPO, 'DEFAULT']),
        notification: {
          date: umDe([...HOSTIS, Date.now(), null, 'ontem']),
          request: {
            identifier: umDe([...TEXTOS_HOSTIS, null, 7]),
            content: { data: { ml: umDe([...HOSTIS, ...TEXTOS_HOSTIS, null]) } },
          },
        },
      },
    ])

    try {
      const copo = copoDoAviso(entrada, agora)
      if (copo) {
        if (!Number.isFinite(copo.ml) || copo.ml <= 0) mlRuim = `${copo.ml} de ${JSON.stringify(entrada)}`
        if (Number.isNaN(copo.quando.getTime())) dataRuim = JSON.stringify(entrada)
      }
    } catch (e) {
      quebrou = `${(e as Error).message} em ${JSON.stringify(entrada)}`
    }
  }

  ok('copoDoAviso nunca estoura', quebrou === '', quebrou)
  ok('nunca registra copo de ml inválido ou zero', mlRuim === '', mlRuim)
  ok('a data do copo é sempre válida', dataRuim === '', dataRuim)
}

/* A água não entra aqui: `ritmoAgua.ts` é da outra sessão do app e já tem os
   próprios 44 casos, e `ritmoDeAgua.ts` importa Supabase, então nem carrega
   fora do aparelho. Sonda de lib alheia é boa ideia combinada, não à revelia. */

/* ── montarAvisos ──────────────────────────────────────────────────────────*/
{
  let quebrou = ''
  let idRepetido = ''
  let textoRuim = ''

  for (let i = 0; i < N && !quebrou; i++) {
    const agora = {
      consultas: Array.from({ length: inteiro(0, 6) }, () => ({
        id: inteiro(-5, 50),
        status: umDe(['solicitada', 'pendente', 'confirmada', 'recusada', '', 'status_novo', 'CONFIRMADA']),
        /* `quando` sempre vem de `consultaLegivel`, que já devolve "Horário a
           confirmar" para data inválida. Alimentar lixo aqui testaria uma
           entrada que não existe — e a primeira versão desta sonda deu falso
           positivo exatamente assim, acusando "Você pediu NaN." */
        quando: umDe(['quinta, 3 de setembro, às 14:00', 'Horário a confirmar']),
      })),
      nutricionista: sorteio() < 0.4 ? null : { id: umDe(['n1', 'n2', '']), nome: umDe(['', ' ', 'Luana', 'Maria Clara']) },
      planoId: umDe([...TEXTOS_HOSTIS, null]),
      /* A contagem vem de um `count` do banco: nunca negativa, nunca absurda.
         Alimentar 1e15 aqui testaria entrada que não existe — e a sonda acusava
         "1000000000000000 mensagens novas", que é ruído, não defeito. */
      mensagensNaoLidas: inteiro(0, 99),
    }
    const marca = sorteio() < 0.3 ? null : marcaDe(agora)

    try {
      const lista = montarAvisos(agora, marca)
      const ids = lista.map(a => a.id)
      if (new Set(ids).size !== ids.length) idRepetido = ids.join(', ')

      for (const a of lista) {
        if (/undefined|NaN|\[object/.test(a.titulo + a.texto)) {
          textoRuim = `${a.titulo} / ${a.texto}`
        }
      }

      /* quantosNovos nunca pode passar do tamanho da lista. */
      if (quantosNovos(lista) > lista.length) textoRuim = 'contagem maior que a lista'
    } catch (e) {
      quebrou = `${(e as Error).message} em ${JSON.stringify(agora)}`
    }
  }

  ok('montarAvisos nunca estoura', quebrou === '', quebrou)
  ok('nenhum id de aviso se repete', idRepetido === '', idRepetido)
  ok('nenhum texto sai com undefined, NaN ou [object', textoRuim === '', textoRuim)
}

console.log(`\n${passou} ok, ${falhou} falha(s)  ·  ${N} sorteios por propriedade\n`)
if (falhou > 0) process.exit(1)
