import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { AnelCalorias } from '../components/AnelCalorias'
import { AnelProgresso } from '../components/AnelProgresso'
import { FaixaDeDias } from '../components/FaixaDeDias'
import { MenuTopo } from '../components/MenuTopo'
import { MiniGrafico } from '../components/MiniGrafico'
import { TotaisPlano } from '../components/TotaisPlano'
import { supabase } from '../lib/supabase'
import { dataISO, dataNumerica, milhar } from '../lib/formatar'
import {
  carregarAgua,
  coposDaMeta,
  coposDe,
  registrarAgua,
  totalDe,
  type Agua,
} from '../lib/agua'
import {
  caloriasDoItem,
  carregarPlanoAtivo,
  itensDoPlano,
  medidaDoItem,
  proximaRefeicaoDe,
  quandoDaProxima,
  resumoDosDias,
  totaisDe,
  valeHoje,
  type PlanoCompleto,
  type RefeicaoSalva,
} from '../lib/plano'
import { carregarPlanoDaNutri } from '../lib/planoDaNutri'
import { carregarAvisos, quantosNovos } from '../lib/avisos'
import {
  METAS_VAZIAS,
  carregarMetas,
  seguindoOFoco,
  type Metas,
  type ObjetivoPeso,
} from '../lib/metas'
import {
  carregarPeso,
  evolucaoDe,
  kg,
  serieDe,
  variacaoEmKg,
  type RegistroPeso,
} from '../lib/peso'
import {
  carregarConsumo,
  totaisConsumidos,
  type ItemConsumo,
  type TotaisConsumo,
} from '../lib/consumo'
import {
  carregarNoites,
  duracao,
  eficiencia,
  noitesNaMeta,
  serieDeSono,
  tempoDormindo,
  type Noite,
} from '../lib/sono'
import { calcularMetaDoDia, fraseDoDia, type MetaDoDia, type Pilar } from '../lib/metaDoDia'
import { cores, coresMacro, degrades, inkFraco, inkMedio, inkSuave } from '../theme'

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

const ehHoje = (d: Date) => dataISO(d) === dataISO(new Date())

/* Margem lateral da tela e respiro interno dos cartões. Ficam nomeados porque
   a largura do gráfico é calculada a partir deles. */
const MARGEM = 20
const PADDING_CARTAO = 16

