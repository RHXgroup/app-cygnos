import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AvatarNutri } from '../components/AvatarNutri'
import { LINKS, abrirLink } from '../lib/links'
import { carregarCatalogo, type Catalogo } from '../lib/nutricionista'
import { existeQuestionarioPendente } from '../lib/questionario'
import { supabase } from '../lib/supabase'
import { carregarPlanoAtivo, type PlanoCompleto } from '../lib/plano'
import { carregarMeuVinculo, carregarPlanoDaNutri } from '../lib/planoDaNutri'
import {
  desligarLembretes,
  desligarLembretesDeAgua,
  lembreteDaSequenciaLigado,
  desligarLembreteDaSequencia,
  ligarLembreteDaSequencia,
  lembretesDeAguaLigados,
  lembretesLigados,
  reagendarSeLigados,
  reagendarAguaSeLigada,
  precisaExplicarNotificacao,
  ligarLembretes,
  ligarLembretesDeAgua,
} from '../lib/lembretes'
import {
  acento,
  acentoEfetivo,
  estilosDe,
  limparAcento,
  paleta,
  tema,
  trocarAcento,
  trocarTema,
  type Tema,
} from '../lib/tema'
import { hexDeHsl } from '../lib/cor'
import { ritmoDeAgua } from '../lib/ritmoDeAgua'
import { Confirmacao } from '../components/Confirmacao'
import { EXPLICACAO_DA_NOTIFICACAO, SEM_NOTIFICACAO } from '../lib/permissoes'

const OPCOES_DE_TEMA: { chave: Tema; rotulo: string; icone: 'moon-outline' | 'sunny-outline' }[] = [
  { chave: 'escuro', rotulo: 'Escuro', icone: 'moon-outline' },
  { chave: 'claro', rotulo: 'Claro', icone: 'sunny-outline' },
]

const MARGEM = 20
const PADDING_CARTAO = 16

/* A aba "Mais".
 *
 * Substitui o EmBreveScreen que ficava aqui. O botão de sair veio junto de
 * propósito: era a única coisa que aquela tela realmente fazia, e perdê-la na
 * troca deixaria a pessoa sem caminho para sair da conta. */
