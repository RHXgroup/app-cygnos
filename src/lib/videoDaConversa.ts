import { File } from 'expo-file-system'
import { falha } from './erros'
import { supabase } from './supabase'

/* O vídeo da conversa, guardado.
 *
 * ──────────────────── Mesmo balde, mesma pasta ────────────────────
 * `fotos-diario`, na pasta do PACIENTE -- as mesmas razões da foto e do áudio:
 * é a única pasta que ele consegue abrir, é a que a exclusão de conta dele
 * limpa, e a função do banco recusa anexo de outra pasta.
 *
 * ──────────────────── O teto, e por que ele mora aqui TAMBÉM ────────────────────
 * 25 MB, igual ao do balde (migração 20260911233000). O servidor recusaria
 * sozinho, mas com um erro em inglês depois de ela esperar a subida inteira --
 * e um vídeo de 40 MB no 4G do consultório são dois minutos de espera para
 * ouvir "não". Conferir aqui custa uma leitura de tamanho e devolve a frase
 * certa antes de começar.
 *
 * ──────────────────── E o `fetch` não entra aqui ────────────────────
 * Armadilha 17: o `fetch` do SDK 57 não lê `file://` e devolve vazio sem erro.
 * Quem lê arquivo do aparelho é o `expo-file-system`, e o `File` dele
 * implementa `Blob` -- o supabase-js aceita direto, sem base64 no meio (que num
 * vídeo de 20 MB seria uma string de 27 MB na memória). */

export const TETO_DO_VIDEO_MB = 25
const TETO_EM_BYTES = TETO_DO_VIDEO_MB * 1024 * 1024

const BUCKET = 'fotos-diario'

export type ResultadoDoVideo =
  | { tipo: 'ok'; caminho: string }
  | { tipo: 'erro'; mensagem: string }

/* O tipo que o balde espera, a partir da extensão do arquivo.
 *
 * Pela EXTENSÃO, e não pelo que o seletor disser: no Android o mesmo arquivo
 * chega como `video/mp4`, `video/*` ou sem tipo nenhum conforme a galeria -- e
 * um `contentType` errado faz o tocador escolher o leitor errado do outro lado,
 * cujo sintoma é "o vídeo não abre". */
export function tipoDoVideo(uri: string): string {
  const fim = uri.toLowerCase().split('?')[0].split('.').pop() ?? ''
  if (fim === 'mov') return 'video/quicktime'
  if (fim === '3gp') return 'video/3gpp'
  if (fim === 'webm') return 'video/webm'
  if (fim === 'mkv') return 'video/x-matroska'
  return 'video/mp4'
}

/* ──── E o `mp4` no fim é LISTA DE EXCEÇÃO, de propósito ────
 *
 * A régua que a gente acabou de escrever diz o contrário: quando o padrão de um
 * valor não decidido pode incomodar alguém, o padrão é o lado calado e a lista é
 * de quem PODE. Foi assim que `deveApitar` nasceu explícita.
 *
 * Aqui é o inverso, e a exceção precisa ficar escrita, senão alguém "conserta"
 * isto para uma lista explícita e quebra o caminho comum: **no Android a
 * galeria devolve `content://...` SEM extensão nenhuma**. Recusar o
 * desconhecido recusaria justamente a escolha normal de quem pega um vídeo da
 * galeria -- e esses vídeos são mp4 na esmagadora maioria.
 *
 * O custo de deixar assim, dito por inteiro: um arquivo com extensão exótica
 * (`.avi`) sai rotulado de mp4, o balde aceita porque o rótulo está na lista, e
 * quem falha é o tocador do outro lado -- "o vídeo não abre", sem erro nenhum.
 * É uma falha silenciosa, e é o preço de não recusar o `content://`.
 *
 * A régua continua valendo; o que muda é qual lado é o calado. Aqui recusar é o
 * lado RUIDOSO, porque recusa a maioria para proteger a minoria. */
const nomeUnico = (extensao: string) =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${extensao}`

export async function guardarVideoDaConversa(
  contaId: string,
  uri: string,
): Promise<ResultadoDoVideo> {
  if (!contaId || !uri) {
    return { tipo: 'erro', mensagem: 'Não consegui preparar o vídeo. Tente escolher de novo.' }
  }

  try {
    const arquivo = new File(uri)
    if (!arquivo.exists) {
      return { tipo: 'erro', mensagem: 'Não encontrei o vídeo no aparelho. Escolha de novo.' }
    }

    const tamanho = arquivo.size ?? 0
    if (tamanho === 0) {
      return { tipo: 'erro', mensagem: 'O vídeo veio vazio. Escolha de novo.' }
    }
    if (tamanho > TETO_EM_BYTES) {
      const mb = Math.ceil(tamanho / (1024 * 1024))
      return {
        tipo: 'erro',
        mensagem:
          `Este vídeo tem ${mb} MB e o limite é ${TETO_DO_VIDEO_MB} MB. ` +
          'Grave um mais curto, ou mande pelo computador.',
      }
    }

    const agora = new Date()
    const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
    const extensao = (uri.toLowerCase().split('?')[0].split('.').pop() || 'mp4').slice(0, 5)
    const caminho = `${contaId}/${anoMes}/${nomeUnico(extensao)}`

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, arquivo, { contentType: tipoDoVideo(uri) })

    if (error) {
      falha('Não consegui subir o vídeo.', error)
      return { tipo: 'erro', mensagem: 'Não consegui subir o vídeo agora. Tente de novo.' }
    }
    return { tipo: 'ok', caminho }
  } catch (e) {
    falha('Não consegui preparar o vídeo.', e)
    return { tipo: 'erro', mensagem: 'Não consegui preparar o vídeo. Tente escolher de novo.' }
  }
}
