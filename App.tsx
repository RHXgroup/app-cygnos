import { useEffect, useReducer, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Keyboard,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { BarraAbas, ORDEM_ABAS, type Aba } from './src/components/BarraAbas'
import { AVISO_NAO_E_PACIENTE, ehContaDePaciente } from './src/lib/conta'
import { supabase } from './src/lib/supabase'
import { AguaScreen } from './src/screens/AguaScreen'
import { AvisosScreen } from './src/screens/AvisosScreen'
import { CadastroScreen } from './src/screens/CadastroScreen'
import { CodigoScreen } from './src/screens/CodigoScreen'
import { ContadorCaloriasScreen } from './src/screens/ContadorCaloriasScreen'
import { HomeScreen } from './src/screens/HomeScreen'
import { ListaDeComprasScreen } from './src/screens/ListaDeComprasScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { EditarPlanoScreen } from './src/screens/EditarPlanoScreen'
import { ExcluirContaScreen } from './src/screens/ExcluirContaScreen'
import { MaisScreen } from './src/screens/MaisScreen'
import { MensagensScreen } from './src/screens/MensagensScreen'
import { MetasScreen, type AlvoMetas } from './src/screens/MetasScreen'
import { MeusCadastrosScreen } from './src/screens/MeusCadastrosScreen'
import { ReceitasScreen } from './src/screens/ReceitasScreen'
import { NutricionistasScreen } from './src/screens/NutricionistasScreen'
import { PerfilScreen } from './src/screens/PerfilScreen'
import { RecuperarSenhaScreen } from './src/screens/RecuperarSenhaScreen'
import { PesoScreen } from './src/screens/PesoScreen'
import { RefeicaoScreen } from './src/screens/RefeicaoScreen'
import { RegistrarScreen } from './src/screens/RegistrarScreen'
import { RelatoriosScreen } from './src/screens/RelatoriosScreen'
import { SonoScreen } from './src/screens/SonoScreen'
import type { PlanoCompleto, RefeicaoSalva } from './src/lib/plano'
import { estilosDe, carregarTema, escutarTema, tema, paleta } from './src/lib/tema'

/* UM provider só, na raiz, e que nunca desmonta.
 *
 * O SafeAreaProvider renderiza null enquanto não mediu os insets do aparelho.
 * Com um provider por ramo de tela, trocar de ramo desmontava um e montava
 * outro no meio da medição — e a árvore podia ficar vazia para sempre, sem
 * erro nenhum no console, porque tecnicamente nada quebrou.
 *
 * initialMetrics entrega os insets já no primeiro quadro, em vez de esperar
 * uma ida e volta de medição. */
export default function App() {
  /* A troca de tema redesenha a árvore. Redesenha, e não remonta.
   *
   * A diferença é tudo. A primeira versão disto punha `geracao` como `key` da
   * View da raiz, e isso REMONTAVA o app: quem trocasse a cor estando na aba
   * Mais era jogado de volta para a tela inicial, com toda tela aberta fechada
   * junto. Escolher três cores seguidas exigia navegar até Mais três vezes.
   *
   * E a remontagem nunca foi necessária. `estilos()` é chamado DURANTE o render
   * de cada componente, não no topo do arquivo — então basta o app renderizar de
   * novo para cada um pedir os estilos outra vez e receber os da paleta nova.
   * Subir um estado na raiz faz exatamente isso, e re-render preserva o estado
   * dos filhos; só desmontar destrói.
   *
   * O tema é lido do aparelho antes do primeiro desenho; enquanto não veio, o
   * padrão é o claro, que é a cara da marca. */
  /* Só existe para provocar o novo desenho. O valor em si não é usado em lugar
     nenhum — quem lê a paleta é cada `estilos()`, no render. */
  const [, redesenhar] = useReducer((n: number) => n + 1, 0)
  const [lendoTema, setLendoTema] = useState(true)

  useEffect(() => {
    carregarTema().finally(() => setLendoTema(false))
    escutarTema(redesenhar)
    return () => escutarTema(null)
  }, [])

  const styles = estilos()

  if (lendoTema) return <View style={styles.raiz} />

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* Cor de fundo na raiz: se algum dia sobrar um quadro sem conteúdo, ele
          aparece no fundo do app em vez de um branco estourado. */}
      {/* Sem `key` aqui. Ver o comentário acima: uma chave que muda remonta a
          árvore e leva junto a navegação de quem só queria trocar de cor. */}
      <View style={styles.raiz}>
        <Raiz />
      </View>
    </SafeAreaProvider>
  )
}

