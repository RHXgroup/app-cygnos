import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio'
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

/* O preset de alta qualidade, sem tocar em nada.
 *
 * A primeira versão mexia: 22 kHz mono, para o arquivo ficar quatro vezes
 * menor. A banda da voz cabe nisso em teoria, mas o encoder AAC do Android é
 * confiável a 44.100 Hz e só a ele — taxa fora do padrão produz, em vários
 * aparelhos, um arquivo válido e MUDO. Sem erro, sem aviso: o app grava, envia,
 * e o Whisper devolve nada, como se a pessoa não tivesse falado.
 *
 * Foi otimização prematura, e cara: custou o recurso inteiro. Meio megabyte
 * numa gravação de trinta segundos não é problema para ninguém.
 *
 * O LOW_QUALITY pronto continua sem servir, e por outro motivo: no Android ele
 * cai em 3gp/AMR a 8 kHz, que é qualidade de telefone antigo e faz o Whisper
 * errar palavra. */
export const OPCOES_DITADO: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,

  /* No Android, AAC cru (ADTS) — e não o .m4a do preset.
   *
   * Este é o defeito que custou a noite, e ele não estava no áudio: estava no
   * CONTAINER. O .m4a é MP4, e no MP4 o índice do arquivo (`moov`) é escrito no
   * FIM. Para ler o começo é preciso saber o que há no fim, ou seja, voltar
   * atrás no arquivo.
   *
   * O servidor Whisper joga o upload direto no ffmpeg por um CANO, que não
   * permite voltar atrás. Resultado: o arquivo toca perfeitamente no celular
   * (que abre o arquivo inteiro e consegue procurar) e vira ruído no servidor.
   * Medido: gravação com pico de -6,5 dBFS — voz alta e audível no aparelho —
   * voltava com idioma detectado como INGLÊS numa fala em português, e zero
   * segmentos. Áudio bom, leitura quebrada.
   *
   * É por isso que o sistema da nutricionista sempre funcionou com o MESMO
   * servidor: ele grava webm, que foi desenhado para transmissão e não tem
   * índice no fim.
   *
   * O Android não produz webm (o expo-audio expõe o container, mas os
   * codificadores são só AAC e AMR, e webm não aceita AAC). O ADTS resolve pelo
   * mesmo princípio: é uma sequência de quadros AAC, cada um com o seu próprio
   * cabeçalho, sem índice nenhum. Lê-se de ponta a ponta, por cano, sem voltar.
   *
   * A qualidade é a mesma — é o mesmo codec, só sem a caixa em volta. */
  android: {
    extension: '.aac',
    outputFormat: 'aac_adts',
    audioEncoder: 'aac',
  },
  /* Liga a medição do nível de entrada.
   *
   * Serve para a tela mostrar que está OUVINDO, e não só que está gravando —
   * são coisas diferentes, e a diferença entre elas é exatamente o defeito que
   * um gravador mudo tem. Uma barra parada enquanto a pessoa fala diz na hora o
   * que nenhuma mensagem de erro depois consegue dizer. */
  isMeteringEnabled: true,
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
/* A NOSSA explicação, antes da caixa do sistema.
 *
 * ── Por que só o microfone ────────────────────────────────────────────────
 * A caixa do Android e a do iPhone são do sistema: o app não escolhe cor, nem
 * formato, e no Android nem o texto. O que dá para escolher é o que a pessoa lê
 * ANTES dela.
 *
 * E isso só vale onde o motivo não é óbvio. Quem tocou em "Tirar foto" sabe por
 * que a câmera está sendo pedida, e uma explicação ali seria só um toque a mais.
 * "Por que um aplicativo de nutrição quer o meu microfone?" é a pergunta que
 * existe de verdade — e quem não tem a resposta nega, e depois não acha onde
 * liberar.
 *
 * ── Uma vez só ───────────────────────────────────────────────────────────
 * Só antes do PRIMEIRO pedido. Repetir a cada ditado transformaria a explicação
 * em pedágio, e quem já entendeu não precisa entender de novo. Depois de
 * concedida, o sistema nem pergunta mais — então isto some sozinho. */
const CHAVE_JA_EXPLIQUEI = 'microfone.expliquei'

/* A lib RESPONDE se precisa explicar; quem DESENHA é a tela.
 *
 * Isto aqui chamava `Alert.alert` — a caixa do Android, com fundo claro,
 * tipografia do sistema e botões azuis em caixa alta, no meio de um app escuro.
 * Uma caixa que não se parece com o app parece aviso do celular, e foi lida
 * exatamente assim.
 *
 * Uma lib não tem como desenhar a caixa da casa: ela não renderiza. Então ela
 * devolve a pergunta, e a tela mostra o `Confirmacao`, que é o componente que
 * existe no projeto justamente para substituir o Alert. */
