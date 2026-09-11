import { falha } from './erros'
import {
  PALAVRAS_DA_NUTRI,
  desfechoDoErro,
  juntarFalas,
  temPortugues,
} from './escutaDoDitado'

/* O ditado que ouve pelo próprio celular, e escreve enquanto ela fala.
 *
 * ──────────────────── Por que existe ────────────────────
 * Decisão do Helton em 11/09/2026, entre três opções: "ouvir pelo próprio
 * celular". Os números do aparelho dele fecharam a questão -- o servidor de voz
 * levava de 5 a 19,5 s para transcrever 6 a 9 s de fala, e a rede menos de 1,2 s.
 * Nenhum ajuste de aplicativo conserta um motor lento, e o pedido dele, repetido
 * por dois dias, era "conforme eu fosse falando ela podia ir escrevendo".
 *
 * ──────────────────── O ÁUDIO NÃO SAI DO CELULAR ────────────────────
 * `requiresOnDeviceRecognition: true` em toda escuta, sem exceção. Sem isso, o
 * Android pode mandar o áudio para o servidor do Google -- e a promessa que
 * sustentou a escolha foi exatamente o contrário. O Google seria um terceiro
 * recebendo o que ela dita, e o que ela dita tem nome de paciente.
 *
 * Quando o celular não consegue ouvir sozinho em português, a resposta é
 * `indisponivel`, e quem chamou volta para o servidor de voz PRÓPRIO -- o de
 * sempre, sob o contrato de sempre. Nunca para o Google.
 *
 * ──────────────────── E no Expo Go ────────────────────
 * O módulo nativo não existe lá. `import` estático dele derrubaria o app inteiro
 * na abertura ("Cannot find native module"), e o Expo Go continua sendo onde se
 * testa enquanto o build não chega. Por isso o módulo entra por `import()`
 * dentro de `try`, e a falha vira `indisponivel` -- a mesma defesa do
 * `expo-notifications` em `lembretes.ts`, e pelo mesmo motivo. */

type Modulo = typeof import('expo-speech-recognition')['ExpoSpeechRecognitionModule']

/* Carregado uma vez. `undefined` = ainda não tentou; `null` = tentou e não há
   (Expo Go). Tentar de novo a cada toque no microfone seria pagar a exceção a
   cada vez. */
let modulo: Modulo | null | undefined

async function carregar(): Promise<Modulo | null> {
  if (modulo !== undefined) return modulo
  try {
    const m = await import('expo-speech-recognition')
    modulo = m.ExpoSpeechRecognitionModule ?? null
  } catch {
    /* Expo Go. Não é erro, é o ambiente -- e sem log, porque ia aparecer a cada
       abertura do app enquanto o build não sai. */
    modulo = null
  }
  return modulo
}

export type Escuta =
  | { tipo: 'ouvindo'; parar: () => void; cancelar: () => void }
  /* O celular CONSEGUE ouvir sozinho, mas o português ainda não foi baixado.
   *
   * Estado próprio, e não um `indisponivel` qualquer -- levantado pela sessão
   * APP 2, e ela está certa. Se isto caísse calado no servidor, ele montaria o
   * build, testaria, veria lento de novo e concluiria que "escrever enquanto
   * fala não funciona" -- quando o que falta é um download de uma vez só. A
   * tela oferece baixar, dizendo por quê, e ESTA frase vai pelo servidor. */
  | { tipo: 'falta_portugues' }
  | { tipo: 'indisponivel'; motivo: string }

export type OpcoesDaEscuta = {
  /** O texto até agora, a cada pedaço. É o que faz escrever enquanto fala. */
  aoParcial: (texto: string) => void
  /** O texto final, quando a escuta termina. Vazio se ela não falou nada. */
  aoFinal: (texto: string) => void
  /**
   * Algo deu errado DEPOIS de começar. `reserva` quer dizer "este celular não
   * ouve sozinho" -- quem chamou deve cair no servidor próprio.
   */
  aoErro: (erro: { reserva: boolean; mensagem: string }) => void
  /** Palavras que o reconhecedor não esperaria. Padrão: as da nutricionista. */
  palavras?: string[]
}

