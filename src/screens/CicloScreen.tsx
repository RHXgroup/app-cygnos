import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarioMes } from '../components/CalendarioMes'
import { DiaDoCiclo } from '../components/DiaDoCiclo'
import { MeuCiclo } from '../components/MeuCiclo'
import {
  apagarCiclo,
  carregarCiclos,
  carregarDias,
  compartilharCiclo,
  diaTemAlgo,
  diaTemAlgoClinico,
  estadoDoCompartilhamento,
  registrarComeco,
  salvarCicloInformado,
  salvarDia,
  sincronizarCiclo,
  type DiaDoCiclo as Dia,
  type RegistroCiclo,
} from '../lib/ciclo'
import {
  compararAntesDaMenstruacao,
  situacaoDoCiclo,
  type CicloInformado,
  type Comparacao,
  type Fase,
} from '../lib/cicloDaPessoa'
import {
  diasMenstruada,
  diasPrevistos,
  fluxoAindaEsperado,
  mesVizinho,
  somandoDias,
} from '../lib/calendarioDoCiclo'
import { diasFerteis, ehDiaFertil, janelaFertil } from '../lib/fertilidade'
import { avisoDaSemana, padraoAntesDaMenstruacao } from '../lib/padraoDoCiclo'
import { carregarConsumoPeriodo } from '../lib/consumo'
import { dataISO, milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* O ciclo menstrual — calendário, e não formulário.
 *
 * ── O que havia antes, e por que estava errado ────────────────────────────
 * Um botão: "minha menstruação começou HOJE". Quem lembra na quinta que
 * menstruou na segunda não tinha como dizer isso — e lembrar na quinta é o caso
 * comum, não a exceção. Um controle de ciclo em que só dá para registrar hoje
 * não é controle de ciclo.
 *
 * Agora é um calendário: toca em qualquer dia passado e registra ali. Semana
 * retrasada inclusive.
 *
 * ── Gestão, e não operação ────────────────────────────────────────────────
 * A tela abre DIZENDO onde ela está — dia do ciclo, fase, quando a próxima deve
 * vir, janela fértil — em vez de esperar ser alimentada. O calendário vem logo
 * abaixo, com os dias já pintados, e tudo o que se registra está atrás de um
 * toque num dia. Uma tela, e não uma lista de botões espalhados.
 *
 * ── O que esta tela NÃO faz ───────────────────────────────────────────────
 * Não dá conselho por fase. "Coma carboidrato na lútea" é o que os aplicativos
 * de ciclo vendem, e a evidência é fraca — o metabolismo de repouso não muda de
 * forma relevante entre as fases.
 *
 * O contrário tem evidência boa: a dieta afeta os sintomas. Então a tela cruza
 * o ciclo com o diário que ela já preenche, e isso é medida dela.
 *
 * E não desenha "dias seguros". Janela fértil para quem QUER engravidar é
 * ajuda; a mesma tela lida ao contrário vira anticoncepção, e a margem deste
 * cálculo tem, aí, consequência que ninguém desfaz.
 *
 * ── Ela responde uma vez, e o app mede daí em diante ──────────────────────
 * Esta tela já se recusou a prever sem dois ciclos registrados, e o resultado
 * era um quadradinho solto no calendário por dois meses. Depois chutou 28, que
 * é a média da população e erra uma semana em quem tem 34.
 *
 * O que faltava era PERGUNTAR: duas perguntas, uma vez, no cartão do topo. A
 * resposta dela vale desde o primeiro dia e é substituída assim que houver dois
 * começos para medir. A escada inteira está em , e a tela lê
 *  para escrever a frase certa em cada degrau — porque uma
 * previsão sem procedência vira afirmação. */

const NOME_DA_FASE: Record<Fase, string> = {
  menstrual: 'Menstruação',
  folicular: 'Fase folicular',
  ovulatoria: 'Perto da ovulação',
  lutea: 'Fase lútea',
}

const DIAS_DE_DIARIO = 120

const diaEMes = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function CicloScreen({
  contaId,
  onMudou,
  onFechar,
}: {
  contaId: string
  onMudou: () => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const hoje = dataISO(new Date())

  const [registros, setRegistros] = useState<RegistroCiclo[] | null>(null)
  const [dias, setDias] = useState<Dia[]>([])
  const [comparacao, setComparacao] = useState<Comparacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [relendo, setRelendo] = useState(false)
  const [erro, setErro] = useState('')
  const [mudou, setMudou] = useState(false)
  const [versao, setVersao] = useState(0)

  const [ano, setAno] = useState(() => Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(() => Number(hoje.slice(5, 7)))
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  /* Qual dia o resumo abaixo do calendário está mostrando. Fica separado do
     `diaAberto` porque ele continua valendo DEPOIS de a folha fechar — é o que
     devolve à pessoa o que ela acabou de salvar. */
  const [selecionadoResumo, setSelecionadoResumo] = useState<string | null>(null)
  const [salvandoDia, setSalvandoDia] = useState(false)

  /* O que ela respondeu sobre o próprio ciclo. Vem da mesma linha de
     `app_contas` que a preferência de compartilhamento. */
  const [informado, setInformado] = useState<CicloInformado>({ duracao: null, diasDeFluxo: null })
  const [salvandoInformado, setSalvandoInformado] = useState(false)
  /* Ela mandou perguntar depois, OU tocou em "alterar". O mesmo estado nos dois
     sentidos porque a pergunta é a mesma, e o cartão é o mesmo. */
  const [perguntaAdiada, setPerguntaAdiada] = useState(false)
  const [perguntaAberta, setPerguntaAberta] = useState(false)

  const [compartilha, setCompartilha] = useState(false)
  const [temNutricionista, setTemNutricionista] = useState(false)
  const [mudandoChave, setMudandoChave] = useState(false)

  /* Volta do segundo plano relendo: o que mudou noutro aparelho, ou do lado da
     nutricionista, não chega sozinho — item 8 do AGENTS.md. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') setVersao(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      /* A folha do dia é um Modal e fecha sozinha pelo `onRequestClose`; devolvo
         o evento para ela. Aqui só resta o degrau da tela. Sem lista de
         dependências: item 1 do AGENTS.md. */
      if (diaAberto) return false
      fechar()
      return true
    })
    return () => sub.remove()
  })

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  const carregar = useCallback(async () => {
    const r = await carregarCiclos(contaId)
    if (r.tipo === 'erro') {
      /* O erro fica e o conteúdo antigo também: trocar a tela por uma mensagem
         a cada volta do segundo plano paga um susto por uma leitura que quase
         sempre não muda nada. */
      setErro(r.mensagem)
      return
    }
    /* O else limpa — item 9 do AGENTS.md. */
    setErro('')
    setRegistros(r.registros)

    const e = await estadoDoCompartilhamento(contaId)
    setCompartilha(e.ligado)
    setTemNutricionista(e.temNutricionista)
    setInformado(e.informado)

    /* Um ano de dias de uma vez. São no máximo 365 linhas curtas, e evita uma
       ida à rede a cada vez que ela vira o mês do calendário. */
    const d = await carregarDias(contaId, somandoDias(hoje, -365), hoje)
    if (d.tipo === 'ok') setDias(d.dias)

    if (r.registros.length < 2) {
      setComparacao(null)
      return
    }
    const c = await carregarConsumoPeriodo(contaId, somandoDias(hoje, -DIAS_DE_DIARIO), hoje)
    if (c.tipo === 'erro') {
      /* Silêncio, e só aqui: a tela já apareceu, e falhar em desenhar um bloco
         extra não justifica cobri-la com um erro sobre "histórico de
         refeições". */
      setComparacao(null)
      return
    }
    const porDia = new Map<string, number>()
    for (const i of c.itens) {
      if (i.calorias === null) continue
      porDia.set(i.data, (porDia.get(i.data) ?? 0) + i.calorias)
    }
    setComparacao(
      compararAntesDaMenstruacao(
        r.registros,
        [...porDia].map(([data, calorias]) => ({ data, calorias: Math.round(calorias) })),
      ),
    )
  }, [contaId, hoje])

  useEffect(() => {
    let vivo = true
    void carregar().then(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [carregar, versao])

  /* A escada inteira mora em `situacaoDoCiclo`: o que foi MEDIDO nos registros
     dela vence o que ela INFORMOU, que vence os 28 de população. A tela só
     entrega os dois lados e lê `origemDaDuracao` para escrever a frase certa. */
  const situacao = situacaoDoCiclo(registros ?? [], hoje, informado)
  const janela = janelaFertil(situacao.proximaPrevista)

  const pintados = useMemo(
    () => ({
      /* Com `hoje`: os dias de fluxo que ainda não chegaram não entram aqui.
         O que ela viveu é faixa cheia; o que falta é previsão, logo abaixo. */
      menstruada: diasMenstruada(registros ?? [], hoje, situacao.diasDeFluxo),
      /* A próxima menstruação MAIS o resto do fluxo deste ciclo. Os dois no tom
         fraco, pela mesma razão: ainda não aconteceram. Sem a segunda parte, a
         faixa nascia com um dia e ia crescendo sozinha ao longo da semana. */
      previstos: new Set([
        ...diasPrevistos(situacao.proximaPrevista, registros ?? [], situacao.diasDeFluxo),
        ...fluxoAindaEsperado(registros ?? [], hoje, situacao.diasDeFluxo),
      ]),
      ferteis: diasFerteis(janela),
      /* Só o que é CLÍNICO vira ponto. Se o ponto saísse também para o dia em
         que ela só marcou relação, ele seria a mesma marca para duas coisas
         muito diferentes — e o coração já diz aquilo. */
      anotados: new Set(dias.filter(diaTemAlgoClinico).map(d => d.data)),
      comRelacao: new Set(dias.filter(d => d.relacao === true).map(d => d.data)),
    }),
    [registros, dias, situacao.proximaPrevista, situacao.diasDeFluxo, janela, hoje],
  )

  async function guardarInformado(i: CicloInformado) {
    setSalvandoInformado(true)
    const f = await salvarCicloInformado(contaId, i)
    setSalvandoInformado(false)
    if (f) {
      setErro(f.erro)
      return
    }
    setErro('')
    /* Local na hora: a previsão, a faixa e a janela fértil se refazem no mesmo
       toque. Reler do banco para descobrir o que ela acabou de digitar seria uma
       ida à rede para confirmar o óbvio. */
    setInformado(i)
    setPerguntaAberta(false)
    setPerguntaAdiada(true)
  }

  /* O AVISO. É a peça que separa registrar de acompanhar.
   *
   * Os aplicativos grandes dão "insight" genérico de população; este sai dos
   * ciclos DELA, e só quando aparece em mais de um — um sintoma que aconteceu
   * uma vez é um dia ruim, não um padrão. Sem isso o aviso erraria, e um aviso
   * que erra ensina a ignorar todos os outros.
   *
   * E o que ele NÃO recebe: relação, proteção e nota privada. Não é só que
   * aquilo não sobe para a nutricionista — também não vira padrão nem
   * estatística. A função nem tem os campos. */
  const aviso = useMemo(() => {
    const padroes = padraoAntesDaMenstruacao(
      registros ?? [],
      /* As cinco categorias novas entram no padrão junto com os sintomas — é o
         que permite o aviso dizer "energia baixa" e "digestão inchada", que são
         justamente os que mais se repetem antes da menstruação.

         Os privados continuam de fora: a função nem tem os campos. */
      dias.map(d => ({
        data: d.data,
        sintomas: [
          ...d.sintomas,
          ...(d.energia ? [`energia ${d.energia}`] : []),
          ...(d.digestao ? [`digestão ${d.digestao}`] : []),
          ...(d.pele ? [`pele ${d.pele}`] : []),
          ...(d.cabeca ? [`cabeça ${d.cabeca}`] : []),
        ],
        humor: d.humor,
        desejoAlimentar: d.desejoAlimentar,
      })),
    )
    return avisoDaSemana(situacao.proximaPrevista, situacao.irregular, padroes, hoje)
  }, [registros, dias, situacao.proximaPrevista, situacao.irregular, hoje])

  const doDia = (data: string) => dias.find(d => d.data === data) ?? null

  /* O que está anotado num dia, em uma frase.
   *
   * Existe por uma queixa de uso: ela marcou um dia, salvou, e o app não
   * mostrou NADA de volta. Salvar sem devolução é o mesmo que não salvar, do
   * ponto de vista de quem está olhando.
   *
   * Inclui o que é privado — esta é a tela DELA, e esconder aqui o que ela
   * mesma escreveu não protege ninguém. O que não sai daqui é o espelho para a
   * nutricionista, e isso o servidor garante. */
  function resumoDoDia(d: Dia): string {
    const partes: string[] = []
    if (ehComeco(d.data)) partes.push('menstruação começou')
    if (d.fluxo) partes.push(`fluxo ${d.fluxo}`)
    if (d.sintomas.length) partes.push(d.sintomas.join(', '))
    if (d.energia) partes.push(`energia ${d.energia}`)
    if (d.digestao) partes.push(`digestão ${d.digestao}`)
    if (d.pele) partes.push(`pele ${d.pele}`)
    if (d.cabeca) partes.push(`cabeça ${d.cabeca}`)
    if (d.secrecao) partes.push(`secreção ${d.secrecao.replace('_', ' ')}`)
    if (d.humor) partes.push(`humor ${d.humor}`)
    if (d.desejoAlimentar.length) partes.push(`vontade de ${d.desejoAlimentar.join(', ')}`)
    if (d.relacao) partes.push(
      d.relacaoProtegida === true
        ? 'relação com proteção'
        : d.relacaoProtegida === false
          ? 'relação sem proteção'
          : 'relação',
    )
    if ((d.observacao ?? '').trim()) partes.push('recado para a nutricionista')
    if ((d.notaPrivada ?? '').trim()) partes.push('nota sua')
    return partes.join(' · ')
  }

  /* O último dia com alguma coisa. É ele que a tela mostra quando nenhum está
     selecionado — para o registro de agora aparecer sem a pessoa procurar. */
  const ultimoAnotado = [...dias].filter(diaTemAlgo).sort((a, b) => b.data.localeCompare(a.data))[0]
  const emDestaque = (selecionadoResumo && doDia(selecionadoResumo)) || ultimoAnotado || null
  const ehComeco = (data: string) => (registros ?? []).some(r => r.comecou === data)

  async function marcarComeco(data: string, ligado: boolean) {
    setSalvandoDia(true)
    if (ligado) {
      const r = await registrarComeco(contaId, data)
      setSalvandoDia(false)
      if (r.tipo === 'erro') {
        setErro(r.mensagem)
        return
      }
      setRegistros(a => [r.registro, ...(a ?? []).filter(x => x.comecou !== data)])
    } else {
      const alvo = (registros ?? []).find(r => r.comecou === data)
      if (!alvo) {
        setSalvandoDia(false)
        return
      }
      setRegistros(a => (a ?? []).filter(x => x.id !== alvo.id))
      const f = await apagarCiclo(alvo.id)
      setSalvandoDia(false)
      if (f) {
        setErro(f.erro)
        setVersao(v => v + 1)
        return
      }
    }
    setErro('')
    setMudou(true)
    /* Depois de gravar, e não antes: o espelho é refeito a partir do que
       sobrou, e sincronizar com a linha ainda lá a reenviaria. */
    void sincronizarCiclo()
  }

  async function guardarDia(d: Dia) {
    setSalvandoDia(true)
    const r = await salvarDia(contaId, d)
    setSalvandoDia(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setErro('')
    setMudou(true)
    setDias(atuais => [...atuais.filter(x => x.data !== r.dia.data), r.dia])
    setDiaAberto(null)
    /* Fecha a folha e DEIXA o dia em destaque: é assim que a pessoa vê o que
       acabou de salvar sem ter de abrir de novo. */
    setSelecionadoResumo(r.dia.data)
    void sincronizarCiclo()
  }

  async function trocarChave(ligar: boolean) {
    /* Otimista NÃO: em qualquer outro interruptor errar custa um piscar; aqui
       mostraria "a sua nutricionista vê" para quem não está compartilhando —
       ou o contrário, que é pior. */
    setMudandoChave(true)
    const r = await compartilharCiclo(ligar)
    setMudandoChave(false)
    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    setErro('')
    setCompartilha(r.estado.compartilhando)
    /* O servidor desliga sozinho quando não há vínculo claro. Se ela pediu para
       ligar e voltou desligado, é porque não há para quem mandar. */
    if (ligar && !r.estado.compartilhando) setTemNutricionista(false)
  }

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
        <Text style={styles.tituloTela}>Ciclo</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <ActivityIndicator color={paleta().cores.verde} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            /* Também na ramificação de erro, e é ali que mais importa: puxar
               para tentar de novo é o gesto de quem leu "verifique a conexão". */
            <RefreshControl
              refreshing={relendo}
              onRefresh={() => {
                setRelendo(true)
                void carregar().then(() => setRelendo(false))
              }}
              tintColor={paleta().inkFraco}
            />
          }
        >
          {erro ? (
            <View style={styles.blocoErro}>
              <Text style={styles.textoErro}>{erro}</Text>
            </View>
          ) : null}

          {/* ── A PROMESSA, dita na entrada e não escondida ───────────────
           *
           * O painel do dia já dizia isto — mas só para quem já tocou num dia.
           * Quem abre o Ciclo pela primeira vez, olha, e fecha nunca leu; e é
           * justamente essa pessoa que está decidindo se anota alguma coisa
           * aqui.
           *
           * ── E por que não é um aviso que some ─────────────────────────
           * Porque não é uma novidade, é uma GARANTIA. Aviso de primeira vez
           * some depois de lido, e a dúvida sobre privacidade volta toda vez
           * que ela vai escrever algo que não quer que ninguém veja.
           *
           * ── E por que ela é forte ──────────────────────────────────────
           * A separação não é uma configuração que alguém pode ter deixado
           * ligada por engano: a função que espelha os dados para a
           * nutricionista simplesmente NÃO TEM código para copiar estes
           * campos. Garantido pela ausência, e não pela boa vontade. O Clue
           * ganha confiança dizendo o que faz; nós fazemos mais e não
           * dizíamos. */}
          <View style={styles.promessa}>
            <Ionicons name="lock-closed" size={14} color={paleta().cores.verde} />
            <Text style={styles.textoPromessa}>
              O que você marcar como <Text style={styles.negritoPromessa}>relação</Text> e as{' '}
              <Text style={styles.negritoPromessa}>notas privadas</Text> ficam só neste aparelho.
              Não vão para a sua nutricionista, e não existe opção para ligar isso.
            </Text>
          </View>

          {/* ── Onde ela está. A tela DIZ, em vez de esperar. ───────────── */}
          <View style={styles.agora}>
            {situacao.diaDoCiclo === null ? (
              <>
                <Text style={styles.grande}>Toque num dia</Text>
                <Text style={styles.explicacao}>
                  Marque no calendário quando a sua menstruação começou — pode ser hoje, semana
                  passada ou retrasada. A partir daí eu mostro a próxima data e a janela fértil.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.linhaAgora}>
                  <View>
                    <Text style={styles.rotuloAgora}>Dia do ciclo</Text>
                    <Text style={styles.grande}>{situacao.diaDoCiclo}</Text>
                  </View>
                  {situacao.fase && (
                    <View style={styles.selo}>
                      <Text style={styles.textoSelo}>{NOME_DA_FASE[situacao.fase]}</Text>
                    </View>
                  )}
                </View>

                {/* Uma frase por degrau da escada, e a diferença entre elas é
                    a PROCEDÊNCIA do número. Sem ela a estimativa vira
                    afirmação, e é aí que o app passa a mentir sem querer. */}
                {situacao.irregular ? (
                  <Text style={styles.linhaInfo}>
                    Os seus ciclos duram{' '}
                    <Text style={styles.forte}>{situacao.duracaoTipica} dias</Text> em média, mas
                    variam bastante entre si — então não vou arriscar uma data. Um ciclo irregular
                    pode ser normal, e também pode valer uma conversa com quem te acompanha.
                  </Text>
                ) : (
                  <Text style={styles.linhaInfo}>
                    {situacao.origemDaDuracao === 'medida' ? (
                      <>
                        Os seus ciclos duram{' '}
                        <Text style={styles.forte}>{situacao.duracaoTipica} dias</Text>, medido nos
                        seus registros.{' '}
                      </>
                    ) : situacao.origemDaDuracao === 'informada' ? (
                      <>
                        Contando com o ciclo de{' '}
                        <Text style={styles.forte}>{situacao.duracaoUsada} dias</Text> que você me
                        disse.{' '}
                      </>
                    ) : (
                      <>
                        Ainda estou usando <Text style={styles.forte}>28 dias</Text>, que é a média
                        geral e pode não ser a sua.{' '}
                      </>
                    )}
                    {situacao.atrasoEmDias !== null
                      ? `A previsão era ${diaEMes(situacao.proximaPrevista ?? '')}, há ${situacao.atrasoEmDias} ${situacao.atrasoEmDias === 1 ? 'dia' : 'dias'} — previsão é estimativa, e atrasar acontece.`
                      : `A próxima deve começar por volta de ${diaEMes(situacao.proximaPrevista ?? '')}.`}
                  </Text>
                )}

                {/* O convite para corrigir o número, e ele só aparece enquanto o
                    número ainda não foi medido: depois de dois ciclos
                    registrados, o que ela lembra já não muda nada, e oferecer a
                    edição ali sugeriria que muda. */}
                {situacao.origemDaDuracao !== 'medida' && !perguntaAberta && (
                  <Pressable
                    onPress={() => setPerguntaAberta(true)}
                    style={styles.linkCiclo}
                    accessibilityRole="button"
                  >
                    <Ionicons name="create-outline" size={14} color={paleta().cores.verde} />
                    <Text style={styles.textoLinkCiclo}>
                      {situacao.origemDaDuracao === 'informada'
                        ? 'Alterar a duração do meu ciclo'
                        : 'Dizer quanto dura o meu ciclo'}
                    </Text>
                  </Pressable>
                )}

                {janela && !situacao.irregular && (
                  <Text style={styles.linhaInfo}>
                    Janela fértil estimada:{' '}
                    <Text style={styles.forte}>
                      {diaEMes(janela.de)} a {diaEMes(janela.ate)}
                    </Text>
                    .{' '}
                    <Text style={styles.ressalva}>
                      Estimativa pelas suas datas, erra por dias, e não serve como método
                      contraceptivo.
                    </Text>
                  </Text>
                )}
              </>
            )}
          </View>

          {/* As duas perguntas. Aparecem sozinhas na primeira vez, e por
              "alterar" depois — some assim que a medida dos registros dela
              substitui o que ela lembrava. */}
          {(perguntaAberta || (situacao.origemDaDuracao === 'padrao' && !perguntaAdiada)) && (
            <MeuCiclo
              informado={informado}
              salvando={salvandoInformado}
              onSalvar={i => void guardarInformado(i)}
              onAgoraNao={() => {
                setPerguntaAberta(false)
                setPerguntaAdiada(true)
              }}
            />
          )}

          {/* Antes do calendário: é o que ela precisa saber ANTES de olhar os
              dias, e é o único bloco da tela que fala do futuro próximo. */}
          {aviso && (
            <View style={styles.aviso}>
              <Ionicons name="sparkles" size={17} color={paleta().cores.cicloForte} />
              <Text style={styles.textoAviso}>{aviso.texto}</Text>
            </View>
          )}

          <CalendarioMes
            ano={ano}
            mes={mes}
            hoje={hoje}
            menstruada={pintados.menstruada}
            previstos={pintados.previstos}
            ferteis={pintados.ferteis}
            anotados={pintados.anotados}
            comRelacao={pintados.comRelacao}
            selecionado={selecionadoResumo}
            onSelecionar={data => {
              setSelecionadoResumo(data)
              setDiaAberto(data)
            }}
            onTrocarMes={passo => {
              const v = mesVizinho(ano, mes, passo)
              setAno(v.ano)
              setMes(v.mes)
            }}
          />

          {/* O que está anotado no dia em destaque. Sem isto, salvar não
              devolvia nada — e salvar sem devolução é o mesmo que não salvar,
              do ponto de vista de quem está olhando a tela. */}
          {emDestaque && resumoDoDia(emDestaque) !== '' && (
            <Pressable
              onPress={() => {
                setSelecionadoResumo(emDestaque.data)
                setDiaAberto(emDestaque.data)
              }}
              style={({ pressed }) => [styles.cartao, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={`Editar o dia ${diaEMes(emDestaque.data)}`}
            >
              <View style={styles.linhaChave}>
                <View style={styles.textoChave}>
                  <Text style={styles.tituloCartao}>{diaEMes(emDestaque.data)}</Text>
                  <Text style={styles.linhaInfo}>{resumoDoDia(emDestaque)}</Text>
                </View>
                <Ionicons name="create-outline" size={18} color={paleta().inkFraco} />
              </View>
            </Pressable>
          )}

          {/* ── O cruzamento com o diário ───────────────────────────────── */}
          {comparacao &&
            comparacao.mediaNosDiasAntes !== null &&
            comparacao.mediaNoResto !== null && (
              <View style={styles.cartao}>
                <Text style={styles.tituloCartao}>Você, nos dias antes</Text>
                <Text style={styles.linhaInfo}>
                  Nos {comparacao.ciclosComparados} últimos ciclos, nos {comparacao.diasAntes} dias
                  antes da menstruação você comeu em média{' '}
                  <Text style={styles.forte}>{milhar(comparacao.mediaNosDiasAntes)} kcal</Text> por
                  dia, contra {milhar(comparacao.mediaNoResto)} no resto do ciclo.
                </Text>
                <Text style={styles.ajuda}>
                  Isto é o que o SEU diário mostra, e não uma regra sobre fases.
                </Text>
              </View>
            )}

          {/* ── A chave, por último ─────────────────────────────────────── */}
          <View style={styles.cartao}>
            <View style={styles.linhaChave}>
              <View style={styles.textoChave}>
                <Text style={styles.tituloCartao}>Mostrar para a minha nutricionista</Text>
                <Text style={styles.ajuda}>
                  {!temNutricionista
                    ? 'Você ainda não tem nutricionista vinculada. Quando tiver, esta opção liga.'
                    : compartilha
                      ? 'Ela vê as datas, o fluxo, os sintomas, o humor e a vontade de comer. Desligar apaga o que já foi enviado.'
                      : 'Hoje ninguém além de você vê isto.'}
                </Text>
              </View>
              {mudandoChave ? (
                <ActivityIndicator color={paleta().cores.verde} />
              ) : (
                <Switch
                  value={compartilha}
                  onValueChange={v => void trocarChave(v)}
                  disabled={!temNutricionista}
                  trackColor={{ false: paleta().cores.trilho, true: paleta().cores.verde }}
                  accessibilityLabel="Mostrar o meu ciclo para a minha nutricionista"
                />
              )}
            </View>
          </View>

          <Text style={styles.rodape}>
            Se você teve relação, se foi com proteção e a sua nota privada NUNCA são
            compartilhados — nem com a opção acima ligada.
          </Text>
        </ScrollView>
      )}

      {diaAberto && (
        <DiaDoCiclo
          visivel
          data={diaAberto}
          dia={doDia(diaAberto)}
          carregando={false}
          ehComecoDeCiclo={ehComeco(diaAberto)}
          /* A MESMA janela que pinta o ponto no calendario, e a MESMA regra:
             em dia de fluxo o calendario nao mostra o ponto fertil, e o painel
             nao pode dizer o contrario da tela de onde ela veio.

             Perguntar por um dia so, em vez de montar o Set inteiro, e para
             isso que `ehDiaFertil` existe -- e ela estava escrita e sem
             chamador nenhum. */
          ehFertil={ehDiaFertil(diaAberto, janela) && !pintados.menstruada.has(diaAberto)}
          salvando={salvandoDia}
          onSalvar={d => void guardarDia(d)}
          onMarcarComeco={ligado => void marcarComeco(diaAberto, ligado)}
          onFechar={() => setDiaAberto(null)}
        />
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },
    conteudo: { paddingHorizontal: 20, gap: 14 },

    promessa: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: t.cores.verdeMenta,
    borderWidth: 1,
    borderColor: t.cores.verdeClaro,
  },
  textoPromessa: { flex: 1, fontSize: 11.5, lineHeight: 16.5, color: t.cores.verdeEscuro },
  negritoPromessa: { fontWeight: '800' },

  blocoErro: {
      backgroundColor: t.cores.erroFundo,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.erroBorda,
      padding: 13,
    },
    textoErro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 19 },

    agora: {
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 17,
      gap: 8,
    },
    linhaAgora: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rotuloAgora: { fontSize: 12, color: t.inkFraco, fontWeight: '700' },
    grande: {
      fontSize: 38,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
    },
    selo: {
      backgroundColor: t.cores.verdeMenta,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    textoSelo: { fontSize: 12.5, fontWeight: '800', color: t.cores.verde },
    explicacao: { fontSize: 13.5, color: t.inkMedio, lineHeight: 20 },

    cartao: {
      backgroundColor: t.cores.cartao,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 15,
      gap: 7,
    },
    tituloCartao: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
    linhaInfo: { fontSize: 13.5, color: t.inkMedio, lineHeight: 20 },
    forte: { fontWeight: '800', color: t.cores.ink },
    ressalva: { fontSize: 12, color: t.inkFraco },
    /* Texto, e não botão: corrigir a duração é uma coisa que se faz uma vez, e
       um botão desenhado ali competiria com o registrar, que é o que a tela
       existe para receber. */
    linkCiclo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    textoLinkCiclo: { fontSize: 13, fontWeight: '700', color: t.cores.verde },
    ajuda: { fontSize: 12, color: t.inkFraco, lineHeight: 17 },

    aviso: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: t.cores.cicloFundo,
      borderRadius: 14,
      padding: 15,
    },
    textoAviso: { flex: 1, fontSize: 13.5, color: t.cores.ink, lineHeight: 20, fontWeight: '600' },

    linhaChave: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    textoChave: { flex: 1, gap: 4 },

    rodape: { fontSize: 11.5, color: t.inkFraco, lineHeight: 17, marginTop: 4 },
  }),
)
