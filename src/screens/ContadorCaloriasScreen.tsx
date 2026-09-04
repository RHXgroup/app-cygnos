import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
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
  FRACOES_DA_PORCAO,
  comFator,
  linhasIniciais,
  paraGravar,
  totaisDaFoto,
  viesDaFoto,
  moverDeRefeicao,
  porRefeicao,
  refeicaoPelaHora,
  registrarConsumo,
  totaisConsumidos,
  type Estimativa,
  type ItemDaFoto,
  type LinhaEscolhida,
  type ItemConsumo,
  type ItemFrequente,
  type ItemParaGravar,
  type UltimaRefeicao,
} from '../lib/consumo'
import { enviarPendentes, guardarPendentes, quantosPendentes } from '../lib/pendentes'
import { METAS_VAZIAS, carregarMetas, type Metas } from '../lib/metas'
import { carregarPlanoAtivo, type PlanoCompleto, type RefeicaoSalva } from '../lib/plano'
import { refeicaoDoPlano } from '../lib/refeicaoDoPlano'
import { porcao } from '../lib/alimentos'
import type { AlimentoEscolhido, Nutrientes } from '../lib/plano'
import { horaCurta, milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'
import { Escolha } from '../components/Escolha'
import {
  apagarFotoDoDiario,
  enderecosDasFotos,
  guardarFotoDoDiario,
} from '../lib/fotoDoDiario'
import {
  diferencaDoOriginal,
  escolhidaDe,
  houveTroca,
  proxima,
  totaisDe as totaisDaTroca,
  type ItemComTrocas,
} from '../lib/trocaNoPlano'

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
  /* Onde começa o bloco "como registrar", para tocar numa refeição já
     registrada levar até lá. Ver `escolherRefeicao`. */
  const rolagem = useRef<ScrollView>(null)
  const yDasFormas = useRef(0)

  /* Tocar no bloco de uma refeição escolhe aquela refeição E leva às formas de
     registrar.
   *
   * O defeito: a tela listava "Café da manhã", "Almoço", "Jantar" com o que ela
   * comeu em cada um, e os títulos não eram tocáveis. Quem queria mexer no café
   * da manhã tocava no café da manhã e não acontecia nada — a única forma de
   * escolher estava num seletor acima, fora da vista depois de rolar.
   *
   * E o pior caso era silencioso: às 21h a tela abre em "Jantar" pelo relógio.
   * Quem tocasse no café da manhã e registrasse alguma coisa via aquilo entrar
   * no jantar, sem nada avisando. */
  function escolherRefeicao(r: string) {
    setRefeicao(r)
    rolagem.current?.scrollTo({ y: Math.max(yDasFormas.current - 12, 0), animated: true })
  }

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
  /* As linhas da foto moram AQUI, e não dentro da folha.
   *
   * Porque trocar um item abre a busca de alimentos, que é uma tela inteira por
   * cima — e a folha desmontaria junto, levando as escolhas dela. Com o estado
   * aqui, a pessoa volta da busca e encontra tudo como deixou, com um item a
   * menos de erro. */
  const [linhasDaFoto, setLinhasDaFoto] = useState<LinhaEscolhida[]>([])
  /* Qual item está sendo trocado. Nulo quando ninguém está trocando nada. */
  const [trocandoItem, setTrocandoItem] = useState<number | null>(null)
  /* A imagem que gerou a estimativa, guardada ate ela confirmar.
   *
   * So sobe DEPOIS do Registrar: subir antes encheria o bucket de foto que a
   * pessoa descartou, e ela descarta com frequencia -- e a foto errada e
   * justamente a que a nutricionista nao deveria ver. */
    /* O CAMINHO do arquivo, e não a imagem em texto.
     Guardar a string aqui obrigava a montá-la logo depois da câmera, que é o
     instante em que o Android mata o app por falta de memória — e app morto
     não parece defeito de foto, parece a conversa não carregando.
     `guardarFotoDoDiario` aceita caminho e converte na hora de salvar, quando
     a memória da câmera já voltou. */
  const [caminhoDaFoto, setCaminhoDaFoto] = useState<string | null>(null)
  /* A MESMA imagem em texto que foi mandada para a leitura, guardada para o
     momento de salvar.
     A tela relia o arquivo do zero na hora de gravar, com `fetch('file://')` —
     o caminho que quebrou no SDK 57 e fazia a refeição chegar ao diário SEM
     foto. Guardar são umas trezentas mil letras; reler é uma chance de falhar. */
  const [fotoEmTexto, setFotoEmTexto] = useState<string | null>(null)
  /* Caminho no bucket → endereço assinado. Um mapa, e não um endereço por
     linha: `createSignedUrls` resolve todos de uma vez, e doze fotos seriam
     doze idas à rede na abertura da tela.
   *
   * Endereço assinado VENCE em uma hora (item 7 do AGENTS.md). Por isso ele é
   * ESTADO, refeito quando os itens mudam — e não um valor calculado no render,
   * que ficaria velho numa tela aberta a manhã inteira. */
  const [fotosAbertas, setFotosAbertas] = useState<Map<string, string>>(new Map())
  /* Quantos registros estão esperando a rede voltar. Zero na maioria das
     vezes; quando não é, a tela precisa dizer — senão a pessoa acha que o
     item sumiu. */
  /* As quatro formas menos usadas ficam recolhidas, como no "+". */
  const [maisFormas, setMaisFormas] = useState(false)

  /* PERGUNTA de onde vem a foto, em vez de esconder a galeria num toque longo.
   *
   * Era: tocar abria a câmera, SEGURAR abria a galeria — e uma frase solta lá
   * embaixo, depois de todo o bloco, explicando isso. Dois problemas de uma
   * vez: ninguém segura um botão para descobrir o que acontece, e a explicação
   * estava longe do botão que explicava, num pedaço da tela que já tratava de
   * outro assunto.
   *
   * A pergunta resolve os dois: o caminho aparece sozinho, e a frase deixa de
   * ser necessária. Mesma correção feita na conversa com a nutricionista, pelo
   * mesmo motivo. */
  /* A caixa é a DA CASA, e não o `Alert.alert` do sistema.
   *
   * O Android desenha o Alert com fundo claro, tipografia dele e botões azuis
   * em caixa alta. No meio de um app escuro isso não passa por parte do app:
   * foi lido, literalmente, como "notificação da Samsung" — e a leitura está
   * certa, porque é a caixa do sistema mesmo.
   *
   * `Confirmacao` já dizia isso em comentário e `NutricionistasScreen`
   * registrava que aquele tinha sido o ÚLTIMO Alert.alert do app. Eu escrevi
   * dois novos no mesmo dia. Agora existe `Escolha` para pergunta com mais de
   * duas saídas, que era o buraco que me fez pegar o atalho. */
  const [escolhendoFoto, setEscolhendoFoto] = useState(false)
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
      /* A estimativa da foto vem por cima de tudo, inclusive das portas.
         A imagem sai junto: sao centenas de quilobytes em memoria, e voltar
         precisa deixar a tela como o "Descartar" deixa -- dois caminhos de
         saida que limpam coisas diferentes e como um deles vira defeito. */
      if (estimativa) {
        setEstimativa(null)
        setCaminhoDaFoto(null)
            setFotoEmTexto(null)
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

  async function gravar(novos: ItemParaGravar[], imagemBase64?: string | null) {
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
      fotoPath: n.fotoPath ?? null,
      id: `${PROVISORIO}${quando.getTime()}-${i}`,
      comidoEm: quando.toISOString(),
    }))
    setItens(atuais => [...atuais, ...provisorios])

    /* A foto sobe ANTES do insert, porque o caminho dela e uma coluna da
       linha. Devolve null se falhar -- item 11: a foto e acessorio, e o item
       precisa entrar no diario de qualquer jeito. Perder o registro por causa
       de uma imagem seria trocar o essencial pelo acessorio. */
    const caminho = imagemBase64 ? await guardarFotoDoDiario(contaId, imagemBase64) : null
    const comFoto = caminho
      ? novos.map(n => (n.origem === 'foto' ? { ...n, fotoPath: caminho } : n))
      : novos

    const r = await registrarConsumo(contaId, comFoto, quando)

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
    apagarDeVerdade: async item => {
      const falha = await apagarConsumo(item.id)
      /* A imagem sai junto. Foto orfa ocupa espaco para sempre e ninguem vai
         procura-la depois. So depois de a linha sair de verdade: apagar a
         imagem primeiro deixaria um item sem foto se o apagar falhasse. */
      if (!falha) await apagarFotoDoDiario(item.fotoPath)
      return falha
    },
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

    /* O QUE ELA COSTUMA COMER NESTA REFEICAO vai junto com a foto.
     *
     * E a vantagem que nenhum concorrente pode copiar: eles adivinham do zero
     * toda vez. Aqui o app sabe que as 12:30 ela come arroz, feijao e frango,
     * porque ela repetiu.
     *
     * A trava contra a ancoragem mora na funcao do servidor: a foto e a
     * verdade, a lista e so pista. Uma feijoada continua sendo feijoada mesmo
     * que o habito dela seja salada -- e a tela DIZ quando o habito foi usado,
     * para ela poder desmentir. */
    /* E o PLANO dela para esta refeicao, quando existe.
     *
     * Sinal mais forte que o habito: o habito diz o que ela repetiu, o plano
     * diz o que a nutricionista montou. As travas contra a ancoragem sao as
     * mesmas, e moram na funcao do servidor. */
    /* Comparacao NORMALIZADA, e nao `rotulo === refeicao`.
     *
     * Os dois lados vem de lugares diferentes: `refeicao` sai da lista fechada
     * de seis que a tela oferece, e `rotulo` e texto livre que a nutricionista
     * escreveu no sistema dela. "Almoco " com espaco, "almoco" em minuscula,
     * "Almoco 12h" -- nenhum casava, e falhava CALADO: a foto continuava
     * funcionando, so que sem o sinal mais forte que o app tinha. */
    const doPlano = refeicaoDoPlano(plano?.refeicoes, refeicao)?.itens.map(i => i.nome) ?? []

    /* E para que lado ela costuma corrigir.
     *
     * Devolve null sem sinal e com menos de cinco correcoes -- e sem ele a
     * estimativa sai como saia antes, que e o comportamento aceitavel. Por isso
     * nao vale segurar a foto esperando: vai junto, e pronto. */
    const fatorMedioDeCorrecao = await viesDaFoto()

    const r = await analisarFoto(origem, {
      refeicao,
      costuma: frequentes.map(f => f.nome),
      doPlano,
      fatorMedioDeCorrecao,
    })
    setAnalisando(false)

    if (r.tipo === 'erro') setErro(r.mensagem)
    else if (r.tipo === 'ok') {
      setEstimativa(r.estimativa)
      setLinhasDaFoto(linhasIniciais(r.estimativa))
      setCaminhoDaFoto(r.uri)
      setFotoEmTexto(r.base64)
    }
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

  /* A refeição escolhida do plano, no passo de conferir e trocar.
   *
   * Antes, escolher a refeição GRAVAVA direto os itens principais — e as
   * variações que a nutricionista cadastrou eram ignoradas justamente no
   * momento em que serviriam. Quem não gostou do que estava no plano não comia,
   * ou comia e não registrava; plano rígido não é seguido, é abandonado. */
  const [aConferir, setAConferir] = useState<{
    rotulo: string
    itens: ItemComTrocas[]
  } | null>(null)

  function comerDoPlano(r: RefeicaoSalva) {
    setPorta(null)
    /* A primeira opção é SEMPRE a que a nutricionista pôs como principal — é o
       que `escolhida: 0` significa em toda a lib, inclusive no cálculo da
       diferença. */
    setAConferir({
      rotulo: r.rotulo,
      itens: r.itens.map(i => ({
        opcoes: [i, ...i.variacoes].map(o => ({
          id: o.id,
          nome: o.nome,
          descricao: o.descricao,
          alimentoId: o.alimentoId,
          caloriasPor100g: o.caloriasPor100g,
          proteinasPor100g: o.proteinasPor100g,
          carboidratosPor100g: o.carboidratosPor100g,
          gordurasPor100g: o.gordurasPor100g,
          fibrasPor100g: o.fibrasPor100g,
          gramasTotais: o.gramasTotais,
        })),
        escolhida: 0,
      })),
    })
  }

  /* Grava o que ela CONFIRMOU, e não o que o plano previa.
   *
   * O rótulo gravado é o DO PLANO ("Pré-treino"), e não o da faixa lá em cima:
   * quem registra o pré-treino do plano comeu o pré-treino, mesmo que o relógio
   * ache que é hora do almoço. */
  function confirmarDoPlano() {
    const escolha = aConferir
    if (!escolha) return
    setAConferir(null)
    /* REUSA `doPlano`, a mesma conversao que a versao anterior usava. Escrever
       a conta de novo aqui criaria duas implementacoes do mesmo assunto, que
       sempre divergem -- item 5 do AGENTS.md. E o numero que a folha mostrou
       tem de ser exatamente o que entra no diario. */
    gravar(
      escolha.itens
        .map(i => escolhidaDe(i))
        .filter((o): o is NonNullable<typeof o> => o !== null)
        .map(o => doPlano(o, escolha.rotulo)),
    )
  }

  /* ── ACIMA de qualquer retorno antecipado ───────────────────────────────
   * O React exige a MESMA sequência de hooks em toda renderização. Um hook
   * abaixo de um `if (...) return` não roda numa passada e roda na seguinte, e
   * o app cai inteiro com "Rendered more hooks than during the previous
   * render" — depois de a tela ter aberto uma vez, que é o que faz o defeito
   * parecer outra coisa.
   *
   * O `tsc` não pega: ordem de hook é regra do React, e não do tipo. */
  /* Os enderecos assinados, refeitos quando a lista muda.
     Nao no render: assinar e ida a rede, e render acontece muitas vezes. */
  useEffect(() => {
    let vivo = true
    const caminhos = itens.map(i => i.fotoPath).filter((c): c is string => !!c)
    if (caminhos.length === 0) {
      setFotosAbertas(new Map())
      return
    }
    enderecosDasFotos(caminhos).then(m => {
      if (vivo) setFotosAbertas(m)
    })
    return () => {
      vivo = false
    }
  }, [itens])

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

  /* TROCAR um item da foto.
   *
   * A IA acerta o arroz e a batata e erra o prato principal — leu um filé à
   * parmegiana como "frango assado, coxa e sobrecoxa". Sem esta saída, a pessoa
   * só podia APAGAR o item e perder também o peso e as calorias que ela teria
   * de digitar de novo.
   *
   * A busca devolve o alimento de TABELA, com número de verdade: o que entra no
   * lugar deixa de ser estimativa e passa a ser medida. */
  if (trocandoItem !== null) {
    return (
      <BuscarAlimentoScreen
        refeicao={refeicao}
        motivo="consumo"
        onAdicionar={a => {
          const indice = trocandoItem
          setTrocandoItem(null)

          /* ── ACRESCENTAR o que a leitura não viu ────────────────────────
           *
           * A IA erra por omissão tanto quanto por troca: num prato feito
           * fotografado aqui, a farofa simplesmente não apareceu na lista. A
           * folha deixava tirar e trocar, e não deixava pôr — então quem via a
           * falta tinha de descartar a foto inteira e registrar tudo à mão.
           *
           * Índice além do fim quer dizer acréscimo. O MESMO caminho da troca,
           * de propósito: os dois terminam numa linha com nome, porção e
           * nutrientes, e um segundo fluxo divergiria do primeiro no dia em que
           * um dos dois mudasse.
           *
           * `fator: 1` porque o número veio de tabela, e não de chute — não há
           * o que corrigir. */
          if (indice >= linhasDaFoto.length) {
            setLinhasDaFoto(atuais => [
              ...atuais,
              {
                item: { nome: a.nome, porcaoEstimada: a.descricao, ...absolutos(a) },
                fator: 1,
                dentro: true,
              },
            ])
            return
          }

          setLinhasDaFoto(atuais =>
            atuais.map((l, i) =>
              i === indice
                ? {
                    /* Volta inteiro e sem correção: o número novo veio de
                       tabela, e a fração que ela tinha escolhido era sobre a
                       porção que a IA chutou — aplicá-la aqui reescalaria uma
                       medida boa por causa de um chute que saiu. */
                    item: {
                      nome: a.nome,
                      porcaoEstimada: a.descricao,
                      ...absolutos(a),
                    },
                    fator: 1,
                    dentro: true,
                  }
                : l,
            ),
          )
        }}
        onFechar={() => setTrocandoItem(null)}
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
          ref={rolagem}
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
          <View
            style={styles.portas}
            onLayout={e => {
              yDasFormas.current = e.nativeEvent.layout.y
            }}
          >
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
              onPress={() => !analisando && setEscolhendoFoto(true)}
            />
            <Porta
              icone="nutrition-outline"
              titulo="Do meu plano"
              detalhe={plano ? 'Um toque' : 'Sem plano'}
              desligada={!plano}
              onPress={() => setPorta('plano')}
            />
          </View>

          {/* O CABEÇALHO fica, aberto ou fechado.
           *
           * Era `maisFormas ? <lista> : <botão>`: abrir trocava o botão pela
           * lista, e com o botão sumia o único jeito de fechar de novo. Quem
           * abria por curiosidade ficava com as quatro linhas na tela para
           * sempre.
           *
           * Interruptor que só liga não é interruptor. */}
          <Pressable
            onPress={() => setMaisFormas(m => !m)}
            style={({ pressed }) => [styles.maisFormas, pressed && styles.chipPressionado]}
            accessibilityRole="button"
            accessibilityState={{ expanded: maisFormas }}
            accessibilityLabel="Outras formas de registrar"
          >
            <Text style={styles.textoMaisFormas}>Outras formas de registrar</Text>
            <Ionicons
              name={maisFormas ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={paleta().inkSuave}
            />
          </Pressable>

          {maisFormas && (
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
          )}


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
                {/* O título inteiro é tocável, e é o conserto do defeito que
                    quem usou relatou: "clico e não direciona certo para a
                    refeição que eu queria mudar". Ele escolhe a refeição e leva
                    às formas de registrar, num toque. */}
                <Pressable
                  onPress={() => escolherRefeicao(g.refeicao)}
                  style={({ pressed }) => [styles.linhaTituloBloco, pressed && styles.tituloPressionado]}
                  accessibilityRole="button"
                  accessibilityLabel={`Adicionar em ${g.refeicao}`}
                >
                  <Text style={styles.tituloBloco}>{g.refeicao}</Text>
                  <Text style={styles.kcalGrupo}>
                    {(() => {
                      const t = totaisConsumidos(g.itens)
                      return t.calorias === null ? '—' : `${milhar(t.calorias)} kcal`
                    })()}
                  </Text>
                  <View style={styles.maisNoGrupo}>
                    <Ionicons name="add" size={15} color={paleta().cores.verde} />
                  </View>
                </Pressable>

                {/* ── UMA FOTO POR PRATO, e não uma por item ──────────────
                    Um prato com seis alimentos virava seis linhas com a MESMA
                    miniatura repetida, uma embaixo da outra. Além de feio, era
                    informação errada: parecia seis fotos, quando foi uma.

                    Agora a foto aparece uma vez, grande, encabeçando os itens
                    que saíram dela — que é o que ela é: o registro do prato, e
                    não um ícone de cada alimento. */}
                {blocosDoGrupo(g.itens).map(b =>
                  b.foto ? (
                    <View key={b.chave} style={styles.pratoDaFoto}>
                      {fotosAbertas.get(b.foto) && (
                        <FotoDoPrato uri={fotosAbertas.get(b.foto) as string} />
                      )}
                      {b.itens.map(i => (
                        <LinhaItem key={i.id} item={i} foto={null} onCorrigir={() => abrirAcoes(i)} />
                      ))}
                    </View>
                  ) : (
                    b.itens.map(i => (
                      <LinhaItem
                        key={i.id}
                        item={i}
                        foto={null}
                        onCorrigir={() => abrirAcoes(i)}
                      />
                    ))
                  ),
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Confirmar a estimativa da foto ── */}
      {estimativa && (
        <ConfirmarFoto
          foto={caminhoDaFoto}
          estimativa={estimativa}
          linhas={linhasDaFoto}
          onLinhas={setLinhasDaFoto}
          onTrocar={setTrocandoItem}
          refeicao={refeicao}
          onDescartar={() => {
            setEstimativa(null)
            setCaminhoDaFoto(null)
            setFotoEmTexto(null)
          }}
          onRegistrar={linhas => {
            const imagem = fotoEmTexto
            const confianca = estimativa.confianca
            setEstimativa(null)
            setCaminhoDaFoto(null)
            setFotoEmTexto(null)
            /* UMA linha por alimento, e nao um bloco.
               Todas dividem a MESMA foto: `gravar` sobe a imagem uma vez e
               carimba o caminho em todo item de origem 'foto'. E o que faz a
               nutricionista poder comentar o arroz sem mexer no frango.
               A pessoa nao espera por isso: a lista otimista ja mostrou os
               itens antes de a rede responder. */
            gravar(
              paraGravar(linhas).map(({ item, fatorCorrecao }) => ({
                refeicao,
                nome: item.nome,
                descricao: item.porcaoEstimada || null,
                calorias: item.calorias,
                proteinas: item.proteinas,
                carboidratos: item.carboidratos,
                gorduras: item.gorduras,
                fibras: item.fibras,
                origem: 'foto' as const,
                /* A confianca e do CONJUNTO: a IA olhou uma foto so, e dividir
                   a duvida por item seria inventar uma precisao que ela nao
                   declarou. */
                confianca,
                /* O sinal mais valioso que existe, e que ia fora: quanto ela
                   corrigiu a estimativa DESTE item. */
                fatorCorrecao,
              })),
              imagem,
            )
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

      {/* CONFERIR E TROCAR, antes de gravar. */}
      {aConferir && (
        <ConferirDoPlano
          rotulo={aConferir.rotulo}
          itens={aConferir.itens}
          onTrocar={indice =>
            setAConferir(a =>
              a === null
                ? a
                : { ...a, itens: a.itens.map((i, n) => (n === indice ? proxima(i) : i)) },
            )
          }
          onConfirmar={confirmarDoPlano}
          onFechar={() => setAConferir(null)}
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

      <Escolha
        visivel={escolhendoFoto}
        titulo="Foto do prato"
        mensagem="Eu leio a foto e estimo o que tem nela. Você confere antes de entrar no diário."
        opcoes={[
          {
            rotulo: 'Tirar agora',
            detalhe: 'Abre a câmera',
            icone: 'camera-outline',
            onEscolher: () => void fotografar('camera'),
          },
          {
            rotulo: 'Escolher da galeria',
            detalhe: 'Uma foto que você já tirou',
            icone: 'images-outline',
            onEscolher: () => void fotografar('galeria'),
          },
        ]}
        onCancelar={() => setEscolhendoFoto(false)}
      />
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

function LinhaItem({
  item,
  foto,
  onCorrigir,
}: {
  item: ItemConsumo
  /* O endereço assinado, quando já resolveu. Nulo enquanto carrega, ou quando o
     item não tem foto. */
  foto: string | null
  onCorrigir: () => void
}) {
  const styles = estilos()
  /* QUAL endereço falhou, e não um booleano — item 7 do AGENTS.md. Com booleano,
     um endereço novo (a assinatura é renovada de hora em hora) entraria já
     marcado como quebrado e a foto nunca mais voltaria. */
  const [falhou, setFalhou] = useState<string | null>(null)
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
      {/* A MINIATURA.
          Antes a foto era analisada e jogada fora: a nutricionista recebia
          "Arroz, feijão e frango, 620 kcal" — a leitura da IA, e não o prato.
          Sem a imagem ela não corrige a porção, não nota o que ficou de fora e
          não comenta.

          Toda <Image> remota precisa de `onError`: sem ele, a que falha não
          desenha nada e sobra um buraco do tamanho dela, que se lê como app
          quebrado — pior do que nunca ter tido foto. */}
      {foto !== null && foto !== falhou && (
        <Image
          source={{ uri: foto }}
          style={styles.miniatura}
          onError={() => setFalhou(foto)}
          accessibilityIgnoresInvertColors
        />
      )}

      <View style={styles.textoItem}>
        {/* O nome ENCOLHE e o selo não.
            Sem isto, nome de duas linhas — "Vinagrete de tomate e cebola" —
            empurrava o selo para cima do número de calorias, e os dois ficavam
            impressos um sobre o outro. */}
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

/* Os itens de um bloco, quebrados em pedaços por foto.
 *
 * Consecutivos e com o MESMO caminho viram um pedaço só. Consecutivos importa:
 * duas fotos do mesmo prato em horas diferentes são dois registros, e juntá-las
 * porque o caminho é igual misturaria o almoço com a janta.
 *
 * Quem não tem foto sai em pedaços de um item, para a lista continuar sendo uma
 * lista simples onde não há prato nenhum. */
function blocosDoGrupo(itens: ItemConsumo[]): { chave: string; foto: string | null; itens: ItemConsumo[] }[] {
  const blocos: { chave: string; foto: string | null; itens: ItemConsumo[] }[] = []
  for (const i of itens) {
    const ultimo = blocos[blocos.length - 1]
    if (i.fotoPath && ultimo?.foto === i.fotoPath) ultimo.itens.push(i)
    else blocos.push({ chave: String(i.id), foto: i.fotoPath ?? null, itens: [i] })
  }
  return blocos
}

/* A foto do prato, do tamanho de uma foto.
 *
 * Miniatura de 40 pixels não mostra prato nenhum — serve para dizer "veio de
 * foto", que é trabalho do selo. Aqui ela existe para a pessoa RECONHECER o que
 * comeu, e para a nutricionista ver a porção. Isso pede largura.
 *
 * `onError` guarda o endereço que falhou, e não um booleano: o endereço vence em
 * uma hora, e um novo tem de entrar tentando de novo. */
function FotoDoPrato({ uri }: { uri: string }) {
  const styles = estilos()
  const [falhou, setFalhou] = useState<string | null>(null)
  if (uri === falhou) return null
  return (
    <Image
      source={{ uri }}
      style={styles.fotoDoPrato}
      onError={() => setFalhou(uri)}
      accessibilityIgnoresInvertColors
      accessibilityLabel="Foto do prato registrado"
    />
  )
}

/* ── Confirmar a foto ──────────────────────────────────────────────────────
 *
 * Nada é gravado antes de a pessoa ver os números. A IA erra em prato composto,
 * e um item errado no diário estraga o total do dia até alguém notar.
 *
 * ── Por que uma LISTA, e não um bloco ─────────────────────────────────────
 * Esta folha mostrava um item só: "Arroz, feijão e frango — 620 kcal". As duas
 * saídas eram ruins — aceitar o bloco inteiro sabendo que o feijão não estava
 * ali, ou descartar a foto e digitar tudo à mão.
 *
 * Com a lista, ela mexe no que está errado e aceita o resto. E a nutricionista,
 * do lado dela, passa a ver "Arroz branco, 4 colheres" em vez de um bloco que
 * não dá para comentar.
 *
 * ── E cada correção é guardada ────────────────────────────────────────────
 * Quando ela diz "comi metade", isso é uma medida dela contra a leitura do
 * modelo, e vira o viés que calibra a próxima foto. Ver `paraGravar`. */
function ConfirmarFoto({
  foto,
  estimativa,
  linhas,
  onLinhas,
  onTrocar,
  refeicao,
  onRegistrar,
  onDescartar,
}: {
  /* O CAMINHO da foto que acabou de ser lida.
     Ela abre a folha, e não some quando a leitura termina: o que a pessoa está
     conferindo é aquele prato, e ver a lista ao lado da imagem é o que permite
     dizer "isso aí não é peixe" sem ter de lembrar o que fotografou. */
  foto: string | null
  estimativa: Estimativa
  /* Controlada de fora: trocar um item abre a busca por cima, a folha desmonta,
     e sem isto ela voltaria zerada. */
  linhas: LinhaEscolhida[]
  onLinhas: (linhas: LinhaEscolhida[]) => void
  onTrocar: (indice: number) => void
  refeicao: string
  /* Recebe as LINHAS, e não os itens já prontos: quem monta o que vai para o
     banco é `paraGravar`, num lugar só. A folha decide o que a pessoa escolheu;
     a conta de reescalar mora na lib, e dois lugares multiplicando o mesmo
     número é como eles divergem. */
  onRegistrar: (linhas: LinhaEscolhida[]) => void
  onDescartar: () => void
}) {
  const styles = estilos()
  const { bottom } = useSafeAreaInsets()

  /* A capa é pequena por necessidade — a lista precisa do espaço. Mas quem
     confere "isso aí é frango ou peixe?" precisa VER, e 132 pontos de altura
     não bastam para decidir. Um toque abre a foto inteira por cima. */
  const [fotoAberta, setFotoAberta] = useState(false)

  /* ── O VOLTAR PRECISA DESCASCAR A FOTO ANTES DA FOLHA ───────────────────
   *
   * Relatado: abrir a foto ampliada e apertar o voltar do aparelho CANCELAVA a
   * importação inteira. A tela de cima trata `estimativa` e joga fora a leitura
   * junto — ela não sabia que existia uma camada nova por cima.
   *
   * É o item 1 do AGENTS.md, e eu criei a camada sem o tratador dela na mesma
   * alteração em que escrevi que ia seguir a regra.
   *
   * SEM lista de dependências, de propósito. O React roda os efeitos do FILHO
   * antes dos do PAI, e o React Native chama os tratadores na ordem inversa do
   * registro — então o pai, registrando por último, ganharia. Re-registrar a
   * cada renderização é o que põe este na frente a partir da primeira
   * re-renderização, que sempre acontece. Não é código morto nem descuido:
   * apagar a lista é o que faz isto funcionar. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fotoAberta) {
        setFotoAberta(false)
        return true
      }
      /* Nada aberto aqui: devolve para a tela de cima, que sabe fechar a folha
         e limpar a estimativa. */
      return false
    })
    return () => sub.remove()
  })

  /* Todos entram marcados, e inteiros. É o caminho comum — a pessoa fotografou
     o que comeu — e obrigá-la a marcar item por item cobraria seis toques de
     quem não tinha nada a corrigir. */
  const mexer = (indice: number, muda: (l: LinhaEscolhida) => LinhaEscolhida) =>
    onLinhas(linhas.map((l, i) => (i === indice ? muda(l) : l)))

  const dentro = linhas.filter(l => l.dentro)
  const totais = totaisDaFoto(dentro.map(l => comFator(l.item, l.fator)))
  const nenhum = dentro.length === 0

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onDescartar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        {/* ── O PRATO ABRE A FOLHA ──────────────────────────────────────
         *
         * A foto sumia no instante em que a leitura terminava, e a pessoa
         * ficava conferindo uma lista de nomes sem ter ao lado o que foi
         * fotografado. Ver "filé de peixe" com o frango na tela é o que
         * permite corrigir; ver só a palavra obriga a lembrar.
         *
         * O total vai SOBRE a imagem, e não abaixo dela: é a resposta da
         * pergunta que a pessoa tem ao fotografar, e ali ela é a primeira
         * coisa que se lê.
         *
         * O véu escuro embaixo não é enfeite — é o que garante que o número
         * branco se leia sobre QUALQUER foto, inclusive um prato claro com
         * luz de janela. Sem ele o texto some em metade dos pratos. */}
        {foto ? (
          <Pressable
            style={styles.capaFolha}
            onPress={() => setFotoAberta(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel="Ver a foto inteira"
          >
            <Image source={{ uri: foto }} style={styles.capaImagem} resizeMode="cover" />
            <LinearGradient
              colors={['rgba(20,24,14,0)', 'rgba(20,24,14,0.45)', 'rgba(20,24,14,0.88)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.capaTextos}>
              <View style={styles.capaEsquerda}>
                <Text style={styles.capaTitulo} numberOfLines={1}>
                  {estimativa.descricao}
                </Text>
                <Text style={styles.capaSub} numberOfLines={1}>
                  {estimativa.itens.length === 1
                    ? 'Confira antes de registrar'
                    : `${estimativa.itens.length} alimentos · toque no nome para trocar`}
                </Text>
              </View>
              <View>
                <Text style={styles.capaKcal}>
                  {totais.calorias === null ? '—' : milhar(totais.calorias)}
                </Text>
                <Text style={styles.capaUnidade}>kcal</Text>
              </View>
            </View>
            <View style={styles.puxadorSobreFoto} />
            {/* A lupa diz que dá para tocar. Sem ela a capa parece decoração,
                e ninguém toca em decoração. */}
            <View style={styles.lupaDaCapa}>
              <Ionicons name="expand-outline" size={15} color="#FFFFFF" />
            </View>
          </Pressable>
        ) : (
          <>
            <View style={styles.puxador} />
            <Text style={styles.tituloFolha}>{estimativa.descricao}</Text>
            <Text style={styles.porcaoFolha}>
              {estimativa.itens.length === 1
                ? 'Confira antes de registrar.'
                : `${estimativa.itens.length} alimentos · toque no nome para trocar`}
            </Text>
          </>
        )}

        {/* A LISTA rola; o total e os botões ficam parados embaixo.
            Sem isso, um prato de oito itens empurraria o "Registrar" para fora
            da folha — e o botão que some é o botão que não existe. */}
        <ScrollView
          style={styles.listaDaFoto}
          contentContainerStyle={styles.listaDaFotoConteudo}
          keyboardShouldPersistTaps="handled"
        >
          {linhas.map((l, i) => (
            <LinhaDaFoto
              key={`${l.item.nome}-${i}`}
              linha={l}
              ultimo={i === linhas.length - 1}
              onFracao={fator => mexer(i, x => ({ ...x, fator }))}
              onAlternar={() => mexer(i, x => ({ ...x, dentro: !x.dentro }))}
              onTrocar={() => onTrocar(i)}
            />
          ))}

        {/* O TOTAL repetido embaixo SÓ quando não há capa.
            Com a foto no topo ele já está lá, grande, e mostrar duas vezes o
            mesmo número numa folha curta faz a pessoa procurar a diferença
            entre os dois. */}
        {!foto && (
          <View style={styles.arcoFolha}>
            <Text style={styles.kcalFolha}>
              {totais.calorias === null ? '—' : milhar(totais.calorias)}
            </Text>
            <Text style={styles.unidadeFolha}>kcal no total</Text>
          </View>
        )}

        <View style={styles.macrosFolha}>
          <MacroFolha rotulo="Proteínas" valor={totais.proteinas} />
          <MacroFolha rotulo="Carboidratos" valor={totais.carboidratos} />
          <MacroFolha rotulo="Gorduras" valor={totais.gorduras} />
        </View>

        {/* Item 6: o que a IA não soube dizer fica de fora da soma, e a folha
            DIZ isso. Um total que parece completo e está por baixo é pior do
            que um total que se explica. */}
        {totais.semCalorias > 0 && (
          <Text style={styles.rodapeFolha}>
            {totais.semCalorias === 1
              ? 'Um item ficou sem caloria — o total sai por baixo.'
              : `${totais.semCalorias} itens ficaram sem caloria — o total sai por baixo.`}
          </Text>
        )}

        {/* O que foi CONSIDERADO, e nao so o que foi respondido.
            Contexto que age escondido e erra e o pior dos dois mundos: sem ele
            o erro e aleatorio e a pessoa desconfia; com ele o erro fica
            plausivel, bate com o habito dela, e passa. */}
        {estimativa.usouContexto && (
          <View style={styles.avisoContexto}>
            <Ionicons name="repeat" size={15} color={paleta().inkMedio} />
            <Text style={styles.textoAvisoContexto}>
              Considerei o que voce costuma comer neste horario. Se o prato for outro, troque
              antes de registrar.
            </Text>
          </View>
        )}

        {/* A confiança vem da IA e é mostrada como ela respondeu. Esconder um
            "baixa" faria a pessoa tratar o chute como medida. */}
        {estimativa.confianca !== 'alta' && (
          <View style={styles.avisoFolha}>
            <Ionicons name="information-circle-outline" size={16} color={paleta().cores.verdeEscuro} />
            <Text style={styles.textoAvisoFolha}>
              {estimativa.confianca === 'baixa'
                ? 'A imagem ficou difícil de ler — esses números são um palpite grosseiro.'
                : 'Há dúvida sobre os alimentos ou as porções. Confira antes de registrar.'}
            </Text>
          </View>
        )}

        {/* Antes do rodapé e depois da lista: acrescentar é continuar a
            lista, e um "adicionar" no fim de tudo se lê como outra ação. */}
        <Pressable
          onPress={() => onTrocar(linhas.length)}
          style={({ pressed }) => [styles.acrescentarItem, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Acrescentar um alimento que a foto não pegou"
        >
          <Ionicons name="add" size={17} color={paleta().cores.verde} />
          <Text style={styles.textoAcrescentarItem}>Acrescentar um alimento</Text>
        </Pressable>

        <Text style={styles.rodapeFolha}>
          Toda estimativa por foto é aproximada. Vai entrar em <Text style={styles.negrito}>{refeicao}</Text>.
        </Text>
        </ScrollView>

        {/* ── SÓ OS BOTÕES FICAM PARADOS ─────────────────────────────────
         *
         * Macros, aviso e rodapé eram FIXOS abaixo da lista, e espremiam ela
         * numa janela de dois itens. Fotografado no aparelho: a lista mostrava
         * "Vinagrete" e "Cheiro-verde" enquanto o botão dizia "Registrar 6
         * itens" — e nada indicava que havia mais quatro acima. Quem olha
         * conclui que a leitura achou dois alimentos.
         *
         * Agora a folha inteira rola e a lista deixa de ter um teto invisível.
         * Os botões continuam parados porque o "Registrar" que sai da tela é o
         * botão que não existe — foi por isso que a lista foi presa aqui em
         * primeiro lugar, e a solução era soltar o resto, não prender ela. */}
        <View style={styles.botoesFolha}>
          <Pressable
            onPress={onDescartar}
            style={({ pressed }) => [styles.botaoDescartar, pressed && styles.botaoDescartarPress]}
            accessibilityRole="button"
          >
            <Text style={styles.textoDescartar}>Descartar</Text>
          </Pressable>

          {/* Desligado quando ela tirou tudo: registrar nada gravaria uma foto
              sem alimento nenhum, e a folha fecharia como se tivesse dado
              certo. */}
          <Pressable
            onPress={() => !nenhum && onRegistrar(linhas)}
            disabled={nenhum}
            style={({ pressed }) => [
              styles.botaoRegistrar,
              nenhum && styles.botaoRegistrarDesligado,
              pressed && !nenhum && styles.botaoRegistrarPress,
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: nenhum }}
          >
            <Text style={styles.textoRegistrar}>
              {nenhum
                ? 'Nada marcado'
                : dentro.length === 1
                  ? 'Registrar'
                  : `Registrar ${dentro.length} itens`}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── A FOTO INTEIRA ────────────────────────────────────────────────
       *
       * Por cima de tudo, no preto, sem nada além da imagem: quem abriu quer
       * olhar o prato, e qualquer coisa em volta disputa o olhar com o que
       * está sendo conferido.
       *
       * Fecha em QUALQUER toque, e não num "x" no canto: o gesto de quem
       * terminou de olhar é tocar a tela, e procurar um botão é trabalho a
       * mais para desfazer o que a pessoa acabou de fazer. */}
      {fotoAberta && !!foto && (
        <Pressable style={styles.fotoInteira} onPress={() => setFotoAberta(false)}>
          <Image source={{ uri: foto }} style={styles.imagemInteira} resizeMode="contain" />
          <Text style={styles.dicaFechar}>Toque para fechar</Text>
        </Pressable>
      )}
    </View>
  )
}

/* Uma linha da foto: o alimento, quanto dele, e o botão de tirar.
 *
 * As frações ficam SEMPRE visíveis, e não escondidas atrás de um toque na
 * linha. Controle que só aparece depois de descoberto é controle que a maioria
 * nunca encontra — e aqui ele é justamente o que corrige o erro conhecido da
 * tecnologia (±28% na porção). */
function LinhaDaFoto({
  linha,
  ultimo,
  onFracao,
  onAlternar,
  onTrocar,
}: {
  linha: LinhaEscolhida
  /* O último não leva traço embaixo: separador no fim não separa de nada, e
     desenha uma borda solta acima do total. */
  ultimo: boolean
  onFracao: (fator: number) => void
  onAlternar: () => void
  /* Abre a busca para pôr outro alimento no lugar deste. */
  onTrocar: () => void
}) {
  const styles = estilos()
  const t = paleta()
  const mostrado = comFator(linha.item, linha.fator)

  return (
    <View
      style={[styles.itemDaFoto, ultimo && styles.itemDaFotoUltimo, !linha.dentro && styles.itemDaFotoFora]}
    >
      <View style={styles.linhaTopoItem}>
        <Pressable
          style={styles.textosDoItem}
          onPress={onTrocar}
          accessibilityRole="button"
          accessibilityLabel={`Trocar ${linha.item.nome} por outro alimento`}
        >
          {/* O NOME é o botão de trocar.
              A IA acerta o arroz e erra o prato principal, e sem esta saída a
              pessoa só podia apagar o item — perdendo junto o peso e as
              calorias que ela teria de digitar de novo. */}
          <View style={styles.linhaNomeItem}>
            <Text style={styles.nomeDoItem} numberOfLines={2}>
              {mostrado.nome}
            </Text>
            <Ionicons name="swap-horizontal" size={14} color={paleta().inkFraco} />
          </View>
          {!!mostrado.porcaoEstimada && (
            <Text style={styles.porcaoDoItem} numberOfLines={1}>
              {mostrado.porcaoEstimada}
            </Text>
          )}
        </Pressable>

        {/* O NÚMERO grande e a unidade pequena embaixo.
            Antes era "248 kcal" no mesmo corpo do resto do texto — o dado que
            a pessoa procura estava escondido no meio de palavras. Dígitos de
            largura fixa para as linhas alinharem em coluna. */}
        <View style={styles.numeroDoItem}>
          <Text style={styles.kcalDoItem}>
            {linha.dentro ? (mostrado.calorias === null ? '—' : milhar(mostrado.calorias)) : '—'}
          </Text>
          <Text style={styles.unidadeDoItem}>kcal</Text>
        </View>

        {/* Tirar, e devolver. Um item removido continua na lista, apagado: some-lo
            faria a pessoa que errou o toque perder o alimento sem ter como
            voltar, e a foto não pode ser analisada de novo. */}
        <Pressable
          onPress={onAlternar}
          hitSlop={8}
          style={({ pressed }) => [styles.tirarItem, pressed && styles.chipPressionado]}
          accessibilityRole="button"
          accessibilityLabel={linha.dentro ? `Não comi ${linha.item.nome}` : `Devolver ${linha.item.nome}`}
        >
          <Ionicons
            name={linha.dentro ? 'close' : 'add'}
            size={17}
            color={linha.dentro ? t.inkFraco : t.cores.verdeEscuro}
          />
        </Pressable>
      </View>

      {linha.dentro ? (
        /* QUANTO DESTE ITEM ela comeu.
           Frações, e não um controle deslizante: um deslizante devolve 87%, e
           87% de um número que já é aproximado é precisão inventada. Ninguém
           olha um prato e pensa "comi 87%" — pensa "comi metade". */
        <View style={styles.fracoesDoItem}>
          <Text style={styles.rotuloComi}>Comi</Text>
          <View style={styles.trilhaFracoes}>
            {FRACOES_DA_PORCAO.map(f => (
              <Pressable
                key={f.fator}
                onPress={() => onFracao(f.fator)}
                style={({ pressed }) => [
                  styles.fracaoPequena,
                  linha.fator === f.fator && styles.fracaoAtivaPequena,
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: linha.fator === f.fator }}
                /* O rótulo falado continua sendo a FRASE: "½" lido em voz alta
                   não diz nada, e quem usa leitor de tela perde o sentido que
                   a palavra "Comi" devolve para quem enxerga. */
                accessibilityLabel={`Comi ${f.rotulo}`}
              >
                <Text
                  style={[
                    styles.textoFracaoPequena,
                    linha.fator === f.fator && styles.textoFracaoAtivaPequena,
                  ]}
                >
                  {f.curto}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.foraDoItem}>Não entra no registro.</Text>
      )}
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

/* ── Conferir e trocar antes de gravar ─────────────────────────────────────
 *
 * O plano JÁ TINHA variações por item — a nutricionista cadastra alternativas,
 * e a tela de edição as gerencia. Mas registrar gravava sempre o principal, e
 * as trocas dela eram ignoradas justamente onde serviriam.
 *
 * O mecanismo é o do Eat This Much ("troque a refeição e a conta se refaz"), e
 * aqui ele é melhor por uma razão que nenhum concorrente pode copiar: as
 * alternativas vêm da profissional que conhece a pessoa. Já passaram por
 * alergia, preferência e objetivo.
 *
 * ── A conta se refaz NA FRENTE dela ───────────────────────────────────────
 * Trocar sem ver o efeito é trocar no escuro. O total muda a cada toque, e a
 * diferença aparece com sinal — é com esse número na frente que a pessoa
 * aprende, em algumas semanas, o custo das próprias substituições.
 *
 * E a troca cara também é dita. Esconder o "+188 kcal" seria decidir por ela. */
function ConferirDoPlano({
  rotulo,
  itens,
  onTrocar,
  onConfirmar,
  onFechar,
}: {
  rotulo: string
  itens: ItemComTrocas[]
  onTrocar: (indice: number) => void
  onConfirmar: () => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { bottom } = useSafeAreaInsets()
  const t = totaisDaTroca(itens)
  const diferenca = diferencaDoOriginal(itens)

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fundoFolha} onPress={onFechar} />
      <View style={[styles.folha, { paddingBottom: Math.max(bottom, 16) }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloFolha}>{rotulo}</Text>
        <Text style={styles.porcaoFolha}>
          Toque num alimento para ver as trocas que a sua nutricionista deixou.
        </Text>

        <ScrollView style={styles.listaPlano} bounces={false}>
          {itens.map((item, i) => {
            const o = escolhidaDe(item)
            if (o === null) return null
            const temTroca = item.opcoes.length > 1
            const kcal =
              o.gramasTotais === null ? null : porcao(o.caloriasPor100g, o.gramasTotais)

            return (
              <Pressable
                key={`${o.id}-${i}`}
                onPress={() => temTroca && onTrocar(i)}
                disabled={!temTroca}
                style={({ pressed }) => [
                  styles.linhaItem,
                  pressed && temTroca && styles.linhaItemPressionada,
                ]}
                accessibilityRole={temTroca ? 'button' : 'text'}
                accessibilityLabel={
                  temTroca ? `${o.nome}. Tocar para trocar.` : o.nome
                }
              >
                <View style={styles.textoItem}>
                  <View style={styles.linhaNomeItem}>
                    <Text style={styles.nomeItem} numberOfLines={2}>
                      {o.nome}
                    </Text>
                    {/* O selo só aparece onde HÁ troca. Marcar item sem
                        alternativa criaria a expectativa de um toque que não
                        faz nada. */}
                    {temTroca && (
                      <View style={styles.seloTroca}>
                        <Ionicons name="swap-horizontal" size={10} color={paleta().cores.verde} />
                        <Text style={styles.textoSeloTroca}>
                          {item.escolhida + 1}/{item.opcoes.length}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.detalheItem}>
                    {o.gramasTotais === null ? 'sem peso' : `${milhar(o.gramasTotais)} g`}
                  </Text>
                </View>
                <Text style={styles.kcalItem}>{kcal === null ? '—' : milhar(kcal)}</Text>
              </Pressable>
            )
          })}
        </ScrollView>

        <View style={styles.totalTroca}>
          <Text style={styles.rotuloTotalTroca}>Total</Text>
          <Text style={styles.valorTotalTroca}>{milhar(t.calorias)} kcal</Text>
          {/* A diferença só aparece quando houve troca — antes disso não há o
              que comparar, e um "+0 kcal" seria ruído. */}
          {houveTroca(itens) && diferenca !== 0 && (
            <Text style={styles.diferencaTroca}>
              {diferenca > 0 ? '+' : '−'}
              {milhar(Math.abs(diferenca))} kcal
            </Text>
          )}
        </View>

        {/* Item 6 do AGENTS.md: o que não tem caloria conhecida fica de fora da
            soma, e o total DIZ isso. Um total calado sobre o que faltou é um
            total em que não se pode confiar. */}
        {t.semCalorias > 0 && (
          <Text style={styles.rodapeFolha}>
            {t.semCalorias === 1
              ? '1 alimento sem caloria conhecida ficou de fora da soma.'
              : `${t.semCalorias} alimentos sem caloria conhecida ficaram de fora da soma.`}
          </Text>
        )}

        <View style={styles.botoesFolha}>
          <Pressable
            onPress={onFechar}
            style={({ pressed }) => [styles.botaoDescartar, pressed && styles.botaoDescartarPress]}
            accessibilityRole="button"
          >
            <Text style={styles.textoDescartar}>Voltar</Text>
          </Pressable>
          <Pressable
            onPress={onConfirmar}
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
    borderRadius: 12,
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
    borderRadius: 12,
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
  tituloPressionado: { opacity: 0.55 },
  avisoContexto: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    backgroundColor: t.cores.fundo,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  textoAvisoContexto: { flex: 1, fontSize: 11.5, color: t.inkMedio, lineHeight: 16 },
  rotuloPorcao: { fontSize: 12.5, fontWeight: '700', color: t.cores.ink, marginTop: 16 },
  fracoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  fracao: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  fracaoAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },

  /* ── A lista da foto ──
     Um alimento por linha, e não um bloco. A lista rola; o total e os botões
     ficam parados embaixo, senão um prato de oito itens empurraria o
     "Registrar" para fora da folha. */
  /* A LISTA CRESCE, e é ela que fica com o espaço que sobra.
   *
   * Era `flexGrow: 0`: a lista não crescia, encolhia, e todo o resto da folha
   * tinha prioridade sobre ela. Enquanto a folha abria com um título de duas
   * linhas isso passava; com a capa da foto de 168 pontos em cima, sobrou UM
   * item e meio à vista, de seis — fotografado no aparelho.
   *
   * O que se confere aqui é a lista. Tudo o mais — total, macros, avisos,
   * botões — é moldura, e moldura não pode ganhar espaço da coisa. */
  listaDaFoto: { marginTop: 12, flexGrow: 1, flexShrink: 1 },
  listaDaFotoConteudo: { gap: 8, paddingBottom: 2 },
  /* ── A CAPA: o prato fotografado abre a folha ────────────────────────
     Curta de propósito: o que se confere é a lista, não a imagem.

     Nasceu com 168 e um comentário meu afirmando que "ainda deixa três
     alimentos à vista". Era palpite, e a foto do aparelho desmentiu — deixava
     um e meio, de seis. 132 devolve dois itens inteiros, e junto com o
     `flexGrow` da lista a folha volta a servir para conferir.

     Ainda mostra o prato inteiro: foto de comida é quase sempre mais larga que
     alta, e o que se corta em 132 é a toalha da mesa. */
  /* As margens negativas TÊM de casar com o recuo da folha, que é 20 nas
     laterais e 10 em cima. Um número diferente deixa uma faixa do fundo
     aparecendo dos lados da imagem, e ela se lê como defeito de carregamento.
     E o topo precisa do mesmo arredondamento da folha, senão a foto vaza os
     cantos — com `overflow: 'hidden'`, que é o que faz o corte valer. */
  capaFolha: {
    height: 132,
    marginHorizontal: -20,
    marginTop: -10,
    marginBottom: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  capaImagem: { width: '100%', height: '100%' },
  lupaDaCapa: {
    position: 'absolute',
    top: 12,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(20,24,14,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoInteira: {
    /* Escrito à mão, e não `StyleSheet.absoluteFillObject`: ele foi REMOVIDO
       no React Native 0.86, que veio com o SDK 57. O `absoluteFill` que ficou
       é um id registrado, e não um objeto — espalhar ele com `...` não copia
       nada e o resultado é um bloco sem posição, que desenha no meio do fluxo
       em vez de por cima da tela. */
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,6,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagemInteira: { width: '100%', height: '82%' },
  dicaFechar: {
    position: 'absolute',
    bottom: 34,
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  capaTextos: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 13,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  capaEsquerda: { flex: 1, minWidth: 0 },
  capaTitulo: { fontSize: 19, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  capaSub: { marginTop: 2, fontSize: 11.5, color: 'rgba(255,255,255,0.75)' },
  capaKcal: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 34,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  capaUnidade: {
    fontSize: 9.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.68)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'right',
    marginTop: 2,
  },
  /* O puxador some sobre a foto e vira branco: preto sobre imagem escura
     desaparece, e sem ele a folha perde o sinal de que dá para arrastar. */
  puxadorSobreFoto: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },

  /* LINHA, e não caixa.
     Seis cartões com contorno viram uma grade, e a grade compete com a foto
     que agora abre a folha. Um traço fino separa tão bem quanto e não pesa —
     o último não tem traço, porque separador no fim não separa de nada. */
  itemDaFoto: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.cores.borda },
  itemDaFotoUltimo: { borderBottomWidth: 0 },
  /* Tirado, mas ainda visível: sumir com a linha faria quem errou o toque
     perder o alimento sem ter como voltar, e a foto não é analisada de novo. */
  itemDaFotoFora: { backgroundColor: t.cores.fundo, opacity: 0.6 },
  linhaTopoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  textosDoItem: { flex: 1 },
  linhaNomeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nomeDoItem: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: t.cores.ink },
  porcaoDoItem: { marginTop: 2, fontSize: 11.5, color: t.inkSuave },
  numeroDoItem: { alignItems: 'flex-end', minWidth: 52 },
  unidadeDoItem: {
    fontSize: 9,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  kcalDoItem: {
    fontSize: 16,
    fontWeight: '800',
    color: t.cores.ink,
    lineHeight: 17,
    /* Largura fixa por dígito: é o que deixa a coluna de calorias alinhada
       de uma linha para a outra, que é como ela vai ser lida — de relance. A
       largura mínima mora no `numeroDoItem`, que embrulha número e unidade. */
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  tirarItem: {
    width: 26,
    height: 26,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  /* "Comi" antes da trilha, e o número dentro dela.
     Só os números — "½ 1 1½ 2" — não dizem de QUE é a conta, e foi assim que
     a primeira versão desta tela ficou bonita e indecifrável. A palavra
     aparece uma vez por linha, em vez de quatro vezes dentro dos botões. */
  fracoesDoItem: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  rotuloComi: {
    fontSize: 10,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  /* Trilha única, com o escolhido em relevo — e não quatro botões soltos.
     O fundo cinza diz que os quatro são o mesmo controle; soltos, cada um
     parecia uma ação independente. */
  trilhaFracoes: {
    flexDirection: 'row',
    backgroundColor: t.cores.verdeMenta,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  /* Menor que a `fracao` da folha de item único: aqui são quatro por linha,
     repetidas em até oito linhas. O alvo do dedo continua acima de 40 pontos de
     altura contando o vão entre as linhas. */
  fracaoPequena: {
    minWidth: 42,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  textoFracaoPequena: {
    fontSize: 12.5,
    fontWeight: '700',
    color: t.inkMedio,
    fontVariant: ['tabular-nums'],
  },
  fracaoAtivaPequena: { backgroundColor: t.cores.superficie },
  textoFracaoAtivaPequena: { color: t.cores.verdeEscuro, fontWeight: '800' },
  foraDoItem: { marginTop: 7, fontSize: 11.5, color: t.inkFraco },
  textoFracao: { fontSize: 13, fontWeight: '600', color: t.inkMedio },
  textoFracaoAtiva: { color: t.cores.branco, fontWeight: '800' },
  /* O "+" no titulo do grupo: ele e o que diz que dali da para adicionar.
     Sem ele o titulo tocavel seria um segredo -- area clicavel sem nada
     indicando que e clicavel e o mesmo que nao existir. */
  maisNoGrupo: {
    width: 22,
    height: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cores.verdeClaro,
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
    borderRadius: 16,
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
  /* `flexShrink` aqui e `flexShrink: 0` no selo é o que impede a etiqueta
     "foto · média" de ser empurrada para cima do número de calorias por um nome
     comprido. Sem isso, "Vinagrete de tomate e cebola" imprimia os dois no
     mesmo lugar. */
  nomeItem: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: t.cores.ink },
  /* Quadrada e pequena: ela é referência, e não o conteúdo da linha. Grande
     demais empurraria o nome e a caloria, que é o que se lê. */
  /* O prato: uma foto por registro, encabeçando os itens que saíram dela. */
  pratoDaFoto: { marginBottom: 2 },
  fotoDoPrato: {
    width: '100%',
    /* Proporção, e não altura fixa: altura fixa corta cabeça e pé de foto em
       pé, e prato fotografado de cima costuma sair em pé. */
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },

  miniatura: {
    width: 42,
    height: 42,
    borderRadius: 8,
    marginRight: 11,
    backgroundColor: t.cores.fundo,
  },
  seloTroca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.cores.verdeClaro,
  },
  textoSeloTroca: { fontSize: 10, fontWeight: '800', color: t.cores.verde },

  totalTroca: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.cores.borda,
  },
  rotuloTotalTroca: { flex: 1, fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  valorTotalTroca: { fontSize: 20, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.4 },
  /* Sem cor de alerta no positivo: comer mais num dia nao e erro, e pintar de
     vermelho transformaria a informacao em repreensao. */
  diferencaTroca: { fontSize: 13, fontWeight: '700', color: t.inkMedio },

  seloFoto: {
    flexShrink: 0,
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
  /* Largura mínima e alinhado à direita: sem isso "5" e "220" começam em
     colunas diferentes, e a lista perde a régua que deixa comparar de relance.
     `tabular-nums` mantém o dígito com a mesma largura. */
  kcalItem: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '800',
    color: t.cores.verde,
    fontVariant: ['tabular-nums'],
  },

  /* ── Véu de análise ── */
  veu: {
    ...StyleSheet.absoluteFill,
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
  fundoFolha: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.62)' },
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    /* 88, e não 82. A folha ganhou a capa da foto e nada saiu de dentro dela;
       os seis pontos a mais devolvem uma linha inteira da lista, e 88 ainda
       deixa ver que existe tela por trás — que é o que diz que dá para
       fechar arrastando. */
    maxHeight: '88%',
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
    borderRadius: 4,
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

  acrescentarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.cores.borda,
  },
  textoAcrescentarItem: { fontSize: 13.5, fontWeight: '700', color: t.cores.verdeEscuro },

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
  /* Desligado quando ela tirou todos os itens. Cinza, e com o texto dizendo o
     motivo: um botão verde que não faz nada ao toque se lê como app quebrado. */
  botaoRegistrarDesligado: { backgroundColor: t.cores.trilho },
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
