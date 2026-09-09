import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { consultasNoPeriodo } from '../lib/agendaDaNutri'
import {
  CABECALHO_DA_SEMANA,
  contarPorDia,
  diasDaSemana,
  diasNoMes,
  gradeDoMes,
  hojeLocal,
  mesAndando,
  mesDe,
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
 * ──────────────────── Uma leitura por PER~II~ODO, e não uma por célula ────────────────────
 * A grade do mês tem até 42 células. Uma consulta ao banco por célula seria a
 * tela abrindo em segundos no 4G de dentro de um prédio -- e cada uma cobrando
 * a mesma política de RLS outra vez.
 *
 * ──────────────────── E a grade NÃO mostra os nomes ────────────────────
 * Só quantas. Trinta e cinco células com nome viram uma parede de texto de 6
 * pontos que ninguém lê; o nome aparece quando ela TOCA no dia, que é quando
 * ela quer saber de quem é. */

export function AgendaDaNutriScreen() {
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

  /* Que pedaço do calendário está na tela. O mês pede a grade INTEIRA, sobras
     inclusive: as células de 31 de agosto e 4 de outubro também mostram
     bolinha, e sem esses dias no pedido elas nasceriam vazias mentindo. */
  const periodo = useMemo(() => {
    if (vista === 'dia') return { de: foco, ate: foco }
    if (vista === 'semana') {
      const dias = diasDaSemana(foco)
      return { de: dias[0] ?? foco, ate: dias[6] ?? foco }
    }
    const grade = gradeDoMes(mesDe(foco), new Map())
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

  function andar(passo: number) {
    if (vista === 'dia') return setFoco(somandoDias(foco, passo))
    if (vista === 'semana') return setFoco(somandoDias(foco, passo * 7))
    /* No mês o passo é de M~EC~S, e o dia em foco vai para o dia 1 -- somar 30
       dias faria janeiro pular fevereiro em anos de 31. `mesAndando` não deixa
       o dia entrar na conta. */
    const novo = mesAndando(mesDe(foco), passo)
    setFoco(primeiroDiaDoMes(novo) || foco)
  }

  const titulo =
    vista === 'dia' ? tituloDoDia(foco)
    : vista === 'semana' ? tituloDaSemana(foco)
    : nomeDoMes(mesDe(foco))

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
          {mesDe(foco) !== mesDe(hoje) || (vista !== 'mes' && foco !== hoje) ? (
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
              anoMes={mesDe(foco)}
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
                onAbrir={() => {
                  setFoco(dia)
                  setVista('dia')
                }}
              />
            ))}

          {vista === 'dia' && (
            <ListaDoDia consultas={consultas.filter(c => c.diaISO === foco)} />
          )}
        </ScrollView>
      )}
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
  onAbrir,
}: {
  dia: string
  hoje: string
  consultas: ConsultaDoDia[]
  onAbrir: () => void
}) {
  const styles = estilos()

  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [styles.blocoDia, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={tituloDoDia(dia)}
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

      {consultas.length === 0 ? (
        /* "Livre" e não "nada": o app só enxerga a agenda, e ela pode ter mil
           coisas nesse dia. A palavra fala do que o app SABE. */
        <Text style={styles.blocoLivre}>Sem consulta marcada</Text>
      ) : (
        consultas.map(c => <Linha key={c.id} consulta={c} />)
      )}
    </Pressable>
  )
}

function ListaDoDia({ consultas }: { consultas: ConsultaDoDia[] }) {
  const styles = estilos()

  if (consultas.length === 0) {
    return (
      <View style={styles.vazio}>
        <Ionicons name="calendar-clear-outline" size={22} color={paleta().inkFraco} />
        <Text style={styles.textoVazio}>Sem consulta marcada neste dia.</Text>
      </View>
    )
  }

  return (
    <View style={styles.listaDoDia}>
      {consultas.map(c => (
        <Linha key={c.id} consulta={c} />
      ))}
    </View>
  )
}

function Linha({ consulta }: { consulta: ConsultaDoDia }) {
  const styles = estilos()
  const passada = consulta.status === 'realizada'

  return (
    <View style={styles.linha}>
      <Text style={[styles.hora, passada && styles.apagado]}>{hhmm(consulta.quando)}</Text>
      <Text style={[styles.nome, passada && styles.apagado]} numberOfLines={1}>
        {consulta.nome}
      </Text>
      {passada && <Ionicons name="checkmark" size={15} color={paleta().inkFraco} />}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 6,
    },
    seta: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloArea: { flex: 1, alignItems: 'center' },
    titulo: { fontSize: 18, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
    voltarAHoje: { fontSize: 11.5, color: t.cores.verde, fontWeight: '700', marginTop: 1 },

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
    textoOpcao: { fontSize: 13.5, color: t.inkSuave },
    textoOpcaoAtivo: { color: t.cores.ink, fontWeight: '800' },

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
      fontSize: 11,
      fontWeight: '800',
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
    numeroDoDia: { fontSize: 14, color: t.cores.ink, fontVariant: ['tabular-nums'] },
    /* As sobras dos meses vizinhos ficam apagadas, e não em branco: buraco na
       primeira linha se lê como defeito, e 31 de agosto é um dia real. */
    numeroDeFora: { color: t.inkFraco },
    numeroDeHoje: { color: t.cores.branco, fontWeight: '800' },

    pontos: { flexDirection: 'row', gap: 2, height: 10, alignItems: 'center' },
    ponto: { width: 4.5, height: 4.5, borderRadius: 3, backgroundColor: t.cores.verde },
    pontoDeFora: { backgroundColor: t.inkFraco },
    muitas: { fontSize: 9.5, fontWeight: '800', color: t.cores.verde },

    totalDoMes: { fontSize: 12.5, color: t.inkFraco, textAlign: 'center', paddingTop: 12 },

    blocoDia: {
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    topoDoBloco: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
    tituloDoBloco: { flex: 1, fontSize: 13.5, fontWeight: '800', color: t.inkSuave },
    tituloDeHoje: { color: t.cores.verde },
    contadorDoBloco: {
      fontSize: 11.5,
      fontWeight: '800',
      color: t.inkFraco,
      fontVariant: ['tabular-nums'],
    },
    blocoLivre: { fontSize: 13, color: t.inkFraco, paddingVertical: 6 },

    listaDoDia: {
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    hora: {
      fontSize: 14,
      fontWeight: '700',
      color: t.cores.verde,
      width: 46,
      fontVariant: ['tabular-nums'],
    },
    nome: { flex: 1, fontSize: 15, color: t.cores.ink },
    apagado: { color: t.inkFraco, fontWeight: '400' },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 34,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
    },
    textoVazio: { fontSize: 14, color: t.inkSuave },

    pressionado: { opacity: 0.75 },
  }),
)
