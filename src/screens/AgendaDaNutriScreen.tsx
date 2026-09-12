import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  TextInput,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDesvioDoTeclado } from '../lib/teclado'
import { NovaConsultaScreen } from './NovaConsultaScreen'
import {
  confirmarConsulta,
  geraFinanceiroSozinho,
  marcarComoAtendida,
  salvarNotaDoAtendimento,
} from '../lib/acoesDaConsulta'
import { type PacienteEmFoco } from '../lib/auroraSobreAPaciente'
import { FichaDoPacienteScreen } from './PacientesDaNutriScreen'
import {
  cancelarConsulta,
  consultasNoPeriodo,
  expedienteDaNutri,
  remarcarConsulta,
} from '../lib/agendaDaNutri'
import {
  buracosDoDia,
  duracaoPorExtenso,
  EXPEDIENTE_PADRAO,
  type Buraco,
  type Expediente,
} from '../lib/buracosDaAgenda'
import { interpretarRemarcacao, mascaraDeData, mascaraDeHora } from '../lib/remarcacao'
import { FONTE } from '../lib/fontes'
import {
  CABECALHO_DA_SEMANA,
  contarPorDia,
  diasDaSemana,
  diasNoMes,
  gradeDoMes,
  hojeLocal,
  mesAndando,
  mesDaData,
  nomeDoMes,
  primeiroDiaDoMes,
  tituloDaSemana,
  tituloDoDia,
  type Celula,
  type Vista,
} from '../lib/calendarioDaAgenda'
import { somandoDias } from '../lib/datas'
import { hhmm, type ConsultaDoDia } from '../lib/diaDaNutri'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'

/* A agenda dela para além de hoje: dia, semana e mês.
 *
 * ──────────────────── Por que as três, e não só uma lista longa ────────────────────
 * São três perguntas diferentes, e uma lista responde mal as três. "Como está
 * o meu dia" é o painel. "Quando eu tenho vaga?" é o mês, e só se responde de
 * relance numa grade -- rolando uma lista, ela conta dias na cabeça. "Como está
 * a semana?" é a que ela olha com a paciente na frente pedindo retorno.
 *
 * ──────────────────── Uma leitura por PERÍODO, e não uma por célula ────────────────────
 * A grade do mês tem até 42 células. Uma consulta ao banco por célula seria a
 * tela abrindo em segundos no 4G de dentro de um prédio -- e cada uma cobrando
 * a mesma política de RLS outra vez.
 *
 * ──────────────────── E a grade NÃO mostra os nomes ────────────────────
 * Só quantas. Trinta e cinco células com nome viram uma parede de texto de 6
 * pontos que ninguém lê; o nome aparece quando ela TOCA no dia, que é quando
 * ela quer saber de quem é. */

