import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BarraDesfazer, useApagarComDesfazer } from '../components/Desfazer'
import { retornoDoRegistro, type Retorno } from '../lib/retornoDoRegistro'
import { BuscarAlimentoScreen } from './BuscarAlimentoScreen'
import { EscreverRefeicaoScreen } from './EscreverRefeicaoScreen'
import { LerCodigoScreen } from './LerCodigoScreen'
import { ReceitasScreen } from './ReceitasScreen'
import {
  REFEICOES,
  ajustarQuantidade,
  analisarFoto,
  apagarConsumo,
  carregarConsumo,
  carregarFrequentes,
  carregarUltimaRefeicao,
  moverDeRefeicao,
  porRefeicao,
  refeicaoPelaHora,
  registrarConsumo,
  totaisConsumidos,
  type Estimativa,
  type ItemConsumo,
  type ItemFrequente,
  type ItemParaGravar,
  type UltimaRefeicao,
} from '../lib/consumo'
import { enviarPendentes, guardarPendentes, quantosPendentes } from '../lib/pendentes'
import { METAS_VAZIAS, carregarMetas, type Metas } from '../lib/metas'
import { carregarPlanoAtivo, type PlanoCompleto, type RefeicaoSalva } from '../lib/plano'
import { porcao } from '../lib/alimentos'
import type { AlimentoEscolhido, Nutrientes } from '../lib/plano'
import { horaCurta, milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* O contador de calorias: o que a pessoa comeu hoje, contra a meta dela.
 *
 * Sete portas para registrar, e a escolha entre elas é sobre esforço, não sobre
 * capricho: fotografar resolve o prato de restaurante que ninguém sabe pesar;
 * a busca resolve o alimento embalado, com número de tabela; e "do meu plano"
 * resolve o caso mais comum de todos — quem montou um plano e comeu o que
 * planejou não deveria ter de descrever isso de novo, alimento por alimento; e
 * "repetir" resolve o dia comum, em que se come o mesmo de ontem.
 *
 * A refeição é escolhida UMA vez, no alto, e vale para todas elas. Perguntar
 * "em qual refeição?" no fim de cada fluxo somaria um toque a cada registro, e
 * são vários por dia. */
/* Prefixo do id de um item que está na lista mas ainda não no banco. Prefixo e
   não campo à parte: o id já viaja por toda a tela, e um segundo dado paralelo
   para dizer a mesma coisa acabaria divergindo dele. */
const PROVISORIO = 'provisorio:'

export type PortaDoDiario = 'busca' | 'plano' | 'repetir' | 'escrever' | 'codigo' | 'receitas' | 'foto'

export function ContadorCaloriasScreen({
  contaId,
  portaInicial,
  onFechar,
  onMudou,
}: {
  contaId: string
  /* Abre já dentro de uma das formas de registrar, em vez de na lista delas.
   *
   * É o que permite o "+" da barra levar direto ao microfone. Antes, registrar
   * o que se comeu — a coisa mais frequente do app — custava tocar no "+",
   * escolher "Contador de calorias" e só então escolher a forma: três toques e
   * duas telas para a ação que se repete cinco vezes por dia. O degrau do meio
   * não decidia nada; só existia porque as portas moravam aqui dentro.
   *
   * A refeição continua saindo do relógio, como já saía. */
  portaInicial?: PortaDoDiario
  onFechar: () => void
  /* A tela inicial mostra o mesmo consumo; avisado ao fechar, e não a cada item,
     para não refazer a busca da Home a cada alimento registrado. */
  onMudou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [itens, setItens] = useState<ItemConsumo[]>([])
  const [metas, setMetas] = useState<Metas>(METAS_VAZIAS)
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mudou, setMudou] = useState(false)
  const [refeicao, setRefeicao] = useState(() => refeicaoPelaHora())

  /* null = a tela principal. As portas abrem por cima dela. */
  const [porta, setPorta] = useState<Exclude<PortaDoDiario, 'foto'> | null>(
    portaInicial && portaInicial !== 'foto' ? portaInicial : null,
  )
  /* O que a pessoa já come nesta refeição. Carregado só quando a porta abre —
     são duas consultas que a maioria das visitas não usa, e pagá-las na abertura
     da tela atrasaria o caso comum por causa do caso eventual. */
  const [frequentes, setFrequentes] = useState<ItemFrequente[]>([])
  const [ultima, setUltima] = useState<UltimaRefeicao | null>(null)
  const [buscandoRepetir, setBuscandoRepetir] = useState(false)
  /* O item do diário com o menu de correção aberto. Errar a refeição e comer
     diferente do que se anotou são os dois enganos comuns, e até aqui os dois
     custavam apagar e descrever tudo de novo. */
  const [acoesDe, setAcoesDe] = useState<ItemConsumo | null>(null)
  const [analisando, setAnalisando] = useState(false)
  /* A estimativa esperando confirmação. Nada é gravado antes de a pessoa ver o
     número — a IA erra, e um item errado no diário estraga o total do dia. */
  const [estimativa, setEstimativa] = useState<Estimativa | null>(null)
  /* Quantos registros estão esperando a rede voltar. Zero na maioria das
     vezes; quando não é, a tela precisa dizer — senão a pessoa acha que o
     item sumiu. */
  /* As quatro formas menos usadas ficam recolhidas, como no "+". */
  const [maisFormas, setMaisFormas] = useState(false)
  /* A resposta ao último registro. Some sozinha — ver `gravar`. */
  const [retorno, setRetorno] = useState<Retorno | null>(null)
  const prazoDoRetorno = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendentes, setPendentes] = useState(0)

  useEffect(() => {
    let ativo = true

    /* Tenta subir o que ficou esperando antes de ler o dia: assim o que subiu
       agora já aparece na lista, em vez de só na próxima abertura. */
    enviarPendentes()
      .then(r => {
        if (!ativo) return
        setPendentes(r.restantes)
        return r.enviados > 0 ? carregarConsumo(contaId) : null
      })
      .then(novo => {
        if (ativo && novo && novo.tipo === 'ok') setItens(novo.itens)
      })

    Promise.all([carregarConsumo(contaId), carregarMetas(contaId), carregarPlanoAtivo(contaId)]).then(
      ([rConsumo, rMetas, rPlano]) => {
        if (!ativo) return

        if (rConsumo.tipo === 'erro') setErro(rConsumo.mensagem)
        else setItens(rConsumo.itens)
        if (rMetas.tipo === 'ok') setMetas(rMetas.metas)
        if (rPlano.tipo === 'ok') setPlano(rPlano.plano)

        setCarregando(false)
      },
    )

    return () => {
      ativo = false
    }
  }, [contaId])

  /* O voltar do Android dentro desta tela.
   *
   * Sem isto, quem abre a busca, digita "pão" e aperta voltar perde o contador
   * inteiro e cai na tela inicial — em vez de voltar para a refeição que estava
   * montando. O App tem o seu próprio tratamento, mas ele só enxerga as telas
   * que ele mesmo abriu; o que acontece DENTRO desta é esta tela que sabe.
   *
   * Registrado depois do App de propósito: o React Native chama os tratadores
   * na ordem inversa do registro, então o mais interno decide primeiro — que é
   * o que faz o voltar descascar uma camada por vez. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (acoesDe) {
        setAcoesDe(null)
        return true
      }
      /* A estimativa da foto vem por cima de tudo, inclusive das portas. */
      if (estimativa) {
        setEstimativa(null)
        return true
      }
      if (porta) {
        setPorta(null)
        return true
      }
      /* Nada aberto aqui dentro: devolve o evento, e quem fecha a tela é o App
         — que precisa avisar a Home de que houve mudança. */
      return false
    })

    return () => sub.remove()
  }, [porta, estimativa, acoesDe])

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  async function gravar(novos: ItemParaGravar[]) {
    setErro('')

    /* Aparece na lista ANTES de a rede responder.
     *
     * Era o contrário, e o contrário estava errado: adicionar esperava a ida e
     * volta, e apagar era instantâneo. O gesto perigoso era o rápido e o gesto
     * seguro era o lento — quem acabou de escolher um alimento ficava olhando
     * para uma lista que não mudou, sem saber se tinha registrado. */
    const quando = new Date()
    const provisorios: ItemConsumo[] = novos.map((n, i) => ({
      refeicao: n.refeicao,
      nome: n.nome,
      descricao: n.descricao,
      calorias: n.calorias,
      proteinas: n.proteinas,
      carboidratos: n.carboidratos,
      gorduras: n.gorduras,
      fibras: n.fibras,
      origem: n.origem,
      confianca: n.confianca,
      id: `${PROVISORIO}${quando.getTime()}-${i}`,
      comidoEm: quando.toISOString(),
    }))
    setItens(atuais => [...atuais, ...provisorios])

    const r = await registrarConsumo(contaId, novos, quando)

    if (r.tipo === 'erro') {
      /* Falhou: o registro NÃO se perde.
       *
       * Registrar comida acontece no restaurante, na rua, no elevador. Antes,
       * uma gravação sem sinal mostrava o erro e jogava fora o que a pessoa
       * acabou de descrever — ela olhava para a tela, não via o item, e
       * descrevia tudo de novo. Ou desistia.
       *
       * Agora fica guardado no aparelho e sobe quando a rede voltar. A mensagem
       * diz isso, em vez de repetir a falha do banco, que não ajuda ninguém. */
      /* Os provisórios FICAM na lista. Some-los aqui contradiria a própria
         mensagem que aparece logo abaixo: ela diz que o registro está
         guardado, e uma lista vazia diz que não está. Eles não são editáveis
         até subirem — ver `abrirAcoes`. */
      await guardarPendentes(contaId, novos)
      setPendentes(await quantosPendentes())
      setErro(
        novos.length === 1
          ? 'Sem conexão agora. O registro está guardado e sobe sozinho quando a internet voltar.'
          : `Sem conexão agora. Os ${novos.length} itens estão guardados e sobem sozinhos quando a internet voltar.`,
      )
      return
    }

    setMudou(true)
    /* Troca os provisórios pelos de verdade, que já vêm com id do banco e a
       hora que ele carimbou. */
    const idsProvisorios = new Set(provisorios.map(p => p.id))
    const atualizados = [...itens.filter(i => !idsProvisorios.has(i.id)), ...r.itens]
    setItens(atualizados)

    /* ── O retorno do gesto ──
       Registrar era mudo: a linha aparecia na lista e mais nada. Agora o app
       responde o que mudou no dia — informação, e não prêmio. O porquê dessa
       escolha está em lib/retornoDoRegistro. */
    const somadas = r.itens.reduce<number | null>(
      (soma, i) => (i.calorias === null ? soma : (soma ?? 0) + i.calorias),
      null,
    )
    mostrarRetorno(
      retornoDoRegistro({
        adicionadas: somadas,
        totalDoDia: totaisConsumidos(atualizados).calorias,
        meta: metas.calorias,
        quantos: r.itens.length,
      }),
    )
  }

  /* Mostra e agenda o desaparecimento. Cinco segundos: o mesmo do desfazer, e
     pelo mesmo motivo — é o tempo de os olhos irem até a barra e voltarem. */
  function mostrarRetorno(r: Retorno) {
    setRetorno(r)
    if (prazoDoRetorno.current) clearTimeout(prazoDoRetorno.current)
    prazoDoRetorno.current = setTimeout(() => setRetorno(null), 5000)
  }

  useEffect(
    () => () => {
      if (prazoDoRetorno.current) clearTimeout(prazoDoRetorno.current)
    },
    [],
  )

  /* A folha de correção só abre para item que já existe no banco: mover,
     ajustar e apagar são todos operações sobre um id, e o provisório não tem
     um. Dizer isso é melhor do que abrir a folha e falhar em cada botão. */
  function abrirAcoes(item: ItemConsumo) {
    if (item.id.startsWith(PROVISORIO)) {
      setErro('Este item ainda está subindo. Quando a internet voltar ele fica editável.')
      return
    }
    setErro('')
    setAcoesDe(item)
  }

  /* Apagar com cinco segundos de volta. Ver `components/Desfazer` para por que
     é prazo e não pergunta de confirmação, e por que segurar o apagar em vez de
     apagar e recriar. */
  const { apagar, desfazer, desfazivel } = useApagarComDesfazer<ItemConsumo>({
    remover: item => setItens(atuais => atuais.filter(i => i.id !== item.id)),
    /* A lista é ordenada por relógio, então o item volta para o lugar de onde
       saiu, e não para o fim. */
    restaurar: item =>
      setItens(atuais => [...atuais, item].sort((a, b) => a.comidoEm.localeCompare(b.comidoEm))),
    apagarDeVerdade: item => apagarConsumo(item.id),
    aoFalhar: setErro,
    /* Limpa o erro de antes junto: a regra vale aqui como em toda tela que
       relê — mensagem vencida escondendo conteúdo bom. */
    aoMudar: () => {
      setErro('')
      setMudou(true)
      /* A barra de retorno fala do total do dia, e apagar mexe nele. Deixá-la
         no ar seria mostrar uma conta de antes do apagar. */
      setRetorno(null)
    },
  })

  async function mover(item: ItemConsumo, destino: string) {
    setAcoesDe(null)
    if (destino === item.refeicao) return

    setErro('')
    setItens(atuais => atuais.map(i => (i.id === item.id ? { ...i, refeicao: destino } : i)))

    const falha = await moverDeRefeicao(item.id, destino)

    if (falha) {
      setItens(atuais => atuais.map(i => (i.id === item.id ? item : i)))
      setErro(falha.erro)
      return
    }

    setMudou(true)
  }

  /* Comi metade, comi o dobro. Proporção, e não peso novo: a tabela guarda os
     nutrientes absolutos da porção e não o quanto era, então dobrar tudo é a
     única conta que fecha sem inventar um número que ninguém informou. */
  async function ajustar(item: ItemConsumo, fator: number) {
    setAcoesDe(null)
    setErro('')

    const r = await ajustarQuantidade(item, fator)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }

    setItens(atuais => atuais.map(i => (i.id === r.item.id ? r.item : i)))
    setMudou(true)
  }

  /* A foto é a única porta que não é uma tela: ela abre a câmera do sistema.
     Por isso o `portaInicial === 'foto'` não entra no estado das portas — vira
     esta chamada, uma vez, quando a tela monta. */
  const jaAbriuAFoto = useRef(false)
  useEffect(() => {
    if (portaInicial !== 'foto' || jaAbriuAFoto.current) return
    jaAbriuAFoto.current = true
    void fotografar('camera')
  }, [portaInicial])

  async function fotografar(origem: 'camera' | 'galeria') {
    setErro('')
    setAnalisando(true)

    const r = await analisarFoto(origem)
    setAnalisando(false)

    if (r.tipo === 'erro') setErro(r.mensagem)
    else if (r.tipo === 'ok') setEstimativa(r.estimativa)
    /* 'cancelado' não é erro: a pessoa desistiu da foto e a tela fica como
       estava, sem aviso nenhum. */
  }

  /* Abre a porta do repetir e busca as duas listas.
   *
   * A busca refaz-se a cada abertura em vez de guardar o que já veio: a pessoa
   * registra algo, fecha, abre de novo — e o que ela acabou de comer precisa
   * aparecer entre os frequentes, senão a lista parece desatualizada logo no
   * momento em que ela está prestando atenção nela. */
  async function abrirRepetir() {
    setPorta('repetir')
    setBuscandoRepetir(true)
    setFrequentes([])
    setUltima(null)

    const [rFreq, rUlt] = await Promise.all([
      carregarFrequentes(contaId, refeicao),
      carregarUltimaRefeicao(contaId, refeicao),
    ])

    setBuscandoRepetir(false)
    /* Falha aqui não vira aviso vermelho: a porta é um atalho, e quem não
       conseguir carregá-la ainda tem as outras três. Uma lista vazia com o
       texto de "nada ainda" diz o suficiente. */
    if (rFreq.tipo === 'ok') setFrequentes(rFreq.itens)
    if (rUlt.tipo === 'ok') setUltima(rUlt.refeicao)
  }

  /* Um frequente vira consumo. Os nutrientes vão como estão: já são absolutos
     da porção, porque saíram de um registro anterior — não passam pela conversão
     de 100 g que o plano e a busca precisam. */
  function repetirItem(f: ItemFrequente) {
    gravar([
      {
        refeicao,
        nome: f.nome,
        descricao: f.descricao,
        calorias: f.calorias,
        proteinas: f.proteinas,
        carboidratos: f.carboidratos,
        gorduras: f.gorduras,
        fibras: f.fibras,
        origem: 'manual',
        /* Sem confiança: ela existe para marcar estimativa de foto. Repetir o
           que já foi registrado herda a exatidão do original, seja qual for. */
        confianca: null,
      },
    ])
  }

  /* A refeição inteira de outro dia, de uma vez. */
  function repetirUltima() {
    if (!ultima) return
    setPorta(null)
    gravar(
      ultima.itens.map(i => ({
        refeicao,
        nome: i.nome,
        descricao: i.descricao,
        calorias: i.calorias,
        proteinas: i.proteinas,
        carboidratos: i.carboidratos,
        gorduras: i.gorduras,
        fibras: i.fibras,
        origem: 'manual' as const,
        confianca: null,
      })),
    )
  }

  /* Uma refeição inteira do plano vira consumo de uma vez.
   *
   * O rótulo gravado é o DO PLANO ("Pré-treino"), e não o da faixa lá em cima:
   * quem registra o pré-treino do plano comeu o pré-treino, mesmo que o relógio
   * ache que é hora do almoço. */
  function comerDoPlano(r: RefeicaoSalva) {
    setPorta(null)
    gravar(r.itens.map(i => doPlano(i, r.rotulo)))
  }

  if (porta === 'receitas') {
    return (
      <ReceitasScreen
        contaId={contaId}
        onFechar={() => setPorta(null)}
        onUsar={itens => gravar(itens.map(a => doAlimento(a, refeicao)))}
      />
    )
  }

  if (porta === 'codigo') {
    return (
      <LerCodigoScreen
        onFechar={() => setPorta(null)}
        onAdicionar={a => gravar([doAlimento(a, refeicao)])}
      />
    )
  }

  if (porta === 'escrever') {
    return (
      <EscreverRefeicaoScreen
        refeicao={refeicao}
        onFechar={() => setPorta(null)}
        onAdicionar={novos => gravar(novos.map(a => doAlimento(a, refeicao)))}
      />
    )
  }

  if (porta === 'busca') {
    return (
      <BuscarAlimentoScreen
        refeicao={refeicao}
        motivo="consumo"
        onAdicionar={a => gravar([doAlimento(a, refeicao)])}
        onFechar={() => setPorta(null)}
      />
    )
  }

  const totais = totaisConsumidos(itens)
  const grupos = porRefeicao(itens)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={fechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        {/* "Diário", e não "Contador de calorias".
            O nome antigo descrevia o MECANISMO — contar caloria — e não o que a
            pessoa está fazendo, que é anotar o que comeu. E "contar calorias" é
            o vocabulário que o MyFitnessPal fixou em 2005 e o mercado copiou;
            todos os concorrentes já chamam esta tela de diário, porque é o que
            ela é: o registro do dia. */}
        <Text style={styles.tituloTela}>Diário</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: Math.max(bottom, 16) + 16 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          <CartaoDoDia totais={totais} metas={metas} />

          {/* ── A refeição, escolhida uma vez ── */}
          <View style={styles.bloco}>
            <Text style={styles.tituloBloco}>Registrar em</Text>
            <View style={styles.chips}>
              {REFEICOES.map(r => (
                <Pressable
                  key={r}
                  onPress={() => setRefeicao(r)}
                  style={({ pressed }) => [
                    styles.chip,
                    refeicao === r && styles.chipAtivo,
                    pressed && styles.chipPressionado,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: refeicao === r }}
                >
                  <Text style={[styles.textoChip, refeicao === r && styles.textoChipAtivo]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── As formas de registrar ──
              Mesma hierarquia do "+" da barra, e de propósito: são a mesma
              ação. Duas telas com as mesmas sete opções em desenhos diferentes
              se leem como dois menus diferentes, e a pessoa passa a procurar em
              qual dos dois estava o que ela quer.

              O que muda entre os dois lugares é só a refeição de destino: o "+"
              usa a do relógio, e aqui é a que a pessoa escolheu logo acima. É
              por isso que este não pode simplesmente sumir. */}
          <View style={styles.portas}>
            <Porta
              icone="mic-outline"
              titulo="Falar"
              detalhe="Tudo de uma vez"
              onPress={() => setPorta('escrever')}
            />
            <Porta
              icone="camera-outline"
              titulo="Foto"
              detalhe="A IA estima"
              ocupada={analisando}
              onPress={() => fotografar('camera')}
              onLongPress={() => fotografar('galeria')}
            />
            <Porta
              icone="nutrition-outline"
              titulo="Do meu plano"
              detalhe={plano ? 'Um toque' : 'Sem plano'}
              desligada={!plano}
              onPress={() => setPorta('plano')}
            />
          </View>

          {maisFormas ? (
            <View style={styles.listaFormas}>
              <LinhaForma
                icone="search-outline"
                titulo="Buscar"
                onPress={() => setPorta('busca')}
                styles={styles}
              />
              <LinhaForma
                icone="repeat-outline"
                titulo="Repetir"
                onPress={abrirRepetir}
                styles={styles}
              />
              <LinhaForma
                icone="barcode-outline"
                titulo="Código de barras"
                onPress={() => setPorta('codigo')}
                styles={styles}
              />
              <LinhaForma
                icone="book-outline"
                titulo="Minhas receitas"
                onPress={() => setPorta('receitas')}
                styles={styles}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setMaisFormas(true)}
              style={({ pressed }) => [styles.maisFormas, pressed && styles.chipPressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.textoMaisFormas}>Outras formas de registrar</Text>
              <Ionicons name="chevron-down" size={16} color={paleta().inkSuave} />
            </Pressable>
          )}

          <Text style={styles.dicaPortas}>
            Segure em "Foto" para escolher uma imagem da galeria em vez de tirar na hora.
          </Text>

          {pendentes > 0 && (
            <Pressable
              onPress={async () => {
                const r = await enviarPendentes()
                setPendentes(r.restantes)
                if (r.enviados > 0) {
                  const novo = await carregarConsumo(contaId)
                  if (novo.tipo === 'ok') setItens(novo.itens)
                  setMudou(true)
                }
              }}
              style={({ pressed }) => [styles.blocoPendentes, pressed && styles.chipPressionado]}
              accessibilityRole="button"
              accessibilityLabel="Tentar enviar os registros guardados"
            >
              <Ionicons name="cloud-upload-outline" size={16} color={paleta().cores.gold} />
              <Text style={styles.textoPendentes}>
                {pendentes === 1
                  ? '1 registro guardado esperando internet. Toque para tentar agora.'
                  : `${pendentes} registros guardados esperando internet. Toque para tentar agora.`}
              </Text>
            </Pressable>
          )}

          {!!erro && (
            <View style={styles.blocoErro}>
              <Text style={styles.tituloErro}>Não deu certo</Text>
              {/* A mensagem crua junto. Depois da correção da edge function ela
                  distingue foto ruim de chave errada — antes as duas chegavam
                  aqui como "não identifiquei o alimento". */}
              <Text style={styles.detalheErro}>{erro}</Text>
            </View>
          )}

          {/* ── O dia ── */}
          {itens.length === 0 ? (
            <View style={styles.bloco}>
              <Text style={styles.tituloBloco}>Hoje</Text>
              <Text style={styles.vazio}>
                Nada registrado ainda. Escolha a refeição acima e use uma das portas abaixo.
              </Text>
            </View>
          ) : (
            grupos.map(g => (
              <View key={g.refeicao} style={styles.bloco}>
                <View style={styles.linhaTituloBloco}>
                  <Text style={styles.tituloBloco}>{g.refeicao}</Text>
                  <Text style={styles.kcalGrupo}>
                    {(() => {
                      const t = totaisConsumidos(g.itens)
                      return t.calorias === null ? '—' : `${milhar(t.calorias)} kcal`
                    })()}
                  </Text>
                </View>

                {g.itens.map(i => (
                  <LinhaItem
                    key={i.id}
                    item={i}
                    onCorrigir={() => abrirAcoes(i)}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Confirmar a estimativa da foto ── */}
      {estimativa && (
        <ConfirmarFoto
          estimativa={estimativa}
          refeicao={refeicao}
          onDescartar={() => setEstimativa(null)}
          onRegistrar={() => {
            const e = estimativa
            setEstimativa(null)
            gravar([
              {
                refeicao,
                nome: e.descricao,
                descricao: e.porcaoEstimada || null,
                calorias: e.calorias,
                proteinas: e.proteinas,
                carboidratos: e.carboidratos,
                gorduras: e.gorduras,
                fibras: e.fibras,
                origem: 'foto',
                confianca: e.confianca,
              },
            ])
          }}
        />
      )}

      {/* ── Escolher a refeição do plano ── */}
      {porta === 'plano' && plano && (
        <EscolherDoPlano
          plano={plano}
          onEscolher={comerDoPlano}
          onFechar={() => setPorta(null)}
        />
      )}

      {acoesDe && (
        <AcoesDoItem
          item={acoesDe}
          onMover={destino => mover(acoesDe, destino)}
          onAjustar={fator => ajustar(acoesDe, fator)}
          onApagar={() => { const i = acoesDe; setAcoesDe(null); apagar(i) }}
          onFechar={() => setAcoesDe(null)}
        />
      )}

      {porta === 'repetir' && (
        <Repetir
          refeicao={refeicao}
          buscando={buscandoRepetir}
          ultima={ultima}
          frequentes={frequentes}
          onRepetirUltima={repetirUltima}
          onRepetirItem={repetirItem}
          onFechar={() => setPorta(null)}
        />
      )}

      {analisando && (
        <View style={styles.veu} pointerEvents="auto">
          <View style={styles.caixaAnalise}>
            <ActivityIndicator color={paleta().cores.verde} />
            <Text style={styles.textoAnalise}>Analisando a foto…</Text>
          </View>
        </View>
      )}

      {/* Por último no JSX, e por isso por cima de tudo: a barra precisa
          aparecer mesmo com a folha de correção aberta, já que é de lá que sai
          a maior parte dos apagares. */}
      {/* Nunca as duas juntas: `aoMudar` limpa o retorno ao apagar, e gravar
          não abre desfazer. Se um dia puderem coexistir, esta fica embaixo. */}
      {retorno && !desfazivel && (
        <View style={[styles.barraRetorno, retorno.fechou && styles.barraRetornoFechou, { bottom: bottom + 16 }]}>
          <Ionicons
            name={retorno.fechou ? 'checkmark-circle' : 'arrow-up-circle-outline'}
            size={17}
            color={retorno.fechou ? paleta().cores.sobreLimao : paleta().cores.verde}
          />
          <Text
            style={[styles.textoRetorno, retorno.fechou && styles.textoRetornoFechou]}
            numberOfLines={1}
          >
            {retorno.texto}
          </Text>
        </View>
      )}

      {desfazivel && (
        <BarraDesfazer
          texto={`${desfazivel.nome} saiu do diário`}
          onDesfazer={desfazer}
          bottom={bottom + 16}
        />
      )}
    </View>
  )
}

/* ── Conversões ────────────────────────────────────────────────────────────
   O plano e a busca guardam nutrientes POR 100 g mais o peso; o consumo guarda
   o valor absoluto da porção. A conversão acontece aqui, na fronteira, e não
   nas duas pontas — ver o comentário da coluna na migração. */

const absolutos = (n: Nutrientes) => ({
  calorias: n.gramasTotais === null ? null : porcao(n.caloriasPor100g, n.gramasTotais),
  proteinas: n.gramasTotais === null ? null : porcao(n.proteinasPor100g, n.gramasTotais),
  carboidratos: n.gramasTotais === null ? null : porcao(n.carboidratosPor100g, n.gramasTotais),
  gorduras: n.gramasTotais === null ? null : porcao(n.gordurasPor100g, n.gramasTotais),
  fibras: n.gramasTotais === null ? null : porcao(n.fibrasPor100g, n.gramasTotais),
})

const doAlimento = (a: AlimentoEscolhido, refeicao: string): ItemParaGravar => ({
  refeicao,
  nome: a.nome,
  descricao: a.descricao,
  ...absolutos(a),
  origem: 'busca',
  confianca: null,
  alimentoId: a.alimentoId,
})

const doPlano = (
  i: Nutrientes & { nome: string; descricao: string; alimentoId: number | null },
  refeicao: string,
): ItemParaGravar => ({
  refeicao,
  nome: i.nome,
  descricao: i.descricao,
  ...absolutos(i),
  origem: 'plano',
  confianca: null,
  alimentoId: i.alimentoId,
})

/* ── Cartão do dia ─────────────────────────────────────────────────────────*/

function CartaoDoDia({ totais, metas }: { totais: ReturnType<typeof totaisConsumidos>; metas: Metas }) {
  const styles = estilos()
  const comido = totais.calorias ?? 0
  const meta = metas.calorias

  return (
    <View style={styles.cartaoDia}>
      <View style={styles.linhaTituloDia}>
        <Ionicons name="flame-outline" size={16} color={paleta().cores.branco} />
        <Text style={styles.tituloDia}>Hoje</Text>
      </View>

      <View style={styles.linhaValorDia}>
        <Text style={styles.valorDia}>{milhar(comido)}</Text>
        <Text style={styles.unidadeDia}>kcal</Text>
        {meta !== null && <Text style={styles.metaDia}>de {milhar(meta)} kcal</Text>}
      </View>

      {meta === null ? (
        <Text style={styles.rodapeDia}>
          Você ainda não definiu uma meta de calorias. Sem ela o app soma o dia, mas não tem contra
          o que comparar.
        </Text>
      ) : (
        <>
          <View style={styles.trilhoDia}>
            <View
              style={[styles.preenchimentoDia, { width: `${Math.min((comido / meta) * 100, 100)}%` }]}
            />
          </View>
          <Text style={styles.rodapeDia}>
            {comido <= meta
              ? `Faltam ${milhar(meta - comido)} kcal para a sua meta.`
              : `${milhar(comido - meta)} kcal acima da meta de hoje.`}
          </Text>
        </>
      )}

      <View style={styles.macrosDia}>
        <MacroDia rotulo="Proteínas" valor={totais.proteinas} meta={metas.proteinas} />
        <MacroDia rotulo="Carboidratos" valor={totais.carboidratos} meta={metas.carboidratos} />
        <MacroDia rotulo="Gorduras" valor={totais.gorduras} meta={metas.gorduras} />
      </View>

      {/* Os dois avisos que impedem o total de mentir por omissão. */}
      {totais.deFoto > 0 && (
        <Text style={styles.avisoDia}>
          {totais.deFoto === 1
            ? '1 item foi estimado por foto — o total é aproximado.'
            : `${totais.deFoto} itens foram estimados por foto — o total é aproximado.`}
        </Text>
      )}
      {totais.semCalorias > 0 && (
        <Text style={styles.avisoDia}>
          {totais.semCalorias === 1
            ? '1 item entrou sem caloria e ficou de fora da soma.'
            : `${totais.semCalorias} itens entraram sem caloria e ficaram de fora da soma.`}
        </Text>
      )}
    </View>
  )
}

function MacroDia({
  rotulo,
  valor,
  meta,
}: {
  rotulo: string
  valor: number | null
  meta: number | null
}) {
  const styles = estilos()
  return (
    <View style={styles.macroDia}>
      <Text style={styles.rotuloMacroDia}>{rotulo}</Text>
      <Text style={styles.valorMacroDia}>
        {valor === null ? '—' : `${Math.round(valor)}`}
        {meta !== null && <Text style={styles.metaMacroDia}> / {meta}g</Text>}
      </Text>
    </View>
  )
}

/* ── Portas ────────────────────────────────────────────────────────────────*/

function Porta({
  icone,
  titulo,
  detalhe,
  onPress,
  onLongPress,
  desligada,
  ocupada,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  detalhe: string
  onPress: () => void
  onLongPress?: () => void
  desligada?: boolean
  ocupada?: boolean
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={desligada || ocupada}
      style={({ pressed }) => [
        styles.porta,
        desligada && styles.portaDesligada,
        pressed && styles.portaPressionada,
      ]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <Ionicons name={icone} size={22} color={desligada ? paleta().inkFraco : paleta().cores.verde} />
      <Text style={[styles.tituloPorta, desligada && styles.textoDesligado]}>{titulo}</Text>
      <Text style={styles.detalhePorta}>{detalhe}</Text>
    </Pressable>
  )
}

/* Uma forma de registrar, em lista. Irmã da `Linha` da tela do "+": mesma
   forma, mesmo peso visual, porque é a mesma ação. */
function LinhaForma({
  icone,
  titulo,
  onPress,
  styles,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  onPress: () => void
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linhaForma, pressed && styles.chipPressionado]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <Ionicons name={icone} size={19} color={paleta().cores.verde} />
      <Text style={styles.rotuloForma}>{titulo}</Text>
      <Ionicons name="chevron-forward" size={17} color={paleta().inkFraco} />
    </Pressable>
  )
}

function LinhaItem({ item, onCorrigir }: { item: ItemConsumo; onCorrigir: () => void }) {
  const styles = estilos()
  return (
    /* A linha inteira abre a folha de correção, e é o único jeito de tocar
       nela. Havia um X aqui, de dezesseis pixels, encostado nesta mesma área e
       DENTRO deste mesmo Pressable — apagava na hora, sem volta, e a folha que
       ele abria já tinha um "apagar". Ou seja: o caminho perigoso existia para
       poupar um toque num caminho que já levava ao mesmo lugar.

       Um alvo pequeno colado num alvo grande erra dos dois lados: quem mirava a
       linha apagava o item, e quem mirava o X abria a correção. */
    <Pressable
      onPress={onCorrigir}
      style={({ pressed }) => [styles.linhaItem, pressed && styles.linhaItemPressionada]}
      accessibilityRole="button"
      accessibilityLabel={`Corrigir ${item.nome}`}
    >
      <View style={styles.textoItem}>
        <View style={styles.linhaNomeItem}>
          <Text style={styles.nomeItem} numberOfLines={2}>
            {item.nome}
          </Text>
          {/* O selo só aparece na foto. Busca e plano vêm de tabela; foto é
              chute educado, e o total do dia herda essa diferença. */}
          {item.origem === 'foto' && (
            <View style={styles.seloFoto}>
              <Ionicons name="camera" size={10} color={paleta().cores.verdeEscuro} />
              <Text style={styles.textoSeloFoto}>
                {item.confianca === 'alta' ? 'foto' : `foto · ${item.confianca}`}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.detalheItem}>
          {[item.descricao, horaCurta(new Date(item.comidoEm))].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <Text style={styles.kcalItem}>
        {item.calorias === null ? '—' : `${milhar(item.calorias)}`}
      </Text>

      <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
    </Pressable>
  )
}

/* ── Confirmar a foto ──────────────────────────────────────────────────────
   Nada é gravado antes de a pessoa ver o número. A IA erra em prato composto,
   e um item errado no diário estraga o total do dia até alguém notar. */
function ConfirmarFoto({
  estimativa,
  refeicao,
  onRegistrar,
  onDescartar,
}: {
  estimativa: Estimativa
  refeicao: string
  onRegistrar: () => void
  onDescartar: () => void
}) {
  const styles = estilos()
  const { bottom } = useSafeAreaInsets()

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onDescartar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha}>{estimativa.descricao}</Text>
        {!!estimativa.porcaoEstimada && (
          <Text style={styles.porcaoFolha}>{estimativa.porcaoEstimada}</Text>
        )}

        {/* Número solto, e não um arco: um arco mede progresso contra alguma
            coisa, e aqui não há contra o quê — é um item, não o dia. */}
        <View style={styles.arcoFolha}>
          <Text style={styles.kcalFolha}>
            {estimativa.calorias === null ? '—' : milhar(estimativa.calorias)}
          </Text>
          <Text style={styles.unidadeFolha}>kcal</Text>
        </View>

        <View style={styles.macrosFolha}>
          <MacroFolha rotulo="Proteínas" valor={estimativa.proteinas} />
          <MacroFolha rotulo="Carboidratos" valor={estimativa.carboidratos} />
          <MacroFolha rotulo="Gorduras" valor={estimativa.gorduras} />
        </View>

        {/* A confiança vem da IA e é mostrada como ela respondeu. Esconder um
            "baixa" faria a pessoa tratar o chute como medida. */}
        {estimativa.confianca !== 'alta' && (
          <View style={styles.avisoFolha}>
            <Ionicons name="information-circle-outline" size={16} color={paleta().cores.verdeEscuro} />
            <Text style={styles.textoAvisoFolha}>
              {estimativa.confianca === 'baixa'
                ? 'A imagem ficou difícil de ler — esses números são um palpite grosseiro.'
                : 'Há dúvida sobre o prato ou a porção. Confira antes de registrar.'}
            </Text>
          </View>
        )}

        <Text style={styles.rodapeFolha}>
          Toda estimativa por foto é aproximada. Vai entrar em <Text style={styles.negrito}>{refeicao}</Text>.
        </Text>

        <View style={styles.botoesFolha}>
          <Pressable
            onPress={onDescartar}
            style={({ pressed }) => [styles.botaoDescartar, pressed && styles.botaoDescartarPress]}
            accessibilityRole="button"
          >
            <Text style={styles.textoDescartar}>Descartar</Text>
          </Pressable>

          <Pressable
            onPress={onRegistrar}
            style={({ pressed }) => [styles.botaoRegistrar, pressed && styles.botaoRegistrarPress]}
            accessibilityRole="button"
          >
            <Text style={styles.textoRegistrar}>Registrar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function MacroFolha({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  const styles = estilos()
  return (
    <View style={styles.macroFolha}>
      <Text style={styles.rotuloMacroFolha}>{rotulo}</Text>
      <Text style={styles.valorMacroFolha}>{valor === null ? '—' : `${Math.round(valor)} g`}</Text>
    </View>
  )
}

/* ── Comer do plano ────────────────────────────────────────────────────────*/

function EscolherDoPlano({
  plano,
  onEscolher,
  onFechar,
}: {
  plano: PlanoCompleto
  onEscolher: (r: RefeicaoSalva) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { bottom } = useSafeAreaInsets()
  const comAlimento = plano.refeicoes.filter(r => r.itens.length > 0)

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha}>Qual refeição você comeu?</Text>
        <Text style={styles.porcaoFolha}>Do plano "{plano.nome}"</Text>

        <ScrollView style={styles.listaPlano} bounces={false}>
          {comAlimento.length === 0 ? (
            <Text style={styles.vazio}>
              Nenhuma refeição do seu plano tem alimentos, então não há o que registrar a partir dele.
            </Text>
          ) : (
            comAlimento.map(r => {
              /* Soma pela mesma conversão da gravação: o número que a pessoa vê
                 aqui é o que vai entrar no diário, não uma aproximação dele. */
              const kcal = r.itens.reduce((s, i) => {
                const v = i.gramasTotais === null ? null : porcao(i.caloriasPor100g, i.gramasTotais)
                return s + (v ?? 0)
              }, 0)

              return (
                <Pressable
                  key={r.id}
                  onPress={() => onEscolher(r)}
                  style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
                  accessibilityRole="button"
                  accessibilityLabel={`Registrar ${r.rotulo}`}
                >
                  <View style={styles.horaPlano}>
                    <Text style={styles.textoHoraPlano}>{r.hora}</Text>
                  </View>
                  <View style={styles.textoItem}>
                    <Text style={styles.nomeItem}>{r.rotulo}</Text>
                    <Text style={styles.detalheItem}>
                      {r.itens.length} {r.itens.length === 1 ? 'alimento' : 'alimentos'}
                      {kcal > 0 && ` · ${milhar(kcal)} kcal`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={paleta().inkFraco} />
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </View>
    </View>
  )
}

/* A porta do repetir.
 *
 * Duas listas, e a ordem entre elas é a do esforço: primeiro a refeição inteira
 * de outro dia, que resolve tudo num toque; depois os alimentos avulsos, para
 * quem come quase o mesmo, mas não exatamente.
 *
 * Sem confirmação em nenhuma das duas. O que se grava aqui já foi comido antes
 * pela própria pessoa, e apagar da lista do dia é um toque — pedir "tem
 * certeza?" a cada café da manhã seria devolver o atrito que esta tela existe
 * para tirar. */
function Repetir({
  refeicao,
  buscando,
  ultima,
  frequentes,
  onRepetirUltima,
  onRepetirItem,
  onFechar,
}: {
  refeicao: string
  buscando: boolean
  ultima: UltimaRefeicao | null
  frequentes: ItemFrequente[]
  onRepetirUltima: () => void
  onRepetirItem: (f: ItemFrequente) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { bottom } = useSafeAreaInsets()

  const kcalUltima =
    ultima?.itens.reduce((s, i) => s + (i.calorias ?? 0), 0) ?? 0

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha}>O que você já come</Text>
        <Text style={styles.porcaoFolha}>Em {refeicao.toLowerCase()}</Text>

        {buscando ? (
          <View style={styles.centroRepetir}>
            <ActivityIndicator color={paleta().cores.verde} />
          </View>
        ) : (
          <ScrollView style={styles.listaPlano} bounces={false}>
            {ultima && (
              <Pressable
                onPress={onRepetirUltima}
                style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
                accessibilityRole="button"
                accessibilityLabel={`Repetir ${refeicao} de ${diaRelativo(ultima.data)}`}
              >
                <View style={styles.horaPlano}>
                  <Ionicons name="repeat-outline" size={18} color={paleta().cores.verde} />
                </View>
                <View style={styles.textoItem}>
                  <Text style={styles.nomeItem}>Repetir a de {diaRelativo(ultima.data)}</Text>
                  <Text style={styles.detalheItem}>
                    {ultima.itens.length} {ultima.itens.length === 1 ? 'item' : 'itens'}
                    {kcalUltima > 0 && ` · ${milhar(kcalUltima)} kcal`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={paleta().inkFraco} />
              </Pressable>
            )}

            {frequentes.length > 0 && (
              <Text style={styles.subtituloRepetir}>Seus mais frequentes</Text>
            )}

            {frequentes.map(f => (
              <Pressable
                key={f.chave}
                onPress={() => onRepetirItem(f)}
                style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
                accessibilityRole="button"
                accessibilityLabel={`Adicionar ${f.nome}`}
              >
                <View style={styles.horaPlano}>
                  <Text style={styles.textoHoraPlano}>{f.vezes}×</Text>
                </View>
                <View style={styles.textoItem}>
                  <Text style={styles.nomeItem} numberOfLines={1}>
                    {f.nome}
                  </Text>
                  <Text style={styles.detalheItem} numberOfLines={1}>
                    {f.descricao ? `${f.descricao} · ` : ''}
                    {f.calorias === null ? 'sem caloria' : `${milhar(f.calorias)} kcal`}
                  </Text>
                </View>
                <Ionicons name="add" size={20} color={paleta().cores.verde} />
              </Pressable>
            ))}

            {!ultima && frequentes.length === 0 && (
              <Text style={styles.vazio}>
                Você ainda não registrou nada em {refeicao.toLowerCase()}. Depois do primeiro
                registro, o que se repetir aparece aqui para você repetir num toque.
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  )
}

/* "ontem" pesa mais que "25/08" para quem está olhando o próprio dia. Além de
   anteontem a data volta a ser mais clara que a contagem — "há 9 dias" obriga a
   fazer a conta de cabeça. */
function diaRelativo(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const alvo = new Date(ano, mes - 1, dia)
  const hoje = new Date()
  const zerar = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((zerar(hoje) - zerar(alvo)) / 86400000)

  if (dias === 1) return 'ontem'
  if (dias === 2) return 'anteontem'
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

/* Corrigir um item já registrado.
 *
 * Três enganos, três saídas. Errar a refeição — o pão do café lançado no almoço
 * porque o relógio já tinha virado — se conserta mudando de grupo. Comer
 * diferente do que se anotou se conserta por proporção. E apagar continua ali,
 * para quando o registro não deveria existir.
 *
 * Antes disto, os três custavam o mesmo: apagar e descrever tudo de novo. Um
 * preço alto para consertar um toque errado, e alto o bastante para a pessoa
 * deixar o diário errado em vez de arrumar. */
function AcoesDoItem({
  item,
  onMover,
  onAjustar,
  onApagar,
  onFechar,
}: {
  item: ItemConsumo
  onMover: (destino: string) => void
  onAjustar: (fator: number) => void
  onApagar: () => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { bottom } = useSafeAreaInsets()

  /* A refeição atual sai da lista de destinos: mover para onde já está não é
     uma opção, é um caminho sem efeito ocupando espaço. */
  const destinos = REFEICOES.filter(r => r !== item.refeicao)

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha} numberOfLines={2}>
          {item.nome}
        </Text>
        <Text style={styles.porcaoFolha}>
          {[item.descricao, item.refeicao].filter(Boolean).join(' · ')}
        </Text>

        <ScrollView style={styles.listaPlano} bounces={false}>
          <Text style={styles.subtituloAcoes}>Comi diferente do que anotei</Text>

          <View style={styles.linhaProporcao}>
            <Pressable
              onPress={() => onAjustar(0.5)}
              style={({ pressed }) => [styles.botaoProporcao, pressed && styles.chipPressionado]}
              accessibilityRole="button"
              accessibilityLabel="Comi metade"
            >
              <Text style={styles.textoProporcao}>Comi metade</Text>
            </Pressable>
            <Pressable
              onPress={() => onAjustar(2)}
              style={({ pressed }) => [styles.botaoProporcao, pressed && styles.chipPressionado]}
              accessibilityRole="button"
              accessibilityLabel="Comi o dobro"
            >
              <Text style={styles.textoProporcao}>Comi o dobro</Text>
            </Pressable>
          </View>

          <Text style={styles.subtituloAcoes}>Era outra refeição</Text>

          {destinos.map(destino => (
            <Pressable
              key={destino}
              onPress={() => onMover(destino)}
              style={({ pressed }) => [styles.refeicaoPlano, pressed && styles.chipPressionado]}
              accessibilityRole="button"
              accessibilityLabel={`Mover para ${destino}`}
            >
              <View style={styles.horaPlano}>
                <Ionicons name="arrow-forward" size={16} color={paleta().cores.verde} />
              </View>
              <View style={styles.textoItem}>
                <Text style={styles.nomeItem}>{destino}</Text>
              </View>
            </Pressable>
          ))}

          <Pressable
            onPress={onApagar}
            style={({ pressed }) => [styles.botaoApagarItem, pressed && styles.chipPressionado]}
            accessibilityRole="button"
            accessibilityLabel={`Apagar ${item.nome}`}
          >
            <Ionicons name="trash-outline" size={16} color={paleta().cores.erroTexto} />
            <Text style={styles.textoApagarItem}>Apagar do diário</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({

  blocoPendentes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: t.cores.atencaoFundo,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  textoPendentes: { flex: 1, fontSize: 12.5, color: t.cores.ink, lineHeight: 18 },
  linhaItemPressionada: { opacity: 0.65 },
  subtituloAcoes: {
    fontSize: 12,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  linhaProporcao: { flexDirection: 'row', gap: 10 },
  botaoProporcao: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  textoProporcao: { fontSize: 14, fontWeight: '700', color: t.cores.ink },
  botaoApagarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  textoApagarItem: { fontSize: 14, fontWeight: '700', color: t.cores.erroTexto },

  tela: { flex: 1, backgroundColor: t.cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centroRepetir: { paddingVertical: 40, alignItems: 'center' },
  subtituloRepetir: {
    fontSize: 12,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },

  /* ── Cartão do dia ── */
  cartaoDia: { borderRadius: 20, backgroundColor: t.cores.verde, padding: 18 },
  linhaTituloDia: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tituloDia: { flex: 1, fontSize: 15, fontWeight: '700', color: t.cores.branco },
  linhaValorDia: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 8 },
  valorDia: { fontSize: 40, fontWeight: '800', color: t.cores.branco, letterSpacing: -1.4 },
  unidadeDia: { fontSize: 15, fontWeight: '700', color: t.cores.branco },
  metaDia: { marginLeft: 4, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  trilhoDia: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    marginTop: 12,
  },
  preenchimentoDia: { height: '100%', borderRadius: 4, backgroundColor: t.cores.branco },
  rodapeDia: { marginTop: 10, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.92)' },
  avisoDia: { marginTop: 6, fontSize: 11.5, lineHeight: 16, color: 'rgba(255,255,255,0.8)' },

  macrosDia: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  macroDia: { flex: 1 },
  rotuloMacroDia: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  valorMacroDia: { marginTop: 2, fontSize: 15, fontWeight: '800', color: t.cores.branco },
  metaMacroDia: { fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  /* ── Blocos ── */
  bloco: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 10,
  },
  linhaTituloBloco: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloBloco: { flex: 1, fontSize: 15, fontWeight: '800', color: t.cores.ink },
  kcalGrupo: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio },
  vazio: { fontSize: 12.5, lineHeight: 18, color: t.inkSuave },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  chipAtivo: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  chipPressionado: { backgroundColor: t.cores.verdeClaro, borderColor: t.cores.verdeClaro },
  textoChip: { fontSize: 12.5, fontWeight: '700', color: t.cores.ink },
  textoChipAtivo: { color: t.cores.branco },

  /* ── Portas ── */
  /* Duas por linha, e não quatro lado a lado. Com três cabia; a quarta
     espremeu todas, e "Do meu plano" — o rótulo mais longo — passou a sair do
     enquadramento. Numa tela de telefone, quatro colunas dão menos de 80
     pontos por porta, que não sustenta nem o texto nem o alvo do dedo. */
  portas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  porta: {
    /* Base de 47% para caberem duas por linha com o vão de 10 entre elas, e
       crescendo para dividir a sobra por igual. */
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  portaPressionada: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verdeClaro },
  portaDesligada: { opacity: 0.55 },
  tituloPorta: { fontSize: 13, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
  textoDesligado: { color: t.inkFraco },
  detalhePorta: { fontSize: 10.5, color: t.inkSuave, textAlign: 'center' },
  barraRetorno: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.verde,
  },
  barraRetornoFechou: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoRetorno: { flex: 1, fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  textoRetornoFechou: { color: t.cores.sobreLimao },

  listaFormas: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
    overflow: 'hidden',
    marginTop: 10,
  },
  linhaForma: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rotuloForma: { flex: 1, fontSize: 15, fontWeight: '600', color: t.cores.ink },
  maisFormas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoMaisFormas: { fontSize: 13.5, fontWeight: '600', color: t.inkSuave },

  dicaPortas: { marginTop: -6, fontSize: 11, lineHeight: 15, color: t.inkFraco },

  blocoErro: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  tituloErro: { fontSize: 13.5, fontWeight: '700', color: t.cores.erroTexto },
  detalheErro: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: t.cores.erroTexto },

  /* ── Itens do dia ── */
  linhaItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textoItem: { flex: 1 },
  linhaNomeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nomeItem: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: t.cores.ink },
  seloFoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: t.cores.verdeClaro,
  },
  textoSeloFoto: { fontSize: 9.5, fontWeight: '800', color: t.cores.verdeEscuro },
  detalheItem: { marginTop: 1, fontSize: 11.5, color: t.inkSuave },
  kcalItem: { fontSize: 14, fontWeight: '800', color: t.cores.verde },

  /* ── Véu de análise ── */
  veu: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixaAnalise: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 20,
    backgroundColor: t.cores.fundo,
  },
  textoAnalise: { fontSize: 14, fontWeight: '700', color: t.cores.ink },

  /* ── Folhas ── */
  fundoFolha: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    backgroundColor: t.cores.fundo,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  puxador: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.cores.trilho,
    marginBottom: 14,
  },
  tituloFolha: { fontSize: 19, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
  porcaoFolha: { marginTop: 3, fontSize: 13, color: t.inkSuave },
  arcoFolha: { alignItems: 'center', marginTop: 14, marginBottom: 4 },
  kcalFolha: { fontSize: 26, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.8 },
  unidadeFolha: { fontSize: 12, fontWeight: '600', color: t.inkMedio },
  macrosFolha: { flexDirection: 'row', gap: 8, marginTop: 6 },
  macroFolha: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  rotuloMacroFolha: { fontSize: 11, color: t.inkSuave },
  valorMacroFolha: { marginTop: 2, fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
  avisoFolha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 11,
    borderRadius: 14,
    backgroundColor: t.cores.verdeMenta,
    marginTop: 12,
  },
  textoAvisoFolha: { flex: 1, fontSize: 12, lineHeight: 17, color: t.cores.verdeEscuro },
  rodapeFolha: { marginTop: 12, fontSize: 11.5, lineHeight: 16, color: t.inkFraco },
  negrito: { fontWeight: '800', color: t.inkMedio },

  botoesFolha: { flexDirection: 'row', gap: 10, marginTop: 14 },
  botaoDescartar: {
    paddingHorizontal: 22,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  botaoDescartarPress: { backgroundColor: t.cores.trilho },
  textoDescartar: { fontSize: 15, fontWeight: '700', color: t.inkMedio },
  botaoRegistrar: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verde,
  },
  botaoRegistrarPress: { backgroundColor: t.cores.verdeEscuro },
  textoRegistrar: { fontSize: 15, fontWeight: '700', color: t.cores.branco },

  listaPlano: { marginTop: 12 },
  refeicaoPlano: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
    marginBottom: 8,
  },
  horaPlano: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: t.cores.verdeClaro,
  },
  textoHoraPlano: { fontSize: 11.5, fontWeight: '800', color: t.cores.verdeEscuro },
  }),
)