export function HomeScreen({
  sessao,
  versaoPlano,
  versaoAgua,
  versaoMetas,
  versaoPeso,
  versaoConsumo,
  versaoSono,
  onAbrirPerfil,
  onAbrirCodigo,
  onAbrirCadastros,
  onAbrirAvisos,
  onMontarPlano,
  onAbrirRefeicao,
  onEditarPlano,
  onAbrirAgua,
  onAbrirCompras,
  onAbrirMetas,
  onAbrirPeso,
  onAbrirContador,
  onAbrirSono,
}: {
  sessao: Session
  /* Muda toda vez que um plano é salvo. Serve só para disparar a busca de novo:
     esta tela fica montada dentro do carrossel e nunca remonta sozinha. */
  versaoPlano: number
  /* O mesmo, para a água: muda quando a tela de Água é fechada depois de mexer
     em alguma coisa. Os copos registrados no próprio cartão daqui não passam por
     ele — quem já sabe do copo é este componente. */
  versaoAgua: number
  /* Muda quando as metas são salvas. Separado dos outros dois porque as metas
     alimentam o cartão de calorias E o de água, e um contador por assunto
     evita que salvar uma meta releia o plano inteiro. */
  versaoMetas: number
  versaoPeso: number
  versaoConsumo: number
  versaoSono: number
  onAbrirPerfil: () => void
  onAbrirCodigo: () => void
  onAbrirCadastros: () => void
  /* O destino do sino do topo. */
  onAbrirAvisos: () => void
  onMontarPlano: () => void
  /* Sobem até o App porque estas telas precisam cobrir a barra de abas —
     abertas daqui de dentro, seriam recortadas pelo carrossel. */
  onAbrirRefeicao: (refeicao: RefeicaoSalva, quando: string) => void
  onEditarPlano: (plano: PlanoCompleto) => void
  onAbrirAgua: () => void
  /* A lista de compras nasce de um plano, entao quem abre entrega o plano. */
  onAbrirCompras: (plano: PlanoCompleto) => void
  onAbrirMetas: () => void
  onAbrirPeso: () => void
  onAbrirContador: () => void
  onAbrirSono: () => void
}) {
  const { top } = useSafeAreaInsets()
  const { width: larguraTela } = useWindowDimensions()
  const [nome, setNome] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [menuAberto, setMenuAberto] = useState(false)
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  /* O plano ativo da nutricionista, quando existe vínculo. Estado separado do
     plano próprio: os dois continuam existindo, e é a tela que decide qual
     mostrar — apagar um por causa do outro impediria voltar atrás quando o
     vínculo acabar. */
  const [planoDaNutri, setPlanoDaNutri] = useState<PlanoCompleto | null>(null)
  const [carregandoPlano, setCarregandoPlano] = useState(true)
  /* Só para saber se o sino acende. A lista mora na tela de avisos; aqui a
     pergunta é de sim ou não. */
  const [temAviso, setTemAviso] = useState(false)
  const [agua, setAgua] = useState<Agua | null>(null)
  const [metas, setMetas] = useState<Metas>(METAS_VAZIAS)
  const [objetivo, setObjetivo] = useState<ObjetivoPeso>(null)
  const [pesos, setPesos] = useState<RegistroPeso[]>([])
  const [consumo, setConsumo] = useState<ItemConsumo[]>([])
  /* O dia que a faixa está mostrando. Nasce em hoje e só o bloco de calorias
     obedece a ele: água, peso e sono seguem sendo o dia corrente, porque são
     cartões de acompanhamento contínuo e não do prato de uma data. */
  const [diaSelecionado, setDiaSelecionado] = useState(() => new Date())
  const [noites, setNoites] = useState<Noite[]>([])
  const [detalheDoDia, setDetalheDoDia] = useState(false)

  useEffect(() => {
    let ativo = true

    supabase
      .from('app_contas')
      /* O foco do peso mora aqui desde 20260801000005, então ele vem de carona
         com o nome — sem uma segunda consulta só para um campo. */
      .select('nome_completo, objetivo_peso')
      /* maybeSingle e não single: quem foi criado direto no painel do Supabase
         tem usuário no Auth mas nenhuma linha aqui, e isso não é erro — é o
         caminho de teste. */
      .eq('id', sessao.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return
        setNome(data?.nome_completo ?? sessao.user.email?.split('@')[0] ?? '')
        setObjetivo((data?.objetivo_peso as ObjetivoPeso) ?? null)
        setCarregando(false)
      })

    return () => {
      ativo = false
    }
    /* versaoMetas entra aqui porque o foco muda no Perfil, e o Perfil avisa por
       esse mesmo contador. */
  }, [sessao.user.id, versaoMetas])

  /* Efeito separado do nome de propósito: o plano também é buscado de novo a
     cada gravação, e juntar os dois faria o nome ser relido à toa toda vez. */
  useEffect(() => {
    let ativo = true
    /* O indicador NÃO volta a ligar nas releituras — só a primeira carga o
       mostra, e ele já nasce ligado.
       Antes isto era `setCarregandoPlano(true)` a cada rodada, o que era
       inofensivo enquanto o plano só era relido depois de uma gravação. Agora
       ele é relido também toda vez que o app volta do segundo plano, e piscar o
       cartão inteiro para trocá-lo pelo mesmo conteúdo seria pagar um susto por
       uma leitura que quase sempre não muda nada. O conteúdo velho fica na tela
       até o novo chegar — que é o que o resto deste arquivo já faz com a água,
       o peso e o sono. */

    /* Os dois planos de uma vez: o que o paciente montou e o que a
       nutricionista dele deixou ativo. Qual dos dois vai para a tela é decidido
       depois, com as duas respostas na mão — em sequência, a tela mostraria o
       plano do paciente por um instante antes de trocá-lo pelo dela. */
    Promise.all([
      carregarPlanoAtivo(sessao.user.id),
      /* Falha silenciosa e vira "não há": sem vínculo esta chamada não devolve
         nada de qualquer forma, e uma queda dela não pode derrubar o plano
         próprio, que é o que sobra. */
      carregarPlanoDaNutri().catch(() => null),
    ]).then(([r, daNutri]) => {
      if (!ativo) return

      /* Falhou: fica com o que já estava na tela. Trocar um plano carregado
         pelo convite de cadastrar por causa de uma queda de rede seria dizer ao
         paciente que ele não tem plano nenhum. */
      if (r.tipo === 'ok') setPlano(r.plano)
      setPlanoDaNutri(daNutri)
      setCarregandoPlano(false)
    })

    return () => {
      ativo = false
    }
  }, [sessao.user.id, versaoPlano])

  /* O sino do topo.
   *
   * Ele pendurava um ponto vermelho fixo — aceso para todo mundo, o tempo todo,
   * sem olhar coisa nenhuma. Um aviso que está sempre ligado não avisa nada: a
   * pessoa aprende a ignorá-lo na primeira semana, e no dia em que houver algo
   * de verdade ele já não será notícia.
   *
   * A única coisa que o app sabe hoje, sem depender de nada do sistema, é a
   * agenda dela. Então é isso que o sino diz — e quando não há o que dizer, ele
   * fica apagado.
   *
   * Pega carona no `versaoPlano` porque é ele que sobe quando o app volta do
   * segundo plano: aceitar um pedido é ação DELA, e chega aqui do mesmo jeito
   * que o plano dela chega.
   *
   * Falha vira "não há aviso", em silêncio. Um ponto vermelho por causa de uma
   * queda de rede mandaria a pessoa procurar uma consulta que não existe. */
  useEffect(() => {
    let ativo = true

    carregarAvisos()
      /* Só o que ainda NÃO foi visto acende o ponto.
       *
       * Pela lista inteira, o pedido em aberto manteria o sino aceso até ela
       * responder — e um ponto que nunca apaga é o defeito que este sino tinha
       * antes, com outra roupa. Quem olhou, apagou; o pedido continua na lista
       * de quem abrir. */
      .then(({ lista }) => ativo && setTemAviso(quantosNovos(lista) > 0))
      .catch(() => ativo && setTemAviso(false))

    return () => {
      ativo = false
    }
  }, [sessao.user.id, versaoPlano])

  /* A água tem versão própria: um copo registrado não é motivo para reler o
     plano inteiro, que são quatro tabelas aninhadas. */
  useEffect(() => {
    let ativo = true

    carregarAgua(sessao.user.id).then(r => {
      /* Falha fica com o que já estava: o cartão não some nem zera por causa de
         uma queda de rede — zerar seria dizer que a pessoa não bebeu nada. */
      if (ativo && r.tipo === 'ok') setAgua(r.agua)
    })

    return () => {
      ativo = false
    }
  }, [sessao.user.id, versaoAgua])

  useEffect(() => {
    let ativo = true

    carregarMetas(sessao.user.id).then(r => {
      /* Falha fica com o que já estava, como no plano e na água: trocar metas
         carregadas pelo convite de definir por causa de uma queda de rede seria
         dizer à pessoa que ela não tem meta nenhuma. */
      if (ativo && r.tipo === 'ok') setMetas(r.metas)
    })

    return () => {
      ativo = false
    }
  }, [sessao.user.id, versaoMetas])

  useEffect(() => {
    let ativo = true

    carregarPeso(sessao.user.id).then(r => {
      if (ativo && r.tipo === 'ok') setPesos(r.peso.registros)
    })

    return () => {
      ativo = false
    }
  }, [sessao.user.id, versaoPeso])

  useEffect(() => {
    let ativo = true

    carregarConsumo(sessao.user.id, diaSelecionado).then(r => {
      if (ativo && r.tipo === 'ok') setConsumo(r.itens)
    })

    return () => {
      ativo = false
    }
  }, [sessao.user.id, versaoConsumo, diaSelecionado])

  /* Sete noites, não trinta: é o que o cartão desenha, e trazer o mês inteiro
     para mostrar uma semana seria carregar quatro vezes mais a cada abertura. */
  useEffect(() => {
    let ativo = true

    carregarNoites(sessao.user.id, 7).then(r => {
      if (ativo && r.tipo === 'ok') setNoites(r.noites)
    })

    return () => {
      ativo = false
    }
  }, [sessao.user.id, versaoSono])

  /* Um copo, do próprio cartão. Otimista pelo mesmo motivo da tela de Água: o
     gesto é tocar e guardar o telefone, e um número que só sobe depois da ida e
     volta faz a pessoa tocar de novo — e aí são dois copos. */
  async function registrarCopo() {
    if (!agua) return

    const ml = agua.copoMl
    const provisorio = { id: `provisorio-${Date.now()}`, ml, bebidoEm: new Date().toISOString() }
    setAgua(a => (a ? { ...a, hoje: [provisorio, ...a.hoje] } : a))

    const r = await registrarAgua(sessao.user.id, ml)

    /* Deu errado: o copo sai de volta, sem alarde. Quem quiser saber por quê
       abre a tela de Água, que mostra a mensagem crua — um cartão de 150 pontos
       na tela inicial não é lugar para erro de banco. */
    if (r.tipo === 'erro') {
      setAgua(a => (a ? { ...a, hoje: a.hoje.filter(x => x.id !== provisorio.id) } : a))
      return
    }

    setAgua(a =>
      a ? { ...a, hoje: a.hoje.map(x => (x.id === provisorio.id ? r.registro : x)) } : a,
    )
  }

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={cores.verde} />
      </View>
    )
  }

  /* O plano da tela, e há um só.
   *
   * Havendo nutricionista vinculada com plano ativo, é o dela — em tudo: no
   * bloco do plano, no cartão de calorias, na próxima refeição e no pilar de
   * refeições da meta do dia. Dois cardápios concorrentes na mesma tela
   * deixariam a pergunta "qual eu sigo hoje?" sem resposta, e a resposta certa
   * é sempre o da profissional que acompanha a pessoa.
   *
   * O plano próprio não é apagado nem esquecido: continua em `plano`, continua
   * na tela de Planos, e volta sozinho para cá se o vínculo acabar ou se ela
   * desativar o plano dela. */
  const planoNaTela = planoDaNutri ?? plano

  /* O anel da saudação: a média dos pilares que o app realmente mede hoje.
     Ver lib/metaDoDia.ts — as regras de o que entra e o que fica de fora estão
     todas lá, e não espalhadas por esta tela. */
  const doDia = calcularMetaDoDia({ metas, agua, consumo, noites, plano: planoNaTela })

  /* O que sobra para o gráfico depois das duas colunas de texto do cartão de
     progresso. Calculado, e não fixo, para não estourar num aparelho estreito. */
  const larguraGrafico = Math.max(
    80,
    larguraTela - MARGEM * 2 - PADDING_CARTAO * 2 - 96 - 84 - 16,
  )

  return (
    <>
    <ScrollView
      style={styles.tela}
      contentContainerStyle={[styles.conteudo, { paddingTop: top + 8 }]}
      showsVerticalScrollIndicator={false}
      /* A rolagem continua — o conteúdo é mais alto que a tela —, mas sem o
         efeito elástico do iOS nas pontas. */
      bounces={false}
      overScrollMode="never"
    >
      <View style={styles.barraTopo}>
        <Pressable
          onPress={() => setMenuAberto(true)}
          style={styles.botaoTopo}
          accessibilityRole="button"
          accessibilityLabel="Menu"
        >
          <Ionicons name="menu" size={21} color={cores.ink} />
        </Pressable>
        {/* O ponto só acende quando há o que dizer, e o toque leva a quem tem a
            resposta. Antes ele não fazia nem uma coisa nem outra: acendia
            sempre e não respondia ao toque. */}
        <Pressable
          onPress={onAbrirAvisos}
          style={styles.botaoTopo}
          accessibilityRole="button"
          accessibilityLabel={
            temAviso ? 'Avisos. Você tem avisos novos.' : 'Avisos'
          }
        >
          <Ionicons name="notifications-outline" size={20} color={cores.ink} />
          {temAviso && <View style={styles.pontoAviso} />}
        </Pressable>
      </View>

      <View style={styles.saudacao}>
        <View style={styles.textoSaudacao}>
          <Text style={styles.ola} numberOfLines={1}>
            Olá, {primeiroNome(nome)} 👋
          </Text>
          <Text style={styles.frase}>
            Vamos juntos em direção a sua <Text style={styles.fraseDestaque}>melhor versão.</Text>
          </Text>
        </View>

        {/* O anel abre a decomposição. Um percentual que não se decompõe é um
            percentual em que não se confia — e este resume quatro assuntos num
            número só, o que é justamente o tipo de número que precisa poder ser
            aberto. */}
        <Pressable
          onPress={() => setDetalheDoDia(true)}
          style={styles.blocoAnel}
          accessibilityRole="button"
          accessibilityLabel={`Meta do dia, ${Math.round(doDia.percentual)} por cento. Ver de onde vem.`}
        >
          <AnelProgresso percentual={doDia.percentual} />
          <Text style={styles.rotuloAnel}>Meta do dia</Text>
        </Pressable>
      </View>

      {/* ── Dias da semana ── */}
      <FaixaDeDias selecionado={diaSelecionado} onSelecionar={setDiaSelecionado} />

      {/* ── Calorias ── */}
      <CartaoCalorias
        consumo={consumo}
        plano={planoNaTela}
        metas={metas}
        dia={diaSelecionado}
        onAbrirMetas={onAbrirMetas}
        onAbrirContador={onAbrirContador}
      />

      {/* ── Plano alimentar ── */}
      <BlocoPlano
        plano={planoNaTela}
        carregando={carregandoPlano}
        onMontarPlano={onMontarPlano}
        onEditarPlano={onEditarPlano}
        onAbrirCompras={onAbrirCompras}
      />

      {/* ── Água + próxima refeição ── */}
      <View style={styles.linhaDupla}>
        <CartaoAgua agua={agua} onAbrir={onAbrirAgua} onRegistrar={registrarCopo} />
        <CartaoProximaRefeicao plano={planoNaTela} onAbrir={onAbrirRefeicao} />
      </View>

      {/* ── Progresso ── */}
      <CartaoProgresso
        pesos={pesos}
        objetivo={objetivo}
        largura={larguraGrafico}
        onAbrir={onAbrirPeso}
      />

      {/* ── Sono ── */}
      <CartaoSono
        noites={noites}
        metaHoras={metas.sonoHoras}
        largura={larguraGrafico}
        onAbrir={onAbrirSono}
      />
    </ScrollView>

    {detalheDoDia && <FolhaDoDia doDia={doDia} onFechar={() => setDetalheDoDia(false)} />}

    <MenuTopo
      visivel={menuAberto}
      /* Logo abaixo do botão de menu: inset do aparelho + altura do botão. */
      topo={top + 58}
      onFechar={() => setMenuAberto(false)}
      itens={[
        {
          chave: 'perfil',
          rotulo: 'Meu perfil',
          icone: 'person-circle-outline',
          onPress: onAbrirPerfil,
        },
        {
          chave: 'codigo',
          rotulo: 'Meu código',
          icone: 'link-outline',
          onPress: onAbrirCodigo,
        },
        {
          chave: 'cadastros',
          rotulo: 'Meus cadastros',
          icone: 'albums-outline',
          onPress: onAbrirCadastros,
        },
      ]}
    />
    </>
  )
}