export function AgendaDaNutriScreen({
  onAurora,
}: {
  onAurora?: (foco: PacienteEmFoco) => void
} = {}) {
  const styles = estilos()
  const { top } = useSafeAreaInsets()

  const [vista, setVista] = useState<Vista>('mes')
  /* O dia em foco. É ele que decide o mês e a semana desenhados, para as três
     vistas continuarem falando do mesmo lugar quando ela troca. Sem isso,
     escolher 20 de outubro no mês e ir para semana mostraria a semana de hoje. */
  const [foco, setFoco] = useState<string>(() => hojeLocal())

  const [consultas, setConsultas] = useState<ConsultaDoDia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')
  /* A ficha abre por cima da agenda. É o gesto que fecha o ciclo: ela procura
     um horário, vê quem está nele, e abre para saber quem é -- sem trocar de
     aba e procurar o nome de novo. */
  const [fichaAberta, setFichaAberta] = useState<number | null>(null)

  /* A consulta em que ela tocou nos três pontinhos, para remarcar ou cancelar.
     Guarda a CONSULTA inteira, e não o id: o painel mostra nome e horário, e
     ir buscar isso de novo por id seria uma leitura para um dado que já estava
     na mão. */
  const [agindoEm, setAgindoEm] = useState<ConsultaDoDia | null>(null)

  /* Marcar consulta, aberta por cima da agenda. Guarda o dia e a hora de onde
     ela tocou: do horário livre vêm os dois, do botão do topo vem só o dia em
     foco -- e do dia vazio, o dia também. Nulo quando está fechada. */
  const [marcando, setMarcando] = useState<{ data: string; hora?: string } | null>(null)
  /* A frase que a agenda mostra depois de marcar, que é a do BANCO ("Consulta
     agendada para 12/09/2026 14:30."). Some sozinha: é confirmação, não erro. */
  const [recado, setRecado] = useState('')

  /* O expediente dela, lido uma vez. Não entra no `buscar` porque não muda
     quando ela troca de dia -- e põ-lo lá faria uma ida ao banco a cada seta. */
  const [expediente, setExpediente] = useState<Expediente>(EXPEDIENTE_PADRAO)

  /* ──── O voltar do Android, que esta tela não tinha ────
     Armadilha 1: a navegação é `useState`, então o botão do aparelho não
     encontra pilha nenhuma e faz a única coisa que sabe -- e aqui isso jogava
     ela para fora da agenda inteira com a ficha aberta.

     COM lista de dependências. Esta tela hospeda a ficha, que hospeda o dossiê
     e o plano: sem a lista, qualquer renderização daqui -- inclusive a que vem
     da área quando chega uma mensagem -- punha este tratador na frente dos de
     dentro, e o voltar fechava a ficha inteira em vez da seção aberta nela.
     Com a lista, ele só se re-registra quando a ficha ou a folha abrem e
     fecham, que é quando ele deve ficar na frente. Armadilha 1. */
  /* ──── Registrado UMA VEZ, lendo o estado por `ref` ────
   *
   * Com lista de dependências ele se re-registrava toda vez que a tela de
   * marcar abria -- e, como os efeitos do FILHO rodam antes dos do PAI, entrava
   * por último e ganhava dela: o voltar dentro da busca de paciente fechava a
   * marcação inteira em vez de voltar ao formulário.
   *
   * Registrado na abertura, ele fica ATRÁS de tudo o que abre depois, e só
   * decide quando ninguém de dentro decidiu. O estado vem de `ref` porque um
   * tratador registrado uma vez leria para sempre os valores da primeira
   * renderização. */
  const estado = useRef({ marcando, agindoEm, fichaAberta, vista })
  estado.current = { marcando, agindoEm, fichaAberta, vista }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const agora = estado.current
      if (agora.marcando) {
        setMarcando(null)
        return true
      }
      if (agora.agindoEm) {
        setAgindoEm(null)
        return true
      }
      if (agora.fichaAberta !== null) {
        setFichaAberta(null)
        return true
      }
      /* ──── O DIA E A SEMANA SÃO DEGRAUS, e o voltar não sabia ────
       *
       * Relatado em uso: "estou na agenda, clico num dia, aparece livre até as
       * vinte horas; aperto voltar querendo o calendário e ele volta pra tela
       * inicial do aplicativo".
       *
       * Trocar de vista é NAVEGAR, mesmo sem tela nova: ela entrou no dia a
       * partir do mês, e o voltar tem de desfazer a entrada. Sem este degrau o
       * evento caía para o tratador da área, que só sabe fechar a agenda
       * inteira -- e a pessoa perdia o lugar onde estava.
       *
       * Do MÊS, que é onde a tela abre, o voltar devolve: aí sim é sair. */
      if (agora.vista !== 'mes') {
        setVista('mes')
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [])

  /* Que pedaço do calendário está na tela. O mês pede a grade INTEIRA, sobras
     inclusive: as células de 31 de agosto e 4 de outubro também mostram
     bolinha, e sem esses dias no pedido elas nasceriam vazias mentindo. */
  const periodo = useMemo(() => {
    if (vista === 'dia') return { de: foco, ate: foco }
    if (vista === 'semana') {
      const dias = diasDaSemana(foco)
      return { de: dias[0] ?? foco, ate: dias[6] ?? foco }
    }
    const grade = gradeDoMes(mesDaData(foco), new Map())
    return { de: grade[0]?.iso ?? foco, ate: grade[grade.length - 1]?.iso ?? foco }
  }, [vista, foco])

  const buscar = useCallback(async () => {
    /* `T12:00:00` e não `T00:00:00`: a leitura recebe um `Date` e recorta pela
       meia-noite LOCAL dele. Nascendo ao meio-dia, nenhum fuso do Brasil
       empurra a data para o dia vizinho no caminho. */
    const r = await consultasNoPeriodo(
      new Date(periodo.de + 'T12:00:00'),
      new Date(periodo.ate + 'T12:00:00'),
    )
    /* O erro é limpo no sucesso: esta tela relê ao voltar do segundo plano, e
       um erro que fica esconderia a agenda atrás de uma mensagem vencida.
       Armadilha 9. */
    if (r.tipo === 'ok') {
      setErro('')
      setConsultas(r.consultas)
    } else {
      setErro(r.mensagem)
    }
  }, [periodo.de, periodo.ate])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    void buscar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [buscar])

  useEffect(() => {
    void expedienteDaNutri().then(setExpediente)
  }, [])

  /* O que muda do lado do sistema nunca chega sozinho -- item 8. Ela marca no
     computador e volta ao celular. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void buscar()
    })
    return () => sub.remove()
  }, [buscar])

  const contagem = useMemo(
    () => contarPorDia(consultas.map(c => ({ diaISO: c.diaISO ?? '' }))),
    [consultas],
  )

  const hoje = hojeLocal()

  if (fichaAberta !== null) {
    return (
      <FichaDoPacienteScreen
        id={fichaAberta}
        onFechar={() => setFichaAberta(null)}
        onAurora={onAurora}
      />
    )
  }

  if (marcando) {
    return (
      <NovaConsultaScreen
        dataInicial={marcando.data}
        horaInicial={marcando.hora}
        onFechar={() => setMarcando(null)}
        onMarcou={(diaISO, mensagem) => {
          setMarcando(null)
          /* Vai para o dia em que ela marcou, e não fica onde estava: a
             conferência de "entrou mesmo?" é ver a consulta na lista. */
          setFoco(diaISO)
          setVista('dia')
          setRecado(mensagem)
          void buscar()
        }}
      />
    )
  }

  const painel = agindoEm ? (
    <PainelDaConsulta
      consulta={agindoEm}
      onFechar={() => setAgindoEm(null)}
      onMudou={() => {
        setAgindoEm(null)
        void buscar()
      }}
    />
  ) : null

  function andar(passo: number) {
    if (vista === 'dia') return setFoco(somandoDias(foco, passo))
    if (vista === 'semana') return setFoco(somandoDias(foco, passo * 7))
    /* No mês o passo é de MÊS, e o dia em foco vai para o dia 1 -- somar 30
       dias faria janeiro pular fevereiro em anos de 31. `mesAndando` não deixa
       o dia entrar na conta. */
    const novo = mesAndando(mesDaData(foco), passo)
    setFoco(primeiroDiaDoMes(novo) || foco)
  }

  const titulo =
    vista === 'dia' ? tituloDoDia(foco)
    : vista === 'semana' ? tituloDaSemana(foco)
    : nomeDoMes(mesDaData(foco))

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => andar(-1)}
          hitSlop={10}
          style={styles.seta}
          accessibilityRole="button"
          accessibilityLabel="Anterior"
        >
          <Ionicons name="chevron-back" size={21} color={paleta().cores.ink} />
        </Pressable>

        <Pressable
          onPress={() => setFoco(hoje)}
          style={styles.tituloArea}
          accessibilityRole="button"
          accessibilityLabel={titulo + '. Toque para voltar a hoje.'}
        >
          <Text style={styles.titulo} numberOfLines={1}>
            {titulo.charAt(0).toUpperCase() + titulo.slice(1)}
          </Text>
          {/* Só aparece quando ela SAIU de hoje. Um "hoje" permanente ali seria
              um botão que na maior parte do tempo não faz nada. */}
          {mesDaData(foco) !== mesDaData(hoje) || (vista !== 'mes' && foco !== hoje) ? (
            <Text style={styles.voltarAHoje}>voltar a hoje</Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => andar(1)}
          hitSlop={10}
          style={styles.seta}
          accessibilityRole="button"
          accessibilityLabel="Próximo"
        >
          <Ionicons name="chevron-forward" size={21} color={paleta().cores.ink} />
        </Pressable>

        {/* MARCAR, no lugar mais alcançável da tela.
            Vinha faltando desde que a agenda nasceu, e era o primeiro gesto que
            ela tentava: "estou no dia, quero incluir aqui, e não deixa". */}
        <Pressable
          onPress={() => setMarcando({ data: emBarras(foco) })}
          hitSlop={10}
          style={styles.botaoMarcar}
          accessibilityRole="button"
          accessibilityLabel="Marcar consulta"
        >
          <Ionicons name="add" size={22} color={paleta().cores.branco} />
        </Pressable>
      </View>

      <View style={styles.seletor}>
        {(['dia', 'semana', 'mes'] as Vista[]).map(v => (
          <Pressable
            key={v}
            onPress={() => setVista(v)}
            style={[styles.opcao, vista === v && styles.opcaoAtiva]}
            accessibilityRole="button"
            accessibilityState={{ selected: vista === v }}
          >
            <Text style={[styles.textoOpcao, vista === v && styles.textoOpcaoAtivo]}>
              {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
            </Text>
          </Pressable>
        ))}
      </View>

      {!!erro && <Text style={styles.erro}>{erro}</Text>}
      {!!recado && (
        <Pressable onPress={() => setRecado('')} accessibilityRole="button" accessibilityLabel="Entendi">
          <Text style={styles.recadoDaAgenda}>{recado}</Text>
        </Pressable>
      )}

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={puxando}
              onRefresh={() => {
                setPuxando(true)
                void buscar().finally(() => setPuxando(false))
              }}
              tintColor={paleta().cores.verde}
              colors={[paleta().cores.verde]}
              progressBackgroundColor={paleta().cores.cartao}
            />
          }
        >
          {vista === 'mes' && (
            <Mes
              anoMes={mesDaData(foco)}
              contagem={contagem}
              hoje={hoje}
              foco={foco}
              onEscolher={dia => {
                setFoco(dia)
                setVista('dia')
              }}
            />
          )}

          {vista === 'semana' &&
            diasDaSemana(foco).map(dia => (
              <BlocoDeDia
                key={dia}
                dia={dia}
                hoje={hoje}
                consultas={consultas.filter(c => c.diaISO === dia)}
                onAbrirDia={() => {
                  setFoco(dia)
                  setVista('dia')
                }}
                onAbrirFicha={setFichaAberta}
                onAgir={setAgindoEm}
              />
            ))}

          {vista === 'dia' && (
            <ListaDoDia
              consultas={consultas.filter(c => c.diaISO === foco)}
              buracos={buracosDoDia(
                consultas.filter(c => c.diaISO === foco),
                new Date(foco + 'T12:00:00'),
                new Date(),
                expediente,
              )}
              onAbrirFicha={setFichaAberta}
              onAgir={setAgindoEm}
              onMarcar={hora => setMarcando({ data: emBarras(foco), hora })}
            />
          )}
        </ScrollView>
      )}

      {painel}
    </View>
  )
}