function Raiz() {
  const styles = estilos()
  const [sessao, setSessao] = useState<Session | null>(null)
  /* Três telas antes de entrar, e um estado ainda resolve: elas não empilham,
     não têm parâmetro de rota e sempre voltam para o login. Uma biblioteca de
     navegação aqui seria mais peça do que problema. */
  const [telaAberta, setTelaAberta] = useState<'login' | 'cadastro' | 'recuperar'>('login')
  /* A sessão fica no AsyncStorage, cuja leitura é assíncrona. Sem este estado
     o app pisca a tela de login por um instante para quem já estava logado. */
  const [verificando, setVerificando] = useState(true)
  /* Autenticado não é o mesmo que ser paciente: o Auth é compartilhado com o
     sistema web. Ver `ehContaDePaciente`. */
  const [acesso, setAcesso] = useState<'checando' | 'liberado'>('checando')
  /* Recado que sobrevive ao logout e aparece na tela de login. Sem ele, quem é
     barrado volta para o login sem entender por quê. */
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setVerificando(false)
    })

    /* Fonte única da verdade daqui para a frente: cobre login, logout e a
       renovação do token, sem cada tela ter de avisar as outras. */
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      /* Sair devolve ao login, nunca ao cadastro meio preenchido. */
      if (!s) setTelaAberta('login')
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  /* O voltar do Android nas portas de entrada. Sem isto ele encerra o app de
     dentro do cadastro ou da recuperação, e o que a pessoa digitou some sem nem
     uma pergunta. Do login não intercepta: ali sair é o que se espera. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (telaAberta === 'login') return false
      setTelaAberta('login')
      return true
    })

    return () => sub.remove()
  }, [telaAberta])

  /* O portão fica aqui, e não dentro do login, porque são três as portas de
     entrada: entrar com senha, terminar a recuperação e voltar com a sessão
     guardada no aparelho. Cobrindo no App, nenhuma delas escapa.
     A recuperação fica de fora enquanto está aberta: ali a sessão nasce no meio
     do caminho e quem confere é a própria tela. */
  useEffect(() => {
    if (!sessao || telaAberta === 'recuperar') return

    let vivo = true
    setAcesso('checando')

    ehContaDePaciente().then(paciente => {
      if (!vivo) return
      if (paciente === false) {
        setAviso(AVISO_NAO_E_PACIENTE)
        supabase.auth.signOut()
        return
      }
      setAcesso('liberado')
    })

    return () => {
      vivo = false
    }
  }, [sessao?.user.id, telaAberta])

  if (verificando) {
    return (
      <>
        <StatusBar style={tema() === "claro" ? "dark" : "light"} />
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      </>
    )
  }

  /* A recuperação de senha CRIA sessão no meio do caminho: conferir o código já
     autentica a pessoa, antes de ela ter escolhido a senha nova. Sem esta
     exceção, o App a jogaria para dentro do app naquele instante e a tela de
     senha nova nunca apareceria. */
  if (sessao && telaAberta !== 'recuperar') {
    /* Meio segundo de espera do portão. Renderizar a área logada antes da
       resposta faria a nutricionista ver o app inteiro e ser expulsa em
       seguida, que é pior do que esperar. */
    if (acesso === 'checando') {
      return (
        <>
          <StatusBar style={tema() === "claro" ? "dark" : "light"} />
          <View style={styles.centro}>
            <ActivityIndicator color={paleta().cores.verde} />
          </View>
        </>
      )
    }
    return <AreaLogada sessao={sessao} />
  }

  return (
    <>
      <StatusBar style={tema() === "claro" ? "dark" : "light"} />
      <SafeAreaView style={styles.telaAuth}>
        {telaAberta === 'cadastro' ? (
          <CadastroScreen onVoltar={() => setTelaAberta('login')} />
        ) : telaAberta === 'recuperar' ? (
          <RecuperarSenhaScreen
            onVoltar={() => setTelaAberta('login')}
            /* Só volta para 'login' como estado. Como a sessão já existe, o
               próximo render cai direto na área logada. */
            onConcluido={() => setTelaAberta('login')}
          />
        ) : (
          <LoginScreen
            aviso={aviso}
            onLimparAviso={() => setAviso('')}
            onIrParaCadastro={() => setTelaAberta('cadastro')}
            onIrParaRecuperar={() => setTelaAberta('recuperar')}
          />
        )}
      </SafeAreaView>
    </>
  )
}