/* O plano alimentar do paciente, inteiro: todas as refeições, todos os
 * alimentos, sem "ver mais".
 *
 * Nada de recortar em três linhas e mandar abrir outra tela — o plano É o que a
 * pessoa vem conferir aqui, e a Home já rola. O que fica de fora é só o que ela
 * não montou. */
function BlocoPlano({
  plano,
  carregando,
  onMontarPlano,
  onEditarPlano,
  onAbrirCompras,
}: {
  plano: PlanoCompleto | null
  carregando: boolean
  onMontarPlano: () => void
  onEditarPlano: (plano: PlanoCompleto) => void
  onAbrirCompras: (plano: PlanoCompleto) => void
}) {
  if (carregando) {
    return (
      <View style={[styles.cartao, styles.cartaoPlanoCarregando]}>
        <ActivityIndicator color={cores.verde} />
      </View>
    )
  }

  if (!plano) {
    return (
      <View style={styles.cartao}>
        <View style={styles.linhaTituloPlano}>
          <Ionicons name="nutrition-outline" size={16} color={cores.verde} />
          <Text style={styles.tituloCartao}>Plano alimentar</Text>
        </View>

        <Text style={styles.chamadaVazio}>Cadastre um plano!</Text>
        <Text style={styles.planoVazio}>
          Monte as refeições do seu dia e acompanhe aqui as calorias, as proteínas, os
          carboidratos e as gorduras.
        </Text>

        {/* O botão leva direto para a primeira etapa do planejamento: sem ele o
            caminho seria o + da barra e achar a opção certa numa grade de oito. */}
        <Pressable
          onPress={onMontarPlano}
          style={({ pressed }) => [styles.botaoPlano, pressed && styles.botaoPlanoPressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={cores.branco} />
          <Text style={styles.textoBotaoPlano}>Cadastrar plano alimentar</Text>
        </Pressable>
      </View>
    )
  }

  const totais = totaisDe(itensDoPlano(plano.refeicoes))
  const daNutri = plano.daNutricionista === true

  const miolo = (
    <>
      <View style={styles.linhaTituloPlano}>
        <Ionicons name="nutrition-outline" size={16} color={cores.verde} />
        <Text style={[styles.tituloCartao, styles.tituloPlano]}>
          {daNutri ? 'Plano da sua nutricionista' : 'Plano alimentar'}
        </Text>
        {!daNutri && <Ionicons name="create-outline" size={17} color={inkFraco} />}
      </View>

      <Text style={styles.nomePlano} numberOfLines={2}>
        {plano.nome}
      </Text>

      {daNutri ? (
        /* O plano dela já vem recortado no cardápio de HOJE (ver
           lib/planoDaNutri.ts), então não há "em que dias se repete" para
           mostrar: o que está na tela é o de hoje, e ponto. */
        <Text style={styles.dataPlano}>O cardápio de hoje, montado por ela</Text>
      ) : (
        <>
          {/* Em que dias este cardápio se repete, e se hoje é um deles. Sem a
              segunda parte, quem abre o app num dia de folga lê o plano como se
              fosse o de hoje. */}
          <View style={styles.linhaRepeticao}>
            <Ionicons name="repeat-outline" size={14} color={cores.verde} />
            <Text style={styles.textoRepeticao}>{resumoDosDias(plano.diasSemana)}</Text>
            <View style={[styles.seloDia, !valeHoje(plano.diasSemana) && styles.seloFolga]}>
              <Text style={[styles.textoSeloDia, !valeHoje(plano.diasSemana) && styles.textoSeloFolga]}>
                {valeHoje(plano.diasSemana) ? 'Vale hoje' : 'Hoje não'}
              </Text>
            </View>
          </View>

          <Text style={styles.dataPlano}>
            Criado em {dataNumerica(new Date(plano.criadoEm))}
          </Text>
        </>
      )}

      {!!plano.observacao && <Text style={styles.observacaoPlano}>{plano.observacao}</Text>}

      {/* Um plano de rotina pode não cobrir hoje — de segunda a sábado, num
          domingo. Diz isso com palavras em vez de mostrar um cartão vazio: o
          plano existe, e é só hoje que não tem refeição nele. */}
      {daNutri && plano.refeicoes.length === 0 ? (
        <Text style={styles.planoVazio}>
          O plano dela não tem refeições para hoje. Amanhã ele volta a aparecer aqui.
        </Text>
      ) : (
        <>
          <View style={styles.totaisPlano}>
            <TotaisPlano totais={totais} rotulo="Total do plano" />
          </View>

          {plano.refeicoes.map(r => (
            <RefeicaoDoPlano key={r.id} refeicao={r} />
          ))}

          {/* A lista de compras sai do próprio plano, então o lugar dela é aqui
              embaixo dele, e não numa aba distante: quem acabou de olhar o que
              vai comer é quem está a um passo de ir ao mercado.
           *
           * O toque é isolado do cartão: no plano do próprio paciente o cartão
           * inteiro abre a edição, e sem isto ir às compras viraria editar o
           * plano sem querer. */}
          <Pressable
            onPress={e => {
              e.stopPropagation()
              onAbrirCompras(plano)
            }}
            style={({ pressed }) => [styles.botaoCompras, pressed && styles.botaoComprasPressionado]}
            accessibilityRole="button"
            accessibilityLabel="Ver a lista de compras deste plano"
          >
            <Ionicons name="cart-outline" size={16} color={cores.verde} />
            <Text style={styles.textoBotaoCompras}>Lista de compras</Text>
          </Pressable>
        </>
      )}
    </>
  )

  /* Plano da nutricionista não é editável no app, então o cartão dela não é um
     botão: sem toque, sem afundar, sem o lápis no canto. Um cartão que responde
     ao toque e não abre nada é pior do que um cartão parado. */
  if (daNutri) {
    return <View style={styles.cartao}>{miolo}</View>
  }

  return (
    /* O cartão inteiro é o botão de editar. Um lápis no canto seria um alvo de
       24 pontos numa tela que a pessoa lê inteira — aqui o alvo é o cartão. */
    <Pressable
      onPress={() => onEditarPlano(plano)}
      style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
      accessibilityRole="button"
      accessibilityLabel={`Editar o plano ${plano.nome}`}
    >
      {miolo}
    </Pressable>
  )
}


/* Calorias e macros: o que foi COMIDO hoje contra a meta.
 *
 * Este cartão passou a vida inteira do app dizendo outra coisa. Antes do
 * contador de calorias não havia registro de refeição nenhum, então ele
 * comparava o total do PLANO com a meta — o melhor possível com dado real dos
 * dois lados, mas não a pergunta que ele parecia responder. Agora é consumo
 * contra meta, que é o que ele sempre quis dizer.
 *
 * O plano continua no cartão, numa linha discreta: é a referência do dia — o que
 * a pessoa combinou consigo mesma — e comparar o combinado com o comido é
 * exatamente o que uma nutricionista quer ver. */
function CartaoCalorias({
  consumo,
  plano,
  metas,
  dia,
  onAbrirMetas,
  onAbrirContador,
}: {
  consumo: ItemConsumo[]
  plano: PlanoCompleto | null
  metas: Metas
  /* O dia escolhido na faixa. Só rotula: quem já trouxe os itens certos foi o
     efeito que carregou o consumo. */
  dia: Date
  onAbrirMetas: () => void
  onAbrirContador: () => void
}) {
  const comido: TotaisConsumo = totaisConsumidos(consumo)
  const meta = metas.calorias
  const doPlano = plano ? totaisDe(itensDoPlano(plano.refeicoes)).calorias : null
  const rotuloDoDia = ehHoje(dia) ? 'Hoje' : dataNumerica(dia)

  const cabecalho = (
    <View style={styles.linhaTituloPlano}>
      <Ionicons name="flame-outline" size={16} color={cores.verde} />
      <Text style={[styles.tituloCartao, styles.tituloPlano]}>Calorias</Text>
      <Ionicons name="chevron-forward" size={17} color={inkFraco} />
    </View>
  )

  /* Sem meta, o número do dia não tem contra o que ser lido: 1.500 kcal não é
     bom nem ruim. O convite vem antes de qualquer outra coisa. */
  if (meta === null) {
    return (
      <Pressable
        onPress={onAbrirMetas}
        style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
        accessibilityRole="button"
        accessibilityLabel="Definir suas metas"
      >
        {cabecalho}
        <Text style={styles.chamadaVazio}>Defina sua meta!</Text>
        <Text style={styles.planoVazio}>
          {comido.calorias === null
            ? 'Diga quantas calorias e quanto de cada macro você quer por dia, e o app passa a acompanhar o seu dia contra isso.'
            : `Você já registrou ${milhar(comido.calorias)} kcal hoje. Diga qual é a sua meta e o app passa a comparar as duas.`}
        </Text>

        <View style={styles.botaoPlano}>
          <Ionicons name="flag-outline" size={17} color={cores.branco} />
          <Text style={styles.textoBotaoPlano}>Definir metas</Text>
        </View>
      </Pressable>
    )
  }

  const kcal = comido.calorias ?? 0
  const restantes = meta - kcal

  return (
    /* O cartão inteiro abre o contador: quem olha as calorias do dia está quase
       sempre a caminho de registrar mais uma coisa. */
    <Pressable
      onPress={onAbrirContador}
      style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
      accessibilityRole="button"
      accessibilityLabel={`${milhar(kcal)} de ${milhar(meta)} calorias em ${rotuloDoDia}. Abrir o contador.`}
    >
      {cabecalho}

      {/* Anel à esquerda, macros em coluna à direita. O número grande fica no
          meio do anel, e não numa coluna própria: é ele que o anel está
          medindo, e separá-los faria a pessoa ler duas vezes. */}
      <View style={styles.linhaCalorias}>
        <AnelCalorias
          fatias={{
            proteinas: comido.proteinas,
            carboidratos: comido.carboidratos,
            gorduras: comido.gorduras,
          }}
          meta={meta}
        >
          <Text style={styles.rotuloAnelDia}>{rotuloDoDia}</Text>
          <View style={styles.linhaValorAnel}>
            <Ionicons name="flame" size={17} color={cores.limao} />
            <Text style={styles.valorAnel}>{milhar(kcal)}</Text>
          </View>
          <Text style={styles.metaAnel}>{milhar(meta)} kcal</Text>
          <Text style={styles.restantesAnel}>
            {restantes >= 0 ? `faltam ${milhar(restantes)}` : `${milhar(-restantes)} acima`}
          </Text>
        </AnelCalorias>

        <View style={styles.colunaMacros}>
          <LinhaMacro
            rotulo="Carboidratos"
            comido={comido.carboidratos}
            meta={metas.carboidratos}
            cor={coresMacro.carboidratos}
          />
          <LinhaMacro
            rotulo="Proteínas"
            comido={comido.proteinas}
            meta={metas.proteinas}
            cor={coresMacro.proteinas}
          />
          <LinhaMacro
            rotulo="Gorduras"
            comido={comido.gorduras}
            meta={metas.gorduras}
            cor={coresMacro.gorduras}
          />
        </View>
      </View>

      {/* A mesma ação do cartão inteiro, dita com todas as letras. O cartão ser
          tocável não se anuncia sozinho, e a câmera é o caminho que a maioria
          usa para lançar. */}
      <View style={styles.barraConferir}>
        <Text style={styles.textoConferir}>Conferir calorias</Text>
        <View style={styles.botaoCamera}>
          <Ionicons name="camera-outline" size={17} color={cores.sobreLimao} />
        </View>
      </View>

      {/* A referência do dia. Uma linha só: o plano tem cartão próprio logo
          abaixo, e o que interessa aqui é o número, para comparar de relance. */}
      {doPlano !== null && (
        <View style={styles.linhaPlanoRef}>
          <Ionicons name="nutrition-outline" size={13} color={inkFraco} />
          <Text style={styles.textoPlanoRef}>
            Seu plano prevê {milhar(doPlano)} kcal por dia
          </Text>
        </View>
      )}

      {/* Os dois avisos que impedem o total de mentir por omissão — os mesmos da
          tela do contador, porque o número aqui é o mesmo. */}
      {comido.deFoto > 0 && (
        <Text style={styles.avisoSemPeso}>
          {comido.deFoto === 1
            ? '1 item foi estimado por foto — o total é aproximado.'
            : `${comido.deFoto} itens foram estimados por foto — o total é aproximado.`}
        </Text>
      )}
      {comido.semCalorias > 0 && (
        <Text style={styles.avisoSemPeso}>
          {comido.semCalorias} {comido.semCalorias === 1 ? 'item entrou' : 'itens entraram'} sem
          caloria e {comido.semCalorias === 1 ? 'ficou' : 'ficaram'} de fora da soma.
        </Text>
      )}
    </Pressable>
  )
}

/* A água do dia, em copos. O cartão inteiro abre a tela de Água; o botão de
 * baixo registra um copo sem sair daqui.
 *
 * Os dois gestos convivem porque servem a momentos diferentes: beber água é
 * dezenas de toques por semana e não pode custar uma tela; olhar o histórico e
 * mexer na meta é raro e merece a tela inteira. Por isso o botão é um alvo
 * grande dentro do cartão, e não um "+" de canto encostado na borda dele. */
function CartaoAgua({
  agua,
  onAbrir,
  onRegistrar,
}: {
  agua: Agua | null
  onAbrir: () => void
  onRegistrar: () => void
}) {
  if (!agua) {
    return (
      <View style={[styles.cartaoAgua, styles.cartaoAguaCarregando]}>
        <ActivityIndicator color={cores.branco} />
      </View>
    )
  }

  const bebido = totalDe(agua.hoje)
  const copos = coposDe(bebido, agua.copoMl)
  const coposMeta = coposDaMeta(agua.metaMl, agua.copoMl)
  const fracao = agua.metaMl > 0 ? Math.min(bebido / agua.metaMl, 1) : 0

  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [styles.cartaoAgua, pressed && styles.cartaoAguaPressionado]}
      accessibilityRole="button"
      accessibilityLabel={`Água: ${copos} de ${coposMeta} copos. Abrir.`}
    >
      {/* O degradê fica atrás do conteúdo como camada absoluta, e não como
          contêiner em volta: assim o Pressable continua sendo quem mede o
          cartão, e o estado pressionado não precisa recalcular o degradê. */}
      <LinearGradient
        colors={degrades.destaque}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.linhaTituloAgua}>
        <Ionicons name="water-outline" size={15} color={cores.branco} />
        <Text style={styles.tituloAgua}>Água</Text>
      </View>

      <View style={styles.linhaValorAgua}>
        <Text style={styles.valorAgua}>{copos}</Text>
        <Text style={styles.metaAgua}>/ {coposMeta} copos</Text>
      </View>

      {/* Metade da largura da tela dividida por mais de oito copos dá tiras que
          não se contam de relance. Passando disso, a barra diz mais. */}
      {coposMeta <= 8 ? (
        <View style={styles.copos}>
          {Array.from({ length: coposMeta }, (_, i) => (
            <View key={i} style={[styles.copo, i >= copos && styles.copoVazio]} />
          ))}
        </View>
      ) : (
        <View style={styles.trilhoAgua}>
          <View style={[styles.preenchimentoAgua, { width: `${fracao * 100}%` }]} />
        </View>
      )}

      <Pressable
        onPress={onRegistrar}
        style={({ pressed }) => [styles.botaoRegistrar, pressed && styles.botaoRegistrarPress]}
        accessibilityRole="button"
        accessibilityLabel={`Registrar um copo de ${agua.copoMl} mililitros`}
      >
        <Ionicons name="add" size={15} color={cores.branco} />
        <Text style={styles.textoRegistrar}>Registrar</Text>
      </Pressable>
    </Pressable>
  )
}

