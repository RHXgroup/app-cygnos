import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio'
import type { RecordingOptions } from 'expo-audio'
import { supabase } from './supabase'

/* Ditar a refeição em vez de digitar.
 *
 * É o gesto de quem está com o prato na frente e as mãos ocupadas: falar "dois
 * ovos mexidos, uma fatia de pão integral e um copo de café com leite" leva
 * cinco segundos, e digitar a mesma frase leva quarenta.
 *
 * ── O que isto NÃO faz ─────────────────────────────────────────────────────
 * Não grava nada sozinho. A fala vira TEXTO e o texto cai no campo da tela de
 * escrever, onde a pessoa confere linha por linha antes de qualquer coisa
 * entrar no diário. Transcrição erra — "chá" vira "já", "cem gramas" vira "sem
 * gramas" — e um app que registrasse direto o que ouviu registraria errado sem
 * ninguém perceber. Conferir é o recurso, não um atrito dele.
 *
 * ── De onde vem a transcrição ──────────────────────────────────────────────
 * Do nosso próprio servidor Whisper, o mesmo que a nutricionista já usa para
 * ditar anamnese (ver `transcrever-audio-paciente` no repo do sistema). Ele é
 * nosso: transcrever não custa por minuto, e o áudio não sai para terceiro
 * nenhum.
 *
 * A porta é a `app-transcrever`, e não aquela: `transcrever-audio-paciente`
 * devolve 403 para quem não é nutricionista — o nome engana, ela é o áudio
 * SOBRE o paciente, não o dele. */

/* Fala, não música. Mono a 22 kHz cobre a banda da voz inteira e gera um
   arquivo quatro vezes menor que o preset de alta qualidade — o que importa
   para quem dita no 4G do supermercado.

   O LOW_QUALITY pronto não serve: no Android ele cai em 3gp/AMR a 8 kHz, que é
   qualidade de telefone antigo e faz o Whisper errar palavra. */
export const OPCOES_DITADO: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 64000,
}

/* Um minuto. Ninguém dita uma refeição em mais que isso, e o limite existe
   para o caso de a tela ficar aberta esquecida: sem ele, o gravador rodaria
   até a bateria acabar. A tela para sozinha ao chegar aqui. */
export const LIMITE_SEGUNDOS = 60

/* Abaixo disto não há fala nenhuma — é o toque acidental no botão. Mandar para
   o servidor devolveria texto vazio depois de três segundos de espera, e a
   pessoa leria isso como falha do app. */
const MINIMO_SEGUNDOS = 1

export type ResultadoPermissao =
  | { tipo: 'ok' }
  | { tipo: 'negada'; mensagem: string }

/* Pede o microfone e deixa o áudio em modo de gravação.
 *
 * `setAudioModeAsync` precisa vir antes do primeiro `record()`: sem ele o
 * iOS grava no modo de reprodução e sai um arquivo mudo — falha silenciosa,
 * das piores, porque o app mostra que gravou e o servidor devolve nada. */
export async function prepararMicrofone(): Promise<ResultadoPermissao> {
  const permissao = await requestRecordingPermissionsAsync()
  if (!permissao.granted) {
    return {
      tipo: 'negada',
      mensagem: permissao.canAskAgain
        ? 'Preciso do microfone para ouvir você.'
        : 'Preciso do microfone. Você pode liberar nos ajustes do aparelho.',
    }
  }

  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
  return { tipo: 'ok' }
}

export type ResultadoTranscricao =
  | { tipo: 'ok'; texto: string }
  | { tipo: 'curto_demais' }
  | { tipo: 'nada_ouvido' }
  | { tipo: 'erro'; mensagem: string }

/* Manda o arquivo e devolve o que foi dito.
 *
 * O arquivo vai como multipart e não como base64: base64 infla o corpo em um
 * terço, e `functions.invoke` já monta o multipart sozinho quando recebe um
 * FormData. No React Native o campo de arquivo é `{ uri, name, type }` — não
 * existe Blob de arquivo local aqui. */
export async function transcrever(
  uri: string,
  duracaoSegundos: number,
): Promise<ResultadoTranscricao> {
  if (duracaoSegundos < MINIMO_SEGUNDOS) return { tipo: 'curto_demais' }

  const forma = new FormData()
  forma.append('audio', {
    uri,
    name: 'ditado.m4a',
    type: 'audio/m4a',
  } as unknown as Blob)

  try {
    const { data, error } = await supabase.functions.invoke('app-transcrever', { body: forma })

    if (error) {
      /* O supabase-js embrulha a resposta de erro: sem abrir o context, toda
         falha viraria "FunctionsHttpError" na tela. Mesmo tratamento da foto
         do prato, em consumo.ts. */
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      const codigo = corpo?.error as string | undefined

      if (codigo === 'whisper_nao_configurado') {
        return { tipo: 'erro', mensagem: 'O ditado ainda não está disponível. Escreva por enquanto.' }
      }
      if (codigo === 'forbidden' || codigo === 'unauthorized') {
        return { tipo: 'erro', mensagem: 'Sua sessão expirou. Entre de novo para usar o ditado.' }
      }
      return { tipo: 'erro', mensagem: 'Não consegui entender o áudio agora. Verifique a conexão.' }
    }

    const texto = String(data?.texto ?? '').trim()
    /* Silêncio não é erro: é o que sai de quem apertou e não falou, ou falou
       longe demais do aparelho. Merece uma frase própria, porque a saída é
       diferente — tentar de novo, e não desistir do ditado. */
    if (!texto) return { tipo: 'nada_ouvido' }

    return { tipo: 'ok', texto }
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui enviar o áudio. Verifique a conexão.' }
  }
}

/* mm:ss do cronômetro. `currentTime` vem em segundos com casas decimais, e
   mostrar "12.847" enquanto a pessoa fala seria ruído. */
export function relogio(segundos: number): string {
  const inteiros = Math.max(0, Math.floor(segundos))
  const min = Math.floor(inteiros / 60)
  const seg = inteiros % 60
  return `${min}:${String(seg).padStart(2, '0')}`
}