/* A moldura de toda tela sobreposta.
 *
 * Faz duas coisas que estavam faltando em quinze lugares iguais.
 *
 * Pinta o fundo: absoluteFill posiciona, mas é transparente, e bastava a tela
 * de cima não cobrir cada pixel para a de baixo aparecer atrás dela.
 *
 * E solta o teclado ao sair. Com o teclado no ar a janela está encolhida, e a
 * tela de trás volta a ser medida nesse tamanho — desenhando-se comprimida até
 * algo forçá-la a medir de novo. Aqui no desmonte, e não em cada saída de cada
 * tela: são nove telas com campo de texto, cada uma com três ou quatro saídas, e
 * uma esquecida traz o defeito de volta pelo caminho que ninguém lembrou. */
function Sobreposta({ children }: { children: React.ReactNode }) {
  const styles = estilos()
  useEffect(() => () => Keyboard.dismiss(), [])
  return <View style={styles.sobreposta}>{children}</View>
}

/* Componente à parte porque tem estado e refs próprios: montá-lo só depois do
   login evita criar o carrossel e disparar a busca do nome antes da hora.
   Sem SafeAreaView em volta, de propósito — a faixa do topo precisa sangrar até
   a borda, e quem cuida do respiro do notch é a própria Home. */
function AreaLogada({ sessao }: { sessao: Session }) {
  const styles = estilos()
  const { width } = useWindowDimensions()
  /* Só a faixa da barra de status usa: o respiro do conteúdo é assunto de cada
     tela, e continua sendo. */
  const insets = useSafeAreaInsets()
  const [aba, setAba] = useState<Aba>('inicio')
  /* As telas do menu vivem aqui, e não dentro da Home, para poder cobrir também
     a barra de abas. Dentro da Home elas seriam recortadas pelo carrossel. */
  const [perfilAberto, setPerfilAberto] = useState(false)
  const [codigoAberto, setCodigoAberto] = useState(false)
  const [nutricionistasAbertas, setNutricionistasAbertas] = useState(false)
  const [avisosAbertos, setAvisosAbertos] = useState(false)
  const [excluirContaAberta, setExcluirContaAberta] = useState(false)
  const [cadastrosAberto, setCadastrosAberto] = useState(false)
  /* Receitas abertas para ORGANIZAR, a partir de "Meus cadastros". A outra
     entrada, pelo contador de calorias, é para COMER e mora lá dentro — esta
     não passa `onUsar`, e é isso que separa as duas. */
  const [receitasAbertas, setReceitasAbertas] = useState(false)
  const [aguaAberta, setAguaAberta] = useState(false)
  /* Guarda o plano, e nao um booleano: a lista de compras nao existe sem um,
     e passar o plano junto evita a tela ter de busca-lo de novo. */
  const [comprasDe, setComprasDe] = useState<PlanoCompleto | null>(null)
  /* null = fechada. Aberta, guarda O QUE editar: um conjunto escolhido na lista,
     'nova' para começar em branco, ou 'ativa' quando veio do menu e a pessoa só
     quer mexer no que está valendo. */
  const [metasAbertas, setMetasAbertas] = useState<AlvoMetas | null>(null)
  const [pesoAberto, setPesoAberto] = useState(false)
  const [contadorAberto, setContadorAberto] = useState(false)
  const [sonoAberto, setSonoAberto] = useState(false)
  /* null = fechada. Aberta, guarda em que opção ela deve nascer: 'plano' quando
     veio do botão da Home, 'energetico' quando veio de Meus cadastros, undefined
     quando veio do + e a grade é o começo. */
  /* Quais opções do "+" alguém abre direto, sem passar pela lista. Vem de fora
     — do cartão de plano, de "Meus cadastros" e do cartão de treino. */
  const [registrar, setRegistrar] = useState<{
    inicial?: 'plano' | 'energetico' | 'treino'
  } | null>(null)
  /* A refeição aberta a partir do cartão "Próxima refeição". Carrega junto o
     "Hoje"/"Amanhã" de onde ela foi aberta: quem calculou isso foi a Home, e
     recalcular aqui poderia dar outra resposta se a hora virasse no meio. */
  const [refeicaoAberta, setRefeicaoAberta] = useState<{
    refeicao: RefeicaoSalva
    quando: string
  } | null>(null)
  const [planoEmEdicao, setPlanoEmEdicao] = useState<PlanoCompleto | null>(null)
  /* Contador, e não um booleano de "recarregar": a Home fica montada dentro do
     carrossel o tempo todo e nunca remonta sozinha. Salvar um plano precisa
     empurrar uma busca nova, e um número que só cresce faz isso sem ninguém ter
     de lembrar de baixar a bandeira depois. */
  const [versaoPlano, setVersaoPlano] = useState(0)
  /* O mesmo contador, para a água. Separado do plano de propósito: o cartão de
     água muda várias vezes por dia e o plano quase nunca, e um contador só faria
     cada copo mandar a Home reler as quatro tabelas do plano. */
  const [versaoAgua, setVersaoAgua] = useState(0)
  /* Salvar metas mexe na Home (calorias e macros) E na tela de Água (a meta de
     água mora na mesma linha de app_metas), então este contador empurra as duas.
     Por isso ele também sobe o de água, em vez de a Água ter de saber de metas. */
  const [versaoMetas, setVersaoMetas] = useState(0)
  const [versaoPeso, setVersaoPeso] = useState(0)
  const [versaoConsumo, setVersaoConsumo] = useState(0)
  const [versaoSono, setVersaoSono] = useState(0)
  const [versaoTreino, setVersaoTreino] = useState(0)
  /* Muda quando a nutricionista vincula o paciente enquanto o app está aberto.
     Quem percebe é a tela do código, que fica perguntando: o vínculo acontece
     do lado dela e nada avisa o aparelho. */
  const [versaoVinculo, setVersaoVinculo] = useState(0)
  const carrossel = useRef<ScrollView>(null)
  /* O Início não é a primeira aba, então o carrossel precisa nascer deslocado.
     A prop contentOffset só funciona no iOS; posicionar no primeiro layout
     funciona nos dois. */
  const jaPosicionou = useRef(false)
  /* Com que largura o carrossel foi posicionado.
   *
   * A posição é um deslocamento em pixels — aba 2 vive em 2 × largura. Se a
   * largura mudar depois (girar o aparelho, tela dividida), o deslocamento
   * antigo passa a apontar para o meio de duas abas, e a tela fica com metade
   * de uma e metade da outra. Era posicionar uma vez e nunca mais; agora
   * reposiciona quando a régua muda. */
  const larguraPosicionada = useRef(0)

  /* Voltar do segundo plano relê o plano.
   *
   * É o contador do plano, e não outro, porque é ele que puxa junto o plano DA
   * NUTRICIONISTA — e esse é o único conteúdo da tela inicial que muda sem o
   * paciente ter feito nada. Ela publica o plano dela do consultório, ou vincula
   * a conta, e nada avisa o aparelho: sem isto, a tela inicial continuaria
   * mostrando o plano próprio (ou o convite para montar um) até o app ser
   * fechado e aberto de novo.
   *
   * A Home não pisca por causa disto — ver o efeito do plano lá, que só mostra o
   * indicador na primeira carga. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') setVersaoPlano(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  /* Um caminho só para os dois contadores: a meta de água mora na mesma linha
     que as de caloria e passos, então gravar metas invalida as duas telas. */
  function aoSalvarMetas() {
    setVersaoMetas(v => v + 1)
    setVersaoAgua(v => v + 1)
  }

  function irPara(destino: Aba) {
    const i = ORDEM_ABAS.indexOf(destino)
    if (i < 0) return
    carrossel.current?.scrollTo({ x: i * width, animated: true })
    /* Atualiza já, sem esperar o fim da animação: o realce na barra tem que
       responder ao toque na hora. */
    setAba(destino)
  }

  function aoTerminarDeslizar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width)
    const destino = ORDEM_ABAS[i]
    if (destino && destino !== aba) setAba(destino)
  }

  /* O botão voltar do Android.
   *
   * A navegação daqui é feita com estado, e não com uma biblioteca de rotas, então
   * o Android não encontra pilha nenhuma para desempilhar e faz a única coisa que
   * sabe: encerra o app — de qualquer tela, inclusive do meio de um plano pela
   * metade.
   *
   * A ordem abaixo é a inversa da que as sobreposições são desenhadas no JSX: a
   * última a ser pintada é a que está por cima, e é ela que o voltar fecha
   * primeiro. Duas abertas ao mesmo tempo é o caso comum — Cadastros abre a
   * Edição por cima de si. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const deCimaParaBaixo: [boolean, () => void][] = [
        [registrar !== null, () => setRegistrar(null)],
        [refeicaoAberta !== null, () => setRefeicaoAberta(null)],
        [pesoAberto, () => setPesoAberto(false)],
        [contadorAberto, () => setContadorAberto(false)],
        [sonoAberto, () => setSonoAberto(false)],
        [metasAbertas !== null, () => setMetasAbertas(null)],
        [comprasDe !== null, () => setComprasDe(null)],
        [aguaAberta, () => setAguaAberta(false)],
        [planoEmEdicao !== null, () => setPlanoEmEdicao(null)],
        [cadastrosAberto, () => setCadastrosAberto(false)],
        [excluirContaAberta, () => setExcluirContaAberta(false)],
        [nutricionistasAbertas, () => setNutricionistasAbertas(false)],
        [avisosAbertos, () => setAvisosAbertos(false)],
        [codigoAberto, () => setCodigoAberto(false)],
        [perfilAberto, () => setPerfilAberto(false)],
      ]

      const deCima = deCimaParaBaixo.find(([aberta]) => aberta)
      if (deCima) {
        deCima[1]()
        return true
      }

      /* Sem nada aberto, o voltar leva ao Início, como em qualquer app de abas.
         Já no Início, devolve o evento ao Android: sair dali é o esperado, e
         segurar o voltar para sempre prenderia a pessoa dentro do app. */
      if (aba !== 'inicio') {
        irPara('inicio')
        return true
      }

      return false
    })

    return () => sub.remove()
  }, [
    aba,
    width,
    registrar,
    refeicaoAberta,
    pesoAberto,
    contadorAberto,
    sonoAberto,
    metasAbertas,
    comprasDe,
    aguaAberta,
    planoEmEdicao,
    cadastrosAberto,
    excluirContaAberta,
    nutricionistasAbertas,
    avisosAbertos,
    codigoAberto,
    perfilAberto,
  ])

  return (
    <>
      {/* Fundo escuro em todas as telas, então os ícones do sistema são claros. */}
      <StatusBar style={tema() === "claro" ? "dark" : "light"} />
      <View style={styles.telaApp}>
        <ScrollView
          ref={carrossel}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          /* Sem elástico nas pontas: puxar além da primeira ou da última aba
             mostraria um vão vazio ao lado do conteúdo. */
          bounces={false}
          overScrollMode="never"
          onMomentumScrollEnd={aoTerminarDeslizar}
          onLayout={() => {
            /* Na primeira vez vai para o Início; nas seguintes, só se a largura
               mudou — e aí mantém a aba em que a pessoa está, em vez de
               arrastá-la de volta para o Início por causa de um giro. */
            const primeira = !jaPosicionou.current
            if (!primeira && larguraPosicionada.current === width) return

            jaPosicionou.current = true
            larguraPosicionada.current = width

            const destino = primeira ? 'inicio' : aba
            carrossel.current?.scrollTo({ x: ORDEM_ABAS.indexOf(destino) * width, animated: false })
          }}
          style={styles.carrossel}
        >
          {ORDEM_ABAS.map(chave => (
            <View key={chave} style={{ width }}>
              <TelaDaAba
                chave={chave}
                sessao={sessao}
                versaoPlano={versaoPlano}
                versaoAgua={versaoAgua}
                versaoMetas={versaoMetas}
                versaoPeso={versaoPeso}
                versaoConsumo={versaoConsumo}
                versaoSono={versaoSono}
                versaoTreino={versaoTreino}
                versaoVinculo={versaoVinculo}
                onAbrirPerfil={() => setPerfilAberto(true)}
                onAbrirCodigo={() => setCodigoAberto(true)}
                onAbrirNutricionistas={() => setNutricionistasAbertas(true)}
                onAbrirAvisos={() => setAvisosAbertos(true)}
                onAbrirExcluirConta={() => setExcluirContaAberta(true)}
                onAbrirCadastros={() => setCadastrosAberto(true)}
                onMontarPlano={() => setRegistrar({ inicial: 'plano' })}
                onAbrirRefeicao={(refeicao, quando) => setRefeicaoAberta({ refeicao, quando })}
                onEditarPlano={setPlanoEmEdicao}
                onAbrirAgua={() => setAguaAberta(true)}
                onAbrirCompras={setComprasDe}
                /* Da tela inicial vai-se para o conjunto que está valendo: o
                   convite ali é "defina sua meta", não "crie mais uma". */
                onAbrirMetas={() => setMetasAbertas('ativa')}
                onAbrirPeso={() => setPesoAberto(true)}
                onAbrirContador={() => setContadorAberto(true)}
                onAbrirSono={() => setSonoAberto(true)}
                /* Treino não tem tela própria no App: ele mora dentro do "+",
                   e abrir o "+" já naquela opção é o mesmo caminho que o
                   cartão de plano usa para "montar plano". */
                onAbrirTreino={() => setRegistrar({ inicial: 'treino' })}
              />
            </View>
          ))}
        </ScrollView>

        <BarraAbas ativa={aba} onTrocar={irPara} onRegistrar={() => setRegistrar({})} />

        {/* Sobreposto por cima de tudo, inclusive da barra de abas. É uma View
            e não um Modal de propósito: no iOS, abrir a câmera de dentro de um
            Modal deixa a promise do picker pendurada para sempre. */}
        {perfilAberto && (
          <Sobreposta>
            <PerfilScreen
              sessao={sessao}
              onFechar={() => setPerfilAberto(false)}
              /* O foco do peso mora em app_metas: mudá-lo invalida as mesmas
                 telas que salvar uma meta invalida. */
              onObjetivoMudou={aoSalvarMetas}
            />
          </Sobreposta>
        )}

        {codigoAberto && (
          <Sobreposta>
            <CodigoScreen
              sessao={sessao}
              onFechar={() => setCodigoAberto(false)}
              /* Bate nos três: o vínculo muda o que a aba Mais mostra, e passa
                 a valer o plano e as metas DELA na tela inicial. */
              onVinculou={() => {
                setVersaoVinculo(v => v + 1)
                setVersaoPlano(v => v + 1)
                setVersaoMetas(v => v + 1)
              }}
            />
          </Sobreposta>
        )}

        {nutricionistasAbertas && (
          <Sobreposta>
            <NutricionistasScreen onFechar={() => setNutricionistasAbertas(false)} />
          </Sobreposta>
        )}

        {avisosAbertos && (
          <Sobreposta>
            <AvisosScreen
              onFechar={() => setAvisosAbertos(false)}
              /* Fecha os avisos ao ir: voltar da ficha devolve à tela inicial,
                 e não a uma lista de avisos que a pessoa já leu. */
              onAbrirNutricionistas={() => {
                setAvisosAbertos(false)
                setNutricionistasAbertas(true)
              }}
            />
          </Sobreposta>
        )}

        {/* Não precisa de nada para fechar quando dá certo: apagar a conta
            termina em signOut, o listener de sessão lá em cima zera tudo e o
            App inteiro volta para o login. */}
        {excluirContaAberta && (
          <Sobreposta>
            <ExcluirContaScreen
              email={sessao.user.email ?? ''}
              onFechar={() => setExcluirContaAberta(false)}
            />
          </Sobreposta>
        )}

        {/* Antes da edição no JSX de propósito: abrir um plano daqui empilha a
            tela de edição POR CIMA desta, e é para ela que o voltar devolve. */}
        {cadastrosAberto && (
          <Sobreposta>
            <MeusCadastrosScreen
              contaId={sessao.user.id}
              versao={versaoPlano}
              versaoMetas={versaoMetas}
              onFechar={() => setCadastrosAberto(false)}
              onAbrirPlano={setPlanoEmEdicao}
              onNovoPlano={() => setRegistrar({ inicial: 'plano' })}
              onAbrirMetas={setMetasAbertas}
              onNovasMetas={() => setMetasAbertas('nova')}
              onNovoCalculo={() => setRegistrar({ inicial: 'energetico' })}
              onAbrirReceitas={() => setReceitasAbertas(true)}
              /* Ativar plano e ativar cálculo passam pelo mesmo aviso: os dois
                 mudam o que a tela inicial mostra. Bater nos dois contadores é
                 mais barato que um caminho por assunto. */
              onAtivou={() => {
                setVersaoPlano(v => v + 1)
                setVersaoMetas(v => v + 1)
              }}
            />
          </Sobreposta>
        )}

        {/* Depois de "Meus cadastros" no JSX: abre POR CIMA dele, e o voltar
            devolve para a lista de onde se veio. */}
        {receitasAbertas && (
          <Sobreposta>
            <ReceitasScreen contaId={sessao.user.id} onFechar={() => setReceitasAbertas(false)} />
          </Sobreposta>
        )}

        {planoEmEdicao && (
          <Sobreposta>
            <EditarPlanoScreen
              plano={planoEmEdicao}
              onFechar={() => setPlanoEmEdicao(null)}
              onSalvo={() => {
                setPlanoEmEdicao(null)
                setVersaoPlano(v => v + 1)
              }}
            />
          </Sobreposta>
        )}

        {comprasDe && (
          <Sobreposta>
            <ListaDeComprasScreen plano={comprasDe} onFechar={() => setComprasDe(null)} />
          </Sobreposta>
        )}

        {aguaAberta && (
          <Sobreposta>
            <AguaScreen
              contaId={sessao.user.id}
              onFechar={() => setAguaAberta(false)}
              onMudou={() => setVersaoAgua(v => v + 1)}
            />
          </Sobreposta>
        )}

        {metasAbertas !== null && (
          <Sobreposta>
            <MetasScreen
              contaId={sessao.user.id}
              alvo={metasAbertas}
              onFechar={() => setMetasAbertas(null)}
              onSalvo={aoSalvarMetas}
            />
          </Sobreposta>
        )}

        {sonoAberto && (
          <Sobreposta>
            <SonoScreen
              contaId={sessao.user.id}
              onFechar={() => setSonoAberto(false)}
              onMudou={() => setVersaoSono(v => v + 1)}
            />
          </Sobreposta>
        )}

        {contadorAberto && (
          <Sobreposta>
            <ContadorCaloriasScreen
              contaId={sessao.user.id}
              onFechar={() => setContadorAberto(false)}
              onMudou={() => setVersaoConsumo(v => v + 1)}
            />
          </Sobreposta>
        )}

        {pesoAberto && (
          <Sobreposta>
            <PesoScreen
              contaId={sessao.user.id}
              onFechar={() => setPesoAberto(false)}
              onMudou={() => setVersaoPeso(v => v + 1)}
            />
          </Sobreposta>
        )}

        {refeicaoAberta && (
          <Sobreposta>
            <RefeicaoScreen
              refeicao={refeicaoAberta.refeicao}
              quando={refeicaoAberta.quando}
              onFechar={() => setRefeicaoAberta(null)}
            />
          </Sobreposta>
        )}

        {registrar && (
          <Sobreposta>
            <RegistrarScreen
              contaId={sessao.user.id}
              inicial={registrar.inicial}
              onFechar={() => setRegistrar(null)}
              onPlanoSalvo={() => {
                setRegistrar(null)
                setVersaoPlano(v => v + 1)
              }}
              onAguaMudou={() => setVersaoAgua(v => v + 1)}
              onMetasSalvas={aoSalvarMetas}
              onPesoMudou={() => setVersaoPeso(v => v + 1)}
              onConsumoMudou={() => setVersaoConsumo(v => v + 1)}
              onSonoMudou={() => setVersaoSono(v => v + 1)}
              onTreinoMudou={() => setVersaoTreino(v => v + 1)}
            />
          </Sobreposta>
        )}

        {/* A faixa da barra de status.
         *
         * O Android desenha o app de borda a borda, então a área do relógio e
         * dos ícones do sistema é NOSSA — e o conteúdo passava por baixo dela ao
         * rolar. Medido na tela inicial: o número de calorias ficava atrás do
         * relógio, ilegível, e a leitura disso é "o app está quebrado".
         *
         * Começar o conteúdo abaixo da barra, que é o que a tela já fazia com o
         * `paddingTop`, resolve só o estado inicial: assim que a pessoa rola, o
         * conteúdo sobe.
         *
         * Fica aqui e não em cada tela por dois motivos. É uma só, em vez de
         * uma por tela que rola — e são muitas. E vem por ÚLTIMO no JSX, então
         * cobre também as sobreposições, que rolam do mesmo jeito.
         *
         * `pointerEvents="none"` porque ela é pintura, não alvo: sem isso,
         * roubaria o toque de qualquer botão que passasse por baixo. */}
        <View style={[styles.faixaStatus, { height: insets.top }]} pointerEvents="none" />
      </View>
    </>
  )
}

