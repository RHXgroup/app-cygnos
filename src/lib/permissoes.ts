/* As frases de permissão, num lugar só.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * "Preciso de acesso à câmera. Você pode liberar nos ajustes do aparelho."
 * estava escrita QUATRO vezes — em `avatar`, `consumo`, `fotoDoDiario` e
 * `treinoIA` —, e a de notificação DUAS, na mesma tela. Cópias idênticas hoje
 * não continuam idênticas: alguém melhora uma frase e as outras três viram a
 * versão antiga do mesmo aviso, sem ninguém ter decidido isso (armadilha 5).
 *
 * ── O que estas frases têm de específico ─────────────────────────────────
 * Elas aparecem DEPOIS que o sistema negou, e por isso não podem só lamentar:
 * precisam dizer ONDE liberar. Quem negou uma vez não vê mais a caixa do
 * Android — o app nunca mais pergunta —, e sem o caminho a pessoa conclui que
 * a função está quebrada. */

export const SEM_CAMERA =
  'Preciso de acesso à câmera. Você pode liberar nos ajustes do aparelho.'

export const SEM_GALERIA =
  'Preciso de acesso às suas fotos. Você pode liberar nos ajustes do aparelho.'

export const semImagem = (origem: 'camera' | 'galeria'): string =>
  origem === 'camera' ? SEM_CAMERA : SEM_GALERIA

/* O caminho completo, e não "libere nas configurações".
 *
 * Notificação negada no Android some do lugar óbvio: não fica junto das
 * permissões de câmera e microfone, fica numa tela própria do aplicativo. Quem
 * procura em "Permissões" não acha, e conclui que o lembrete é que está
 * quebrado. */
export const SEM_NOTIFICACAO =
  'O Android não autorizou as notificações. Você pode liberar em Configurações → Aplicativos → Cygnos → Notificações.'

/* ── A NOSSA explicação, antes da caixa do sistema ────────────────────────
 *
 * A caixa do Android e a do iPhone são do sistema: o app não escolhe cor, nem
 * formato, e no Android nem o texto. O que dá para escolher é o que a pessoa lê
 * ANTES dela — e é isso que decide se ela toca em "permitir".
 *
 * Só onde o motivo NÃO é óbvio. Quem tocou em "Tirar foto" sabe por que a
 * câmera está sendo pedida, e uma explicação ali seria um toque a mais sem
 * ganho nenhum. Microfone e notificação são os dois casos em que a pergunta
 * existe de verdade, e quem não tem a resposta nega — e depois não acha onde
 * liberar. */
export const EXPLICACAO_DA_NOTIFICACAO =
  'Os lembretes são avisos deste aparelho, no horário que você escolher. ' +
  'Nada é enviado para a sua nutricionista e nada aparece para mais ninguém.\n\n' +
  'O aparelho vai pedir a permissão na tela seguinte. Se você recusar, o ' +
  'Android não pergunta de novo — e aí só dá para liberar pelas configurações.'
