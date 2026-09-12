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
  /* ──────────────────── A ESCUTA QUE RECOMEÇA ────────────────────
   *
   * Relatado no primeiro teste no aparelho dele: "ele grava só o 'oi' e já
   * para". O reconhecimento DO APARELHO encerra sozinho na primeira pausa --
   * `continuous` é implementado pelo Android como "sessão segmentada", e a
   * própria documentação do módulo diz que, dependendo do reconhecedor, ela
   * pode não ter efeito nenhum. O de dentro do celular é justamente um desses.
   *
   * Então quem segura a escuta somos nós: no `end`, se ela NÃO mandou parar,
   * a escuta recomeça e o que já foi ouvido continua na lista (`fechados`).
   * Para ela, é uma frase só; por baixo, são várias sessões emendadas.
   *
   * Dois freios, para o microfone nunca ficar aberto sozinho:
   *   - um TETO de tempo desde o toque no microfone;
   *   - um teto de recomeços, para o caso de o reconhecedor encerrar na hora,
   *     em laço, e o app ficar reabrindo para sempre. */
  const COMECOU_EM = Date.now()
  const TETO_DA_ESCUTA_MS = 90_000
  const TETO_DE_RECOMECOS = 20
  let recomecos = 0
  let pediuParar = false

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
      /* "Ocupado" é o mesmo respiro do recomeço, e não uma falha do aparelho:
         acontece quando o sistema ainda está soltando o microfone da sessão
         anterior. Quem cuida é o `end`, que vem logo depois. */
      /* Comparado como TEXTO: a lista de tipos do módulo não tem o `busy` do
         Android, e o valor chega assim mesmo do lado nativo. */
      if (/busy/i.test(String(ev?.error ?? ''))) return
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

  /* As opções de início ficam aqui em cima porque o recomeço usa as MESMAS:
     duas listas iguais escritas em dois lugares divergiriam no primeiro ajuste,
     e o recomeço passaria a ouvir diferente do começo. Armadilha 5. */
  const comoOuvir = {
    lang: 'pt-BR',
    interimResults: true,
    /* Contínua: ela fala com pausas ("marca um lembrete... pras oito...").
       Onde o aparelho respeita, é ela que segura; onde não respeita, quem
       segura é o recomeço do `end`. */
    continuous: true,
    requiresOnDeviceRecognition: true,
    addsPunctuation: true,
    contextualStrings: op.palavras ?? PALAVRAS_DA_NUTRI,
    /* O tempo de silêncio que o Android espera antes de decidir que a frase
       acabou. O padrão é de busca por voz -- perto de um segundo --, e quem
       está pensando no que dizer para a paciente passa disso sem esforço.
       Três segundos é a pausa de quem está formulando; acima disso, o recomeço
       assume. */
    androidIntentOptions: {
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
      EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 8000,
    },
  }

  /* Entrega o que foi ouvido e fecha. Um lugar só: o `end` chama daqui quando
     desiste de recomeçar, e o recomeço chama quando o microfone não reabre. */
  const entregar = () => {
    if (terminou) return
    terminou = true
    desligar()
    if (cancelada) return
    const tudo = juntarFalas(fechados, parcial)
    console.log(
      '[cygnos] ditado: entregando',
      tudo.length,
      'letras depois de',
      recomecos,
      'recomeços e',
      Math.round((Date.now() - COMECOU_EM) / 1000) + 's',
    )
    op.aoFinal(tudo)
  }

  /* ── O RESPIRO DO ANDROID ──
   *
   * Relatado no segundo teste, com o recomeço já no ar: "eu falei Aurora e ele
   * escreveu 'ouro.' e parou". O recomeço estava lá e falhava: chamar `start`
   * DENTRO do `end` pede o microfone no mesmo instante em que o sistema o está
   * fechando, e o Android responde "reconhecedor ocupado" -- a exceção caía no
   * `catch` e o app entregava a primeira palavra.
   *
   * Então o recomeço espera um pouco e tenta de novo, com o intervalo
   * crescendo. Três tentativas: se o microfone não voltar em pouco mais de um
   * segundo, entregar o que tem é melhor do que ficar tentando com ela
   * falando para uma tela parada. */
  const RESPIRO_MS = [250, 500, 900]
  const recomecar = (tentativa = 0) => {
    if (terminou || pediuParar || cancelada) return
    if (tentativa >= RESPIRO_MS.length) {
      falha('A escuta não recomeçou depois de três tentativas.', null)
      entregar()
      return
    }
    setTimeout(() => {
      if (terminou || pediuParar || cancelada) return
      try {
        m.start(comoOuvir)
        console.log('[cygnos] ditado: escuta recomeçada', recomecos)
      } catch (e) {
        falha('A escuta não recomeçou; tentando de novo.', e)
        recomecar(tentativa + 1)
      }
    }, RESPIRO_MS[tentativa])
  }

  inscricoes.push(
    m.addListener('end', () => {
      if (terminou) return

      /* Ela não mandou parar, ainda cabe tempo: recomeça, e o que já foi ouvido
         fica. É isto que transforma várias sessões do Android numa frase só. */
      console.log(
        '[cygnos] ditado: a escuta do aparelho encerrou.',
        pediuParar ? 'Ela mandou parar.' : 'Sozinha -- vou recomeçar.',
      )
      if (
        !pediuParar &&
        !cancelada &&
        recomecos < TETO_DE_RECOMECOS &&
        Date.now() - COMECOU_EM < TETO_DA_ESCUTA_MS
      ) {
        recomecos++
        /* O parcial da sessão que acabou entra como trecho fechado antes de
           recomeçar: a sessão nova nasce sem memória, e sem isto a última
           palavra dita antes da pausa se perderia. */
        if (parcial.trim()) {
          const juntado = juntarFalas(fechados, parcial)
          fechados.splice(0, fechados.length, juntado)
          parcial = ''
        }
        recomecar()
        return
      }

      entregar()
    }),
  )

  try {
    m.start(comoOuvir)
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
      /* ANTES do `stop`: é o que impede o `end` de recomeçar a escuta. */
      pediuParar = true
      try {
        m.stop()
      } catch (e) {
        falha('Não consegui parar a escuta.', e)
      }
    },
    cancelar: () => {
      cancelada = true
      pediuParar = true
      try {
        m.abort()
      } catch (e) {
        falha('Não consegui cancelar a escuta.', e)
      }
    },
  }
}