export function MaisScreen({
  contaId,
  email,
  versaoVinculo,
  versaoPlano,
  versaoMetas,
  onAbrirNutricionistas,
  onAbrirRede,
  onAbrirPlanoTerapeutico,
  onAbrirCodigo,
  onAbrirExcluirConta,
  onAbrirMensagens,
  onAbrirQuestionario,
  naoLidas,
  onAbrirMetas,
}: {
  contaId: string
  email: string
  /* Muda quando o vínculo com a nutricionista aparece — hoje, quando a tela do
     código percebe que ela vinculou. O segundo plano e o puxar-para-atualizar
     já cobriam o caso de a pessoa sair do app; este cobre o de ela ficar. */
  versaoVinculo: number
  /* Os dois que mexem no horário dos lembretes: o plano dá a hora da refeição,
     a meta de água e o sono dão o ritmo dos copos. Esta tela fica MONTADA o
     tempo todo — as quatro abas vivem no mesmo carrossel —, então sem estes
     contadores o efeito de reagendar nunca rodaria de novo. */
  versaoPlano: number
  versaoMetas: number
  onAbrirNutricionistas: () => void
  onAbrirRede: () => void
  onAbrirPlanoTerapeutico: () => void
  onAbrirCodigo: () => void
  onAbrirExcluirConta: () => void
  /* Mensagens deixou de ser aba e virou linha aqui. O contador vem junto:
     era o ponto sobre o ícone da aba, e sem ele a mensagem dela só seria
     descoberta por quem abrisse este menu por acaso. */
  onAbrirMensagens: () => void
  onAbrirQuestionario: () => void
  naoLidas: number
  /* O lembrete de água não é nada sem a meta: é dela que saem quantos avisos, a
     que horas, e quanto o botão da notificação registra. Sem este caminho, a
     tela diria "defina sua meta" e deixaria a pessoa procurando onde. */
  onAbrirMetas: () => void
}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  /* Os lembretes saem dos horários do plano, então ele precisa estar em mãos na
     hora de ligar — não há o que lembrar sem plano. */
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [lembretes, setLembretes] = useState(false)
  const [mexendoLembretes, setMexendoLembretes] = useState(false)
  const [avisoLembretes, setAvisoLembretes] = useState('')

  /* ── A NOSSA explicação, antes da caixa do sistema ────────────────────
   *
   * A permissão de notificação era pedida FRIA: a pessoa ligava o interruptor
   * e a caixa do Android aparecia sem nada antes. Quem não sabe o que vai
   * receber recusa — e no Android a recusa é definitiva: ele não pergunta de
   * novo, e daí em diante o único caminho é as configurações do aparelho.
   *
   * O app já explicava, mas DEPOIS da recusa, que é tarde. Agora explica antes,
   * com a caixa da casa, e o aviso do "negado" continua para quem recusar
   * mesmo assim.
   *
   * Guarda QUAL interruptor pediu, porque são três — refeição, água e
   * sequência — e depois da explicação é preciso continuar naquele. */
  const [explicandoAviso, setExplicandoAviso] = useState<null | (() => void)>(null)
  /* Estado próprio, e não um só para os dois: os interruptores são
     independentes — o da refeição depende de existir plano, o da água não
     depende de nada. */
  const [agua, setAgua] = useState(false)
  const [mexendoAgua, setMexendoAgua] = useState(false)
  const [avisoAgua, setAvisoAgua] = useState('')

  const [sequencia, setSequencia] = useState(false)
  const [mexendoSequencia, setMexendoSequencia] = useState(false)
  const [avisoSequencia, setAvisoSequencia] = useState('')
  /* Ligado quando o aviso acima é sobre a meta faltando: aí ele ganha um
     caminho, em vez de mandar a pessoa procurar. */
  const [faltaMeta, setFaltaMeta] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  /* Há questionário pré-consulta esperando resposta?
   *
   * Quem manda é ela, do sistema dela, e nada avisa o aparelho — item 8 do
   * AGENTS.md. Esta tela já relê ao voltar do segundo plano, e é por isso que a
   * verificação mora aqui e não numa tela própria: a linha aparece sozinha
   * quando a pessoa volta ao app, sem ela ter de procurar em lugar nenhum. */
  const [temQuestionario, setTemQuestionario] = useState(false)

  const buscar = useCallback(async () => {
    const r = await carregarCatalogo()
    if (r.tipo === 'erro') setErro(r.mensagem)
    else {
      setErro(null)
      setCatalogo(r.catalogo)
    }

    /* Em silêncio de propósito, e é o único lugar desta tela onde engulo erro.
       Falhar em saber se há questionário não é motivo para cobrir a tela de
       Mais com uma mensagem: o que a pessoa veio fazer aqui continua todo
       disponível, e a linha reaparece na próxima leitura. */
    setTemQuestionario(await existeQuestionarioPendente())
  }, [])

  useEffect(() => {
    let vivo = true

    lembretesLigados().then(l => vivo && setLembretes(l))
    lembretesDeAguaLigados().then(l => vivo && setAgua(l))
    lembreteDaSequenciaLigado().then(l => vivo && setSequencia(l))
    buscar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [buscar, versaoVinculo])

  /* Reagendar os lembretes quando o horário deles mudou.
   *
   * Quem muda o almoço das 12:30 para as 13h continuaria sendo avisado no
   * horário velho, sem ter como saber por quê. O mesmo vale para a água: o
   * ritmo dela sai da meta e das noites registradas, e as duas mudam.
   *
   * Efeito próprio, e não junto com a carga da tela, porque as dependências são
   * outras: o catálogo se relê quando o vínculo muda, e o horário do lembrete
   * quando o plano ou a meta muda. Misturar os dois faria cada mudança de meta
   * puxar o catálogo de volta do servidor à toa.
   *
   * E a conta da água só é feita se o interruptor estiver ligado: perguntar o
   * ritmo ao banco a cada mudança de meta, para quem nunca ligou lembrete
   * nenhum, é pagar uma consulta por nada.
   *
   * `versaoPlano` também sobe a cada volta do segundo plano — ver o efeito do
   * AppState no App. É de graça e é o que pega o que não tem contador próprio:
   * a noite registrada ontem, que mexe na janela de sono de onde saem os
   * horários da água. */
  useEffect(() => {
    let vivo = true

    /* O plano dos lembretes é o MESMO que a tela inicial mostra.
     *
     * Aqui só entrava `carregarPlanoAtivo`, que é o plano PRÓPRIO. A tela
     * inicial prefere o da nutricionista quando existe — então quem seguia a
     * prescrição dela ligava o lembrete e ouvia "seu plano não tem refeições com
     * horário, não há o que lembrar". O recurso estava morto exatamente para
     * quem tem profissional, que é quem mais tem horário definido.
     *
     * E o plano dela só vale enquanto o acompanhamento estiver de pé: encerrado,
     * ele continua legível como histórico, mas não dispara aviso. "Hora do
     * almoço do seu plano" de uma prescrição que acabou é pior do que silêncio. */
    Promise.all([carregarPlanoAtivo(contaId), carregarPlanoDaNutri().catch(() => null), carregarMeuVinculo()])
      .then(([r, daNutri, vinculo]) => {
        if (!vivo) return
        const proprio = r.tipo === 'ok' ? r.plano : null
        const paraLembrar = (vinculo.ativo ? daNutri : null) ?? proprio
        setPlano(paraLembrar)
        reagendarSeLigados(paraLembrar)
      })
      .catch(() => {
        /* Falhou tudo: fica sem reagendar, e o que já estava agendado continua
           valendo. Melhor um horário velho do que nenhum. */
      })

    lembretesDeAguaLigados().then(async ligada => {
      if (!vivo || !ligada) return
      const ritmo = await ritmoDeAgua(contaId)
      if (vivo) reagendarAguaSeLigada(ritmo?.horarios, ritmo?.mlPorVez)
    })

    return () => {
      vivo = false
    }
  }, [contaId, versaoPlano, versaoMetas])

  /* O mesmo motivo do puxar-para-atualizar, sem exigir o gesto.
   *
   * Voltar do segundo plano é o instante exato em que a resposta mudou: o
   * caminho comum é o paciente ditar o código, sair do app para falar com ela, e
   * voltar. Esperar que ele descubra sozinho que precisa arrastar o dedo para
   * baixo é esperar demais — o cartão continuaria dizendo que ele não tem
   * nutricionista com o vínculo já feito. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') buscar()
    })
    return () => sub.remove()
  }, [buscar])

  /* Ligar e desligar. O estado só muda depois de o sistema responder: mostrar
     "ligado" antes de a permissão ser concedida seria prometer um aviso que não
     vai tocar. */
  async function alternarLembretes() {
    setAvisoLembretes('')

    /* Só ao LIGAR, e só na primeira vez: já concedida, o sistema não pergunta
       mais e a explicação seria conversa sobre coisa nenhuma. */
    if (!lembretes && (await precisaExplicarNotificacao())) {
      setExplicandoAviso(() => () => void seguirLembretes())
      return
    }
    await seguirLembretes()
  }

  async function seguirLembretes() {
    setMexendoLembretes(true)

    if (lembretes) {
      await desligarLembretes()
      setLembretes(false)
      setMexendoLembretes(false)
      return
    }

    const r = await ligarLembretes(plano)
    setMexendoLembretes(false)

    if (r.tipo === 'negado') {
      setAvisoLembretes(
        SEM_NOTIFICACAO,
      )
      return
    }
    if (r.tipo === 'erro') {
      setAvisoLembretes(r.mensagem)
      return
    }
    if (r.quantos === 0) {
      setAvisoLembretes('Seu plano não tem refeições com horário, então não há o que lembrar.')
      return
    }

    setLembretes(true)
    setAvisoLembretes(
      r.proximo
        ? `${r.quantos} ${r.quantos === 1 ? 'lembrete agendado' : 'lembretes agendados'}. O próximo é às ${r.proximo}.`
        : `${r.quantos} ${r.quantos === 1 ? 'lembrete agendado' : 'lembretes agendados'}, todo dia.`,
    )
  }

  /* Quem vincula é a nutricionista, do lado dela, enquanto o app já está aberto
     na mão do paciente. Não há evento nenhum avisando o aparelho disso — então
     o puxar-para-atualizar é o caminho, e por isso ele existe numa tela que de
     resto quase não muda. */
  /* O terceiro lembrete, e o único que não fala de horário.
   *
   * Os outros dois tocam por relógio: 12:30 é 12:30 tenha ela almoçado ou não.
   * Este toca às 20h só quando o dia ainda está vazio E há sequência a
   * proteger — e é cancelado no instante em que ela registra qualquer coisa.
   *
   * Quem não tem sequência nunca é avisado. Cutucar quem ainda não começou é o
   * caminho mais curto para o app ser silenciado inteiro, junto com os
   * lembretes que serviam. */
  async function alternarSequencia() {
    setAvisoSequencia('')
    if (!sequencia && (await precisaExplicarNotificacao())) {
      setExplicandoAviso(() => () => void seguirSequencia())
      return
    }
    await seguirSequencia()
  }

  async function seguirSequencia() {
    setMexendoSequencia(true)

    if (sequencia) {
      await desligarLembreteDaSequencia()
      setSequencia(false)
      setMexendoSequencia(false)
      return
    }

    const r = await ligarLembreteDaSequencia()
    setMexendoSequencia(false)

    if (r.tipo === 'negado') {
      setAvisoSequencia(
        SEM_NOTIFICACAO,
      )
      return
    }
    if (r.tipo === 'erro') {
      setAvisoSequencia(r.mensagem)
      return
    }

    setSequencia(true)
    /* Diz o que vai acontecer E o que NÃO vai. A segunda metade é a que evita a
       leitura de "mais um app me enchendo": sem ela, a pessoa liga esperando
       aviso todo dia e desliga no terceiro. */
    setAvisoSequencia(
      'Ligado. Um aviso às 20h, e só nos dias em que você ainda não tiver registrado nada. ' +
        'Registrou? Ele nem chega.',
    )
  }

  async function alternarAgua() {
    setAvisoAgua('')
    if (!agua && (await precisaExplicarNotificacao())) {
      setExplicandoAviso(() => () => void seguirAgua())
      return
    }
    await seguirAgua()
  }

  async function seguirAgua() {
    setFaltaMeta(false)
    setMexendoAgua(true)

    if (agua) {
      await desligarLembretesDeAgua()
      setAgua(false)
      setMexendoAgua(false)
      return
    }

    /* O ritmo sai da meta e das noites registradas: quem levanta às 5h30 é
       avisado a partir das 6h, e não às 9h como todo mundo. Sem sono anotado,
       a função devolve null e o lembrete cai no genérico. */
    const ritmo = await ritmoDeAgua(contaId)
    const r = await ligarLembretesDeAgua(ritmo?.horarios, ritmo?.mlPorVez)
    setMexendoAgua(false)

    if (r.tipo === 'negado') {
      setAvisoAgua(
        SEM_NOTIFICACAO,
      )
      return
    }
    if (r.tipo === 'erro') {
      setAvisoAgua(r.mensagem)
      return
    }

    setAgua(true)

    /* Sem meta, o lembrete funciona pela metade e é honesto dizer qual metade.
     *
     * Os avisos tocam — de três em três horas, das 9h às 21h —, mas eles não
     * conhecem o dia da pessoa e não trazem o botão de registrar, porque o
     * botão precisa saber QUANTO gravar. Ficar calado aqui faria alguém achar
     * que o app não sabe fazer melhor, quando o que falta é um número que ela
     * ainda não deu. */
    if (!ritmo) {
      setFaltaMeta(true)
      setAvisoAgua(
        `Ligado: ${r.quantos} avisos por dia, das 9h às 21h. Com a sua meta de água definida, ` +
          'eles passam a caber no seu dia e ganham o botão de registrar sem abrir o app.',
      )
      return
    }

    /* Diz QUANDO é o próximo. Ligar às dez da noite não produz nada visível até
       o dia seguinte, e sem essa frase a leitura é "não funcionou". */
    setAvisoAgua(
      r.proximo
        ? `${r.quantos} avisos de ${ritmo.mlPorVez} ml${ritmo.daJanelaPadrao ? '' : ', no seu ritmo'}. O próximo é às ${r.proximo}.` +
            (ritmo.daJanelaPadrao ? ' Anote três noites de sono e os horários passam a seguir a sua rotina.' : '')
        : `${r.quantos} avisos por dia, das 9h às 21h.`,
    )
  }

  async function puxarParaAtualizar() {
    setAtualizando(true)
    await buscar()
    setAtualizando(false)
  }

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={[styles.conteudo, { paddingTop: top + 8 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={puxarParaAtualizar}
          tintColor={paleta().cores.limao}
        />
      }
    >
      <Text style={styles.titulo}>Mais</Text>

      <CartaoNutricionista
        catalogo={catalogo}
        carregando={carregando}
        erro={erro}
        onAbrir={onAbrirNutricionistas}
        onAbrirCodigo={onAbrirCodigo}
      />

      {/* ── O PLANO TERAPÊUTICO ──────────────────────────────────────────
          Fica logo abaixo da nutricionista porque é DELA que ele vem, e porque
          é tarefa do dia — o que oferecer em casa, hoje. Não é ajuste de app,
          então não desce para o fim junto com aparência e conta.

          A tela decide sozinha se tem o que mostrar; aqui a linha existe
          sempre. Esconder a entrada quando não há plano faria a mãe que acabou
          de sair do consultório procurar uma opção que sumiu — e ela não sabe
          que a nutricionista ainda não publicou. */}
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Plano da nutricionista</Text>
        <Text style={styles.textoPrivacidade}>
          Os alimentos para oferecer em casa, e como foi cada vez.
        </Text>
        <LinhaLink
          icone="restaurant-outline"
          rotulo="Ver e registrar em casa"
          onPress={onAbrirPlanoTerapeutico}
          interno
        />
      </View>

      {/* Só aparece quando há algo a responder, e some sozinha depois.
          Uma linha permanente de "questionário" ensinaria a ignorá-la: quando o
          dia do questionário chegasse, ela seria mais um item que já estava
          ali. Assim ela é sempre uma coisa nova. */}
      {temQuestionario && (
        <Pressable
          onPress={onAbrirQuestionario}
          style={({ pressed }) => [styles.linhaQuestionario, pressed && styles.linhaPressionada]}
          accessibilityRole="button"
          accessibilityLabel="Responder o questionário antes da consulta"
        >
          <View style={styles.iconeQuestionario}>
            <Ionicons name="document-text-outline" size={19} color={paleta().cores.verde} />
          </View>
          <View style={styles.textoQuestionario}>
            <Text style={styles.tituloQuestionario}>Responder antes da consulta</Text>
            <Text style={styles.subQuestionario}>
              A sua nutricionista mandou algumas perguntas
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
        </Pressable>
      )}

      <Pressable
        onPress={onAbrirMensagens}
        style={({ pressed }) => [styles.linhaMensagens, pressed && styles.linhaPressionada]}
        accessibilityRole="button"
        accessibilityLabel={
          naoLidas > 0
            ? `Mensagens, ${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}`
            : 'Mensagens'
        }
      >
        <View style={styles.iconeMensagens}>
          <Ionicons name="chatbubble-ellipses-outline" size={19} color={paleta().cores.verde} />
        </View>
        <Text style={styles.textoMensagens}>Mensagens</Text>
        {naoLidas > 0 && (
          <View style={styles.selo}>
            <Text style={styles.textoSelo}>{naoLidas > 9 ? '9+' : naoLidas}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
      </Pressable>

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Lembretes</Text>
        <Text style={styles.rotuloLembrete}>Refeição</Text>
        <Text style={styles.explicacaoLembrete}>
          {plano
            ? `Um aviso no horário de cada refeição do plano "${plano.nome}".`
            : 'Os lembretes saem dos horários do seu plano alimentar. Cadastre um plano para ligá-los.'}
        </Text>

        <Pressable
          onPress={alternarLembretes}
          disabled={!plano || mexendoLembretes}
          style={({ pressed }) => [
            styles.botaoLembrete,
            lembretes && styles.botaoLembreteAtivo,
            (!plano || mexendoLembretes) && styles.botaoLembreteDesligado,
            pressed && styles.botaoSairPressionado,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: lembretes, disabled: !plano }}
          accessibilityLabel="Lembretes de refeição"
        >
          <Ionicons
            name={lembretes ? 'notifications' : 'notifications-off-outline'}
            size={17}
            color={lembretes ? paleta().cores.sobreLimao : paleta().cores.verde}
          />
          <Text style={[styles.textoBotaoSair, lembretes && styles.textoBotaoLembreteAtivo]}>
            {mexendoLembretes ? 'Um instante…' : lembretes ? 'Lembretes ligados' : 'Ligar lembretes'}
          </Text>
        </Pressable>

        {!!avisoLembretes && <Text style={styles.avisoLembrete}>{avisoLembretes}</Text>}

        <View style={styles.divisor} />

        <Text style={styles.rotuloLembrete}>Água</Text>
        <Text style={styles.explicacaoLembrete}>
          Os horários saem da sua meta e das noites que você registrou — quem levanta cedo é
          avisado cedo. Sem sono anotado, de três em três horas das 9h às 21h.
        </Text>

        <Pressable
          onPress={alternarAgua}
          disabled={mexendoAgua}
          style={({ pressed }) => [
            styles.botaoLembrete,
            agua && styles.botaoLembreteAtivo,
            mexendoAgua && styles.botaoLembreteDesligado,
            pressed && styles.botaoSairPressionado,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: agua }}
          accessibilityLabel="Lembretes de beber água"
        >
          <Ionicons
            name={agua ? 'water' : 'water-outline'}
            size={17}
            color={agua ? paleta().cores.sobreLimao : paleta().cores.verde}
          />
          <Text style={[styles.textoBotaoSair, agua && styles.textoBotaoLembreteAtivo]}>
            {mexendoAgua ? 'Um instante…' : agua ? 'Lembretes ligados' : 'Ligar lembretes'}
          </Text>
        </Pressable>

        {!!avisoAgua && <Text style={styles.avisoLembrete}>{avisoAgua}</Text>}

        <View style={styles.divisor} />

        <Text style={styles.rotuloLembrete}>Sequência</Text>
        <Text style={styles.explicacaoLembrete}>
          Um aviso às 20h, e só quando o dia ainda estiver vazio e você tiver uma sequência para
          manter. Se já tiver registrado alguma coisa, ele não chega.
        </Text>

        <Pressable
          onPress={alternarSequencia}
          disabled={mexendoSequencia}
          style={({ pressed }) => [
            styles.botaoLembrete,
            sequencia && styles.botaoLembreteAtivo,
            mexendoSequencia && styles.botaoLembreteDesligado,
            pressed && styles.botaoSairPressionado,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: sequencia }}
          accessibilityLabel="Lembrete da sequência"
        >
          <Ionicons
            name={sequencia ? 'flame' : 'flame-outline'}
            size={17}
            color={sequencia ? paleta().cores.sobreLimao : paleta().cores.verde}
          />
          <Text style={[styles.textoBotaoSair, sequencia && styles.textoBotaoLembreteAtivo]}>
            {mexendoSequencia ? 'Um instante…' : sequencia ? 'Lembrete ligado' : 'Ligar lembrete'}
          </Text>
        </Pressable>

        {!!avisoSequencia && <Text style={styles.avisoLembrete}>{avisoSequencia}</Text>}
        {faltaMeta && (
          <Pressable
            onPress={onAbrirMetas}
            style={({ pressed }) => [styles.linkMeta, pressed && styles.linkMetaPressionado]}
            accessibilityRole="button"
            accessibilityLabel="Definir a minha meta de água"
          >
            <Text style={styles.textoLinkMeta}>Definir minha meta de água</Text>
            <Ionicons name="chevron-forward" size={15} color={paleta().cores.verde} />
          </Pressable>
        )}
      </View>

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Aparência</Text>
        <Text style={styles.explicacaoLembrete}>
          O claro segue as cores da marca; o escuro é o padrão do app.
        </Text>

        {/* Duas opções, e não um interruptor de "modo escuro".
            Interruptor obriga a pessoa a saber qual é o estado atual para
            entender o que o toque faz. Dois botões mostram os dois estados e
            marcam onde ela está. */}
        <View style={styles.linhaTema}>
          {OPCOES_DE_TEMA.map(o => {
            const escolhido = tema() === o.chave
            return (
              <Pressable
                key={o.chave}
                onPress={() => trocarTema(o.chave)}
                style={({ pressed }) => [
                  styles.botaoTema,
                  escolhido && styles.botaoTemaEscolhido,
                  pressed && styles.botaoSairPressionado,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: escolhido }}
                accessibilityLabel={`Tema ${o.rotulo}`}
              >
                <Ionicons
                  name={o.icone}
                  size={17}
                  color={escolhido ? paleta().cores.sobreLimao : paleta().cores.verde}
                />
                <Text style={[styles.textoBotaoSair, escolhido && styles.textoBotaoTemaEscolhido]}>
                  {o.rotulo}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.divisor} />

        <Text style={styles.rotuloLembrete}>Cor</Text>
        <Text style={styles.explicacaoLembrete}>
          Escolha a sua. O app ajusta o tom para ela funcionar no tema que você estiver usando.
        </Text>

        <SeletorDeCor />
      </View>

      {/* ── A REDE mora AQUI, e não dentro da tela da nutricionista ──────
          Ela chegou a ficar lá dentro, como uma linha que abria por cima da
          ficha da profissional da pessoa. Continuava escondida: quem quer
          conhecer a rede não vai procurar dentro de "Minha nutricionista", e
          quem abre "Minha nutricionista" quer ver a dela.

          São dois assuntos, e agora são dois lugares. Aqui, antes de
          Privacidade, é onde ficam as coisas do app que não são do dia. */}
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Nutricionistas Cygnos</Text>
        <Text style={styles.textoPrivacidade}>
          Conheça as fichas das profissionais da rede: formação, especialidades e como cada uma
          atende.
        </Text>

        <LinhaLink
          icone="people-outline"
          rotulo="Ver as nutricionistas da rede"
          onPress={onAbrirRede}
          interno
        />
      </View>

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Privacidade</Text>
        <Text style={styles.textoPrivacidade}>
          O que o Cygnos guarda sobre você, para que serve e quem enxerga.
        </Text>

        <LinhaLink
          icone="shield-checkmark-outline"
          rotulo="Política de Privacidade"
          onPress={() => abrirLink(LINKS.privacidade)}
        />
        <LinhaLink
          icone="document-text-outline"
          rotulo="Termos de Uso"
          onPress={() => abrirLink(LINKS.termos)}
        />
      </View>

      {/* ── A CONTA fica por ÚLTIMO ─────────────────────────────────────
          Sair e excluir são as duas únicas ações desta tela sem uso diário, e
          uma delas não tem desfazer. No meio da rolagem elas apareciam entre
          coisas que a pessoa vem ajustar toda semana — lembrete, meta de água,
          cor —, e ficavam no caminho do dedo de quem só estava passando.

          Fim da tela é onde se procura o que se usa uma vez. */}
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Conta</Text>
        <Text style={styles.email}>{email}</Text>

        <Pressable
          onPress={() => supabase.auth.signOut()}
          style={({ pressed }) => [styles.botaoSair, pressed && styles.botaoSairPressionado]}
          accessibilityRole="button"
          accessibilityLabel="Sair da conta"
        >
          <Ionicons name="log-out-outline" size={17} color={paleta().cores.verde} />
          <Text style={styles.textoBotaoSair}>Sair da conta</Text>
        </Pressable>

        {/* Fora do botão de sair e sem a moldura dele, de propósito: são ações
            de peso muito diferente, e dois botões iguais lado a lado convidam ao
            toque errado justamente naquele que não tem desfazer. */}
        <Pressable
          onPress={onAbrirExcluirConta}
          style={styles.linkExcluir}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Excluir conta"
        >
          <Text style={styles.textoLinkExcluir}>Excluir conta</Text>
        </Pressable>
      </View>
      {/* A explicação da notificação, com a cara do app.
          `explicandoAviso` guarda QUAL interruptor pediu — são três, e depois
          do "pode pedir" é preciso continuar naquele, e não em outro. */}
      <Confirmacao
        visivel={explicandoAviso !== null}
        titulo="Lembretes no seu aparelho"
        mensagem={EXPLICACAO_DA_NOTIFICACAO}
        rotuloConfirmar="Pode pedir"
        rotuloCancelar="Agora não"
        onCancelar={() => setExplicandoAviso(null)}
        onConfirmar={() => {
          const seguir = explicandoAviso
          setExplicandoAviso(null)
          seguir?.()
        }}
      />
    </ScrollView>
  )
}

/* A escolha da cor.
 *
 * Uma faixa de matizes em cima e os tons daquele matiz embaixo — que é como um
 * seletor de cor funciona, e dá acesso a qualquer cor sem depender de gesto nem
 * de biblioteca. Toque, e só.
 *
 * Nenhuma escolha é recusada. Amarelo-claro não vira "essa cor não pode": vira
 * um amarelo que se lê, porque quem ajusta é o app — ver lib/cor.ts, onde a
 * conta está verificada nos 360 matizes.
 *
 * O que a pessoa escolhe é o ACENTO. Fundo, cartão e texto continuam sendo os do
 * tema, e é isso que faz o app continuar sendo o mesmo app de outra cor, em vez
 * de virar um app diferente a cada toque. */
const MATIZES = Array.from({ length: 24 }, (_, i) => i * 15)

/* Do mais vivo ao mais fechado. O app corrige o que precisar depois; estes são
   os pontos de partida que dão diferença visível entre um toque e o seguinte. */
const TONS: { s: number; l: number }[] = [
  { s: 85, l: 62 },
  { s: 90, l: 48 },
  { s: 75, l: 38 },
  { s: 45, l: 45 },
]

function SeletorDeCor() {
  const styles = estilos()
  const atual = acentoEfetivo()
  const [matiz, setMatiz] = useState(() => hslDoAtual(atual))

  /* A faixa SEGUE a cor que está valendo.
   *
   * `matiz` nascia da cor do momento e depois vivia sozinho. Tocar na folha —
   * "voltar para a cor da marca" — limpava o acento e o app inteiro voltava ao
   * verde, mas esta faixa continuava parada onde a pessoa tinha deixado: quem
   * escolheu vermelho e voltou para o Cygnos via a marca no vermelho e os
   * quatro tons embaixo em vermelho, como se não tivesse voltado nada.
   *
   * Vale para qualquer caminho, e não só para a folha: a cor também muda ao
   * trocar de tema, porque o app ajusta o tom para ele funcionar no fundo novo.
   * Derivar daqui cobre os dois sem que ninguém precise lembrar de chamar
   * `setMatiz` no lugar certo — que é justamente o que não aconteceu. */
  useEffect(() => {
    setMatiz(hslDoAtual(atual))
  }, [atual])

  return (
    <View style={styles.blocoCor}>
      <View style={styles.faixaMatiz}>
        {MATIZES.map(h => {
          const escolhido = Math.abs(h - matiz) < 8
          return (
            <Pressable
              key={h}
              onPress={() => {
                setMatiz(h)
                trocarAcento(hexDeHsl({ h, s: TONS[1].s, l: TONS[1].l }))
              }}
              style={[
                styles.matiz,
                { backgroundColor: hexDeHsl({ h, s: 90, l: 50 }) },
                escolhido && styles.matizEscolhido,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Matiz ${h} graus`}
            />
          )
        })}
      </View>

      <View style={styles.linhaTons}>
        {TONS.map(t => {
          const cor = hexDeHsl({ h: matiz, ...t })
          const escolhido = acento()?.toUpperCase() === cor.toUpperCase()
          return (
            <Pressable
              key={`${t.s}-${t.l}`}
              onPress={() => trocarAcento(cor)}
              style={[styles.tom, { backgroundColor: cor }, escolhido && styles.tomEscolhido]}
              accessibilityRole="button"
              accessibilityLabel={`Tom ${t.l} por cento`}
            >
              {escolhido && <Ionicons name="checkmark" size={16} color={paleta().cores.branco} />}
            </Pressable>
          )
        })}

        <Pressable
          onPress={limparAcento}
          style={[styles.tom, styles.tomMarca, acento() === null && styles.tomEscolhido]}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a cor da marca"
        >
          <Ionicons
            name="leaf-outline"
            size={15}
            color={acento() === null ? paleta().cores.sobreLimao : paleta().cores.verde}
          />
        </Pressable>
      </View>
    </View>
  )
}

/* O matiz da cor que está valendo, para a faixa abrir marcando onde a pessoa
   está — e não sempre no vermelho. */
function hslDoAtual(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return Math.round((h * 60 + 360) % 360)
}

/* Linha de link para uma página do site. O chevron à direita é o que diz que o
   toque sai do app — sem ele a linha parece uma tela interna. */
function LinhaLink({
  icone,
  rotulo,
  onPress,
  interno = false,
}: {
  icone: keyof typeof Ionicons.glyphMap
  rotulo: string
  onPress: () => void
  interno?: boolean
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linhaLink, pressed && styles.linhaLinkPressionada]}
      accessibilityRole="link"
      accessibilityLabel={rotulo}
    >
      <Ionicons name={icone} size={18} color={paleta().cores.verde} />
      <Text style={styles.textoLink}>{rotulo}</Text>
      {/* Seta para fora quando o toque SAI do app, seta para o lado quando é
          tela interna. O ícone é o que diz para onde se vai, e usar o mesmo nos
          dois casos ensina a pessoa a não confiar nele. */}
      <Ionicons name={interno ? 'chevron-forward' : 'open-outline'} size={15} color={paleta().inkFraco} />
    </Pressable>
  )
}

/* O card do pedido. Dois estados bem diferentes no mesmo lugar:
 *
 *   vinculado    → quem é, com o que importa saber sobre ela
 *   sem vínculo  → o convite para conhecer o catálogo
 *
 * O card inteiro é o botão nos dois casos. Um "ver mais" pequeno no canto seria
 * um alvo de toque menor pelo mesmo destino. */
function CartaoNutricionista({
  catalogo,
  carregando,
  erro,
  onAbrir,
  onAbrirCodigo,
}: {
  catalogo: Catalogo | null
  carregando: boolean
  erro: string | null
  onAbrir: () => void
  onAbrirCodigo: () => void
}) {
  const styles = estilos()
  if (carregando) {
    return (
      <View style={[styles.cartao, styles.cartaoCarregando]}>
        <ActivityIndicator color={paleta().cores.verde} />
      </View>
    )
  }

  if (erro) {
    return (
      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Meu nutricionista</Text>
        <Text style={styles.textoErro}>Não consegui carregar agora. Puxe para baixo para tentar de novo.</Text>
      </View>
    )
  }

  const vinculada = catalogo?.vinculada ?? null
  const lista = catalogo?.lista ?? []

  if (vinculada) {
    return (
      <Pressable
        onPress={onAbrir}
        style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Meu nutricionista: ${vinculada.nome}`}
      >
        <View style={styles.cabecalhoCartao}>
          <Text style={styles.tituloCartao}>Meu nutricionista</Text>
          <Ionicons name="chevron-forward" size={18} color={paleta().inkFraco} />
        </View>

        <View style={styles.linhaNutri}>
          <AvatarNutri nutri={vinculada} tamanho={54} />
          <View style={styles.textoNutri}>
            <Text style={styles.nomeNutri} numberOfLines={2}>
              {vinculada.nome}
            </Text>
            {!!vinculada.crn && <Text style={styles.crnNutri}>CRN {vinculada.crn}</Text>}
            {vinculada.especialidades.length > 0 && (
              <Text style={styles.especialidades} numberOfLines={1}>
                {vinculada.especialidades.join(' · ')}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.cartao}>
      <View style={styles.cabecalhoCartao}>
        <Text style={styles.tituloCartao}>Meu nutricionista</Text>
      </View>

      <Text style={styles.semVinculo}>
        Você ainda não está vinculada a uma nutricionista. Conheça quem está no Cygnos e informe o
        seu código a ela.
      </Text>

      <Pressable
        onPress={onAbrir}
        style={({ pressed }) => [styles.convite, pressed && styles.convitePressionado]}
        accessibilityRole="button"
        accessibilityLabel="Ver as nutricionistas do Cygnos"
      >
        {lista.length > 0 && (
          /* As três primeiras em pilha, sobrepostas: mostra que há gente do
             outro lado antes de a pessoa decidir abrir a lista. */
          <View style={styles.pilha}>
            {lista.slice(0, 3).map((n, i) => (
              <View key={n.id} style={i > 0 && styles.empilhado}>
                <AvatarNutri nutri={n} tamanho={34} />
              </View>
            ))}
          </View>
        )}

        <Text style={styles.textoConvite}>
          {lista.length > 0
            ? `Ver ${lista.length} ${lista.length === 1 ? 'nutricionista' : 'nutricionistas'}`
            : 'Ver nutricionistas'}
        </Text>
        <Ionicons name="chevron-forward" size={17} color={paleta().cores.verde} />
      </Pressable>

      <Pressable onPress={onAbrirCodigo} style={styles.linhaCodigo} accessibilityRole="button">
        <Ionicons name="link-outline" size={14} color={paleta().inkMedio} />
        <Text style={styles.textoCodigo}>Ver o meu código de vínculo</Text>
      </Pressable>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  conteudo: { paddingHorizontal: MARGEM, paddingBottom: 28, gap: 14 },

  titulo: { fontSize: 27, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.6 },

  linhaMensagens: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.cores.cartao,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  linhaPressionada: { backgroundColor: t.cores.superficie },
  linhaQuestionario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.cores.verdeMenta,
    borderRadius: 14,
    borderWidth: 1,
    /* Borda verde e fundo menta, ao contrário das outras linhas desta tela.
       Não é enfeite: ela aparece por poucos dias, tem prazo (a consulta), e
       precisa parecer diferente do que já estava aqui — senão o olho de quem
       abre Mais todo dia passa por cima dela. */
    borderColor: t.cores.verde,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  iconeQuestionario: {
    width: 34,
    height: 34,
    borderRadius: 16,
    backgroundColor: t.cores.cartao,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoQuestionario: { flex: 1, gap: 2 },
  tituloQuestionario: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
  subQuestionario: { fontSize: 12, color: t.inkMedio },
  iconeMensagens: {
    width: 34,
    height: 34,
    borderRadius: 16,
    backgroundColor: t.cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoMensagens: { flex: 1, fontSize: 15, fontWeight: '600', color: t.cores.ink },
  selo: {
    minWidth: 20,
    height: 20,
    borderRadius: 8,
    paddingHorizontal: 6,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoSelo: { fontSize: 11, fontWeight: '800', color: t.cores.branco },
  cartao: { borderRadius: 20, backgroundColor: t.cores.cartao, padding: PADDING_CARTAO },
  cartaoPressionado: { backgroundColor: t.cores.trilho },
  cartaoCarregando: { alignItems: 'center', paddingVertical: 34 },
  cabecalhoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tituloCartao: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

  linhaNutri: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  textoNutri: { flex: 1 },
  nomeNutri: { fontSize: 15.5, fontWeight: '700', color: t.cores.ink, lineHeight: 21 },
  crnNutri: { marginTop: 2, fontSize: 12, color: t.inkSuave },
  especialidades: { marginTop: 3, fontSize: 11.5, color: t.inkFraco },

  semVinculo: { marginTop: 8, fontSize: 13.5, lineHeight: 20, color: t.inkSuave },

  convite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
  },
  convitePressionado: { backgroundColor: t.cores.verdeMenta },
  pilha: { flexDirection: 'row' },
  /* Sobreposição para a esquerda: a pilha ocupa menos e diz "são várias" sem
     precisar de um número antes de o olho chegar nele. */
  empilhado: { marginLeft: -12 },
  textoConvite: { flex: 1, fontSize: 14, fontWeight: '700', color: t.cores.verde },

  linhaCodigo: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  textoCodigo: { fontSize: 12.5, fontWeight: '600', color: t.inkMedio },

  email: { marginTop: 6, fontSize: 13, color: t.inkSuave },
  botaoSair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.verde,
  },
  explicacaoLembrete: { fontSize: 13, color: t.inkSuave, lineHeight: 19, marginBottom: 12 },
  botaoLembrete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  rotuloLembrete: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: t.cores.verde,
  },
  /* Separa os dois interruptores sem virar um segundo cartão: são o mesmo
     assunto, e dois cartões iguais lado a lado dariam a entender que um
     substitui o outro. */
  divisor: { height: 1, backgroundColor: t.cores.borda, marginVertical: 16 },
linhaTema: { flexDirection: 'row', gap: 10, marginTop: 12 },
  blocoCor: { marginTop: 12, gap: 10 },
  /* Colados, sem vão: junto eles formam o arco-íris que se reconhece como
     seletor de cor. Separados viravam vinte e quatro botões coloridos. */
  faixaMatiz: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', height: 34 },
  matiz: { flex: 1, height: '100%' },
  matizEscolhido: { borderWidth: 3, borderColor: t.cores.ink },
  linhaTons: { flexDirection: 'row', gap: 8 },
  tom: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tomEscolhido: { borderWidth: 2, borderColor: t.cores.ink },
  tomMarca: { backgroundColor: t.cores.verdeClaro },
  botaoTema: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  botaoTemaEscolhido: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoBotaoTemaEscolhido: { color: t.cores.sobreLimao },
  botaoLembreteAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  /* Fundo apagado, e nao `opacity`: opacidade compoe texto e fundo contra a
       pagina e destroi a razao entre os dois — medido em 1,43 num caso, com 4,5
       de minimo. `desligado` foi escolhido pela conta: branco sobre ele da 4,76. */
  botaoLembreteDesligado: { backgroundColor: t.cores.desligado },
  textoBotaoLembreteAtivo: { color: t.cores.sobreLimao },
  avisoLembrete: { fontSize: 12.5, color: t.inkSuave, lineHeight: 18, marginTop: 10 },
  linkMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: t.cores.verdeClaro,
  },
  linkMetaPressionado: { backgroundColor: t.cores.verdeMenta },
  textoLinkMeta: { fontSize: 13, fontWeight: '700', color: t.cores.verde },
  botaoSairPressionado: { backgroundColor: t.cores.verdeMenta },
  textoBotaoSair: { fontSize: 15, fontWeight: '600', color: t.cores.verde },

  /* Centralizado e sem moldura: a exclusão precisa estar sempre alcançável — é
     exigência da loja —, mas não competindo pelo olhar com o que se usa todo
     dia. */
  linkExcluir: { alignSelf: 'center', marginTop: 12, paddingVertical: 6 },
  textoLinkExcluir: { fontSize: 13.5, fontWeight: '600', color: t.cores.erroTexto },

  textoPrivacidade: { marginTop: 6, fontSize: 13, lineHeight: 19, color: t.inkSuave },
  linhaLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
  },
  linhaLinkPressionada: { backgroundColor: t.cores.verdeMenta },
  textoLink: { flex: 1, fontSize: 14, fontWeight: '600', color: t.cores.ink },

  textoErro: { marginTop: 8, fontSize: 13, lineHeight: 19, color: t.inkSuave },
  }),
)