function TelaDaAba({
  chave,
  sessao,
  versaoPlano,
  versaoAgua,
  versaoMetas,
  versaoPeso,
  versaoConsumo,
  versaoSono,
  versaoTreino,
  versaoVinculo,
  onAbrirPerfil,
  onAbrirCodigo,
  onAbrirNutricionistas,
  onAbrirAvisos,
  onAbrirExcluirConta,
  onAbrirCadastros,
  onMontarPlano,
  onAbrirRefeicao,
  onEditarPlano,
  onAbrirAgua,
  onAbrirCompras,
  onAbrirMetas,
  onAbrirPeso,
  onAbrirContador,
  onAbrirSono,
  onAbrirTreino,
}: {
  chave: Aba
  sessao: Session
  versaoPlano: number
  versaoAgua: number
  versaoMetas: number
  versaoPeso: number
  versaoConsumo: number
  versaoSono: number
  versaoTreino: number
  versaoVinculo: number
  onAbrirPerfil: () => void
  onAbrirCodigo: () => void
  onAbrirNutricionistas: () => void
  /* O destino do sino do topo. */
  onAbrirAvisos: () => void
  onAbrirExcluirConta: () => void
  onAbrirCadastros: () => void
  onMontarPlano: () => void
  onAbrirRefeicao: (refeicao: RefeicaoSalva, quando: string) => void
  onEditarPlano: (plano: PlanoCompleto) => void
  onAbrirAgua: () => void
  onAbrirCompras: (plano: PlanoCompleto) => void
  onAbrirMetas: () => void
  onAbrirPeso: () => void
  onAbrirContador: () => void
  onAbrirSono: () => void
  onAbrirTreino: () => void
}) {
  switch (chave) {
    case 'inicio':
      return (
        <HomeScreen
          sessao={sessao}
          versaoPlano={versaoPlano}
          versaoAgua={versaoAgua}
          versaoMetas={versaoMetas}
          versaoPeso={versaoPeso}
          versaoConsumo={versaoConsumo}
          versaoSono={versaoSono}
          versaoTreino={versaoTreino}
          onAbrirPerfil={onAbrirPerfil}
          onAbrirCodigo={onAbrirCodigo}
          onAbrirCadastros={onAbrirCadastros}
          onAbrirAvisos={onAbrirAvisos}
          onMontarPlano={onMontarPlano}
          onAbrirRefeicao={onAbrirRefeicao}
          onEditarPlano={onEditarPlano}
          onAbrirAgua={onAbrirAgua}
          onAbrirCompras={onAbrirCompras}
          onAbrirMetas={onAbrirMetas}
          onAbrirPeso={onAbrirPeso}
          onAbrirContador={onAbrirContador}
          onAbrirSono={onAbrirSono}
          onAbrirTreino={onAbrirTreino}
        />
      )
    case 'relatorios':
      return (
        <RelatoriosScreen
          contaId={sessao.user.id}
          /* A soma dos seis contadores, e não um sétimo: os relatórios leem TODOS
             os assuntos, então qualquer registro os invalida. Como cada contador
             só cresce, a soma também só cresce — que é a única coisa de que o
             efeito da tela precisa. */
          versao={versaoPlano + versaoAgua + versaoMetas + versaoPeso + versaoConsumo + versaoSono}
          onAbrirMetas={onAbrirMetas}
        />
      )
    case 'mensagens':
      return <MensagensScreen onAbrirNutricionistas={onAbrirNutricionistas} />
    case 'mais':
      return (
        <MaisScreen
          versaoVinculo={versaoVinculo}
          contaId={sessao.user.id}
          email={sessao.user.email ?? ''}
          onAbrirNutricionistas={onAbrirNutricionistas}
          onAbrirCodigo={onAbrirCodigo}
          onAbrirExcluirConta={onAbrirExcluirConta}
        />
      )
  }
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  raiz: { flex: 1, backgroundColor: t.cores.fundo },
  /* Toda tela sobreposta pinta o próprio fundo.
   *
   * absoluteFill sozinho é transparente: bastava a tela de cima não cobrir cada
   * pixel — por um respiro de notch, pelo teclado empurrando o conteúdo, por um
   * recorte de rolagem — para a de baixo aparecer atrás dela. Duas telas
   * misturadas na mesma imagem, que é o que se via.
   *
   * O fundo aqui, e não em cada tela, porque o buraco é da moldura: quem esquecer
   * de pintar a sua continua coberto. */
  sobreposta: { ...StyleSheet.absoluteFillObject, backgroundColor: t.cores.fundo },
  /* Login e cadastro ficam um degrau acima do fundo da área logada, para o
     cartão de formulário não sumir dentro da tela. */
  telaAuth: { flex: 1, backgroundColor: t.cores.mist },
  faixaStatus: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: t.cores.fundo,
  },
  telaApp: { flex: 1, backgroundColor: t.cores.fundo },
  carrossel: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.cores.fundo },
  }),
)
