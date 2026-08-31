import { decode } from 'base64-arraybuffer'
import { falha } from './erros'
import { supabase } from './supabase'

/* A foto do prato, guardada.
 *
 * ── O que acontecia antes ─────────────────────────────────────────────────
 * A pessoa fotografava, a IA estimava, o número entrava no diário — e a imagem
 * era descartada. Nada ficava.
 *
 * Duas razões para isso ser falha, e não escolha:
 *
 *   A NUTRICIONISTA NÃO VÊ NADA. Ela recebe "Arroz, feijão e frango, 620 kcal",
 *   que é a leitura da IA e não o prato. Sem a imagem ela não corrige a porção,
 *   não nota o que ficou de fora e não comenta — e é ela quem pode fazer as
 *   três coisas.
 *
 *   E O MERCADO INTEIRO GUARDA. O MyFitnessPal deixa anexar foto às entradas do
 *   diário como registro visual, e comprou o Cal AI — app foto-primeiro, 15
 *   milhões de downloads. Guardar a imagem não é extra: é o produto.
 *
 * ── O bucket é privado, e isso muda como se lê ────────────────────────────
 * Item 7 do AGENTS.md, e ele custou meses de foto quebrada: `getPublicUrl` não
 * pergunta nada a ninguém — concatena uma string e devolve um endereço com cara
 * de válido, que o servidor recusa com "Bucket not found". Sem erro nenhum do
 * lado do app.
 *
 * Aqui só existe `createSignedUrl`, e ela é `async`. O endereço deixa de ser
 * calculado no meio do render e vira estado.
 *
 * ── E VENCE ──────────────────────────────────────────────────────────────
 * Uma hora. Tela que carrega uma vez e fica aberta mostra foto quebrada depois
 * do almoço. Quem monta lista longa deve pedir os endereços de novo ao voltar
 * do segundo plano.
 *
 * ── O caminho carrega o dono ──────────────────────────────────────────────
 * `<conta>/<ano-mes>/<uuid>.jpg`. A primeira pasta é a conta, e é o que as
 * políticas de storage usam para decidir — a da dona e a da nutricionista
 * vinculada. Fabricar um caminho com outra conta é recusado na origem. */

const BUCKET = 'fotos-diario'

/* Uma hora. Mesmo prazo do avatar, e pela mesma razão: é folga suficiente para
   uma sessão de uso e curto o bastante para um endereço vazado não valer nada
   no dia seguinte. */
const VALIDADE_SEGUNDOS = 3600

/* Sem `crypto.randomUUID` garantido no Hermes: monta com o relógio e aleatório.
   Colisão aqui só produziria uma foto sobrescrita da MESMA pessoa no MESMO
   milissegundo, e o caminho já é único por conta. */
const nomeUnico = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`

/* Sobe a foto e devolve o caminho, ou null se falhar.
 *
 * NULL, e não erro: item 11 do AGENTS.md. Esta função existe para enriquecer um
 * registro que já vai acontecer de qualquer jeito. Se a imagem não subir — sem
 * sinal, storage fora —, o item precisa entrar no diário mesmo assim, com o
 * número que a IA estimou. Perder o registro inteiro por causa da foto seria
 * trocar o essencial pelo acessório.
 *
 * Recebe base64 porque é o que `analisarFoto` já produziu para mandar à IA:
 * pedir o arquivo de novo seria ler e comprimir a mesma imagem duas vezes. */
export async function guardarFotoDoDiario(
  contaId: string,
  base64: string,
): Promise<string | null> {
  if (!contaId || !base64) return null

  const agora = new Date()
  const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const caminho = `${contaId}/${anoMes}/${nomeUnico()}`

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, decode(base64), { contentType: 'image/jpeg' })

    if (error) {
      falha('Não consegui guardar a foto do prato.', error)
      return null
    }
    return caminho
  } catch (e) {
    /* `decode` pode rejeitar com base64 corrompido, e uma rejeição não tratada
       aqui derrubaria a tela do diário inteira por causa de uma imagem. */
    falha('Não consegui preparar a foto do prato.', e)
    return null
  }
}

/* O endereço assinado de UMA foto, ou null.
 *
 * Null quando falha, de novo: a tela já sabe desenhar o item sem imagem, e um
 * erro aqui não pode cobrir o diário. */
export async function enderecoDaFoto(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(caminho, VALIDADE_SEGUNDOS)
    if (error) {
      falha('Não consegui abrir a foto.', error)
      return null
    }
    return data?.signedUrl ?? null
  } catch (e) {
    falha('Não consegui abrir a foto.', e)
    return null
  }
}

/* Vários de uma vez, para uma lista.
 *
 * Uma chamada por foto num diário de doze itens são doze idas à rede na
 * abertura da tela. `createSignedUrls` resolve todos de uma vez, e o mapa volta
 * indexado pelo caminho — que é o que a tela tem em mãos.
 *
 * Caminho que falhar simplesmente não entra no mapa, e a linha dele fica sem
 * imagem. Uma foto quebrada não pode derrubar as outras onze. */
export async function enderecosDasFotos(
  caminhos: (string | null)[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const uteis = [...new Set(caminhos.filter((c): c is string => !!c))]
  if (uteis.length === 0) return mapa

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(uteis, VALIDADE_SEGUNDOS)
    if (error) {
      falha('Não consegui abrir as fotos do diário.', error)
      return mapa
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) mapa.set(item.path, item.signedUrl)
    }
  } catch (e) {
    falha('Não consegui abrir as fotos do diário.', e)
  }
  return mapa
}

/* Apaga a imagem. Chamada quando o item do diário é apagado — foto órfã ocupa
   espaço para sempre e ninguém vai procurá-la depois.
 *
 * Falha em silêncio de propósito: o item já saiu do diário, e travar o apagar
 * por causa do arquivo deixaria a pessoa com uma linha que ela mandou remover. */
export async function apagarFotoDoDiario(caminho: string | null): Promise<void> {
  if (!caminho) return
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([caminho])
    if (error) falha('Não consegui remover a foto do prato.', error)
  } catch (e) {
    falha('Não consegui remover a foto do prato.', e)
  }
}