function Mes({
  anoMes,
  contagem,
  hoje,
  foco,
  onEscolher,
}: {
  anoMes: string
  contagem: Map<string, number>
  hoje: string
  foco: string
  onEscolher: (dia: string) => void
}) {
  const styles = estilos()
  const grade = gradeDoMes(anoMes, contagem)
  const total = grade.filter(c => c.doMes).reduce((s, c) => s + c.quantas, 0)

  return (
    <View>
      <View style={styles.cabecalhoDaGrade}>
        {CABECALHO_DA_SEMANA.map((letra, i) => (
          <Text key={i} style={styles.letraDoDia}>
            {letra}
          </Text>
        ))}
      </View>

      <View style={styles.grade}>
        {grade.map(c => (
          <CelulaDoMes
            key={c.iso}
            celula={c}
            ehHoje={c.iso === hoje}
            escolhida={c.iso === foco}
            onEscolher={onEscolher}
          />
        ))}
      </View>

      {/* ──────────────────── A LEGENDA ────────────────────
          "Não tem bola de cristal para adivinhar aqui." Ele estava certo: a
          grade desenha uma bolinha por consulta até três, e daí em diante um
          número -- e nada na tela dizia isso. Quem vê "4" numa célula não tem
          como saber se são quatro consultas ou o dia 4 repetido.

          Fica embaixo da grade, e não em cima: legenda antes do desenho é lida
          por ninguém, porque ainda não há o que explicar. */}
      <View style={styles.legenda}>
        <View style={styles.itemDaLegenda}>
          <View style={styles.pontos}>
            <View style={styles.ponto} />
          </View>
          <Text style={styles.textoDaLegenda}>1 consulta</Text>
        </View>

        <View style={styles.itemDaLegenda}>
          <View style={styles.pontos}>
            <View style={styles.ponto} />
            <View style={styles.ponto} />
            <View style={styles.ponto} />
          </View>
          <Text style={styles.textoDaLegenda}>até 3</Text>
        </View>

        <View style={styles.itemDaLegenda}>
          <Text style={styles.muitas}>5</Text>
          <Text style={styles.textoDaLegenda}>4 ou mais</Text>
        </View>

        <View style={styles.itemDaLegenda}>
          <View style={styles.exemploDeHoje}>
            <Text style={[styles.numeroDoDia, styles.numeroDeHoje]}>9</Text>
          </View>
          <Text style={styles.textoDaLegenda}>hoje</Text>
        </View>
      </View>

      <Text style={styles.totalDoMes}>
        {total === 0
          ? 'Nenhuma consulta marcada neste mês.'
          : total === 1
            ? '1 consulta neste mês · ' + diasNoMes(anoMes) + ' dias'
            : total + ' consultas neste mês'}
      </Text>
    </View>
  )
}

