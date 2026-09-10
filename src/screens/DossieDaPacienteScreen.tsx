import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  consultasDaPaciente,
  planoTerapeuticoDaPaciente,
  TETO_DO_HISTORICO,
  type ConsultaDoHistorico,
  type PlanoTerapeuticoDaPaciente,
} from '../lib/dossieDaPaciente'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

export type SecaoDoDossie = 'terapeutico' | 'consultas'

/* O plano terapêutico e o histórico de consultas, abertos pela ficha.
 *
 * ──────────────────── Uma tela para as duas, e não duas telas ────────────────────
 * As duas têm exatamente a mesma moldura -- cabeçalho com voltar, rolagem,
 * puxar para reler, erro em cima, vazio no meio -- e diferem só no que
 * desenham no miolo. Duas telas seriam duas folhas de estilo repetidas, e a
 * segunda envelheceria: é a armadilha 5 pelo lado do componente.
 *
 * O que MUDA fica em dois blocos pequenos aqui embaixo; o que se repete fica
 * aqui em cima, uma vez.
 */
export function DossieDaPacienteScreen({
  pacienteId,
  nome,
  secao,
  onFechar,
}: {
  pacienteId: number
  nome: string
  secao: SecaoDoDossie
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [terapeutico, setTerapeutico] = useState<PlanoTerapeuticoDaPaciente | null>(null)
  const [consultas, setConsultas] = useState<ConsultaDoHistorico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (secao === 'terapeutico') {
      const r = await planoTerapeuticoDaPaciente(pacienteId)
      /* Erro limpo no sucesso -- armadilha 9. Esta tela relê ao puxar. */
      if (r.tipo === 'ok') {
        setErro('')
        setTerapeutico(r.plano)
      } else setErro(r.mensagem)
      return
    }
    const r = await consultasDaPaciente(pacienteId)
    if (r.tipo === 'ok') {
      setErro('')
      setConsultas(r.consultas)
    } else setErro(r.mensagem)
  }, [pacienteId, secao])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    void carregar().finally(() => {
      if (vivo) setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  /* Sem lista de dependências: põe este tratador na frente do da ficha e do da
     área a partir da segunda renderização. Armadilha 1. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  const titulo = secao === 'terapeutico' ? `Plano de ${nome}` : `Consultas de ${nome}`

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.voltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a ficha"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaTela} numberOfLines={1}>
          {titulo}
        </Text>
        <View style={styles.voltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 24 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={puxando}
              onRefresh={() => {
                setPuxando(true)
                void carregar().finally(() => setPuxando(false))
              }}
              tintColor={paleta().cores.verde}
              colors={[paleta().cores.verde]}
              progressBackgroundColor={paleta().cores.cartao}
            />
          }
        >
          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          {!erro && secao === 'terapeutico' && (
            <Terapeutico plano={terapeutico} nome={nome} />
          )}
          {!erro && secao === 'consultas' && <Historico consultas={consultas} nome={nome} />}
        </ScrollView>
      )}
    </View>
  )
}

/* ──────────────────── O PLANO TERAPÊUTICO ──────────────────── */

function Terapeutico({
  plano,
  nome,
}: {
  plano: PlanoTerapeuticoDaPaciente | null
  nome: string
}) {
  const styles = estilos()

  if (!plano) {
    return (
      <View style={styles.vazio}>
        <Ionicons name="leaf-outline" size={22} color={paleta().inkFraco} />
        <Text style={styles.textoVazio}>{nome} não tem plano terapêutico.</Text>
        <Text style={styles.ondeSeFaz}>Montar continua no sistema.</Text>
      </View>
    )
  }

  /* Em andamento primeiro. É o que ela precisa ler com a criança na frente; o
     que já foi vencido é histórico, e histórico se lê depois. */
  const andando = plano.objetivos.filter(o => o.status === 'em_andamento')
  const resto = plano.objetivos.filter(o => o.status !== 'em_andamento')

  return (
    <>
      <View style={styles.topo}>
        <Text style={styles.tituloGrande}>{plano.titulo}</Text>
        <Text style={styles.situacao}>{plano.status}</Text>
      </View>

      {plano.objetivos.length === 0 && (
        <Text style={styles.ondeSeFaz}>Este plano ainda não tem metas.</Text>
      )}

      {andando.map(o => (
        <View key={o.id} style={styles.meta}>
          <Text style={styles.nomeDaMeta}>{o.alimento ?? 'Meta sem alimento'}</Text>
          {!!o.frequencia && <Text style={styles.frequencia}>{o.frequencia}</Text>}
          {!!o.orientacoes && <Text style={styles.orientacoes}>{o.orientacoes}</Text>}
        </View>
      ))}

      {resto.length > 0 && (
        <>
          <Text style={styles.rotuloDeSecao}>Fora de andamento</Text>
          {resto.map(o => (
            <View key={o.id} style={[styles.meta, styles.metaApagada]}>
              <Text style={[styles.nomeDaMeta, styles.apagado]}>
                {o.alimento ?? 'Meta sem alimento'}
              </Text>
              <Text style={styles.frequencia}>{o.status}</Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.ondeSeFaz}>
        Registrar exposição e mudar meta continuam no sistema, no computador.
      </Text>
    </>
  )
}

/* ──────────────────── O HISTÓRICO ──────────────────── */

function Historico({ consultas, nome }: { consultas: ConsultaDoHistorico[]; nome: string }) {
  const styles = estilos()

  if (consultas.length === 0) {
    return (
      <View style={styles.vazio}>
        <Ionicons name="time-outline" size={22} color={paleta().inkFraco} />
        <Text style={styles.textoVazio}>{nome} ainda não tem consulta registrada.</Text>
      </View>
    )
  }

  return (
    <>
      {consultas.map(c => (
        <View key={c.id} style={styles.consulta}>
          <View style={styles.topoDaConsulta}>
            <Text style={styles.data}>{porExtenso(c.quando)}</Text>
            <Text style={styles.statusDaConsulta}>{rotuloDoStatus(c.status)}</Text>
          </View>
          {/* A NOTA é o motivo de esta tela existir. "O que ficou combinado da
              última vez?" é a pergunta, e é a única coisa aqui que ela não
              reconstrói de cabeça olhando a data. */}
          {c.notas ? (
            <Text style={styles.notas}>{c.notas}</Text>
          ) : (
            <Text style={styles.semNota}>Sem nota de atendimento.</Text>
          )}
        </View>
      ))}

      {consultas.length >= TETO_DO_HISTORICO && (
        <Text style={styles.ondeSeFaz}>
          Mostrando as {TETO_DO_HISTORICO} mais recentes. O histórico completo está
          no sistema.
        </Text>
      )}
    </>
  )
}

/* "12/08/2026 às 14:00", ou vazio quando a data não é data. Vazio e não
   "Invalid Date": ela lê isto ao lado de uma nota de atendimento. */
function porExtenso(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/* Função com genérico de reserva, e não `ROTULOS[status]`: um status novo numa
   coluna faria o índice cru devolver `undefined` e a linha morrer. Item 10 do
   AGENTS.md -- e o genérico ADMITE que o app não sabe, em vez de chutar. */
function rotuloDoStatus(s: string): string {
  if (s === 'realizada') return 'realizada'
  if (s === 'cancelada') return 'cancelada'
  if (s === 'confirmada') return 'confirmada'
  if (s === 'pendente') return 'marcada'
  if (s === 'solicitada') return 'pedido'
  return s || 'sem situação'
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
    voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloDaTela: {
      flex: 1,
      fontFamily: FONTE.forte,
      fontSize: 17,
      color: t.cores.ink,
      textAlign: 'center',
    },

    conteudo: { paddingHorizontal: 16, gap: 10 },

    erro: {
      fontFamily: FONTE.normal,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 10,
    },

    topo: { gap: 3, paddingBottom: 2 },
    tituloGrande: {
      fontFamily: FONTE.bruta,
      fontSize: 24,
      color: t.cores.ink,
      letterSpacing: -0.8,
    },
    situacao: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco },

    rotuloDeSecao: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      paddingTop: 8,
    },

    meta: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 3,
    },
    metaApagada: { backgroundColor: 'transparent' },
    nomeDaMeta: { fontFamily: FONTE.meia, fontSize: 15, color: t.cores.ink },
    apagado: { color: t.inkFraco },
    frequencia: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco },
    orientacoes: {
      fontFamily: FONTE.normal,
      fontSize: 14,
      color: t.inkSuave,
      lineHeight: 20,
      paddingTop: 3,
    },

    consulta: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    topoDaConsulta: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
    data: {
      flex: 1,
      fontFamily: FONTE.meia,
      fontSize: 14,
      color: t.cores.ink,
      fontVariant: ['tabular-nums'],
    },
    statusDaConsulta: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco },
    notas: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, lineHeight: 20 },
    semNota: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
    },
    textoVazio: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, textAlign: 'center' },
    ondeSeFaz: {
      fontFamily: FONTE.normal,
      fontSize: 12,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 12,
    },
  }),
)