/* Peso de hoje contra o PRIMEIRO registro, nunca contra o de ontem.
 *
 * Comparar com ontem mediria o sal do jantar. A pergunta que o cartão responde é
 * a outra: desde que comecei, subiu ou desceu?
 *
 * O selo não tem cor de bom nem de ruim. Ganhar peso é o objetivo de parte de
 * quem usa isto — pintar perda de verde e ganho de vermelho transformaria a meta
 * dessas pessoas em alarme toda vez que elas abrissem o app. */
function CartaoProgresso({
  pesos,
  objetivo,
  largura,
  onAbrir,
}: {
  pesos: RegistroPeso[]
  objetivo: ObjetivoPeso
  largura: number
  onAbrir: () => void
}) {
  const evolucao = evolucaoDe(pesos)
  const seguindo =
    evolucao && evolucao.quantos > 1 ? seguindoOFoco(objetivo, evolucao.sentido) : null

  if (!evolucao) {
    return (
      <Pressable
        onPress={onAbrir}
        style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
        accessibilityRole="button"
        accessibilityLabel="Registrar seu peso"
      >
        <View style={styles.linhaTituloProgresso}>
          <Ionicons name="trending-up" size={16} color={cores.verde} />
          <Text style={styles.tituloCartao}>Seu progresso</Text>
        </View>

        <Text style={styles.chamadaVazio}>Registre seu peso!</Text>
        <Text style={styles.planoVazio}>
          O primeiro peso que você registrar vira o ponto de partida — e daqui em diante este cartão
          mostra o quanto você andou desde ele.
        </Text>

        <View style={styles.botaoPlano}>
          <Ionicons name="add" size={18} color={cores.branco} />
          <Text style={styles.textoBotaoPlano}>Registrar peso</Text>
        </View>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
      accessibilityRole="button"
      accessibilityLabel={`Peso atual ${kg(evolucao.atual)} quilos. Abrir.`}
    >
      {/* Nada de comparar direção com um registro só: a variação é zero por
          construção, e dizer "fora do seu foco" para quem acabou de se pesar
          pela primeira vez seria uma bronca por nada. */}
      <View style={styles.linhaTituloProgresso}>
        <Ionicons name="trending-up" size={16} color={cores.verde} />
        <Text style={[styles.tituloCartao, styles.tituloPlano]}>Seu progresso</Text>
        <Ionicons name="chevron-forward" size={17} color={inkFraco} />
      </View>

      <View style={styles.linhaProgresso}>
        <View style={styles.colunaPeso}>
          <Text style={styles.rotuloPeso}>Peso atual</Text>
          <View style={styles.linhaValorGrande}>
            <Text style={styles.valorPeso}>{kg(evolucao.atual)}</Text>
            <Text style={styles.unidadePeso}>kg</Text>
          </View>
        </View>

        {/* Com um registro só não há curva: a série de um ponto viraria uma
            linha reta que finge um histórico que não existe. */}
        <MiniGrafico serie={serieDe(pesos)} largura={largura} />

        <View style={styles.colunaVariacao}>
          {/* Sem foco declarado o selo fica no verde-claro neutro de sempre.
              Com foco, ele passa a dizer a direção: verde cheio quando o
              movimento é o pedido, cinza quando é o contrário. Cinza e não
              vermelho — o app não sabe o que aconteceu na vida de quem lê, e
              alarme numa tela que se abre toda manhã não ajuda ninguém. */}
          <View style={[styles.selo, seguindo === true && styles.seloNoFoco, seguindo === false && styles.seloForaDoFoco]}>
            <Text style={[styles.textoSelo, seguindo === true && styles.textoSeloNoFoco]}>
              {evolucao.quantos === 1
                ? 'Início'
                : evolucao.sentido === 'manteve'
                  ? '—'
                  : `${evolucao.sentido === 'ganho' ? '+' : '−'}${variacaoEmKg(evolucao.variacao)} kg`}
            </Text>
          </View>
          <Text style={styles.desdeInicio}>
            {evolucao.quantos === 1
              ? 'seu ponto de partida'
              : seguindo === true
                ? 'no seu foco'
                : seguindo === false
                  ? 'fora do seu foco'
                  : evolucao.sentido === 'manteve'
                    ? 'sem mudança'
                    : `${evolucao.sentido === 'ganho' ? 'ganhos' : 'perdidos'} desde o início`}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

/* De onde vem o número do anel.
 *
 * Existe porque o anel resume quatro assuntos num percentual só, e um número
 * assim tem de poder ser aberto. Sem isto, "63%" seria uma opinião do app sobre
 * o dia da pessoa — com isto, é uma conta que ela confere. */
function FolhaDoDia({ doDia, onFechar }: { doDia: MetaDoDia; onFechar: () => void }) {
  const { bottom } = useSafeAreaInsets()

  return (
    /* Cartão centralizado, e não folha subindo de baixo: esta tela vive dentro
       do carrossel, então uma folha ancorada no rodapé encostaria na barra de
       abas sem escurecê-la — as outras folhas do app moram no App justamente
       para cobrir a barra. Centralizado, a questão não existe. */
    <View style={[StyleSheet.absoluteFill, styles.centroFolha]}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { marginBottom: bottom }]}>
        <View style={styles.topoFolha}>
          <AnelProgresso percentual={doDia.percentual} />
          <View style={styles.textoTopoFolha}>
            <Text style={styles.tituloFolha}>Meta do dia</Text>
            <Text style={styles.fraseFolha}>{fraseDoDia(doDia)}</Text>
          </View>
        </View>

        {doDia.pilares.map(p => (
          <LinhaPilar key={p.chave} pilar={p} />
        ))}

        {/* As duas ressalvas que o número carrega e que ninguém adivinha. */}
        <Text style={styles.notaFolha}>
          {doDia.soAgua
            ? 'Só a água está entrando na conta. Defina metas de caloria, macros ou sono — ou ative um plano alimentar — e o anel passa a medir o dia inteiro.'
            : 'Cada assunto pesa o mesmo, e nenhum passa de 100% — beber quatro litros não compensa uma noite curta. Passos e treinos ficam de fora enquanto o app não registrar os dois.'}
        </Text>
      </View>
    </View>
  )
}

function LinhaPilar({ pilar }: { pilar: Pilar }) {
  const pct = Math.round(pilar.fracao * 100)

  return (
    <View style={styles.linhaPilar}>
      <View style={styles.iconePilar}>
        <Ionicons name={pilar.icone} size={17} color={cores.verde} />
      </View>

      <View style={styles.textoPilar}>
        <View style={styles.linhaNomePilar}>
          <Text style={styles.nomePilar}>{pilar.rotulo}</Text>
          <Text style={styles.pctPilar}>{pct}%</Text>
        </View>
        <View style={styles.trilhoPilar}>
          <View style={[styles.preenchimentoPilar, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.detalhePilar}>{pilar.detalhe}</Text>
      </View>
    </View>
  )
}

/* A última noite: quanto se dormiu, com que eficiência, e a semana em volta.
 *
 * Irmão do cartão de progresso — mesmo desenho de três colunas, porque os dois
 * respondem à mesma pergunta ("como venho indo?") e se olham uma vez por dia,
 * ao contrário de Calorias e Água, que são cartões de agir.
 *
 * O que ele NUNCA faz é mostrar a última noite sem dizer de quando ela é. Quem
 * registrou na terça e voltou no sábado veria "7h45" e leria como esta
 * madrugada — o cartão estaria mentindo sem escrever nenhuma mentira. */
function CartaoSono({
  noites,
  metaHoras,
  largura,
  onAbrir,
}: {
  noites: Noite[]
  metaHoras: number | null
  largura: number
  onAbrir: () => void
}) {
  const cabecalho = (
    <View style={styles.linhaTituloProgresso}>
      <Ionicons name="moon-outline" size={16} color={cores.verde} />
      <Text style={[styles.tituloCartao, styles.tituloPlano]}>Seu sono</Text>
      <Ionicons name="chevron-forward" size={17} color={inkFraco} />
    </View>
  )

  if (noites.length === 0) {
    return (
      <Pressable
        onPress={onAbrir}
        style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
        accessibilityRole="button"
        accessibilityLabel="Registrar como você dormiu"
      >
        {cabecalho}
        <Text style={styles.chamadaVazio}>Como você dormiu?</Text>
        <Text style={styles.planoVazio}>
          Registre a noite e o app passa a mostrar aqui quanto você dormiu de fato — e o que vem
          atrapalhando, do café da tarde ao jantar pesado.
        </Text>

        <View style={styles.botaoPlano}>
          <Ionicons name="add" size={18} color={cores.branco} />
          <Text style={styles.textoBotaoPlano}>Registrar o sono</Text>
        </View>
      </Pressable>
    )
  }

  /* A lista vem da mais recente para a mais antiga, mas escolher pela data em
     vez de confiar na ordem deixa este cartão independente de quem o chamou. */
  const ultima = noites.reduce((a, b) => (a.data >= b.data ? a : b))
  const dormiu = tempoDormindo(ultima)
  const efic = eficiencia(ultima)
  const naMeta = metaHoras !== null ? noitesNaMeta(noites, metaHoras) : null

  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
      accessibilityRole="button"
      accessibilityLabel={`Última noite: ${duracao(dormiu)} de sono. Abrir.`}
    >
      {cabecalho}

      <View style={styles.linhaProgresso}>
        <View style={styles.colunaPeso}>
          <Text style={styles.rotuloPeso}>Você dormiu</Text>
          <View style={styles.linhaValorGrande}>
            <Text style={styles.valorPeso}>{duracao(dormiu)}</Text>
          </View>
        </View>

        {/* Com uma noite só não há curva: uma série de um ponto viraria uma reta
            que finge um histórico que não existe. */}
        <MiniGrafico serie={serieDeSono(noites)} largura={largura} />

        <View style={styles.colunaVariacao}>
          <View style={[styles.selo, efic !== null && efic >= 85 && styles.seloNoFoco]}>
            <Text
              style={[styles.textoSelo, efic !== null && efic >= 85 && styles.textoSeloNoFoco]}
            >
              {efic === null ? '—' : `${Math.round(efic)}%`}
            </Text>
          </View>
          {/* Eficiência é o número que explica o cansaço de quem jura que dorme
              o suficiente: oito horas na cama dormindo cinco. */}
          <Text style={styles.desdeInicio}>de eficiência</Text>
        </View>
      </View>

      <Text style={styles.rodapeSono}>
        {quandoFoiANoite(ultima.data)}
        {naMeta !== null &&
          ` · ${naMeta} de ${noites.length} ${noites.length === 1 ? 'noite' : 'noites'} na meta de ${metaHoras}h`}
      </Text>
    </Pressable>
  )
}

/* "Esta madrugada", "Noite de ontem", "Última noite registrada: 28/07".
 *
 * O terceiro caso é o que importa: passados dois dias, o cartão para de falar
 * como se o número fosse de agora e passa a dizer a data. */
function quandoFoiANoite(iso: string): string {
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)

  if (iso === dataISO(hoje)) return 'Esta madrugada'
  if (iso === dataISO(ontem)) return 'Noite de ontem'

  const [, mes, dia] = iso.split('-')
  return `Última noite registrada: ${dia}/${mes}`
}