/**
 * Pede ao sistema o português para ouvir sem internet. Chamado pela TELA, quando
 * ela aceitar -- e nunca sozinho: no Android 13 isto abre uma caixa do sistema,
 * e caixa que aparece sem a pessoa ter pedido nada é caixa que se fecha sem ler.
 *
 * No Android 14 em diante o download pode esperar Wi-Fi -- por isso o resultado
 * volta para a tela dizer "vai ficar pronto" em vez de prometer agora.
 */
export async function baixarPortugues(): Promise<'pronto' | 'agendado' | 'abriu_caixa' | 'nao_deu'> {
  const m = await carregar()
  if (!m || typeof m.androidTriggerOfflineModelDownload !== 'function') return 'nao_deu'
  try {
    const r = await m.androidTriggerOfflineModelDownload({ locale: 'pt-BR' })
    const s = String((r as { status?: string } | null)?.status ?? '')
    if (s === 'download_success') return 'pronto'
    if (s === 'download_scheduled') return 'agendado'
    if (s === 'opened_dialog') return 'abriu_caixa'
    /* Status que a biblioteca venha a mandar no futuro: não sabemos, e dizer
       "agendado" é o que não promete demais. */
    return 'agendado'
  } catch (e) {
    falha('Não consegui pedir o download do português.', e)
    return 'nao_deu'
  }
}

/**
 * Começa a ouvir. Devolve `indisponivel` ANTES de ligar o microfone quando este
 * celular não consegue ouvir sozinho -- para quem chamou poder usar o servidor
 * sem que ela perca a frase.
 */
