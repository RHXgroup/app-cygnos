/* O que fazer com a resposta do sistema sobre a permissão de notificação.
 *
 * ──────────────────── Por que isto virou um arquivo ────────────────────
 * Ele relatou o mesmo defeito TRÊS vezes -- "clico pra ligar e ele fala que o
 * telefone não liberou, e não aparece caixa nenhuma" --, e eu consertei a última
 * vez sem nunca ter visto o log: a correção é raciocínio sobre o Android, não
 * medição. Uma correção assim tem de ser exercitável em algum lugar, senão a
 * quarta vez que ele relatar vai me encontrar adivinhando de novo.
 *
 * `lembretes.ts` não dá para testar: ele importa AsyncStorage e o próprio
 * `expo-notifications`, e qualquer um dos dois arrasta o aparelho inteiro para
 * dentro do Node. Aqui não há import nenhum -- só `import type`, que some na
 * compilação --, então a DECISÃO fica exercitável mesmo sem celular.
 *
 * É o corte que o AGENTS descreve no item 16: lá fica o que fala com o sistema,
 * aqui o que decide, e é o que decide que erra.
 *
 * ──────────────────── As três formas da mesma resposta ────────────────────
 * O módulo devolve `granted` numa versão, `status: 'granted'` noutra, e as duas
 * na terceira. E há uma quarta forma, que não é do módulo: o embrulho de
 * `moduloProtegido` responde `[]` para qualquer nome que falte no Expo Go -- um
 * ARRAY, onde o código espera um objeto. Ler `.granted` de `[]` dá `undefined`,
 * sem erro nenhum, e é por isso que este arquivo trata as quatro. */

export type EstadoDasNotificacoes = 'ligadas' | 'perguntar' | 'bloqueadas'

/* O que o `expo-notifications` devolve -- e tudo é opcional de propósito: ver o
   parágrafo das quatro formas, acima. `unknown` na raiz porque pode vir `[]`. */
export type RespostaDaPermissao = unknown

function comoObjeto(r: RespostaDaPermissao): {
  granted?: unknown
  status?: unknown
  canAskAgain?: unknown
} {
  /* Array e nulo caem no objeto vazio, e o resto das perguntas devolve
     `undefined` -- que é exatamente "não sei", e é a resposta honesta. */
  return r !== null && typeof r === 'object' && !Array.isArray(r)
    ? (r as { granted?: unknown; status?: unknown; canAskAgain?: unknown })
    : {}
}

/** Liberou? `granted` OU `status`, porque versões diferentes preenchem um e
 *  esquecem o outro -- e ler só um deixa o app dizendo "desligadas" com o
 *  Android dizendo que liberou. */
export function liberou(r: RespostaDaPermissao): boolean {
  const o = comoObjeto(r)
  return o.granted === true || o.status === 'granted'
}

/** O estado, a partir de uma LEITURA da permissão (sem pedir nada). */
export function leituraDaPermissao(r: RespostaDaPermissao): EstadoDasNotificacoes {
  if (liberou(r)) return 'ligadas'
  /* `canAskAgain === false` é o sistema dizendo que não vai mais perguntar.
     Qualquer outra coisa -- true, ausente, nulo -- vira 'perguntar', porque
     tentar e falhar é melhor do que mandar alguém às configurações sem motivo. */
  return comoObjeto(r).canAskAgain === false ? 'bloqueadas' : 'perguntar'
}

export type DesfechoDoPedido = {
  estado: EstadoDasNotificacoes
  /* Abrir a página do app nas configurações do telefone? */
  abrirConfiguracao: boolean
  /* O novo valor de "já pedi nesta sessão", para quem guarda esse estado. */
  jaPedi: boolean
}

/** O que fazer DEPOIS de pedir a permissão.
 *
 * ──────────────────── A caixa que não aparece ────────────────────
 * No Android 13 para cima, `POST_NOTIFICATIONS` é permissão de caixa, e o
 * sistema só desenha a caixa DUAS vezes. Da terceira em diante ele devolve
 * "negado" na hora, sem desenhar nada -- e nesse caso `canAskAgain` deveria vir
 * falso, que é o sinal que manda abrir a configuração. Nem sempre vem: o módulo
 * relata o que PEDIU, e não o que o sistema decidiu.
 *
 * Do lado do app, "negado com caixa" e "negado sem caixa" chegam IGUAIS. O que
 * as separa é o histórico: se já pedimos e voltou negado outra vez, a caixa não
 * vai aparecer, e insistir é o que ele viveu três vezes.
 *
 * O custo, dito por inteiro: quem de fato recusou a caixa uma vez vai para as
 * configurações em vez de vê-la de novo. Paga porque ninguém fica preso num
 * botão que não faz nada. */
export function depoisDoPedido(
  r: RespostaDaPermissao,
  jaPediAntes: boolean,
): DesfechoDoPedido {
  if (liberou(r)) {
    /* Zera o histórico: se ela desligar nas configurações depois, o próximo
       pedido merece a caixa de novo em vez de ir direto para o ajuste. */
    return { estado: 'ligadas', abrirConfiguracao: false, jaPedi: false }
  }
  if (comoObjeto(r).canAskAgain === false) {
    return { estado: 'bloqueadas', abrirConfiguracao: true, jaPedi: jaPediAntes }
  }
  if (jaPediAntes) {
    return { estado: 'bloqueadas', abrirConfiguracao: true, jaPedi: true }
  }
  return { estado: 'perguntar', abrirConfiguracao: false, jaPedi: true }
}

/* ──────────────────── QUEM PODE APITAR COM O APP ABERTO ────────────────────
 *
 * Relatado: "a Aurora me notificou às sete da manhã, mas não apitou, não fez
 * nada -- só pôs um lembrete na tela do celular. Não deveria ter apitado?"
 *
 * Deveria. O canal do aviso dela é HIGH com som desde o primeiro dia, então o
 * culpado não era o canal: era o `setNotificationHandler`, que decide o que
 * acontece quando a notificação chega COM O APP ABERTO -- e ele devolvia
 * `shouldPlaySound: false` para TODAS, por atacado.
 *
 * O atacado existia por um motivo legítimo: a confirmação de água ("3º copo de
 * hoje") não pode apitar. Ela avisa de uma coisa que a pessoa acabou de fazer, e
 * cobrar atenção por isso é o que o canal MIN dela existe para evitar. Só que
 * calar todas para calar essa calou também o lembrete que ela PEDIU -- e um
 * lembrete que não apita não é lembrete, é um recado esperando ser encontrado.
 *
 * Então a decisão passou a ser por TIPO. O tipo viaja dentro da notificação
 * (`data.tipo`) desde que os avisos ganharam dono; a confirmação de água não
 * tem tipo nenhum, e é isso que a separa: ausência é "não apita".
 *
 * Continua valendo só para o app ABERTO. Com o app fechado, quem decide é o
 * canal do Android, e todos os canais de lembrete já são HIGH ou DEFAULT. */

/* Os tipos que PEDEM atenção. Lista explícita, e não "tudo menos a água":
   notificação nova entra calada e alguém percebe, o que é melhor do que entrar
   apitando sem ninguém ter decidido. Armadilha 10, pelo lado do padrão. */
const APITAM = new Set(['nutri', 'refeicao', 'agua', 'sequencia'])

export function deveApitar(tipo: unknown): boolean {
  return typeof tipo === 'string' && APITAM.has(tipo)
}
