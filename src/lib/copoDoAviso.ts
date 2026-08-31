/* O que o toque em "Registrei" quer dizer, e só isso.
 *
 * Sem I/O e sem um único import de runtime: entra o objeto cru que o sistema
 * operacional entrega quando alguém toca no botão do aviso de água, sai o copo
 * a registrar — ou `null`, quando não é para registrar nada.
 *
 * Existe separado de lib/lembretes.ts pelo motivo de sempre: lá fica o que fala
 * com o aparelho, aqui o que decide. E aqui o dado vem de FORA, sem tipo e sem
 * garantia — é `unknown` de verdade, montado pelo Android e pelo iOS, que
 * passeia por uma serialização no meio do caminho. É exatamente o lugar onde um
 * `as` otimista registra o copo errado em silêncio.
 *
 * Ver a armadilha 14 do AGENTS.md. */

export const ACAO_COPO = 'registrar-copo'

export type CopoDoAviso = {
  ml: number
  /* Quando a pessoa bebeu — que é quando o AVISO foi entregue, e não quando o
     app abriu. Se ela tocou "Registrei" às dez da manhã com o app encerrado, o
     copo é das dez; gravar meio-dia porque foi quando o app subiu estragaria o
     gráfico de horário, que é a tela que existe para mostrar como o dia se
     distribui. */
  quando: Date
  /* Para não registrar duas vezes o mesmo toque, que pode chegar pelos dois
     caminhos — o ouvinte e a consulta de abertura.
   *
   * `null` quer dizer "não dá para saber se é repetido", e aí o certo é
   * registrar assim mesmo. Ver o comentário lá embaixo: é o oposto do que a
   * intuição pede, e o oposto é o certo. */
  chave: string | null
}

type Resposta = {
  actionIdentifier?: unknown
  notification?: {
    date?: unknown
    request?: {
      identifier?: unknown
      content?: { data?: { ml?: unknown } }
    }
  }
}

/* Número que veio de fora. Aceita texto porque o `data` do aviso atravessa uma
   serialização entre o app e o sistema, e um 330 pode voltar como "330". */
/* Um instante que o `Date` aceita, ou null.
 *
 * Duas armadilhas em sequência, as duas achadas por sonda e nenhuma por caso de
 * mesa:
 *
 *   `typeof NaN` é 'number'    — NaN passava e virava Invalid Date
 *   MAX_SAFE_INTEGER é finito  — mas está FORA do alcance do Date, que para em
 *                                ±8.64e15, e também vira Invalid Date
 *
 * Invalid Date chegava a `registrarAgua`, onde `.toISOString()` estoura com
 * RangeError — um copo registrado pela notificação derrubaria o app.
 *
 * Por isso a conferência é no resultado, e não na entrada: qualquer jeito novo
 * de produzir data impossível cai aqui também. */
const LIMITE_DO_DATE = 8.64e15

function instanteValido(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  if (Math.abs(v) > LIMITE_DO_DATE) return null
  return Number.isNaN(new Date(v).getTime()) ? null : v
}

function numeroDe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

export function copoDoAviso(resposta: unknown, agora: Date): CopoDoAviso | null {
  if (!resposta || typeof resposta !== 'object') return null
  const r = resposta as Resposta

  /* Tocar no CORPO do aviso não é tocar no botão. O toque comum chega aqui com
     o identificador padrão do módulo e serve para abrir o app — se ele também
     registrasse, quem abrisse o app pelo aviso ganharia um copo que não bebeu. */
  if (r.actionIdentifier !== ACAO_COPO) return null

  const ml = numeroDe(r.notification?.request?.content?.data?.ml)
  if (ml === null) return null

  /* `Number.isFinite`, e não `typeof === 'number'`.
   *
   * `typeof NaN` é `'number'`, então NaN passava por aqui, virava `new
   * Date(NaN)` — Invalid Date — e chegava a `registrarAgua`, onde
   * `.toISOString()` estoura com RangeError. Um copo registrado pela
   * notificação derrubaria o app.
   *
   * Achado por sonda de propriedade, não por caso de mesa: eu escrevi o teste
   * com data ausente e com data válida, e nunca com NaN — que é justamente o
   * valor que o sistema operacional pode mandar. */
  const entregue = instanteValido(r.notification?.date)
  const id = typeof r.notification?.request?.identifier === 'string'
    ? r.notification.request.identifier
    : null

  /* ── Por que a chave pode ser nula, e por que isso é a decisão certa ──────
   *
   * O aviso é diário e REUSA o identificador todo dia. Só a data separa o toque
   * de hoje do de ontem.
   *
   * Sem a data — e o sistema nem sempre a manda —, uma chave feita só com o
   * identificador seria idêntica todos os dias. O guarda de repetição olharia
   * para ela, veria a de ontem, e concluiria que já registrou. A partir do
   * segundo dia o botão pararia de funcionar, em silêncio, para sempre.
   *
   * Então: sem data, sem chave, e quem chama registra sem conferir. O pior caso
   * vira um copo repetido — visível na lista do dia e apagável com um toque —
   * em vez de um botão que morre calado. */
  const chave = entregue !== null ? `${id ?? '?'}:${entregue}` : null

  return { ml, quando: entregue !== null ? new Date(entregue) : agora, chave }
}
