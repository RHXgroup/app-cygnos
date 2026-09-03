import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AvatarNutri } from '../components/AvatarNutri'
import {
  carregarCatalogo,
  conversaNoApp,
  linkDoWhatsapp,
  telefoneFormatado,
  type Nutricionista,
} from '../lib/nutricionista'
import {
  carregarMensagens,
  ehMinha,
  enviarMensagem,
  marcarLidas,
  ouvirMensagens,
  type Mensagem,
  type TipoDeAnexo,
} from '../lib/mensagens'
import { horaCurta, rotuloDoDia } from '../lib/formatar'
import {
  apagarFotoDoDiario,
  enderecoNoDiario,
  escolherFoto,
  guardarFotoDoDiario,
} from '../lib/fotoDoDiario'
import { comoElaResponde } from '../lib/ritmoDaConversa'
import { estilosDe, paleta } from '../lib/tema'
import { Confirmacao } from '../components/Confirmacao'
import { AudioDoBalao } from '../components/AudioDoBalao'
import { Escolha } from '../components/Escolha'
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import { LIMITE_DO_RECADO, MINIMO_DO_RECADO, guardarAudioDaConversa } from '../lib/audioDaConversa'
import { falha } from '../lib/erros'
import {
  EXPLICACAO_DO_MICROFONE,
  OPCOES_DITADO,
  marcarMicrofoneExplicado,
  mmss,
  precisaExplicarMicrofone,
  prepararMicrofone,
} from '../lib/voz'
import { useDesvioDoTeclado } from '../lib/teclado'

/* A conversa com a nutricionista.
 *
 * Existe só com vínculo. Antes dele não há conversa — há pedido, que mora no
 * catálogo. Sem vínculo esta tela convida a procurar alguém, e é só isso que
 * ela faz.
 *
 * ── O canal é escolha DELA ─────────────────────────────────────────────────
 * O padrão é conversar aqui dentro. Quem marca WhatsApp no parâmetro do sistema
 * aparece com o botão verde e o número; quem não marca nem tem número devolvido
 * pelo banco. A tela não decide isso — ela obedece.
 *
 * ── A primeira tela do app que chega sozinha ───────────────────────────────
 * Todo o resto relê ao voltar do segundo plano, o que serve para plano e
 * consulta. Não serve aqui: resposta que só aparece quando a pessoa sai do app e
 * volta não é conversa. Esta tem realtime — e mantém a releitura do segundo
 * plano como rede, para o caso de a inscrição ter caído sem avisar. */
