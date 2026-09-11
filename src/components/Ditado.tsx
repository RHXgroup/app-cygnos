import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { createAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import {
  LIMITE_SEGUNDOS,
  OPCOES_DITADO,
  prepararMicrofone,
  precisaExplicarMicrofone,
  marcarMicrofoneExplicado,
  EXPLICACAO_DO_MICROFONE,
  mmss,
  transcrever,
  type AssuntoDoAudio,
} from '../lib/voz'
import { baixarPortugues, ouvirNoAparelho, type Escuta } from '../lib/ditadoNoAparelho'
import { estilosDe, paleta } from '../lib/tema'
import { Confirmacao } from './Confirmacao'
import { BotaoDeVoz } from './BotaoDeVoz'

/* O botão de falar em vez de digitar.
 *
 * Vive DENTRO da tela de escrever, e não numa tela própria, de propósito: o que
 * a pessoa dita vira texto no mesmo campo, e a conferência item por item que já
 * existe ali passa a valer também para a fala. Uma tela separada teria de
 * repetir aquela conferência inteira — ou, pior, não repetir, e virar o único
 * caminho do app que grava sem mostrar antes.
 *
 * ── Três estados, e cada um diz uma coisa diferente ────────────────────────
 * Parado, a tela convida. Gravando, ela mostra o cronômetro, porque quem fala
 * para um aparelho não tem como saber se ele está ouvindo. Enviando, ela avisa
 * que está pensando — a transcrição leva alguns segundos, e sem aviso a pessoa
 * aperta de novo e grava por cima. */

/* `ouvindo` é o quarto, e ele não é "gravando": no reconhecimento do próprio
   celular não há arquivo, cronômetro nem onda -- o gravador nem está ligado. Se
   ele reaproveitasse a tela de `gravando`, a onda ficaria reta e o relógio em
   0:00 com a pessoa falando, e a própria tela diz que onda reta quer dizer
   "o áudio não está entrando". A tela mentiria sobre o que ela mesma mede. */
type Estado = 'parado' | 'gravando' | 'ouvindo' | 'enviando'

/* ──────────────────── QUEM OUVE PELO PRÓPRIO CELULAR ────────────────────
 *
 * Só o lado da nutricionista, por enquanto: a Aurora e o recado. Foi dali que
 * veio o pedido ("escrever enquanto eu falo") e foi ali que a lentidão foi
 * medida -- o Whisper levando de 5 a 19,5 s para 6 a 9 s de fala.
 *
 * O paciente continua no servidor, e é decisão, não esquecimento. A lista de
 * palavras que o reconhecedor recebe é a da NUTRICIONISTA (verbos de agenda,
 * "Cygnos", "Aurora"); sem uma lista de comida no lugar, quem dita o almoço
 * receberia um reconhecedor enviesado para comando. O servidor, ao contrário,
 * já tem o contexto de refeição afinado. Muda quando houver a lista certa. */
const OUVE_NO_APARELHO: ReadonlySet<AssuntoDoAudio> = new Set(['nutri', 'recado'])

/* Este celular já mostrou que não ouve sozinho, nesta sessão. Guardado fora do
   componente porque a tela da Aurora monta e desmonta -- e tentar de novo a cada
   toque seria pagar a mesma recusa toda vez antes de cair no servidor. */
let semEscutaNoAparelho = false

/* Oferecer o download do português UMA vez por sessão. Oferta que volta a cada
   toque vira atrito, e atrito vira "desligo isso". */
let jaOfereceuPortugues = false

/* A onda. Barra fina e espaçada porque o que importa é o RELEVO — barra grossa
   colada vira um bloco cheio, e um bloco cheio não mostra sílaba. */
const LARGURA_BARRA = 3
const ESPACO_BARRA = 3
const ALTURA_MIN = 3
const ALTURA_MAX = 26

export function Ditado({
  onTexto,
  onErro,
  onParcial,
  assunto = 'refeicao',
  compacto = false,
}: {
  /* O que foi ouvido. A tela decide onde colocar — aqui não se sabe se o campo
     já tem coisa escrita. */
  onTexto: (texto: string) => void
  onErro: (mensagem: string) => void
  /* O texto até agora, a cada pedaço, quando o celular ouve sozinho. É o que
     faz escrever ENQUANTO ela fala.

     Vem a frase INTEIRA a cada vez, e não o pedaço novo: "remarca", depois
     "remarca a", depois "remarca a consulta". A tela SUBSTITUI o que estava,
     nunca acrescenta -- senão o campo vira "remarca remarca a remarca a
     consulta". No fim chega `onTexto` com a frase final, como sempre. */
  onParcial?: (texto: string) => void
  /* Qual vocabulário o servidor deve esperar. Padrão 'refeicao' porque é o que
     as duas telas que já usam este componente pedem — acrescentar o parâmetro
     não pode mudar o que elas fazem hoje. */
  assunto?: AssuntoDoAudio
  /* Só o botão, sem o convite escrito em volta.
     A barra de escrever da Aurora é uma linha de 40 e poucos pixels, e o
     componente inteiro nasceu para ocupar um bloco. Com `compacto` ele cabe ao
     lado do campo — e continua sendo O MESMO componente, com a mesma
     permissão, o mesmo cronômetro e o mesmo reenvio. Uma segunda gravação
     escrita para a Aurora seria a armadilha 5 outra vez, e desta vez em cima de
     um caminho que já custou uma semana. */
  compacto?: boolean
}) {
  const styles = estilos()
  const gravador = useAudioRecorder(OPCOES_DITADO)
  /* 80 ms, e não os 250 de antes. É a taxa em que a onda é amostrada, e a 4
     quadros por segundo ela andava aos saltos — parecia travada, que é o
     oposto do que ela existe para dizer. */
  const estadoDoGravador = useAudioRecorderState(gravador, 80)
  const [estado, setEstado] = useState<Estado>('parado')
  /* A última gravação que não virou texto.
   *
   * Quando o servidor não ouve nada, sobram duas explicações opostas — o
   * microfone gravou silêncio, ou o detector de voz descartou o que veio — e a
   * pessoa não tem como saber qual. Ouvir resolve em três segundos: se a voz
   * está lá, o problema não é dela.
   *
   * É diagnóstico, mas é também o que qualquer um faria com um gravador que
   * "não ouviu": apertar o play. */
  const [gravacaoMuda, setGravacaoMuda] = useState<string | null>(null)

  /* A escuta do próprio celular, quando ela está aberta. Referência e não
     estado: `parar` precisa dela no mesmo instante do toque. */
  const escuta = useRef<Extract<Escuta, { tipo: 'ouvindo' }> | null>(null)
  /* Já chegou algum pedaço? Decide o que fazer quando o reconhecedor desiste:
     antes de ela falar, cai no servidor sem ela perceber; depois, as palavras
     dela se perderam, e aí ela precisa saber. */
  const recebeuParcial = useRef(false)
  /* A oferta do português fica para DEPOIS desta frase: aparecer com a pessoa
     no meio da fala seria uma caixa por cima do que ela está fazendo. */
  const ofertaPendente = useRef(false)
  const [oferecendoPortugues, setOferecendoPortugues] = useState(false)

  /* O `estado` de dentro do efeito de limpeza seria o da primeira renderização,
     e a limpeza só roda no fim. Sem a referência, sair da tela gravando deixaria
     o microfone aberto. */
  const gravandoAgora = useRef(false)
  gravandoAgora.current = estado === 'gravando'

  useEffect(
    () => () => {
      if (gravandoAgora.current) gravador.stop().catch(() => {})
      /* Sair da tela ouvindo não pode deixar o microfone do sistema aberto --
         e cancelar, e não parar: parar entregaria a frase a uma tela que já
         não existe. */
      escuta.current?.cancelar()
      escuta.current = null
    },
    [gravador],
  )

  const segundos = estadoDoGravador.durationMillis / 1000

  /* O nível de entrada, de 0 a 1.
   *
   * `metering` vem em dBFS: -160 é silêncio absoluto e 0 é o máximo antes de
   * distorcer. Fala normal a um palmo do aparelho fica entre -30 e -10. A
   * conversão corta em -60 porque abaixo disso é ruído de fundo, e esticar a
   * barra até -160 deixaria toda fala colada no topo. */
  const nivel = (() => {
    const db = estadoDoGravador.metering
    if (db === undefined || db === null) return 0
    return Math.max(0, Math.min(1, (db + 60) / 60))
  })()

  /* ── A onda ───────────────────────────────────────────────────────────────
   *
   * O que havia aqui era uma barra de progresso: um trilho cheio, e um pedaço
   * verde que ia e voltava conforme a voz. Ela mostrava o instante e mais nada
   * — e uma barra que vai e volta sozinha é o desenho universal de "carregando",
   * então ela dizia a coisa errada: parecia espera, não escuta.
   *
   * A onda mostra os últimos segundos ao mesmo tempo. É a forma que todo
   * aparelho de gravar usa, e ela responde a pergunta que a pessoa tem — "ele
   * está me ouvindo?" — sem legenda: a fala tem sílaba, e sílaba tem relevo. Uma
   * linha reta enquanto ela fala significa que o áudio não está entrando.
   *
   * As barras antigas ficam mais apagadas, e isso é o que dá o sentido de
   * tempo: sem o esmaecimento, o desenho vira um gráfico parado que se
   * reorganiza sozinho. */
  const [ondas, setOndas] = useState<number[]>([])
  /* Quantas barras cabem. Medido, e não fixo: o mesmo componente aparece na
     tela de escrever refeição e na de contar o plano, com larguras diferentes,
     e sobra de barra sairia pela direita. */
  const [quantasBarras, setQuantasBarras] = useState(24)

  /* Uma amostra por leitura do gravador. Depende de `durationMillis` porque é
     ele que muda a cada tique — `nivel` sozinho repetiria o valor e o efeito
     não rodaria durante o silêncio, que é justamente quando a linha reta
     precisa aparecer. */
  useEffect(() => {
    if (estado !== 'gravando') return
    setOndas(atuais => {
      const proximo = atuais.length >= quantasBarras ? atuais.slice(1) : atuais.slice()
      proximo.push(nivel)
      return proximo
    })
    /* `nivel` fica de fora de propósito: ele é lido dentro, e listá-lo faria o
       efeito rodar de novo na renderização que ele mesmo causou. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoDoGravador.durationMillis, estado, quantasBarras])

  /* O pico da gravação inteira. Vai para o log ao parar: uma barra que a pessoa
     viu mexer e um número que eu leio dizem a mesma coisa, e o número sobrevive
     à conversa. */
  const pico = useRef(-160)
  if (estado === 'gravando' && (estadoDoGravador.metering ?? -160) > pico.current) {
    pico.current = estadoDoGravador.metering ?? -160
  }

  /* Para sozinho no limite. Sem isto, a tela esquecida aberta grava até a
     bateria acabar — e o arquivo cresceria além do que o servidor aceita. */
  useEffect(() => {
    if (estado === 'gravando' && segundos >= LIMITE_SEGUNDOS) {
      void parar()
    }
    /* `parar` fica de fora das dependências de propósito: ela é recriada a
       cada renderização, e listá-la faria o efeito rodar sem parar. */
  }, [estado, segundos])

  /* Duas etapas: a nossa explicação, e depois a do sistema.
     `seguirComMicrofone` é o que roda DEPOIS do "pode pedir" — e também é o
     caminho direto de quem já explicou uma vez. */
  const [explicandoMicrofone, setExplicandoMicrofone] = useState(false)

  async function comecar() {
    if (await precisaExplicarMicrofone()) {
      setExplicandoMicrofone(true)
      return
    }
    await seguirComMicrofone()
  }

  async function seguirComMicrofone() {
    const permissao = await prepararMicrofone()
    if (permissao.tipo === 'negada') {
      onErro(permissao.mensagem)
      return
    }

    if (OUVE_NO_APARELHO.has(assunto) && !semEscutaNoAparelho) {
      recebeuParcial.current = false
      const e = await ouvirNoAparelho({
        aoParcial: texto => {
          recebeuParcial.current = true
          onParcial?.(texto)
        },
        aoFinal: texto => {
          escuta.current = null
          setEstado('parado')
          const limpo = texto.trim()
          if (limpo) onTexto(limpo)
          /* Sem "ouvir a gravação": aqui não há gravação para ouvir. A frase do
             servidor manda tocar um áudio que não existe neste caminho. */
          else onErro('Não ouvi nada. Fale perto do celular e tente de novo.')
        },
        aoErro: ({ reserva, mensagem }) => {
          escuta.current = null
          setEstado('parado')
          if (reserva) {
            /* Este celular não ouve sozinho. Lembra, para não pagar a recusa a
               cada toque, e segue pelo servidor. */
            semEscutaNoAparelho = true
            if (!recebeuParcial.current) {
              void gravarNoServidor()
              return
            }
            onErro('Perdi o áudio no meio da frase. Toque no microfone de novo.')
            return
          }
          onErro(mensagem)
        },
      })

      /* Uma linha que diz qual dos caminhos foi tomado. Sem ela, "caiu no
         servidor" e "o celular não quis ouvir" dão a mesma foto de tela -- e a
         medição custa uma rodada de teste dele. */
      console.log(
        '[cygnos] ditado no aparelho:',
        e.tipo,
        e.tipo === 'indisponivel' ? e.motivo : '',
      )

      if (e.tipo === 'ouvindo') {
        escuta.current = e
        setEstado('ouvindo')
        return
      }

      /* Falta o português: ESTA frase vai pelo servidor, e a oferta de baixar
         vem depois dela. Cair calado no servidor faria ele testar o build,
         achar lento de novo e concluir que "escrever enquanto fala" não
         funciona -- quando o que falta é um download de uma vez só. */
      if (e.tipo === 'falta_portugues' && !jaOfereceuPortugues) ofertaPendente.current = true
      /* `indisponivel` (Expo Go, celular sem reconhecedor): segue como sempre. */
    }

    await gravarNoServidor()
  }

  /* O caminho de sempre: grava o arquivo, e o servidor transcreve. */
  async function gravarNoServidor() {
    setGravacaoMuda(null)
    setOndas([])
    pico.current = -160

    try {
      await gravador.prepareToRecordAsync()
      gravador.record()
      setEstado('gravando')
    } catch {
      onErro('Não consegui abrir o microfone agora.')
    }
  }

  async function parar() {
    /* Ouvindo pelo celular: parar ENTREGA o que foi ouvido -- chega pelo
       `aoFinal`. A referência sai antes de chamar, para um segundo toque não
       parar a mesma escuta duas vezes. */
    const aberta = escuta.current
    if (aberta) {
      escuta.current = null
      aberta.parar()
      return
    }

    /* Marca antes de esperar: o `stop` demora o suficiente para caber um
       segundo toque, e dois `stop` seguidos derrubam o gravador. */
    setEstado('enviando')

    console.log('[cygnos] ditado: pico de entrada', pico.current.toFixed(1), 'dBFS')

    /* O tempo tem de ser lido ANTES do stop — depois dele o estado zera, e a
       gravação de dez segundos seria descartada como curta demais. */
    const mmss = segundos

    try {
      await gravador.stop()
    } catch {
      setEstado('parado')
      onErro('Não consegui encerrar a gravação.')
      return
    }

    const uri = gravador.uri
    if (!uri) {
      setEstado('parado')
      onErro('A gravação não chegou a ser salva. Tente de novo.')
      return
    }

    const r = await transcrever(uri, mmss, assunto)
    setEstado('parado')

    if (ofertaPendente.current) {
      ofertaPendente.current = false
      jaOfereceuPortugues = true
      setOferecendoPortugues(true)
    }

    if (r.tipo === 'ok') {
      onTexto(r.texto)
      return
    }
    if (r.tipo === 'curto_demais') {
      /* A frase muda com o ASSUNTO. "Fale o que você comeu" para uma
         nutricionista que estava ditando "remarca a consulta da Juliana" é o
         app falando de outra coisa -- e quem lê isso conclui que apertou o
         botão errado, não que falou pouco. */
      onErro(
        assunto === 'nutri'
          ? 'Foi rápido demais. Segure o botão e fale o que você quer.'
          : assunto === 'treino'
            ? 'Foi rápido demais. Segure o botão e diga o que você fez.'
            : 'Foi rápido demais. Segure o botão e fale o que você comeu.',
      )
      return
    }
    if (r.tipo === 'nada_ouvido') {
      setGravacaoMuda(uri)
      onErro('Não ouvi nada. Toque em "ouvir a gravação" para conferir se a sua voz foi captada.')
      return
    }
    onErro(r.mensagem)
  }

  if (estado === 'enviando') {
    /* Compacto não mostra a frase, e mostra o giro NO LUGAR do microfone.
       O botão fica onde estava, do mesmo tamanho: se ele sumisse, o campo de
       escrever pularia de largura no meio do envio. */
    if (compacto) {
      return (
        <View style={[styles.redondo, styles.redondoPensando]}>
          <ActivityIndicator size="small" color={paleta().cores.verde} />
        </View>
      )
    }
    return (
      <View style={[styles.botao, styles.pensando]}>
        <ActivityIndicator size="small" color={paleta().cores.verde} />
        <Text style={styles.textoPensando}>Entendendo o que você falou…</Text>
      </View>
    )
  }

  if (estado === 'ouvindo' && compacto) {
    /* Sem cronômetro: não há gravador ligado para medir. O que diz que ele
       está ouvindo é o texto aparecendo no campo ao lado -- que é justamente o
       que este caminho existe para fazer. */
    return (
      <Pressable
        onPress={parar}
        style={({ pressed }) => [styles.redondo, styles.redondoGravando, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel="Parar de ouvir"
      >
        <Ionicons name="stop" size={16} color={paleta().cores.erroTexto} />
      </Pressable>
    )
  }

  if (estado === 'ouvindo') {
    return (
      <Pressable
        onPress={parar}
        style={({ pressed }) => [styles.botao, styles.gravando, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel="Parar de ouvir"
      >
        <View style={styles.linhaGravando}>
          <View style={styles.ponto} />
          <Text style={styles.textoGravando}>Ouvindo -- o texto aparece enquanto você fala</Text>
        </View>
        <View style={styles.pararLinha}>
          <Ionicons name="stop-circle" size={18} color={paleta().cores.erroTexto} />
          <Text style={styles.toqueParaParar}>Toque para parar</Text>
        </View>
      </Pressable>
    )
  }

  if (estado === 'gravando' && compacto) {
    /* Gravando, o botão compacto vira o cronômetro.
       A onda e o "toque para parar" ficam de fora — não cabem numa linha de
       barra, e espremidos quebram no meio da palavra, que é o defeito que a
       versão grande já pagou. O que NÃO pode faltar é o tempo correndo: sem
       ele, quem fala para um aparelho não tem como saber se ele está ouvindo. */
    return (
      <Pressable
        onPress={parar}
        style={({ pressed }) => [styles.redondo, styles.redondoGravando, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel={'Parar de gravar. ' + mmss(segundos)}
      >
        <Text style={styles.relogioCompacto}>{mmss(segundos)}</Text>
      </Pressable>
    )
  }

  if (estado === 'gravando') {
    return (
      <Pressable
        onPress={parar}
        style={({ pressed }) => [styles.botao, styles.gravando, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel="Parar de gravar"
      >
        {/* Três blocos, e não uma linha só.
             Ponto + "Ouvindo" + cronômetro + espaçador + "toque para parar"
             dividiam a MESMA linha, e num telefone estreito ela espremia tudo
             até a palavra quebrar no meio — sobrando ilegível justamente a
             instrução de que a pessoa precisa naquele instante. */}
        <View style={styles.linhaGravando}>
          <View style={styles.ponto} />
          <Text style={styles.textoGravando}>Ouvindo</Text>
        </View>

        <Text style={styles.relogio}>{mmss(segundos)}</Text>

        {/* A onda é a prova de que o microfone está captando: reta com a pessoa
            falando significa que o áudio não está entrando.

            Em linha PRÓPRIA, e não ao lado do cronômetro. Dividindo a mesma
            linha ela espremia o texto até a palavra quebrar no meio — e o que
            ficou ilegível foi justamente "toque para parar", que é a instrução
            de que a pessoa precisa naquele instante. */}
        <View
          style={styles.onda}
          onLayout={e => {
            const cabe = Math.floor(e.nativeEvent.layout.width / (LARGURA_BARRA + ESPACO_BARRA))
            const limitado = Math.max(10, Math.min(40, cabe))
            setQuantasBarras(atual => (atual === limitado ? atual : limitado))
          }}
        >
          {ondas.map((n, i) => (
            <View
              key={i}
              style={[
                styles.barra,
                {
                  height: ALTURA_MIN + n * (ALTURA_MAX - ALTURA_MIN),
                  /* A mais nova cheia, as de trás desbotando. É o que faz o
                     desenho ter direção — sem isso ele é um gráfico que se
                     reorganiza sozinho, e não um som que passou. */
                  opacity: 0.28 + 0.72 * ((i + 1) / ondas.length),
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.pararLinha}>
          <Ionicons name="stop-circle" size={18} color={paleta().cores.erroTexto} />
          <Text style={styles.toqueParaParar}>Toque para parar</Text>
        </View>
      </Pressable>
    )
  }

  return (
    <>
      {compacto ? (
        <Pressable
          onPress={comecar}
          style={({ pressed }) => [styles.redondo, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel="Falar em vez de digitar"
        >
          <Ionicons name="mic-outline" size={19} color={paleta().cores.ink} />
        </Pressable>
      ) : (
        <BotaoDeVoz estado="parado" rotulo="Falar em vez de digitar" onPress={comecar} />
      )}

      {gravacaoMuda && (
        <Pressable
          onPress={() => {
            /* Toca e se descarta. Um player por gravação, sem estado guardado:
               isto existe para conferir uma vez, não para virar tocador. */
            const p = createAudioPlayer({ uri: gravacaoMuda })
            p.play()
          }}
          style={({ pressed }) => [styles.botaoOuvir, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel="Ouvir a gravação"
        >
          <Ionicons name="play-circle-outline" size={17} color={paleta().inkMedio} />
          <Text style={styles.textoOuvir}>Ouvir a gravação</Text>
        </Pressable>
      )}

      {/* ──────────────────── O PORTUGUÊS PARA OUVIR SEM INTERNET ────────────────────
          Depois da frase, e não no meio dela. E uma vez por sessão.

          O argumento é o que ela ganha, e não o que falta: o texto aparecendo
          enquanto fala, e o áudio sem sair do celular. "Falta um pacote de
          idioma" é a frase do sistema; ninguém baixa nada por causa dela. */}
      <Confirmacao
        visivel={oferecendoPortugues}
        titulo="Escrever enquanto você fala"
        mensagem={
          'O seu celular pode ouvir sozinho, sem mandar o áudio para lugar nenhum -- e aí o ' +
          'texto aparece enquanto você fala. Para isso ele precisa do português, que se baixa ' +
          'uma vez só. Esta frase já foi pelo jeito de sempre.'
        }
        rotuloConfirmar="Baixar"
        rotuloCancelar="Agora não"
        onCancelar={() => setOferecendoPortugues(false)}
        onConfirmar={() => {
          setOferecendoPortugues(false)
          void baixarPortugues().then(r => {
            /* A caixa do sistema fala por si; as outras três precisam de frase.
               "Agendado" não promete agora: no Android 14 o download espera
               o Wi-Fi, e prometer "pronto" seria mentir sobre o próximo toque. */
            if (r === 'pronto') onErro('Pronto. Da próxima vez eu já escrevo enquanto você fala.')
            else if (r === 'agendado') onErro('O português vai ficar pronto quando o celular estiver no Wi-Fi.')
            else if (r === 'nao_deu') onErro('Não consegui baixar o português agora. Continua funcionando do jeito de sempre.')
          })
        }}
      />

      {/* A explicação ANTES da caixa do sistema, com a cara do app.
          A do Android não se estiliza e nem o texto dela é nosso — o que dá
          para escolher é o que a pessoa lê antes. E é aqui que vale: "por que
          um aplicativo de nutrição quer o meu microfone?" é a pergunta que
          existe de verdade, e quem não tem a resposta nega e depois não acha
          onde liberar. */}
      <Confirmacao
        visivel={explicandoMicrofone}
        titulo="Falar em vez de digitar"
        mensagem={EXPLICACAO_DO_MICROFONE}
        rotuloConfirmar="Pode pedir"
        rotuloCancelar="Agora não"
        onCancelar={() => setExplicandoMicrofone(false)}
        onConfirmar={() => {
          setExplicandoMicrofone(false)
          void marcarMicrofoneExplicado().then(seguirComMicrofone)
        }}
      />

    </>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    /* ──────────────────── A FORMA COMPACTA ────────────────────
       Redondo e do tamanho do botão de enviar ao lado dele. Os dois são
       irmãos na mesma barra, e um redondo de 38 ao lado de um de 34 se lê
       como desalinhamento, não como hierarquia. */
    redondo: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    redondoGravando: {
      backgroundColor: t.cores.erroFundo,
      borderColor: t.cores.erroBorda,
      /* Cresce um pouco: o cronômetro não cabe em 42, e um número cortado
         durante a gravação é o pior lugar possível para cortar. */
      width: 60,
      borderRadius: 21,
    },
    redondoPensando: { backgroundColor: t.cores.cartao },
    relogioCompacto: {
      fontSize: 12.5,
      fontWeight: '700',
      color: t.cores.erroTexto,
      fontVariant: ['tabular-nums'],
    },

  /* 52 de altura e canto redondo de pílula.
     46 num retângulo se lê como campo de formulário; o microfone é uma AÇÃO, e
     precisa parecer um botão em que se toca. */
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  /* O ícone dentro de um círculo cheio, e não solto sobre o fundo. É o que
     separa "um ícone ao lado de um texto" de um botão com identidade. */

  pararLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
  },
  pressionado: { opacity: 0.7 },


  botaoOuvir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 40,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoOuvir: { fontSize: 13.5, fontWeight: '600', color: t.inkMedio },

  onda: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    /* Da direita para a esquerda: a amostra nova entra no fim da lista, e é a
       ponta direita que a pessoa olha. Preenchendo da esquerda, a onda ficaria
       parada num canto enquanto a metade da faixa continuava vazia. */
    justifyContent: 'flex-end',
    gap: ESPACO_BARRA,
    height: ALTURA_MAX,
    overflow: 'hidden',
  },
  barra: { width: LARGURA_BARRA, borderRadius: LARGURA_BARRA / 2, backgroundColor: t.cores.limao },

  gravando: {
    borderColor: t.cores.verde,
    backgroundColor: t.cores.verdeMenta,
    /* Deixa de ser uma linha só: agora são duas, e a altura acompanha. */
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 7,
    height: 'auto',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  linhaGravando: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ponto: { width: 9, height: 9, borderRadius: 4, backgroundColor: t.cores.erroTexto },
  textoGravando: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
  /* Dígito de largura fixa: sem isto o "1" é mais estreito que o "8" e o
     cronômetro balança de um lado para o outro a cada segundo, empurrando o
     "toque para parar" junto. */
  /* Grande: com o bloco reorganizado, o cronometro deixou de dividir a linha
     com a instrucao e passou a ser a informacao principal enquanto ela fala. */
  relogio: {
    fontSize: 30,
    fontWeight: '800',
    color: t.cores.ink,
    textAlign: 'center',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },

  toqueParaParar: { fontSize: 13, fontWeight: '600', color: t.inkMedio },

  pensando: { borderColor: t.cores.borda },
  textoPensando: { fontSize: 14, fontWeight: '600', color: t.inkSuave },
  }),
)