export async function precisaExplicarMicrofone(): Promise<boolean> {
  /* Só quando o sistema ainda vai perguntar. Já concedida, a caixa dele não
     aparece e a explicação seria conversa sobre coisa nenhuma. */
  const antes = await getRecordingPermissionsAsync().catch(() => null)
  if (!antes || antes.granted || !antes.canAskAgain) return false
  try {
    return !(await AsyncStorage.getItem(CHAVE_JA_EXPLIQUEI))
  } catch {
    /* Sem armazenamento, explica de novo. Explicar duas vezes é chato; não
       explicar é o que faz a pessoa negar. */
    return true
  }
}

/* Guarda só depois do SIM: quem disse "agora não" volta a ver a explicação da
   próxima vez, que é justamente quando ela pode mudar de ideia. */
export async function marcarMicrofoneExplicado(): Promise<void> {
  await AsyncStorage.setItem(CHAVE_JA_EXPLIQUEI, '1').catch(() => {})
}

/* O texto da explicação mora aqui, e não em cada tela: são duas telas pedindo o
   microfone hoje, e duas versões da mesma promessa de privacidade divergem. */
export const EXPLICACAO_DO_MICROFONE =
  'O Cygnos usa o microfone só enquanto você segura para falar, e manda o áudio ' +
  'para transcrever o que você disse. Ele não fica escutando, e nada é guardado ' +
  'depois que o texto aparece.\n\nO aparelho vai pedir a permissão na tela seguinte.'

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

  /* Quanto o arquivo realmente tem. Custa uma leitura local e vale a pena: sem
     este número, "não ouvi nada" pode ser gravação muda, arquivo vazio ou
     upload que não anexou — três defeitos diferentes com a mesma cara na tela.
     Aparece no terminal do Metro com o prefixo [cygnos]. */
  try {
    const arquivo = await fetch(uri)
    const bytes = (await arquivo.blob()).size
    console.log('[cygnos] ditado:', Math.round(duracaoSegundos), 's,', bytes, 'bytes,', uri)
  } catch {
    console.log('[cygnos] ditado: não consegui medir o arquivo', uri)
  }

  /* O nome e o tipo saem da extensão de verdade do arquivo, e não de uma
     constante: quem decide o formato é o preset, por plataforma, e um nome
     mentindo sobre o conteúdo faz o ffmpeg escolher o leitor errado — que é
     outra forma de chegar ao mesmo silêncio. */
  const aac = uri.toLowerCase().endsWith('.aac')
  const forma = new FormData()
  forma.append('audio', {
    uri,
    name: aac ? 'ditado.aac' : 'ditado.m4a',
    type: aac ? 'audio/aac' : 'audio/m4a',
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

    /* O que o servidor mediu, quando não veio texto. Vai para o terminal do
       Metro porque é lá que se lê enquanto se conserta — a tela continua
       dizendo só a frase de gente. Temporário. */
    if (data?.diagnostico) console.log('[cygnos] ditado vazio:', JSON.stringify(data.diagnostico))

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
/* Uma DURAÇÃO, em "1:23" — e não uma hora do dia.
 *
 * Chamava-se `relogio`, e havia OUTRO `relogio` exportado em `ritmoAgua.ts` que
 * recebe minutos desde a meia-noite e devolve "07:30". Dois nomes iguais, as
 * duas assinaturas `number => string`: trocar um pelo outro compila, roda, e
 * imprime um número plausível e errado.
 *
 * O tipo não protege quando a diferença é a UNIDADE. O nome tem de proteger. */
/* O NOME diz o formato, e nao o assunto.
 *
 * Esta funcao ja se chamou `relogio` e depois `duracao`, e as duas vezes
 * colidiu com outra lib: `ritmoAgua.relogio` recebe MINUTOS desde a
 * meia-noite, `sono.duracao` recebe MINUTOS dormidos, e esta recebe
 * SEGUNDOS. As tres sao `number => string`, entao o TypeScript nao pega a
 * troca: compila, roda, e imprime um numero plausivel e errado.
 *
 * `mmss` nao colide com assunto nenhum porque nao fala de assunto: fala do
 * que sai. Quando a diferenca entre duas funcoes e a UNIDADE, o nome e a
 * unica protecao que existe. */
export function mmss(segundos: number): string {
  const inteiros = Math.max(0, Math.floor(segundos))
  const min = Math.floor(inteiros / 60)
  const seg = inteiros % 60
  return `${min}:${String(seg).padStart(2, '0')}`
}