export async function ouvirNoAparelho(op: OpcoesDaEscuta): Promise<Escuta> {
  const m = await carregar()
  if (!m) return { tipo: 'indisponivel', motivo: 'sem_modulo' }

  try {
    if (typeof m.isRecognitionAvailable === 'function' && !m.isRecognitionAvailable()) {
      return { tipo: 'indisponivel', motivo: 'sem_reconhecedor' }
    }
    if (typeof m.supportsOnDeviceRecognition === 'function' && !m.supportsOnDeviceRecognition()) {
      return { tipo: 'indisponivel', motivo: 'sem_reconhecimento_no_aparelho' }
    }

    /* O português está no celular?
     *
     * No Android 12 e anterior a lista vem VAZIA sempre -- não quer dizer "sem
     * português", quer dizer "não sei". Nesse caso tenta assim mesmo: se faltar,
     * o `start` devolve 'language-not-supported', que já cai na reserva. Só a
     * lista preenchida e SEM português vale como "não tem". */
    if (typeof m.getSupportedLocales === 'function') {
      const locais = await m.getSupportedLocales({}).catch(() => null)
      const instalados = locais?.installedLocales ?? []
      console.log('[cygnos] ditado: idiomas no aparelho:', instalados.join(', ') || '(nenhum)')
      if (instalados.length > 0 && !temPortugues(instalados)) {
        return { tipo: 'falta_portugues' }
      }
    }

    /* Sem permissão de RECONHECER, segue calado pelo servidor.
     *
     * Chamava `aoErro` ("o Cygnos não tem permissão para usar o microfone") E
     * devolvia `indisponivel` -- e o `<Ditado>` trata `indisponivel` gravando
     * pelo servidor. Ela lia que não havia microfone com o microfone gravando.
     * O microfone em si já foi liberado antes daqui (`prepararMicrofone`); o
     * que faltou é a permissão de transcrever no aparelho, que no iPhone é
     * outra. O servidor não precisa dela. */
    const permissao = await m.requestPermissionsAsync()
    if (!permissao?.granted) {
      return { tipo: 'indisponivel', motivo: 'sem_permissao' }
    }
  } catch (e) {
    /* Qualquer surpresa na preparação volta para o servidor. É o caminho que
       funcionava antes de hoje, e ela não precisa saber que o outro tentou. */
    falha('O reconhecimento no aparelho não conseguiu começar.', e)
    return { tipo: 'indisponivel', motivo: 'falhou_ao_preparar' }
  }

  /* ──────────────────── A ESCUTA ──────────────────── */
  const fechados: string[] = []
  let parcial = ''
  /* Um desfecho só por escuta.
   *
   * A biblioteca promete que `end` é "sempre o último evento, INCLUSIVE depois
   * de erro" -- está no README dela. Então todo erro que já tinha virado
   * `aoErro` recebia um `aoFinal` logo em seguida, e o segundo desfazia o
   * primeiro:
   *   - na RESERVA, `aoErro` começava a gravar para o servidor, e o `end` que
   *     chegava depois punha a tela em "parado" com o gravador ainda aberto: o
   *     microfone ficava ligado sem ninguém ver, e o toque seguinte recusava
   *     abrir o microfone;
   *   - no erro comum, a frase certa ("o microfone está ocupado...") era
   *     trocada por "Não ouvi nada".
   * Achado na terceira rodada de testes, lendo o README contra os ouvintes,
   * antes do primeiro teste do build de desenvolvimento.
   *
   * `terminou` passa a valer para os dois caminhos: quem chega primeiro decide,
   * e o outro é ignorado. */
  let terminou = false
  /* `cancelar` promete jogar fora o que foi ouvido. Mas `abort` também termina
     em `end`, e o `end` entregava o texto como se ela tivesse tocado em
     "pronto". */
  let cancelada = false

  const inscricoes: { remove: () => void }[] = []
  const desligar = () => {
    for (const s of inscricoes.splice(0)) {
      try {
        s.remove()
      } catch {
        /* Inscrição que já tinha caído. Nada a fazer. */
      }
    }
  }

  inscricoes.push(
    m.addListener('result', ev => {
      const texto = ev?.results?.[0]?.transcript ?? ''
      if (ev?.isFinal) {
        /* Trecho fechado: entra na lista e o parcial zera. Com o reconhecedor
           que repete tudo, `juntarFalas` impede a frase de dobrar. */
        const juntado = juntarFalas(fechados, texto)
        fechados.splice(0, fechados.length, juntado)
        parcial = ''
        op.aoParcial(juntado)
      } else {
        parcial = texto
        op.aoParcial(juntarFalas(fechados, parcial))
      }
    }),
  )

  inscricoes.push(
    m.addListener('error', ev => {
      const d = desfechoDoErro(ev?.error)
      /* Silêncio e parada seguem para o `end`, que entrega o que houver (ou
         "não ouvi nada"). Todo o resto decide AQUI, e fecha a escuta. */
      if (d.tipo === 'parou' || d.tipo === 'silencio') return
      if (terminou) return
      terminou = true
      desligar()
      if (d.tipo === 'reserva') {
        op.aoErro({ reserva: true, mensagem: '' })
        return
      }
      op.aoErro({ reserva: false, mensagem: d.mensagem })
    }),
  )

  inscricoes.push(
    m.addListener('end', () => {
      if (terminou) return
      terminou = true
      desligar()
      if (cancelada) return
      op.aoFinal(juntarFalas(fechados, parcial))
    }),
  )

  try {
    m.start({
      lang: 'pt-BR',
      interimResults: true,
      /* Contínua: ela fala com pausas ("marca um lembrete... pras oito...").
         Sem isto o reconhecedor encerra na primeira respirada e corta a
         frase ao meio. Quem encerra é o botão, ou o `parar`. */
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      contextualStrings: op.palavras ?? PALAVRAS_DA_NUTRI,
    })
  } catch (e) {
    desligar()
    falha('O reconhecimento no aparelho recusou começar.', e)
    return { tipo: 'indisponivel', motivo: 'recusou_comecar' }
  }

  return {
    tipo: 'ouvindo',
    /* `stop` entrega o que foi ouvido (vira `end` com o texto); `abort` joga
       fora. Os dois existem porque a barra tem os dois gestos: "pronto" e
       "cancelar". */
    parar: () => {
      try {
        m.stop()
      } catch (e) {
        falha('Não consegui parar a escuta.', e)
      }
    },
    cancelar: () => {
      cancelada = true
      try {
        m.abort()
      } catch (e) {
        falha('Não consegui cancelar a escuta.', e)
      }
    },
  }
}