function CelulaDoMes({
  celula,
  ehHoje,
  escolhida,
  onEscolher,
}: {
  celula: Celula
  ehHoje: boolean
  escolhida: boolean
  onEscolher: (dia: string) => void
}) {
  const styles = estilos()
  const numero = Number(celula.iso.slice(8, 10))

  return (
    <Pressable
      onPress={() => onEscolher(celula.iso)}
      style={styles.celula}
      accessibilityRole="button"
      /* O número de consultas entra no rótulo falado, e não só nas bolinhas:
         um ponto colorido não existe para quem usa leitor de tela. */
      accessibilityLabel={
        tituloDoDia(celula.iso) +
        (celula.quantas === 0
          ? ', sem consulta'
          : ', ' + celula.quantas + (celula.quantas === 1 ? ' consulta' : ' consultas'))
      }
    >
      <View
        style={[
          styles.numeroArea,
          ehHoje && styles.hojeArea,
          escolhida && !ehHoje && styles.escolhidaArea,
        ]}
      >
        <Text
          style={[
            styles.numeroDoDia,
            !celula.doMes && styles.numeroDeFora,
            ehHoje && styles.numeroDeHoje,
          ]}
        >
          {numero}
        </Text>
      </View>

      {/* Até três bolinhas, e depois um número. Contar seis pontos é mais lento
          do que ler "6", e a questão aqui é o relance. */}
      <View style={styles.pontos}>
        {celula.quantas > 0 && celula.quantas <= 3 ? (
          Array.from({ length: celula.quantas }).map((_, i) => (
            <View key={i} style={[styles.ponto, !celula.doMes && styles.pontoDeFora]} />
          ))
        ) : celula.quantas > 3 ? (
          <Text style={[styles.muitas, !celula.doMes && styles.numeroDeFora]}>
            {celula.quantas}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function BlocoDeDia({
  dia,
  hoje,
  consultas,
  onAbrirDia,
  onAbrirFicha,
  onAgir,
}: {
  dia: string
  hoje: string
  consultas: ConsultaDoDia[]
  onAbrirDia: () => void
  onAbrirFicha: (id: number) => void
  onAgir: (c: ConsultaDoDia) => void
}) {
  const styles = estilos()

  return (
    /* O CABEÇALHO abre o dia; cada NOME abre a ficha. Duas ações no mesmo
       cartão, e é de propósito: o bloco inteiro tocável engoliria o toque no
       nome, e o nome é o que ela quer na maior parte das vezes. */
    <View style={styles.blocoDia}>
      <Pressable
        onPress={onAbrirDia}
        style={({ pressed }) => pressed && styles.pressionado}
        accessibilityRole="button"
        accessibilityLabel={tituloDoDia(dia) + '. Toque para ver o dia inteiro.'}
      >
        <View style={styles.topoDoBloco}>
          <Text style={[styles.tituloDoBloco, dia === hoje && styles.tituloDeHoje]}>
            {tituloDoDia(dia)}
            {dia === hoje ? ' · hoje' : ''}
          </Text>
          {consultas.length > 0 && (
            <Text style={styles.contadorDoBloco}>{consultas.length}</Text>
          )}
        </View>
      </Pressable>

      {consultas.length === 0 ? (
        /* "Sem consulta marcada", e não "livre": o app só enxerga a agenda, e
           ela pode ter mil coisas nesse dia. A frase fala do que o app SABE. */
        <Text style={styles.blocoLivre}>Sem consulta marcada</Text>
      ) : (
        consultas.map(c => (
          <Linha key={c.id} consulta={c} onAbrirFicha={onAbrirFicha} onAgir={onAgir} />
        ))
      )}
    </View>
  )
}

function ListaDoDia({
  onMarcar,
  consultas,
  buracos,
  onAbrirFicha,
  onAgir,
}: {
  consultas: ConsultaDoDia[]
  buracos: Buraco[]
  /** Abre a tela de marcar já com esta hora ("14:30"), ou só com o dia. */
  onMarcar: (hora?: string) => void
  onAbrirFicha: (id: number) => void
  onAgir: (c: ConsultaDoDia) => void
}) {
  const styles = estilos()

  /* ──────────────────── CONSULTA E BURACO NA MESMA LISTA, em ordem de hora ────────────────────
   *
   * Duas listas separadas -- "consultas" em cima e "vagas" embaixo -- fariam ela
   * ler as duas e cruzar de cabeça, que é exatamente o trabalho que isto veio
   * tirar. Intercalado, o dia se lê de cima a baixo: cheio, vago, cheio.
   *
   * A chave do buraco é o instante, e não o índice: dois buracos podem trocar
   * de posição quando uma consulta é cancelada, e chave por índice faria o
   * React reaproveitar a linha errada. */
  const doDia = [
    ...consultas.map(c => ({ chave: 'c' + c.id, quando: Date.parse(c.quando), consulta: c, buraco: null as Buraco | null })),
    ...buracos.map(b => ({ chave: 'b' + b.de, quando: b.de, consulta: null as ConsultaDoDia | null, buraco: b })),
  ].sort((a, b) => a.quando - b.quando)

  if (doDia.length === 0) {
    return (
      <View style={styles.vazio}>
        <Ionicons name="calendar-clear-outline" size={22} color={paleta().inkFraco} />
        <Text style={styles.textoVazio}>Sem consulta marcada neste dia.</Text>
        {/* O dia vazio é onde ele travou: "estou no dia que não tem nenhum, não
            deixa incluir". Um dia vazio sem saída é a tela dizendo não. */}
        <Pressable
          onPress={() => onMarcar()}
          style={({ pressed }) => [styles.botaoDoVazio, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel="Marcar consulta neste dia"
        >
          <Ionicons name="add" size={16} color={paleta().cores.branco} />
          <Text style={styles.textoDoBotaoDoVazio}>Marcar consulta</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.listaDoDia}>
      {doDia.map(x =>
        x.consulta ? (
          <Linha key={x.chave} consulta={x.consulta} onAbrirFicha={onAbrirFicha} onAgir={onAgir} />
        ) : (
          <VagaLivre key={x.chave} buraco={x.buraco!} onMarcar={onMarcar} />
        ),
      )}
    </View>
  )
}

/* ──────────────────── UMA VAGA ────────────────────
 *
 * Tracejada, e sem cartão. É o oposto visual de uma consulta de propósito: o
 * contorno cheio diz "isto está ocupado" e o tracejado diz "isto está vazio",
 * e as duas coisas na mesma lista precisam se distinguir sem ela ler.
 *
 * ──── E AGORA É BOTÃO ────
 * Dizia aqui que não era, porque a tela de marcar não existia e um retângulo
 * que parece tocável e não faz nada é pior do que um que não promete. A tela
 * existe desde 11/09: tocar num horário livre abre a marcação com o dia e a
 * HORA deste buraco já preenchidos, que é o caminho mais curto entre ver o
 * vazio e preenchê-lo. */
function VagaLivre({ buraco, onMarcar }: { buraco: Buraco; onMarcar: (hora?: string) => void }) {
  const styles = estilos()
  const hora = (t: number) => {
    const x = new Date(t)
    return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0')
  }
  const de = hora(buraco.de)
  const ate = hora(buraco.ate)

  return (
    <Pressable
      onPress={() => onMarcar(de)}
      style={({ pressed }) => [styles.vaga, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={`Livre das ${de} às ${ate}, ${duracaoPorExtenso(buraco.minutos)}. Marcar consulta.`}
    >
      <Text style={styles.horaDaVaga}>{de}</Text>
      <Text style={styles.textoDaVaga}>
        Livre até {ate}
      </Text>
      <Text style={styles.duracaoDaVaga}>{duracaoPorExtenso(buraco.minutos)}</Text>
      <Ionicons name="add-circle-outline" size={18} color={paleta().cores.verde} />
    </Pressable>
  )
}

function Linha({
  consulta,
  onAbrirFicha,
  onAgir,
}: {
  consulta: ConsultaDoDia
  onAbrirFicha: (id: number) => void
  onAgir: (c: ConsultaDoDia) => void
}) {
  const styles = estilos()
  const passada = consulta.status === 'realizada'
  const temFicha = !!consulta.pacienteId
  /* Cancelada já não tem o que remarcar nem o que cancelar, e realizada só
     aceita cancelamento -- que é decisão de dinheiro e mora no computador
     quando há pagamento. Esconder o botão nos dois casos evita um painel que
     abre para dizer não. */
  const podeAgir = consulta.status !== 'cancelada' && !passada

  return (
    <View style={styles.linhaComAcao}>
    <Pressable
      onPress={() => consulta.pacienteId && onAbrirFicha(consulta.pacienteId)}
      /* Encaixe avulso não tem ficha para abrir, e por isso não é botão: tocar
         num nome e nada acontecer é pior do que ele não parecer tocável. */
      disabled={!temFicha}
      style={({ pressed }) => [styles.linha, pressed && styles.pressionado]}
      accessibilityRole={temFicha ? 'button' : 'text'}
      accessibilityLabel={
        hhmm(consulta.quando) + ', ' + consulta.nome +
        (temFicha ? '. Toque para abrir a ficha.' : '')
      }
    >
      <Text style={[styles.hora, passada && styles.apagado]}>{hhmm(consulta.quando)}</Text>
      <Text style={[styles.nome, passada && styles.apagado]} numberOfLines={1}>
        {consulta.nome}
      </Text>
      {passada && <Ionicons name="checkmark" size={15} color={paleta().inkFraco} />}
      {/* A seta some quando ha o botao de acao ao lado.
          Duas marcas no mesmo canto direito -- uma seta e tres pontinhos --
          disputam o mesmo toque e nao dizem qual faz o que. Com o botao
          presente, quem abre a ficha e a LINHA inteira; sem ele, a seta volta
          a ser o unico sinal de que da para tocar. */}
      {temFicha && !podeAgir && (
        <Ionicons name="chevron-forward" size={14} color={paleta().inkFraco} />
      )}
    </Pressable>

    {/* Botão próprio, e não toque longo: toque longo não se descobre sozinho, e
        uma função que ninguém acha é uma função que não existe. Fica FORA do
        Pressable de cima porque Pressable dentro de Pressable no Android deixa a
        área de toque ambigua -- e o toque errado aqui abre a ficha de quem ela
        queria cancelar. */}
    {podeAgir && (
      <Pressable
        onPress={() => onAgir(consulta)}
        hitSlop={10}
        style={({ pressed }) => [styles.tresPontinhos, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel={'Remarcar ou cancelar a consulta de ' + consulta.nome}
      >
        <Ionicons name="ellipsis-horizontal" size={16} color={paleta().inkFraco} />
      </Pressable>
    )}
    </View>
  )
}

/* ──────────────────── O PAINEL DE REMARCAR E CANCELAR ────────────────────
 *
 * Um degrau de cada vez: menu -> formulário. E o formulário de cancelar exige o
 * motivo, porque o motivo NÃO é burocracia -- é o texto que o PACIENTE lê na
 * tela de confirmação dele. Cancelar sem motivo deixa alguém sem consulta e sem
 * explicação.
 *
 * ──── Quem decide é o banco, e a frase que aparece é a dele ────
 * As duas ações são RPC. Nada de regra escrita aqui: a mesma função atende
 * este botão e a Aurora, e uma segunda cópia da regra divergiria no dia em que
 * uma ganhasse um caso novo. A recusa também vem de lá inteira -- é ela que diz
 * QUEM ocupa o horário, ou que há parcela paga, ou que a série continua marcada.
 * Traduzir aqui seria reescrever com menos informação. */
/* Exportado para a tela Hoje usar o MESMO painel.
 *
 * O Helton pediu remarcar direto do cartao do proximo paciente: "clico na
 * minha consulta de agora e nao consigo fazer mais nada". Uma segunda folha
 * escrita la teria os mesmos dois botoes e divergiria na primeira regra nova --
 * armadilha 5, e desta vez em cima de cancelar consulta, que mexe em dinheiro.
 *
 * Mora aqui e nao num arquivo proprio porque ela usa a folha de estilo desta
 * tela inteira; mover exigiria duplicar a folha, que e o mesmo problema com
 * outro nome. */
/* "2026-09-12" vira "12/09/2026" -- o formato do campo da tela de marcar. */
function emBarras(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : ''
}

export function PainelDaConsulta({
  consulta,
  onFechar,
  onMudou,
}: {
  consulta: ConsultaDoDia
  onFechar: () => void
  onMudou: () => void
}) {
  const styles = estilos()
  const { bottom } = useSafeAreaInsets()
  /* ──────────────────── O TECLADO, e a folha que mora no rodapé ────────────────────
   *
   * A folha é `absoluteFill` com `justifyContent: 'flex-end'`: ela vive colada
   * embaixo. E os campos de Remarcar (data e hora) e de Cancelar (motivo) estão
   * dentro dela -- ou seja, exatamente onde o teclado sobe.
   *
   * No Expo Go a janela NÃO encolhe (armadilha 2), então sem desvio a pessoa
   * toca em Remarcar, o teclado abre, e os dois campos ficam atrás dele. E
   * `KeyboardAvoidingView` não resolve aqui: dentro de um `absoluteFill` ele
   * erra de qualquer jeito. O que funciona é o deslocamento medido, que já soma
   * teclado + área segura -- as duas SOMAM, e foi isso que custou seis
   * tentativas na tela de conversa. */
  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)
  const [modo, setModo] = useState<'menu' | 'remarcar' | 'cancelar' | 'nota'>('menu')
  /* A nota do atendimento, escrita logo depois de dar por atendida. É a mesma
     coluna que a ficha mostra no topo como "onde a gente parou" -- escrita no
     corredor ela existe; deixada para a noite, é o que mais se perde. */
  const [nota, setNota] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  /* A trava do toque duplo: `salvando` só vale na renderização seguinte, e
     confirmar duas vezes é pedir ao banco duas vezes a mesma coisa. */
  const salvandoAgora = useRef(false)
  const [recado, setRecado] = useState('')
  /* Ligado quando o consultório gera título sozinho ao dar por atendida. Serve
     só para a frase: é o que diz a ela que o lançamento NÃO nasceu aqui. */
  const [financeiroAuto, setFinanceiroAuto] = useState(false)

  useEffect(() => {
    let vivo = true
    void geraFinanceiroSozinho().then(x => {
      if (vivo) setFinanceiroAuto(x)
    })
    return () => {
      vivo = false
    }
  }, [])

  /* Sem lista de dependências, pelo mesmo motivo da tela: assim este fica na
     frente do da agenda e do `AreaDaNutri`, e o voltar descasca um degrau por
     vez em vez de fechar tudo. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (salvando) return true
      if (modo !== 'menu') {
        setModo('menu')
        setRecado('')
        return true
      }
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  /* ──────────────────── O BÁSICO QUE SÓ EXISTIA NO SITE ────────────────────
   *
   * "Confirmar que eu atendi, essas coisinhas têm que funcionar aqui." Eram
   * dois toques no computador, e no celular não havia nenhum: a agenda mostrava
   * o dia e não deixava mexer no estado de nada. */
  async function acao(qual: 'confirmar' | 'atendida') {
    if (salvando || salvandoAgora.current) return
    salvandoAgora.current = true
    setSalvando(true)
    setRecado('')

    const r =
      qual === 'confirmar'
        ? await confirmarConsulta(consulta.id)
        : await marcarComoAtendida(consulta.id)

    salvandoAgora.current = false
    setSalvando(false)

    if (!r.ok) {
      setRecado(r.mensagem)
      return
    }

    /* Confirmar fecha: a prova é a linha mudando de cor na lista. Atendida NÃO
       fecha -- ela abre a nota, porque é o instante em que a nota existe na
       cabeça dela. Pular direto seria mandar escrever depois, e depois quer
       dizer nunca. */
    if (qual === 'confirmar') onMudou()
    else {
      setModo('nota')
      setRecado('Consulta dada por atendida.')
    }
  }

  async function guardarNota() {
    if (salvando || salvandoAgora.current) return
    salvandoAgora.current = true
    setSalvando(true)

    const r = await salvarNotaDoAtendimento(consulta.id, nota)

    salvandoAgora.current = false
    setSalvando(false)

    if (r.ok) onMudou()
    else setRecado(r.mensagem)
  }

  async function confirmarRemarcacao() {
    const lido = interpretarRemarcacao(data, hora)
    if (lido.tipo === 'erro') {
      setRecado(lido.mensagem)
      return
    }
    setSalvando(true)
    setRecado('')
    const r = await remarcarConsulta(consulta.id, lido.quando)
    setSalvando(false)
    if (r.ok) onMudou()
    /* A recusa fica NA TELA e o painel NÃO fecha: ela precisa ler com quem
       chocou para escolher outro horário, e fechar levaria a frase junto. */
    else setRecado(r.mensagem)
  }

  async function confirmarCancelamento() {
    setSalvando(true)
    setRecado('')
    const r = await cancelarConsulta(consulta.id, motivo)
    setSalvando(false)
    if (r.ok) onMudou()
    else setRecado(r.mensagem)
  }

  return (
    <View
      style={styles.sobreposta}
      /* A altura vem daqui, e não de `useWindowDimensions`: num build de
         verdade a janela encolhe com o teclado, e a medida do `onLayout`
         encolhe junto -- é o que impede a conta de somar duas vezes. */
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      {/* O fundo fecha, como toda folha deste app. Nunca enquanto grava: fechar
          no meio deixaria ela sem saber se cancelou ou não. */}
      <Pressable
        style={styles.fundoDaFolha}
        onPress={() => !salvando && onFechar()}
        accessibilityLabel="Fechar"
      />

      <View style={[styles.folha, { paddingBottom: 26 + respiro }]}>
        <View style={styles.puxador} />

        <Text style={styles.tituloDaFolha} numberOfLines={1}>
          {consulta.nome}
        </Text>
        <Text style={styles.subtituloDaFolha}>{hhmm(consulta.quando)}</Text>

        {modo === 'menu' && (
          <>
            {/* Só o que cabe NESTE estado. Confirmar uma consulta já confirmada
                ou dar por atendida uma cancelada são opções que existiriam para
                a pessoa descobrir, tocando, que não fazem nada. */}
            {consulta.status === 'pendente' && (
              <Pressable
                onPress={() => void acao('confirmar')}
                disabled={salvando}
                style={({ pressed }) => [styles.opcaoDaFolha, pressed && styles.pressionado]}
                accessibilityRole="button"
                accessibilityLabel="Confirmar consulta"
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={paleta().cores.verde} />
                <Text style={styles.textoDaOpcao}>Confirmar</Text>
              </Pressable>
            )}

            {(consulta.status === 'pendente' || consulta.status === 'confirmada') && (
              <Pressable
                onPress={() => void acao('atendida')}
                disabled={salvando}
                style={({ pressed }) => [styles.opcaoDaFolha, pressed && styles.pressionado]}
                accessibilityRole="button"
                accessibilityLabel="Marcar como atendida"
              >
                <Ionicons name="person-circle-outline" size={18} color={paleta().cores.ink} />
                <Text style={styles.textoDaOpcao}>Atendi esta consulta</Text>
              </Pressable>
            )}

            {financeiroAuto &&
              (consulta.status === 'pendente' || consulta.status === 'confirmada') && (
                /* Dito ANTES, e não depois: no sistema, dar por atendida também
                   gera o título quando o consultório tem geração automática, e
                   essa regra (mensalidade, convênio, parcelas) mora lá. Marcar
                   aqui e ela descobrir sozinha que a cobrança não nasceu é o
                   defeito que já custou dez consultas sem título em agosto. */
                <Text style={styles.dica}>
                  O lançamento no financeiro continua sendo feito no computador.
                </Text>
              )}

            <Pressable
              onPress={() => {
                setModo('remarcar')
                setRecado('')
              }}
              style={({ pressed }) => [styles.opcaoDaFolha, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={18} color={paleta().cores.ink} />
              <Text style={styles.textoDaOpcao}>Remarcar</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setModo('cancelar')
                setRecado('')
              }}
              style={({ pressed }) => [styles.opcaoDaFolha, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle-outline" size={18} color={paleta().cores.erroTexto} />
              <Text style={[styles.textoDaOpcao, styles.textoPerigo]}>Cancelar consulta</Text>
            </Pressable>
          </>
        )}

        {modo === 'nota' && (
          <>
            <Text style={styles.dica}>
              O que ficou desta consulta? Aparece no topo da ficha dela, e é o que você lê antes
              da próxima.
            </Text>
            <TextInput
              value={nota}
              onChangeText={setNota}
              placeholder="Trouxe os exames, começou a caminhada, vai voltar em 30 dias…"
              placeholderTextColor={paleta().inkFraco}
              multiline
              style={[styles.campo, styles.campoDaNota]}
              accessibilityLabel="Nota do atendimento"
            />
            {!!recado && <Text style={styles.recado}>{recado}</Text>}
            <BotoesDaFolha
              rotulo="Guardar nota"
              salvando={salvando}
              onVoltar={() => {
                /* Sem nota também é uma resposta, e a consulta já está
                   atendida: fechar aqui não desfaz nada. */
                onMudou()
              }}
              onConfirmar={() => void guardarNota()}
            />
          </>
        )}

        {modo === 'remarcar' && (
          <>
            <View style={styles.doisCampos}>
              <View style={styles.campoCurto}>
                <Text style={styles.rotulo}>Data</Text>
                <TextInput
                  value={data}
                  onChangeText={x => setData(mascaraDeData(x))}
                  placeholder="16/09"
                  placeholderTextColor={paleta().inkFraco}
                  keyboardType="number-pad"
                  style={styles.campo}
                  maxLength={10}
                />
              </View>
              <View style={styles.campoCurto}>
                <Text style={styles.rotulo}>Hora</Text>
                <TextInput
                  value={hora}
                  onChangeText={x => setHora(mascaraDeHora(x))}
                  placeholder="14:30"
                  placeholderTextColor={paleta().inkFraco}
                  keyboardType="number-pad"
                  style={styles.campo}
                  maxLength={5}
                />
              </View>
            </View>
            <Text style={styles.dica}>
              O ano entra sozinho. As outras sessões da série, se houver, ficam onde
              estão.
            </Text>
            {!!recado && <Text style={styles.recado}>{recado}</Text>}
            <BotoesDaFolha
              rotulo="Remarcar"
              salvando={salvando}
              onVoltar={() => {
                setModo('menu')
                setRecado('')
              }}
              onConfirmar={() => void confirmarRemarcacao()}
            />
          </>
        )}

        {modo === 'cancelar' && (
          <>
            <Text style={styles.rotulo}>Motivo</Text>
            <TextInput
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Imprevisto no consultório"
              placeholderTextColor={paleta().inkFraco}
              style={[styles.campo, styles.campoLargo]}
              multiline
              maxLength={200}
            />
            <Text style={styles.dica}>
              O paciente lê esse texto na confirmação dele.
            </Text>
            {!!recado && <Text style={styles.recado}>{recado}</Text>}
            <BotoesDaFolha
              rotulo="Cancelar consulta"
              perigo
              salvando={salvando}
              onVoltar={() => {
                setModo('menu')
                setRecado('')
              }}
              onConfirmar={() => void confirmarCancelamento()}
            />
          </>
        )}
      </View>
    </View>
  )
}

/* Voltar é o LARGO e confirmar o estreito, como no cartão da Aurora: o toque
   sem atenção vai no maior, e o maior tem de ser o que NÃO muda a agenda de
   ninguém. */
function BotoesDaFolha({
  rotulo,
  perigo,
  salvando,
  onVoltar,
  onConfirmar,
}: {
  rotulo: string
  perigo?: boolean
  salvando: boolean
  onVoltar: () => void
  onConfirmar: () => void
}) {
  const styles = estilos()
  return (
    <View style={styles.botoesDaFolha}>
      <Pressable
        onPress={onVoltar}
        disabled={salvando}
        style={({ pressed }) => [
          styles.voltarDaFolha,
          salvando && styles.desligado,
          pressed && styles.pressionado,
        ]}
        accessibilityRole="button"
      >
        <Text style={styles.textoVoltar}>Voltar</Text>
      </Pressable>

      <Pressable
        onPress={onConfirmar}
        disabled={salvando}
        style={({ pressed }) => [
          styles.confirmarDaFolha,
          perigo && styles.confirmarPerigo,
          salvando && styles.desligado,
          pressed && styles.pressionado,
        ]}
        accessibilityRole="button"
      >
        {salvando ? (
          <ActivityIndicator color={paleta().cores.branco} size="small" />
        ) : (
          <Text style={styles.textoConfirmar}>{rotulo}</Text>
        )}
      </Pressable>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },

    /* ──── A linha, e os três pontinhos ao lado ──── */
    linhaComAcao: { flexDirection: 'row', alignItems: 'center' },
    tresPontinhos: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 17,
    },

    /* ──── A folha que sobe de baixo ──── */
    sobreposta: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
    /* O fundo escurece o que está atrás em vez de esconder: ela continua vendo a
       agenda, e é isso que diz que a folha é um degrau e não outra tela. */
    fundoDaFolha: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
    folha: {
      backgroundColor: t.cores.cartao,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 26,
      gap: 8,
    },
    puxador: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.cores.borda,
      marginBottom: 8,
    },
    tituloDaFolha: { fontFamily: FONTE.forte, fontSize: 17, color: t.cores.ink, letterSpacing: -0.4 },
    subtituloDaFolha: { fontSize: 13, color: t.inkFraco, marginBottom: 6 },

    opcaoDaFolha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: t.cores.superficie,
    },
    textoDaOpcao: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink },
    textoPerigo: { color: t.cores.erroTexto },

    doisCampos: { flexDirection: 'row', gap: 10 },
    campoCurto: { flex: 1, gap: 4 },
    rotulo: { fontFamily: FONTE.meia, fontSize: 12, color: t.inkFraco, letterSpacing: 0.2 },
    campo: {
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: t.cores.ink,
    },
    campoLargo: { minHeight: 68, textAlignVertical: 'top' },
    /* Mais alta que a do motivo: a nota do atendimento é o texto mais longo que
       ela escreve nesta folha, e um campo de três linhas faz parecer que só
       cabe uma frase. */
    campoDaNota: { minHeight: 96, textAlignVertical: 'top' },
    dica: { fontSize: 11.5, color: t.inkFraco, lineHeight: 16 },
    /* A frase do banco, com folga para caber inteira: a recusa de choque traz
       nome e horário, e cortar isso em duas linhas com reticências tiraria
       justamente o que ela precisa para escolher outro horário. */
    recado: {
      fontSize: 12.5,
      color: t.cores.ink,
      lineHeight: 18,
      backgroundColor: t.cores.superficie,
      padding: 10,
      borderRadius: 10,
    },

    botoesDaFolha: { flexDirection: 'row', gap: 8, marginTop: 4 },
    voltarDaFolha: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoVoltar: { fontFamily: FONTE.meia, fontSize: 14, color: t.cores.ink },
    confirmarDaFolha: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 130,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: t.cores.verde,
    },
    confirmarPerigo: { backgroundColor: t.cores.erroTexto },
    textoConfirmar: { fontFamily: FONTE.forte, fontSize: 14, color: t.cores.branco },
    /* Cor pr'+chr(243)+'pria, e n'+chr(227)+'o `opacity`. O `cores.desligado` existe exatamente por
       isto, e o coment'+chr(225)+'rio dele traz a medi'+chr(231)+chr(227)+'o: opacidade comp'+chr(245)+'e o texto E o
       fundo contra a p'+chr(225)+'gina e destr'+chr(243)+'i a raz'+chr(227)+'o entre os dois -- um prim'+chr(225)+'rio a
       0.45 deu contraste 1,43, quando o m'+chr(237)+'nimo leg'+chr(237)+'vel '+chr(233)+' 4,5. Eu tinha escrito
       `opacity: 0.5` aqui sem olhar; o tema j'+chr(225)+' sabia. */
    desligado: { backgroundColor: t.cores.desligado, borderColor: t.cores.desligado },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 6,
    },
    seta: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    botaoMarcar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    recadoDaAgenda: {
      marginHorizontal: 16,
      marginBottom: 8,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 12,
    },
    tituloArea: { flex: 1, alignItems: 'center' },
    /* 23 e não 18. É o título desta tela, e ele estava do tamanho de um
       subtítulo -- espremido entre duas setas, sem peso nenhum para dizer que
       ele é o assunto. Fica menor que os 29 de Hoje e Pacientes de propósito:
       aquelas são telas de entrada, esta é uma tela de navegar. */
    titulo: {
      fontFamily: FONTE.forte,
      fontSize: 23,
      color: t.cores.ink,
      letterSpacing: -0.7,
    },
    voltarAHoje: { fontFamily: FONTE.meia, fontSize: 11.5, color: t.cores.verde, marginTop: 1 },

    /* Três opções num trilho, e não três botões soltos: o trilho diz que uma
       delas está sempre ligada, que é o que separa "escolher a vista" de
       "executar três ações diferentes". */
    seletor: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: t.cores.superficie,
      borderRadius: 12,
      padding: 3,
    },
    opcao: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
    opcaoAtiva: { backgroundColor: t.cores.cartao },
    textoOpcao: { fontFamily: FONTE.media, fontSize: 13.5, color: t.inkSuave },
    /* Família, e não `fontWeight`. Com a fonte carregada o peso é arquivo, e
       `fontWeight: '800'` sobre `Archivo_500Medium` desenharia o medium sem erro
       -- a opção escolhida ficaria igual às outras, com só o fundo do trilho
       separando. Ver `lib/fontes.ts`. */
    textoOpcaoAtivo: { fontFamily: FONTE.forte, color: t.cores.ink },

    erro: {
      marginHorizontal: 16,
      marginBottom: 8,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 10,
    },

    conteudo: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },

    cabecalhoDaGrade: { flexDirection: 'row', paddingBottom: 6 },
    letraDoDia: {
      flex: 1,
      textAlign: 'center',
      fontFamily: FONTE.forte,
      fontSize: 11,
      color: t.inkFraco,
    },
    grade: { flexDirection: 'row', flexWrap: 'wrap' },
    /* Um sétimo exato, para as sete colunas fecharem em qualquer largura. */
    celula: { width: '14.2857%', alignItems: 'center', paddingVertical: 5 },
    numeroArea: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hojeArea: { backgroundColor: t.cores.verde },
    escolhidaArea: { borderWidth: 1.5, borderColor: t.cores.verde },
    numeroDoDia: { fontFamily: FONTE.media, fontSize: 14, color: t.cores.ink, fontVariant: ['tabular-nums'] },
    /* As sobras dos meses vizinhos ficam apagadas, e não em branco: buraco na
       primeira linha se lê como defeito, e 31 de agosto é um dia real. */
    numeroDeFora: { color: t.inkFraco },
    numeroDeHoje: { fontFamily: FONTE.forte, color: t.cores.branco },

    pontos: { flexDirection: 'row', gap: 2, height: 10, alignItems: 'center' },
    ponto: { width: 4.5, height: 4.5, borderRadius: 3, backgroundColor: t.cores.verde },
    pontoDeFora: { backgroundColor: t.inkFraco },
    muitas: { fontFamily: FONTE.forte, fontSize: 9.5, color: t.cores.verde },

    legenda: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 16,
      paddingTop: 14,
    },
    itemDaLegenda: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    textoDaLegenda: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco },
    /* Do tamanho da célula de verdade, para o exemplo ser reconhecível: um
       círculo menor ao lado da palavra "hoje" não se liga ao que está na grade
       logo acima. */
    exemploDeHoje: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.verde,
    },
    totalDoMes: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco, textAlign: 'center', paddingTop: 12 },

    /* Ganha borda, como todo cartão das telas novas. Sem ela, creme sobre
       creme se separava só pela diferença de tom entre `cartao` e `fundo` --
       que é de propósito pequena, e num aparelho ao sol some. */
    blocoDia: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    topoDoBloco: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
    tituloDoBloco: { flex: 1, fontFamily: FONTE.forte, fontSize: 13.5, color: t.inkSuave, letterSpacing: -0.2 },
    tituloDeHoje: { color: t.cores.verde },
    contadorDoBloco: {
      fontFamily: FONTE.meia,
      fontSize: 11.5,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    blocoLivre: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco, paddingVertical: 6 },

    listaDoDia: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    /* `flex: 1` e `minWidth: 0`, e sem eles os tres pontinhos saem do cartao.
       Este Pressable e o irmao esquerdo do botao de acao dentro de
       `linhaComAcao`, e ele carrega um texto com `flex: 1` dentro. Sem um limite
       proprio, o filho flexivel faz o pai crescer ate a largura toda -- o botao
       nao cabe, e o Android nao corta: ele desenha fora. Foi o que o Helton viu
       na vista Dia, com o `...` pendurado do lado de fora da tela. */
    linha: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
    },

    /* Tracejado e sem preenchimento: o vazio precisa PARECER vazio ao lado de
       uma consulta, senão as duas viram a mesma linha com texto diferente. */
    vaga: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginVertical: 5,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.cores.trilho,
    },
    horaDaVaga: {
      width: 46,
      fontFamily: FONTE.meia,
      fontSize: 13.5,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    textoDaVaga: { flex: 1, fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave },
    duracaoDaVaga: {
      fontFamily: FONTE.meia,
      fontSize: 12,
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    /* Deixa de ser VERDE. Verde é a cor da ação nesta área -- Aceitar,
       Confirmar, Remarcar --, e uma coluna inteira de horários verdes fazia a
       agenda parecer uma lista de botões. O horário é dado, e dado é tinta
       normal; quem separa a coluna do nome é a largura fixa e o dígito
       tabular, que continuam aqui. */
    hora: {
      fontFamily: FONTE.meia,
      fontSize: 13.5,
      color: t.inkSuave,
      width: 46,
      fontVariant: ['tabular-nums'],
    },
    nome: { flex: 1, fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink, letterSpacing: -0.2 },
    /* Só cor: o peso vem da família, e `fontWeight: '400'` aqui não afinaria
       nada -- desenharia o mesmo arquivo. */
    apagado: { color: t.inkFraco },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 34,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
    },
    textoVazio: { fontSize: 14, color: t.inkSuave },
    botaoDoVazio: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      backgroundColor: t.cores.verde,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    textoDoBotaoDoVazio: { fontFamily: FONTE.forte, fontSize: 13.5, color: t.cores.branco },

    pressionado: { opacity: 0.75 },
  }),
)
