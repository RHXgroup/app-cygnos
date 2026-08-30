import { ACAO_COPO, copoDoAviso } from './copoDoAviso.ts'

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

const AGORA = new Date(2026, 7, 30, 12, 0)
/* 30/08/2026 às 10:00 — a hora em que o aviso foi entregue, duas horas antes de
   o app abrir. É a diferença que o teste inteiro existe para proteger. */
const ENTREGUE = new Date(2026, 7, 30, 10, 0).getTime()

const resposta = (extra: Record<string, unknown> = {}, ml: unknown = 330) => ({
  actionIdentifier: ACAO_COPO,
  notification: {
    date: ENTREGUE,
    request: { identifier: 'aviso-agua-1', content: { data: { tipo: 'agua', ml } } },
  },
  ...extra,
})

console.log('\ncopoDoAviso\n')

/* ── O caminho feliz ───────────────────────────────────────────────────────*/
{
  const c = copoDoAviso(resposta(), AGORA)
  ok('lê os ml do aviso', c?.ml === 330)
  ok('a hora é a da ENTREGA, não a de agora', c?.quando.getHours() === 10, String(c?.quando))
  ok('a chave junta identificador e data', c?.chave === `aviso-agua-1:${ENTREGUE}`)
}

/* ── O que NÃO é o botão ───────────────────────────────────────────────────
 *
 * Tocar no corpo do aviso abre o app. Se isso também registrasse, quem abrisse
 * o app pelo aviso ganharia um copo que não bebeu. */
{
  ok(
    'toque comum no aviso não registra',
    copoDoAviso(
      { ...resposta(), actionIdentifier: 'expo.modules.notifications.actions.DEFAULT' },
      AGORA,
    ) === null,
  )
  ok('outra ação qualquer não registra', copoDoAviso({ ...resposta(), actionIdentifier: 'adiar' }, AGORA) === null)
  ok('sem ação nenhuma não registra', copoDoAviso({ ...resposta(), actionIdentifier: undefined }, AGORA) === null)
}

/* ── Lixo ──────────────────────────────────────────────────────────────────*/
{
  ok('null não derruba', copoDoAviso(null, AGORA) === null)
  ok('undefined não derruba', copoDoAviso(undefined, AGORA) === null)
  ok('texto solto não derruba', copoDoAviso('registrar-copo', AGORA) === null)
  ok('número solto não derruba', copoDoAviso(42, AGORA) === null)
  ok('objeto vazio não derruba', copoDoAviso({}, AGORA) === null)
  ok(
    'aviso sem conteúdo não derruba',
    copoDoAviso({ actionIdentifier: ACAO_COPO, notification: {} }, AGORA) === null,
  )
}

/* ── O número ──────────────────────────────────────────────────────────────
 *
 * O `data` do aviso atravessa uma serialização entre o app e o sistema: um 330
 * pode voltar como "330". */
{
  ok('texto numérico vale', copoDoAviso(resposta({}, '330'), AGORA)?.ml === 330)
  /* Montado à mão: passar `undefined` ao auxiliar acionaria o valor padrão
     dele, e o teste passaria a medir o auxiliar em vez da função. */
  ok(
    'ml ausente não registra',
    copoDoAviso(
      {
        actionIdentifier: ACAO_COPO,
        notification: { date: ENTREGUE, request: { identifier: 'a', content: { data: {} } } },
      },
      AGORA,
    ) === null,
  )
  ok('ml nulo não registra', copoDoAviso(resposta({}, null), AGORA) === null)
  ok('ml zero não registra', copoDoAviso(resposta({}, 0), AGORA) === null)
  ok('ml negativo não registra', copoDoAviso(resposta({}, -250), AGORA) === null)
  ok('ml que não é número não registra', copoDoAviso(resposta({}, 'muita'), AGORA) === null)
  ok('ml vazio não registra', copoDoAviso(resposta({}, ''), AGORA) === null)
  ok('ml NaN não registra', copoDoAviso(resposta({}, NaN), AGORA) === null)
  ok('ml infinito não registra', copoDoAviso(resposta({}, Infinity), AGORA) === null)
  /* Copo grande é copo grande. Não cabe a esta função decidir que 1200 ml é
     demais — quem definiu a meta foi a pessoa, e o limite mora em metas. */
  ok('copo grande continua valendo', copoDoAviso(resposta({}, 1200), AGORA)?.ml === 1200)
}

/* ── A data que falta ──────────────────────────────────────────────────────
 *
 * O caso que quase virou defeito calado. O aviso é DIÁRIO e reusa o mesmo
 * identificador todo dia: só a data separa o toque de hoje do de ontem.
 *
 * Sem a data, uma chave feita só com o identificador seria igual todos os dias,
 * o guarda de repetição veria a de ontem e concluiria que já registrou — e o
 * botão morreria em silêncio a partir do segundo dia. */
{
  const semData = copoDoAviso(resposta({ notification: {
    request: { identifier: 'aviso-agua-1', content: { data: { ml: 330 } } },
  } }), AGORA)

  ok('sem data ainda registra', semData?.ml === 330)
  ok('sem data cai na hora de agora', semData?.quando.getHours() === 12)
  ok('sem data NÃO produz chave', semData?.chave === null)
}

/* ── A chave separa os dias ────────────────────────────────────────────────*/
{
  const hoje = copoDoAviso(resposta(), AGORA)
  const amanha = copoDoAviso(
    resposta({ notification: {
      date: ENTREGUE + 24 * 60 * 60 * 1000,
      request: { identifier: 'aviso-agua-1', content: { data: { ml: 330 } } },
    } }),
    AGORA,
  )

  ok('mesmo aviso em dias diferentes tem chaves diferentes', hoje?.chave !== amanha?.chave)
  ok('o mesmo toque duas vezes tem a mesma chave', copoDoAviso(resposta(), AGORA)?.chave === hoje?.chave)
}

/* ── Identificador ausente ─────────────────────────────────────────────────*/
{
  const c = copoDoAviso(
    resposta({ notification: { date: ENTREGUE, request: { content: { data: { ml: 200 } } } } }),
    AGORA,
  )
  ok('sem identificador ainda registra', c?.ml === 200)
  /* A data sozinha já separa os dias, então a chave continua servindo. */
  ok('sem identificador a chave usa só a data', c?.chave === `?:${ENTREGUE}`)
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