export function MensagensScreen({
  contaId,
  onFechar,
  onAbrirNutricionistas,
  visivel,
  versaoVinculo,
  onLeu,
  onChegou,
}: {
  /* Para subir o anexo: o caminho no bucket começa com a pasta da conta, e é
     ela que o servidor confere ao receber a mensagem. */
  contaId: string
  /* Existe desde que Mensagens deixou de ser aba e virou tela aberta por cima.
     Como aba ela não precisava fechar — a barra levava embora. */
  onFechar: () => void
  onAbrirNutricionistas: () => void
  /* Esta tela é a aba que a pessoa está vendo AGORA?
   *
   * Ela não monta quando a aba é escolhida: as quatro abas vivem no mesmo
   * carrossel e existem desde o primeiro instante. Sem esta distinção, a
   * conversa marcaria tudo como lido no fundo, com a pessoa na tela inicial — e
   * o ponto da aba, que existe justamente para avisar quem NÃO está aqui, nunca
   * acenderia. */
  visivel: boolean
  /* Sobe quando o vínculo aparece. Sem isto, quem vincula com o app aberto vê
     esta aba continuar dizendo que não há com quem conversar. */
  versaoVinculo: number
  /* Avisa o App de que a conversa foi lida, para o ponto da aba apagar sem uma
     segunda ida ao banco só para descobrir que agora é zero. */
  onLeu: () => void
  /* E o contrário: chegou mensagem com a pessoa em outra aba. Como a inscrição
     vive aqui e nunca desliga, é daqui que o ponto acende na hora, sem esperar
     a próxima contagem. */
  onChegou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  /* ── A conta é teclado MAIS área segura, e as duas somam ─────────────────
   *
   * Seis tentativas erraram aqui porque eu tratava as duas como alternativas:
   * ou o teclado, ou a barra de gestos. Uma medição na tela do aparelho mostrou
   * a verdade:
   *
   *     teclado 306 · segura 48 · e faltavam exatamente 48
   *
   * No Android com edge-to-edge, `endCoordinates.height` devolve a altura do
   * teclado SEM a barra de navegação que fica por baixo dele. O teclado ocupa
   * 306, a barra ocupa 48, e o que precisa ser desviado são os 354.
   *
   * Com o teclado fechado sobra só a área segura, como antes.
   *
   * O ouvinte sempre funcionou. O que estava errado era a aritmética, e eu
   * passei seis rodadas mexendo no COMO em vez de conferir o QUANTO. */
  /* A altura desta tela, medida. Serve para uma coisa só: perceber se o Android
     encolheu a janela quando o teclado subiu. No Expo Go ele não encolhe; num
     build de verdade pode encolher, e aí somar o teclado de novo empurraria o
     campo para o meio da tela. Ver useDesvioDoTeclado. */
  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  const [nutri, setNutri] = useState<Nutricionista | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [texto, setTexto] = useState('')
  /* O anexo escolhido, ainda não enviado.
   *
   * Ele sobe para o bucket ANTES do envio — precisa de um caminho para o
   * servidor conferir —, mas a mensagem só nasce quando ela toca em enviar.
   * Assim ela vê o que escolheu, escreve a legenda, e pode trocar de ideia. */
  const [anexo, setAnexo] = useState<{ path: string; tipo: TipoDeAnexo } | null>(null)
  const [subindoAnexo, setSubindoAnexo] = useState(false)

  /* ── Gravar o recado ──────────────────────────────────────────────────
   *
   * Mesmo gravador do ditado, e de propósito: um segundo preset produziria
   * dois formatos de áudio no mesmo balde, e o formato é o que decide se o
   * outro lado consegue tocar.
   *
   * A diferença é o destino. O ditado grava para VIRAR TEXTO — o áudio é
   * descartado assim que a transcrição volta. Aqui o áudio É a mensagem, e
   * quem ouve é a nutricionista. */
  const gravador = useAudioRecorder(OPCOES_DITADO)
  const estadoDoGravador = useAudioRecorderState(gravador, 200)
  const [gravando, setGravando] = useState(false)
  const gravandoAgora = useRef(false)

  const segundosGravados = Math.floor((estadoDoGravador.durationMillis ?? 0) / 1000)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  /* Separado do erro de enviar: um é sobre a mensagem que não saiu, o outro
     sobre a conversa que não veio, e trocar um pelo outro confunde. */
  const [erroCarga, setErroCarga] = useState('')
  const [atualizando, setAtualizando] = useState(false)

  const rolagem = useRef<ScrollView>(null)

  /* Ele mandou a última e ainda não teve resposta? É o único momento em que a
     frase do ritmo ajuda. */
  const esperando = mensagens.length > 0 && ehMinha(mensagens[mensagens.length - 1])
  const ritmo = comoElaResponde(mensagens)

  /* As funções de avisar ficam FORA das dependências de propósito: são
     recriadas a cada renderização do App, e incluí-las faria `buscar` mudar de
     identidade toda vez — o que refaz o efeito de carga, que chama `buscar`,
     que… Uma função de avisar não é motivo para recarregar a conversa. O mesmo
     vale para `visivel`, lido por referência para não reatar a inscrição a cada
     troca de aba. */
  const visivelRef = useRef(visivel)
  visivelRef.current = visivel

  const buscar = useCallback(async () => {
    const [cat, msgs] = await Promise.all([carregarCatalogo(), carregarMensagens()])

    /* Falhou a leitura do catálogo: FICA com o que já estava. Zerar aqui trocaria
       a conversa em andamento pelo convite a procurar nutricionista, por causa
       de um túnel — e dizer a alguém que ela não tem profissional é a pior coisa
       que esta tela pode dizer errado. */
    if (cat.tipo === 'ok') setNutri(cat.catalogo.vinculada)

    /* O erro é limpo no sucesso, e não só escrito na falha: esta tela relê
       sozinha, e um erro que fica faria a conversa aparecer atrás de uma
       mensagem vencida. Ver a armadilha 9. */
    if (msgs.tipo === 'ok') {
      setErroCarga('')
      setMensagens(msgs.mensagens)
    } else {
      /* Sem isto, falhar em carregar parecia conversa vazia — "vocês ainda não
         trocaram mensagens" sobre uma conversa que existe e não desceu. Silêncio
         que se lê como fato é pior do que erro. */
      setErroCarga(msgs.mensagem)
    }
  }, [])

  /* Ler é ter a conversa NA FRENTE, e não tê-la carregado.
   *
   * Roda quando a aba passa a ser a visível e sempre que a conversa muda com
   * ela aberta. `marcarLidas` é barato e idempotente: chamá-lo sem nada para
   * marcar não faz nada, e é mais simples do que manter a contagem aqui só para
   * decidir se vale a pena perguntar. */
  useEffect(() => {
    if (!visivel) return
    marcarLidas()
    onLeu()
  }, [visivel, mensagens.length])

  useEffect(() => {
    let vivo = true
    buscar().finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [buscar, versaoVinculo])

  /* Rede de segurança, e não o caminho principal: se a inscrição do realtime
     cair sem avisar — sinal ruim, app suspenso por horas —, voltar ao app
     recompõe a conversa. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') buscar()
    })
    return () => sub.remove()
  }, [buscar])

  /* O que ela escreve entra sem ninguém pedir. Só as dela: o que eu escrevo já
     entrou na tela no envio, e reagir ao próprio insert duplicaria a linha. */
  useEffect(() => {
    if (!nutri) return
    const desligar = ouvirMensagens(nova => {
      setMensagens(atuais =>
        atuais.some(m => m.id === nova.id) ? atuais : [...atuais, nova],
      )
      /* Com a conversa na frente, o efeito acima marca como lida assim que a
         lista cresce. Com a pessoa em outra aba, o ponto acende na hora — é o
         único ponto do app que não espera a próxima leitura. */
      if (!visivelRef.current) onChegou()
    })
    return desligar
  }, [nutri])

  /* Sempre no fim: uma conversa que abre no começo obriga a rolar para ler o que
     acabou de chegar. */
  useEffect(() => {
    if (mensagens.length > 0) {
      requestAnimationFrame(() => rolagem.current?.scrollToEnd({ animated: false }))
    }
  }, [mensagens.length])

  /* Para sozinho no limite.
   *
   * Sem isto, esquecer o dedo fora do botão grava até a memória acabar — e o
   * recado de dez minutos não é ouvido por ninguém entre atendimentos. */
  useEffect(() => {
    if (gravando && segundosGravados >= LIMITE_DO_RECADO) void pararEAnexar()
  }, [gravando, segundosGravados])

  /* Sair da tela gravando tem de SOLTAR o microfone.
   *
   * O gravador é recurso nativo: deixá-lo aberto mantém o ponto vermelho do
   * sistema aceso depois que a pessoa já saiu, o que se lê — com razão — como
   * um app que continua ouvindo. */
  useEffect(
    () => () => {
      if (gravandoAgora.current) gravador.stop().catch(() => {})
    },
    [],
  )

  const [explicandoMicrofone, setExplicandoMicrofone] = useState(false)

  async function comecarAGravar() {
    if (gravando || enviando || subindoAnexo) return

    /* A nossa explicação primeiro, a do sistema depois. */
    if (await precisaExplicarMicrofone()) {
      setExplicandoMicrofone(true)
      return
    }
    await seguirComMicrofone()
  }

  async function seguirComMicrofone() {

    const permissao = await prepararMicrofone()
    if (permissao.tipo !== 'ok') {
      setErro(permissao.mensagem)
      return
    }

    try {
      await gravador.prepareToRecordAsync()
      gravador.record()
      gravandoAgora.current = true
      setGravando(true)
      setErro('')
    } catch (e) {
      setErro(falha('Não consegui abrir o microfone agora.', e))
    }
  }

  /* Parar, subir, e só então virar anexo.
   *
   * O arquivo sobe ANTES do envio porque o servidor confere que o caminho
   * começa na pasta de quem manda, e essa conferência acontece no instante em
   * que a mensagem nasce. Então a pessoa grava, vê "Áudio pronto", pode
   * escrever uma legenda por cima e pode desistir. */
  async function pararEAnexar() {
    if (!gravandoAgora.current) return
    gravandoAgora.current = false
    setGravando(false)

    let uri: string | null = null
    const duracao = segundosGravados
    try {
      await gravador.stop()
      uri = gravador.uri
    } catch (e) {
      setErro(falha('A gravação não foi concluída.', e))
      return
    }

    /* Toque sem querer não vira mensagem. Abaixo de um segundo é quase sempre
       o dedo escorregando, e mandar meio segundo de silêncio gasta a atenção
       dela à toa. */
    if (!uri || duracao < MINIMO_DO_RECADO) {
      setErro('Gravação muito curta. Segure e fale por pelo menos um segundo.')
      return
    }

    setSubindoAnexo(true)
    const r = await guardarAudioDaConversa(contaId, uri)
    setSubindoAnexo(false)

    if (r.tipo === 'erro') {
      /* A frase vem de lá, e é diferente por causa: quem lê precisa saber se
         tenta de novo, se fecha outro aplicativo, ou se avisa a gente. */
      setErro(r.mensagem)
      return
    }
    setAnexo({ path: r.caminho, tipo: 'audio' })
  }

  async function enviar() {
    const limpo = texto.trim()
    /* Foto sem legenda é mensagem inteira: exigir texto obrigaria a pessoa a
       escrever "olha" para poder mandar o prato. */
    if ((!limpo && !anexo) || enviando) return

    setEnviando(true)
    setErro('')
    const r = await enviarMensagem(limpo, anexo)
    setEnviando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    /* Limpa o campo e relê. Reler em vez de montar a linha aqui: o id e o
       horário vêm do banco, e uma linha montada na mão apareceria com hora do
       aparelho e id inventado — que some e reaparece na próxima leitura. */
    setTexto('')
    setAnexo(null)
    const msgs = await carregarMensagens()
    if (msgs.tipo === 'ok') setMensagens(msgs.mensagens)
  }

  /* A foto sobe primeiro, e a mensagem depois.
   *
   * O servidor confere que o caminho começa na pasta de quem envia — sem isso,
   * alguém chamando a função direto apontaria a mensagem para o arquivo de
   * outra conta e faria a própria nutricionista abrir a foto de um terceiro. E
   * essa conferência tem de acontecer no mesmo momento em que a linha nasce,
   * então o caminho já precisa existir antes do envio.
   *
   * Falhar em subir não bloqueia a conversa: ela continua podendo escrever. */
  /* PERGUNTA de onde vem a foto, em vez de esconder a galeria num toque
   * longo.
   *
   * Estava assim: tocar abria a câmera, SEGURAR abria a galeria. Ninguém
   * segura um botão para descobrir o que acontece — e quem tinha a foto já
   * tirada concluía, com razão, que o app só aceita foto nova.
   *
   * Toque longo serve para atalho de quem já sabe, nunca para o único caminho
   * de uma das duas opções. */
  const [escolhendoFoto, setEscolhendoFoto] = useState(false)

  async function anexarFoto(origem: 'camera' | 'galeria') {
    const escolha = await escolherFoto(origem)
    if (escolha.tipo === 'cancelado') return
    if (escolha.tipo === 'erro') {
      setErro(escolha.mensagem)
      return
    }

    setSubindoAnexo(true)
    setErro('')
    const caminho = await guardarFotoDoDiario(contaId, escolha.uri)
    setSubindoAnexo(false)

    if (!caminho) {
      setErro('Não consegui preparar a foto agora. Você pode escrever e tentar de novo depois.')
      return
    }
    setAnexo({ path: caminho, tipo: 'foto' })
  }

  /* Descartar antes de enviar TIRA do servidor.
   *
   * O arquivo já subiu; sem isto, escolher e desistir deixaria uma foto órfã no
   * bucket para sempre — e ninguém vai procurá-la depois. */
  function descartarAnexo() {
    const antigo = anexo
    setAnexo(null)
    if (antigo) void apagarFotoDoDiario(antigo.path)
  }

  const whatsapp = nutri?.telefone ? linkDoWhatsapp(nutri.telefone) : null
  const noApp = nutri ? conversaNoApp(nutri) : true

  if (carregando) {
    return (
      <View style={[styles.tela, styles.centro, { paddingTop: top + 8, paddingBottom: bottom }]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  if (!nutri) {
    return (
      <View style={[styles.tela, { paddingTop: top + 8, paddingBottom: bottom }]}>
        <View style={styles.linhaTopo}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
          <Text style={styles.tituloComVolta}>Mensagens</Text>
        </View>
        <View style={styles.vazio}>
          <View style={styles.circulo}>
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={paleta().cores.verde} />
          </View>
          <Text style={styles.tituloVazio}>Ainda não há com quem conversar</Text>
          <Text style={styles.textoVazio}>
            A conversa começa quando uma nutricionista aceita o seu pedido. Conheça quem está no
            Cygnos e mande o primeiro contato.
          </Text>

          <Pressable
            onPress={onAbrirNutricionistas}
            style={({ pressed }) => [styles.botaoVer, pressed && styles.botaoVerPressionado]}
            accessibilityRole="button"
            accessibilityLabel="Ver as nutricionistas do Cygnos"
          >
            <Text style={styles.textoVer}>Ver nutricionistas</Text>
            <Ionicons name="chevron-forward" size={16} color={paleta().cores.verde} />
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    /* View comum: quem desvia do teclado é o sistema, encolhendo a janela. Sem
       respiro no pai — a barra de escrever cuida do dela, e o bloco do WhatsApp
       do dele. */
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <AvatarNutri nutri={nutri} tamanho={38} />
        <View style={styles.textoCabecalho}>
          <Text style={styles.nome} numberOfLines={1}>
            {nutri.nome}
          </Text>
          {!!nutri.crn && <Text style={styles.crn}>CRN {nutri.crn}</Text>}
        </View>

        {/* Só quando ela escolheu o WhatsApp. No padrão o banco nem devolve o
            número, e este botão não tem como existir. */}
        {!noApp && !!whatsapp && (
          <Pressable
            onPress={() => Linking.openURL(whatsapp)}
            style={({ pressed }) => [styles.botaoZap, pressed && styles.botaoZapPressionado]}
            accessibilityRole="button"
            accessibilityLabel={`Abrir conversa com ${nutri.nome} no WhatsApp`}
          >
            <Ionicons name="logo-whatsapp" size={18} color={paleta().cores.branco} />
          </Pressable>
        )}
      </View>

      {!noApp ? (
        /* Ela conversa por fora. Dizer isso é melhor do que abrir um campo que
           escreve para um lugar que ela não lê. */
        <View style={[styles.vazio, { paddingBottom: bottom }]}>
          <View style={styles.circulo}>
            <Ionicons name="logo-whatsapp" size={26} color={paleta().cores.verde} />
          </View>
          <Text style={styles.tituloVazio}>Ela prefere conversar pelo WhatsApp</Text>
          <Text style={styles.textoVazio}>
            {nutri.telefone
              ? `Toque no botão acima, ou chame no ${telefoneFormatado(nutri.telefone)}.`
              : 'Use o botão acima para abrir a conversa.'}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={rolagem}
            style={styles.conversa}
            contentContainerStyle={styles.conteudoConversa}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            /* Puxar para tentar de novo é o gesto óbvio de quem viu a conversa
               não descer, e a tela precisa atender ao gesto que ela sugere. */
            refreshControl={
              <RefreshControl
                refreshing={atualizando}
                onRefresh={() => {
                  setAtualizando(true)
                  buscar().finally(() => setAtualizando(false))
                }}
                tintColor={paleta().cores.limao}
              />
            }
          >
            {erroCarga ? (
              <Text style={styles.primeira}>{erroCarga}</Text>
            ) : mensagens.length === 0 ? (
              <Text style={styles.primeira}>
                Vocês ainda não trocaram mensagens. Escreva a primeira.
              </Text>
            ) : (
              mensagens.map((m, i) => (
                <Fragment key={m.id}>
                  {/* Separador quando o dia muda, e no topo da conversa.
                   *
                   * A tela mostrava só a hora, e "18:05" de hoje é idêntico a
                   * "18:05" de dez dias atrás. Num acompanhamento nutricional
                   * isso muda o que a pessoa conclui do silêncio: "ela respondeu
                   * ontem" e "ela não responde há uma semana" são situações
                   * diferentes que a tela apresentava igual. */}
                  {mudouDeDia(mensagens[i - 1], m) && (
                    <Text style={styles.dia}>{rotuloDoDia(new Date(m.criadaEm), new Date())}</Text>
                  )}
                  <Balao mensagem={m} />
                </Fragment>
              ))
            )}
          </ScrollView>

          {/* Quanto ela costuma demorar, e SÓ enquanto ele está esperando.
           *
           * Sem push, quem manda uma mensagem fica sem referência: duas horas de
           * silêncio podem ser normais ou esquecimento, e a pessoa não tem como
           * saber — então reabre o app, remanda, ou desiste.
           *
           * A conta sai da própria conversa (mediana das respostas anteriores),
           * sem dado novo. E some assim que ela responde: com a resposta na
           * tela, dizer quanto ela costuma demorar seria ruído. */}
          {esperando && !!ritmo && (
            <Text style={styles.ritmo}>Ela costuma responder em {ritmo}.</Text>
          )}

          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          {/* A PRÉVIA do que vai junto.
              Sem ela, a pessoa escolhe a foto, vê a tela voltar igual, e não
              sabe se pegou — e manda a mesma foto três vezes. */}
          {anexo && (
            <View style={styles.previaAnexo}>
              <Ionicons
                name={anexo.tipo === 'audio' ? 'mic' : 'image'}
                size={16}
                color={paleta().cores.verde}
              />
              {/* Diz QUAL, e não "anexo pronto": quem gravou e fotografou na
                  mesma conversa precisa saber o que está preso ali agora. */}
              <Text style={styles.textoPrevia}>
                {anexo.tipo === 'audio' ? 'Áudio pronto para enviar' : 'Foto pronta para enviar'}
              </Text>
              <Pressable
                onPress={descartarAnexo}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                anexo.tipo === 'audio' ? 'Tirar o áudio da mensagem' : 'Tirar a foto da mensagem'
              }
              >
                <Ionicons name="close" size={17} color={paleta().inkFraco} />
              </Pressable>
            </View>
          )}

          {/* GRAVANDO: a barra some e dá lugar ao que está acontecendo.
              Deixar o campo de escrever no lugar durante a gravação convida a
              digitar com o microfone aberto, e o que sai disso é um áudio com
              o barulho do teclado. */}
          {gravando && (
            <View style={[styles.gravando, { marginBottom: respiro }]}>
              <View style={styles.pontoGravando} />
              <Text style={styles.tempoGravando}>{mmss(segundosGravados)}</Text>
              <Text style={styles.dicaGravando}>
                {segundosGravados >= LIMITE_DO_RECADO - 10
                  ? `Faltam ${LIMITE_DO_RECADO - segundosGravados}s`
                  : 'Gravando para a sua nutricionista'}
              </Text>
              <Pressable
                onPress={pararEAnexar}
                style={({ pressed }) => [styles.botaoParar, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel="Parar de gravar e anexar o áudio"
              >
                <Ionicons name="stop" size={18} color={paleta().cores.branco} />
              </Pressable>
            </View>
          )}

          <View
            style={[styles.barraEnvio, { marginBottom: respiro }, gravando && styles.escondida]}
          >
            <Pressable
              onPress={() => !subindoAnexo && !enviando && setEscolhendoFoto(true)}
              disabled={subindoAnexo || enviando}
              style={({ pressed }) => [styles.botaoClipe, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Mandar uma foto"
            >
              {subindoAnexo ? (
                <ActivityIndicator size="small" color={paleta().cores.verde} />
              ) : (
                /* Clipe, e não câmera: o desenho da câmera prometia foto
                   nova e só foto nova, que era metade do que o botão faz. */
                <Ionicons name="attach" size={22} color={paleta().cores.verde} />
              )}
            </Pressable>

            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escreva uma mensagem"
              placeholderTextColor={paleta().inkFraco}
              style={styles.campo}
              /* Cresce até quatro linhas e para: uma caixa que cresce sem limite
                 come a conversa inteira em quem escreve muito. */
              multiline
              maxLength={4000}
            />
            {/* Um botão só, que troca de função conforme há ou não o que
                enviar — o mesmo gesto que todo aplicativo de conversa usa, e
                por isso o único que não precisa ser explicado.
                Sem isso a barra teria quatro controles lado a lado num espaço
                que já está apertado, e o de enviar apagado a maior parte do
                tempo. */}
            {!texto.trim() && !anexo && !enviando ? (
              <Pressable
                onPress={comecarAGravar}
                disabled={subindoAnexo}
                style={({ pressed }) => [styles.botaoEnviar, pressed && styles.botaoZapPressionado]}
                accessibilityRole="button"
                accessibilityLabel="Gravar um áudio para a sua nutricionista"
              >
                {subindoAnexo ? (
                  <ActivityIndicator size="small" color={paleta().cores.branco} />
                ) : (
                  <Ionicons name="mic" size={20} color={paleta().cores.branco} />
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={enviar}
                disabled={(!texto.trim() && !anexo) || enviando}
                style={({ pressed }) => [
                  styles.botaoEnviar,
                  (!texto.trim() && !anexo) || enviando ? styles.botaoEnviarApagado : null,
                  pressed && styles.botaoZapPressionado,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Enviar mensagem"
              >
                {enviando ? (
                  <ActivityIndicator size="small" color={paleta().cores.branco} />
                ) : (
                  <Ionicons name="arrow-up" size={20} color={paleta().cores.branco} />
                )}
              </Pressable>
            )}
          </View>
        </>
      )}


      {/* A explicação ANTES da caixa do sistema, com a cara do app.
          A do Android não se estiliza e no Android nem o texto é nosso — o que
          dá para escolher é o que a pessoa lê antes dela. E é aqui que vale:
          "por que um aplicativo de nutrição quer o meu microfone?" é a pergunta
          que existe de verdade, e quem não tem a resposta nega e depois não
          acha onde liberar. */}
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

      <Escolha
        visivel={escolhendoFoto}
        titulo="Mandar uma foto"
        mensagem="Ela vai junto com o que você escrever."
        opcoes={[
          {
            rotulo: 'Tirar agora',
            detalhe: 'Abre a câmera',
            icone: 'camera-outline',
            onEscolher: () => void anexarFoto('camera'),
          },
          {
            rotulo: 'Escolher da galeria',
            detalhe: 'Uma foto que você já tirou',
            icone: 'images-outline',
            onEscolher: () => void anexarFoto('galeria'),
          },
        ]}
        onCancelar={() => setEscolhendoFoto(false)}
      />
    </View>
  )
}

/* A mensagem começa um dia novo? A primeira sempre começa. */
function mudouDeDia(anterior: Mensagem | undefined, atual: Mensagem): boolean {
  if (!anterior) return true
  const a = new Date(anterior.criadaEm)
  const b = new Date(atual.criadaEm)
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  )
}

/* Minhas à direita e cheias, as dela à esquerda e claras — o lado diz de quem é
   antes de qualquer palavra ser lida. */
function Balao({ mensagem }: { mensagem: Mensagem }) {
  const styles = estilos()
  const minha = ehMinha(mensagem)

  /* O ENDEREÇO é estado, e não conta no render.
   *
   * O bucket é privado: `getPublicUrl` devolveria um endereço com cara de
   * válido que o servidor recusa, sem erro nenhum do lado do app (item 7).
   * Assinar é `async`.
   *
   * E o endereço VENCE em uma hora. Numa conversa que fica aberta, isso é o
   * caso comum — por isso o `onError` guarda QUAL endereço falhou, e não um
   * booleano: um endereço novo entra tentando de novo. */
  const [endereco, setEndereco] = useState<string | null>(null)
  const [falhou, setFalhou] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    if (!mensagem.anexoPath) {
      setEndereco(null)
      return
    }
    void enderecoNoDiario(mensagem.anexoPath).then(u => {
      if (vivo) setEndereco(u)
    })
    return () => {
      vivo = false
    }
  }, [mensagem.anexoPath])

  return (
    <View style={[styles.linhaBalao, minha && styles.linhaBalaoMinha]}>
      {/* Com foto, o balão tem largura PRÓPRIA.
          `maxWidth` sozinho deixa a largura ser ditada pelo conteúdo, e o
          conteúdo mais largo de um balão com legenda curta é a legenda: quem
          escreveu "oi" e anexou o prato recebia a foto do tamanho da palavra,
          espremida e cortada. Com foto, a largura é fixa e a legenda se acomoda
          embaixo — que é a ordem certa, porque a imagem é o assunto. */}
      <View
        style={[
          styles.balao,
          minha ? styles.balaoMeu : styles.balaoDela,
          mensagem.anexoTipo === 'foto' && styles.balaoComFoto,
        ]}
      >
        {/* A FOTO vem antes do texto, porque é a legenda que explica a imagem e
            não o contrário. Sem endereço — ainda assinando, ou falhou — o balão
            desenha só o texto: uma imagem que não carrega deixa um buraco do
            tamanho dela, e isso se lê como app quebrado. */}
        {mensagem.anexoTipo === 'foto' && endereco && endereco !== falhou && (
          <Image
            source={{ uri: endereco }}
            style={styles.fotoDoBalao}
            onError={() => setFalhou(endereco)}
            accessibilityLabel={minha ? 'Foto que você mandou' : 'Foto que ela mandou'}
          />
        )}

        {/* ── Áudio ────────────────────────────────────────────────────────
         *
         * Até agora esta linha dizia "este aplicativo ainda não toca", porque
         * a coluna aceitava 'audio' e só a foto era desenhada — um áudio dela
         * virava balão VAZIO, e a paciente não ficava sabendo que chegou nada.
         *
         * Agora toca. O player pede o endereço no primeiro toque, e não ao
         * montar: `createAudioPlayer` segura recurso nativo, e uma lista de
         * conversa abriria dezenas de tocadores para ouvir um. */}
        {mensagem.anexoTipo === 'audio' && mensagem.anexoPath && (
          <AudioDoBalao caminho={mensagem.anexoPath} minha={minha} />
        )}

        {/* Texto vazio não desenha linha: foto sem legenda é mensagem inteira, e
            um `<Text>` vazio deixaria um vão embaixo da imagem. */}
        {!!mensagem.texto.trim() && (
          <Text style={[styles.textoBalao, minha && styles.textoBalaoMeu]}>{mensagem.texto}</Text>
        )}
        <View style={styles.rodapeBalao}>
          <Text style={[styles.hora, minha && styles.horaMinha]}>
            {horaCurta(new Date(mensagem.criadaEm))}
          </Text>
          {/* Só nas dele, e só quando ela leu.
           *
           * "Enviada" não entra: a mensagem estar na tela já diz que saiu, e uma
           * marca a mais em cada balão vira ruído. O que ele não tinha como
           * saber é se ela ABRIU — e é essa a informação que muda o que ele
           * conclui do silêncio. */}
          {minha && !!mensagem.lidaEm && (
            <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.75)" />
          )}
        </View>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { alignItems: 'center', justifyContent: 'center' },
    titulo: {
      paddingHorizontal: 20,
      fontSize: 27,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -0.6,
    },

    linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 4 },
    botaoVoltar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    tituloComVolta: { fontSize: 22, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.4 },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.cores.borda,
    },
    textoCabecalho: { flex: 1, gap: 1 },
    nome: { fontSize: 16, fontWeight: '800', color: t.cores.ink },
    crn: { fontSize: 12, color: t.inkFraco },

    botaoZap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    botaoZapPressionado: { backgroundColor: t.cores.verdeEscuro },

    conversa: { flex: 1 },
    conteudoConversa: {
      paddingHorizontal: 16,
      paddingTop: 14,
      /* Mais embaixo do que em cima: sem folga, o último balão encosta na barra
         de escrever e a conversa parece cortada bem onde ela está viva. */
      paddingBottom: 20,
      gap: 8,
    },
    primeira: {
      marginTop: 40,
      fontSize: 13.5,
      lineHeight: 20,
      color: t.inkFraco,
      textAlign: 'center',
      paddingHorizontal: 24,
    },

    dia: {
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 2,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: t.cores.cartao,
      fontSize: 11.5,
      fontWeight: '700',
      color: t.inkFraco,
      overflow: 'hidden',
    },
    linhaBalao: { flexDirection: 'row' },
    linhaBalaoMinha: { justifyContent: 'flex-end' },
    balao: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16 },
    balaoComFoto: { width: '72%' },
    balaoDela: { backgroundColor: t.cores.cartao, borderBottomLeftRadius: 4 },
    balaoMeu: { backgroundColor: t.cores.verde, borderBottomRightRadius: 4 },
    textoBalao: { fontSize: 14.5, lineHeight: 20, color: t.cores.ink },
    textoBalaoMeu: { color: t.cores.branco },
    rodapeBalao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 3,
      alignSelf: 'flex-end',
    },
    hora: { fontSize: 10.5, color: t.inkFraco },
    ritmo: {
      paddingHorizontal: 20,
      paddingBottom: 8,
      fontSize: 12,
      color: t.inkFraco,
      textAlign: 'center',
    },
    horaMinha: { color: 'rgba(255,255,255,0.75)' },

    erro: { paddingHorizontal: 20, paddingBottom: 6, fontSize: 12.5, color: t.cores.erroTexto },

    /* No FLUXO da coluna, sem posicionamento nenhum. A janela encolhe com o
       teclado (adjustResize do Expo Go), então o último filho de uma coluna já
       é o que fica logo acima dele. */
    /* Largura cheia do balão e altura fixa: proporção livre faria cada foto
     mudar a altura da conversa enquanto ela carrega, e a lista pularia sob o
     dedo de quem está rolando. */
  fotoDoBalao: {
    width: '100%',
    /* Proporção, e não altura fixa: 170 de altura numa foto em pé corta cabeça
       e pé. `aspectRatio` deixa a imagem ocupar a largura do balão e ficar com
       a altura que a proporção pedir. */
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },

  previaAnexo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: t.cores.verdeMenta,
  },
  textoPrevia: { flex: 1, fontSize: 12.5, fontWeight: '600', color: t.cores.verdeEscuro },
  botaoClipe: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escondida: { display: 'none' },
  gravando: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  pontoGravando: { width: 9, height: 9, borderRadius: 4, backgroundColor: t.cores.erroBorda },
  tempoGravando: {
    fontSize: 15,
    fontWeight: '800',
    color: t.cores.ink,
    /* Largura fixa por dígito: sem isto o "1" é mais estreito que o "8" e o
       contador treme a cada segundo. */
    fontVariant: ['tabular-nums'],
  },
  dicaGravando: { flex: 1, fontSize: 12.5, color: t.inkMedio },
  botaoParar: {
    width: 38,
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.erroBorda,
  },

  barraEnvio: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      borderTopWidth: 1,
      borderTopColor: t.cores.borda,
    },
    campo: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 14,
      paddingTop: 11,
      paddingBottom: 11,
      borderRadius: 22,
      backgroundColor: t.cores.cartao,
      color: t.cores.ink,
      fontSize: 14.5,
    },
    botaoEnviar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    /* Fundo apagado, e nao `opacity`: opacidade compoe texto e fundo contra a
         pagina e destroi a razao entre os dois — medido em 1,43 num caso, com 4,5
         de minimo. `desligado` foi escolhido pela conta: branco sobre ele da 4,76. */
    botaoEnviarApagado: { backgroundColor: t.cores.desligado },

    vazio: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20, gap: 10 },
    circulo: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: t.cores.verdeMenta,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    tituloVazio: { fontSize: 17, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
    textoVazio: {
      fontSize: 13.5,
      lineHeight: 20,
      color: t.inkFraco,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    botaoVer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: t.cores.verdeClaro,
    },
    botaoVerPressionado: { backgroundColor: t.cores.verdeMenta },
    textoVer: { fontSize: 14, fontWeight: '700', color: t.cores.verde },

    pedidos: { alignSelf: 'stretch', marginTop: 16, gap: 14, paddingHorizontal: 4 },
    pedido: { gap: 5 },
    nomePedido: { fontSize: 12.5, fontWeight: '700', color: t.inkSuave },
    /* Balão à direita e verde, igual ao das mensagens dele na conversa: é a
       mesma coisa — o que ele escreveu —, e desenhar diferente sugeriria que é
       outra. */
    balaoPedido: {
      alignSelf: 'flex-end',
      maxWidth: '90%',
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      backgroundColor: t.cores.verde,
    },
    textoBalaoPedido: { fontSize: 14.5, lineHeight: 20, color: t.cores.branco },
    semTextoPedido: { fontSize: 12.5, color: t.inkFraco, fontStyle: 'italic' },
  }),
)