/* A hora de agora, viva.
 *
 * Sem isto, o cartão calcularia a próxima refeição uma vez e ficaria nela: um
 * app deixado aberto continuaria anunciando o almoço às três da tarde. Um tique
 * por minuto basta — a granularidade do plano é HH:MM, acordar mais vezes não
 * mudaria um pixel.
 *
 * O AppState entra junto porque o timer não é confiável com o app suspenso: no
 * segundo plano o sistema o segura, e voltar depois de horas cairia num relógio
 * parado até o próximo tique. */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000)
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') setAgora(new Date())
    })

    return () => {
      clearInterval(id)
      sub.remove()
    }
  }, [])

  return agora
}

/* A refeição que vem agora, pelo relógio. Toca e abre só ela.
 *
 * Sem plano montado o cartão continua no lugar, com o convite: some-lo deixaria
 * um buraco ao lado do cartão de água, que é da mesma linha. */
function CartaoProximaRefeicao({
  plano,
  onAbrir,
}: {
  plano: PlanoCompleto | null
  onAbrir: (refeicao: RefeicaoSalva, quando: string) => void
}) {
  const agora = useAgora()
  const proxima = plano ? proximaRefeicaoDe(plano, agora) : null

  if (!proxima) {
    return (
      <View style={[styles.cartao, styles.cartaoRefeicao]}>
        <Text style={styles.rotuloProxima}>Próxima refeição</Text>
        {/* Duas ausências diferentes: não ter plano e ter um plano com as
            refeições todas vazias. A saída de cada uma é outra. */}
        <Text style={styles.semProxima}>
          {plano
            ? 'Nenhuma refeição do seu plano tem alimentos ainda.'
            : 'Monte seu plano alimentar para ver o que vem agora.'}
        </Text>
      </View>
    )
  }

  const quando = quandoDaProxima(proxima)
  const t = totaisDe(proxima.refeicao.itens)

  return (
    <Pressable
      onPress={() => onAbrir(proxima.refeicao, quando)}
      style={({ pressed }) => [
        styles.cartao,
        styles.cartaoRefeicao,
        pressed && styles.cartaoRefeicaoPressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Próxima refeição: ${proxima.refeicao.rotulo}, ${quando} às ${proxima.refeicao.hora}`}
    >
      <Text style={styles.rotuloProxima}>Próxima refeição</Text>
      <Text style={styles.nomeRefeicao} numberOfLines={1}>
        {proxima.refeicao.rotulo}
      </Text>

      <View style={styles.linhaHorario}>
        <Ionicons name="time-outline" size={14} color={inkSuave} />
        <Text style={styles.horario}>{proxima.refeicao.hora}</Text>
        {/* "Hoje" também aparece: sem ele, um horário já passado e um de amanhã
            ficam com a mesma cara. */}
        <Text style={styles.quandoProxima}>· {quando}</Text>
      </View>

      {t.calorias !== null && (
        <Text style={styles.kcalProxima}>{milhar(t.calorias)} kcal</Text>
      )}

      {/* Sem banco de fotos de prato no projeto: um bloco resolvido lê melhor
          que um retângulo cinza esperando imagem. */}
      <View style={styles.fotoRefeicao}>
        <Ionicons name="restaurant" size={26} color={cores.verde} />
      </View>
    </Pressable>
  )
}

function RefeicaoDoPlano({ refeicao }: { refeicao: RefeicaoSalva }) {
  const t = totaisDe(refeicao.itens)

  return (
    <View style={styles.refeicaoPlano}>
      <View style={styles.cabecalhoRefeicaoPlano}>
        <View style={styles.horaPlano}>
          <Text style={styles.textoHoraPlano}>{refeicao.hora}</Text>
        </View>
        <Text style={styles.nomeRefeicaoPlano} numberOfLines={1}>
          {refeicao.rotulo}
        </Text>
        {t.calorias !== null && (
          <Text style={styles.kcalRefeicaoPlano}>{milhar(t.calorias)} kcal</Text>
        )}
      </View>

      {refeicao.itens.length === 0 ? (
        <Text style={styles.refeicaoVazia}>Nenhum alimento nesta refeição</Text>
      ) : (
        <View style={styles.listaItensPlano}>
          {refeicao.itens.map((i, indice) => {
            const kcal = caloriasDoItem(i)
            return (
              /* Fio separando um item do outro, e não espaço maior: com nome em
                 duas linhas o espaço sozinho não diz onde um item acaba e o
                 próximo começa. */
              <View
                key={i.id}
                style={[styles.itemPlano, indice > 0 && styles.itemPlanoComLinha]}
              >
                <View style={styles.textoItemPlano}>
                  <Text style={styles.nomeItemPlano} numberOfLines={2}>
                    {i.nome}
                  </Text>
                  <Text style={styles.medidaItemPlano}>{medidaDoItem(i)}</Text>
                </View>

                {/* Largura mínima fixa: é ela que alinha as calorias numa
                    coluna, em vez de cada uma parar onde o texto da esquerda
                    terminou. */}
                {kcal !== null && (
                  <Text style={styles.kcalItemPlano}>
                    {Math.round(kcal)}
                    <Text style={styles.unidadeKcalItem}> kcal</Text>
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

/* Um macro do plano contra a meta dele.
 *
 * Os dois lados podem faltar, e cada ausência tem uma cara diferente: sem meta,
 * o número do plano aparece sozinho, sem barra — barra sem meta não teria contra
 * o que encher. Sem plano, um traço, que é como se escreve "não se sabe". */
/* Um bloco por macro, cada um com a sua cor.
 *
 * A cor não é enfeite: os três ficam lado a lado e a barrinha de cada um é
 * curta. Fossem os três no mesmo verde, saber qual barra é de qual macro
 * dependeria de ler o rótulo toda vez. */
/* Um macro na coluna ao lado do anel: glifo de barras, o comido sobre a meta e
   o nome na cor do arco correspondente.
 *
 * O nome é que carrega a cor, e não um quadradinho de legenda: são três linhas
 * curtas, e ligar arco a nome pela cor da própria palavra dispensa a legenda
 * inteira. */
function LinhaMacro({
  rotulo,
  comido,
  meta,
  cor,
}: {
  rotulo: string
  comido: number | null
  meta: number | null
  cor: string
}) {
  const fracao = meta !== null && meta > 0 && comido !== null ? Math.min(comido / meta, 1) : 0
  /* Quatro barras de altura crescente, preenchidas conforme a fração. Um
      progresso que cabe em 14 pontos de largura, onde uma barra deitada não
      caberia. */
  const barras = [0.45, 0.62, 0.8, 1]

  return (
    <View style={styles.linhaMacro}>
      <View style={styles.glifoMacro}>
        {barras.map((altura, i) => (
          <View
            key={i}
            style={[
              styles.barrinha,
              { height: 18 * altura, backgroundColor: i / barras.length < fracao ? cor : cores.trilho },
            ]}
          />
        ))}
      </View>

      <View style={styles.textoMacro}>
        <Text style={styles.valorMacro} numberOfLines={1}>
          {/* Traço, e não zero, quando nada informou o macro: nenhum item trouxe
              proteína é diferente de comeu zero de proteína. */}
          {comido === null ? '—' : Math.round(comido)}
          {meta !== null && <Text style={styles.metaMacro}>/{meta}g</Text>}
        </Text>
        <Text style={[styles.rotuloMacro, { color: cor }]} numberOfLines={1}>
          {rotulo}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { paddingHorizontal: MARGEM, paddingBottom: 24, gap: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo },

  barraTopo: { flexDirection: 'row', justifyContent: 'space-between' },
  botaoTopo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: cores.cartao,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pontoAviso: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: cores.verde,
    borderWidth: 1.5,
    borderColor: cores.cartao,
  },

  saudacao: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  textoSaudacao: { flex: 1 },
  ola: { fontSize: 27, fontWeight: '800', color: cores.ink, letterSpacing: -0.6 },
  frase: { marginTop: 6, fontSize: 14.5, lineHeight: 21, color: inkSuave },
  fraseDestaque: { color: cores.verde, fontWeight: '700' },
  blocoAnel: { alignItems: 'center', gap: 5 },
  rotuloAnel: { fontSize: 11.5, color: inkSuave },

  cartao: {
    borderRadius: 20,
    backgroundColor: cores.cartao,
    padding: PADDING_CARTAO,
  },
  tituloCartao: { fontSize: 17, fontWeight: '800', color: cores.ink },
  /* flex só aqui, e não no tituloCartao: nos outros cartões ele está dentro de
     uma coluna, e ali flex faria o texto esticar na vertical. */
  tituloPlano: { flex: 1 },

  linhaCalorias: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  linhaValorGrande: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  avisoSemPeso: { marginTop: 10, fontSize: 11.5, lineHeight: 16, color: inkFraco },
  linhaPlanoRef: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  textoPlanoRef: { flexShrink: 1, fontSize: 11.5, color: inkFraco },



  /* Coluna à direita do anel. `justifyContent: space-around` para as três
     linhas se distribuírem na altura do anel em vez de ficarem grudadas no
     topo. */
  colunaMacros: { flex: 1, justifyContent: 'space-around', paddingVertical: 4 },
  linhaMacro: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  glifoMacro: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },
  barrinha: { width: 3, borderRadius: 2 },
  textoMacro: { flex: 1 },
  rotuloMacro: { fontSize: 12, fontWeight: '700' },
  valorMacro: { fontSize: 15, fontWeight: '800', color: cores.ink },
  metaMacro: { fontSize: 12, fontWeight: '600', color: inkSuave },

  /* Miolo do anel. Quatro linhas curtas, centralizadas, com o número comendo
     quase toda a largura interna. */
  rotuloAnelDia: { fontSize: 11.5, fontWeight: '700', color: inkSuave },
  linhaValorAnel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  valorAnel: { fontSize: 34, fontWeight: '800', color: cores.ink, letterSpacing: -1.2 },
  metaAnel: { fontSize: 12.5, fontWeight: '600', color: inkSuave },
  restantesAnel: { marginTop: 3, fontSize: 11.5, fontWeight: '700', color: cores.limao },

  /* Faixa de ação no rodapé do cartão, no formato de campo: é o convite para
     lançar o que comeu, e o botão da câmera é o atalho de dentro dele. */
  barraConferir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  textoConferir: { flex: 1, fontSize: 14, fontWeight: '600', color: inkMedio },
  botaoCamera: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: cores.limao,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cartaoPlanoCarregando: { alignItems: 'center', justifyContent: 'center', height: 120 },

  cartaoPressionado: { backgroundColor: cores.verdeMenta },
  /* O lápis fica na ponta: o título cresce e empurra o ícone para a direita. */
  linhaTituloPlano: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chamadaVazio: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '800',
    color: cores.ink,
    letterSpacing: -0.3,
  },
  planoVazio: { marginTop: 4, fontSize: 13, lineHeight: 19, color: inkSuave },
  botaoPlano: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    height: 48,
    borderRadius: 14,
    backgroundColor: cores.verde,
  },
  botaoPlanoPressionado: { backgroundColor: cores.verdeEscuro },
  textoBotaoPlano: { fontSize: 14.5, fontWeight: '700', color: cores.branco },
  nomePlano: { marginTop: 10, fontSize: 18, fontWeight: '800', color: cores.ink, letterSpacing: -0.3 },
  linhaRepeticao: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  textoRepeticao: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: cores.verde },
  seloDia: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: cores.verdeClaro,
  },
  textoSeloDia: { fontSize: 10.5, fontWeight: '800', color: cores.verdeEscuro },
  seloFolga: { backgroundColor: cores.trilho },
  textoSeloFolga: { color: inkMedio },

  dataPlano: { marginTop: 6, fontSize: 11.5, color: inkFraco },
  observacaoPlano: { marginTop: 6, fontSize: 13, lineHeight: 19, color: inkSuave },
  /* O totalizador vem com cartão próprio: aqui ele só ganha o respiro em volta. */
  /* Discreto de proposito: e um atalho util, nao o assunto do cartao. */
  botaoCompras: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  botaoComprasPressionado: { opacity: 0.7 },
  textoBotaoCompras: { fontSize: 14, fontWeight: '700', color: cores.verde },
  totaisPlano: { marginTop: 14 },

  /* Cada refeição num painel próprio, um degrau mais claro que o cartão. Sem
     isto as refeições do dia viram uma coluna de texto contínua, e o cabeçalho
     de uma parece rodapé da anterior. */
  refeicaoPlano: {
    marginTop: 12,
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  cabecalhoRefeicaoPlano: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  horaPlano: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: cores.verdeClaro,
  },
  textoHoraPlano: { fontSize: 12, fontWeight: '800', color: cores.limao },
  nomeRefeicaoPlano: { flex: 1, fontSize: 15, fontWeight: '800', color: cores.ink },
  kcalRefeicaoPlano: { fontSize: 12.5, fontWeight: '700', color: inkMedio },

  listaItensPlano: { marginTop: 2 },
  /* Duas colunas: texto à esquerda, caloria à direita. O respiro vertical vem
     do padding de cada linha, e não de um gap na lista, para o fio separador
     nascer no meio do vão e não colado no texto de cima. */
  itemPlano: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 },
  itemPlanoComLinha: { borderTopWidth: 1, borderTopColor: cores.borda },
  textoItemPlano: { flex: 1 },
  nomeItemPlano: { fontSize: 14, fontWeight: '600', color: cores.ink, lineHeight: 19 },
  medidaItemPlano: { marginTop: 3, fontSize: 12, lineHeight: 16, color: inkSuave },
  kcalItemPlano: {
    minWidth: 66,
    textAlign: 'right',
    fontSize: 13.5,
    fontWeight: '700',
    color: cores.ink,
  },
  unidadeKcalItem: { fontSize: 11.5, fontWeight: '600', color: inkSuave },
  refeicaoVazia: { fontSize: 12, color: inkFraco },

  linhaDupla: { flexDirection: 'row', gap: 12 },
  cartaoAgua: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: cores.verde,
    padding: PADDING_CARTAO,
    /* Sem isto o degradê de dentro vaza pelos cantos arredondados. */
    overflow: 'hidden',
  },
  cartaoAguaCarregando: { alignItems: 'center', justifyContent: 'center', minHeight: 150 },
  cartaoAguaPressionado: { backgroundColor: cores.verdeEscuro },
  linhaTituloAgua: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tituloAgua: { fontSize: 14.5, fontWeight: '700', color: cores.branco },
  linhaValorAgua: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 8 },
  valorAgua: { fontSize: 28, fontWeight: '800', color: cores.branco, letterSpacing: -0.8 },
  metaAgua: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  copos: { flexDirection: 'row', gap: 4, marginTop: 10 },
  /* Copo desenhado com View em vez de ícone: a forma é simples e assim a
     largura acompanha o espaço disponível sem estourar em tela estreita. */
  copo: { flex: 1, height: 20, borderRadius: 4, backgroundColor: cores.branco },
  copoVazio: { backgroundColor: 'rgba(255,255,255,0.32)' },
  /* A altura é a mesma dos copos: com a barra ou com eles, o cartão de água tem
     o mesmo tamanho — e a linha não muda de altura conforme a meta da pessoa. */
  trilhoAgua: {
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.32)',
    overflow: 'hidden',
    marginTop: 10,
  },
  preenchimentoAgua: { height: '100%', borderRadius: 4, backgroundColor: cores.branco },
  botaoRegistrar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 12,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  botaoRegistrarPress: { backgroundColor: 'rgba(255,255,255,0.38)' },
  textoRegistrar: { fontSize: 12.5, fontWeight: '700', color: cores.branco },

  cartaoRefeicao: { flex: 1, overflow: 'hidden' },
  cartaoRefeicaoPressionado: { backgroundColor: cores.verdeMenta },
  rotuloProxima: { fontSize: 12.5, fontWeight: '700', color: cores.verde },
  nomeRefeicao: { marginTop: 6, fontSize: 20, fontWeight: '800', color: cores.ink },
  linhaHorario: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  horario: { fontSize: 13.5, fontWeight: '600', color: inkSuave },
  quandoProxima: { fontSize: 13.5, fontWeight: '600', color: inkFraco },
  kcalProxima: { marginTop: 4, fontSize: 12.5, fontWeight: '700', color: inkMedio },
  semProxima: { marginTop: 8, fontSize: 13, lineHeight: 19, color: inkSuave },
  fotoRefeicao: {
    alignSelf: 'flex-end',
    marginTop: 10,
    marginRight: -PADDING_CARTAO,
    marginBottom: -PADDING_CARTAO,
    width: 84,
    height: 62,
    borderTopLeftRadius: 18,
    backgroundColor: cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },

  linhaTituloProgresso: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  linhaProgresso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  colunaPeso: { width: 96 },
  rotuloPeso: { fontSize: 12.5, color: inkSuave },
  valorPeso: { fontSize: 26, fontWeight: '800', color: cores.ink, letterSpacing: -0.8 },
  unidadePeso: { fontSize: 12.5, fontWeight: '600', color: inkMedio },
  colunaVariacao: { width: 84, alignItems: 'center', gap: 4 },
  selo: {
    borderRadius: 999,
    backgroundColor: cores.verdeClaro,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  textoSelo: { fontSize: 12.5, fontWeight: '800', color: cores.verdeEscuro },
  seloNoFoco: { backgroundColor: cores.verde },
  textoSeloNoFoco: { color: cores.branco },
  seloForaDoFoco: { backgroundColor: cores.trilho },
  desdeInicio: { fontSize: 11, color: inkFraco, textAlign: 'center' },
  rodapeSono: { marginTop: 10, fontSize: 11.5, color: inkFraco },

  /* ── Folha da meta do dia ── */
  centroFolha: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: MARGEM },
  fundoFolha: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  folha: {
    width: '100%',
    backgroundColor: cores.fundo,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  topoFolha: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  textoTopoFolha: { flex: 1 },
  tituloFolha: { fontSize: 19, fontWeight: '800', color: cores.ink, letterSpacing: -0.3 },
  fraseFolha: { marginTop: 3, fontSize: 13, color: inkSuave },

  linhaPilar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconePilar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoPilar: { flex: 1 },
  linhaNomePilar: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  nomePilar: { fontSize: 14, fontWeight: '700', color: cores.ink },
  pctPilar: { fontSize: 13, fontWeight: '800', color: cores.verde },
  trilhoPilar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: cores.trilho,
    overflow: 'hidden',
    marginTop: 5,
  },
  preenchimentoPilar: { height: '100%', borderRadius: 3, backgroundColor: cores.verde },
  detalhePilar: { marginTop: 4, fontSize: 11.5, color: inkFraco },
  notaFolha: { fontSize: 11.5, lineHeight: 16, color: inkFraco },
})
