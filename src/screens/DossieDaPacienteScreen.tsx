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
  anamnesesDaPaciente,
  calculosDaPaciente,
  consultasDaPaciente,
  examesDaPaciente,
  planoTerapeuticoDaPaciente,
  TETO_DO_HISTORICO,
  type AnamneseDaPaciente,
  type CalculoEnergeticoDaPaciente,
  type ConsultaDoHistorico,
  type ExameDaPaciente,
  type PlanoTerapeuticoDaPaciente,
} from '../lib/dossieDaPaciente'
import { medidasDaPaciente, type Medida } from '../lib/pacientesDaNutri'
import {
  Anamneses,
  Energetico,
  Evolucao,
  Exames,
  ResumoDaAurora,
} from '../components/SecoesDoProntuario'
import {
  BANDAS,
  alertaDeReacao,
  bandaDoPasso,
  comeSozinho,
  descricaoDoPasso,
  melhorPasso,
  rotuloDaArea,
  rotuloDoAmbiente,
  rotuloDoPeriodo,
  rotuloDoResponsavel,
  rotuloDoStatusTerapeutico,
  statusAtual,
  tendenciaDe,
} from '../lib/escaladaDoComer'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

export type SecaoDoDossie =
  | 'terapeutico'
  | 'consultas'
  | 'anamnese'
  | 'exames'
  | 'energetico'
  | 'evolucao'
  | 'resumo'

/* O título de cada seção. Função com `switch`, e não `Record`: é o mesmo tipo
   dos dois lados, mas assim o compilador acusa a seção nova que esquecer o
   título -- o `Record` também acusaria, e o `switch` ainda deixa o nome junto. */
function tituloDaSecao(secao: SecaoDoDossie, nome: string): string {
  switch (secao) {
    case 'terapeutico':
      return `Plano de ${nome}`
    case 'consultas':
      return `Consultas de ${nome}`
    case 'anamnese':
      return `Anamnese de ${nome}`
    case 'exames':
      return `Exames de ${nome}`
    case 'energetico':
      return `Gasto energético de ${nome}`
    case 'evolucao':
      return `Evolução de ${nome}`
    case 'resumo':
      return `Resumo de ${nome}`
  }
}

/* Quantas avaliações a evolução mostra. A ficha pede três; aqui é a série. */
const AVALIACOES_NA_EVOLUCAO = 12

/* Tudo o que a ficha abre por cima de si: plano terapêutico, consultas e, desde
 * 11/09, o prontuário para ler -- anamnese, exames, gasto energético, evolução
 * das medidas e o resumo da Aurora.
 *
 * ──────────────────── Uma tela para todas, e não sete telas ────────────────────
 * Todas têm exatamente a mesma moldura -- cabeçalho com voltar, rolagem,
 * puxar para reler, erro em cima, vazio no meio -- e diferem só no que
 * desenham no miolo. Sete telas seriam sete folhas de estilo repetidas, e as
 * cópias envelheceriam: é a armadilha 5 pelo lado do componente.
 *
 * O miolo do plano e das consultas mora aqui embaixo; o do prontuário, em
 * `components/SecoesDoProntuario.tsx`.
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
  const [anamneses, setAnamneses] = useState<AnamneseDaPaciente[]>([])
  const [exames, setExames] = useState<ExameDaPaciente[]>([])
  const [calculos, setCalculos] = useState<CalculoEnergeticoDaPaciente[]>([])
  const [medidas, setMedidas] = useState<Medida[]>([])
  /* Sobe a cada "puxar para reler" -- o resumo da Aurora lê sozinho, porque
     precisa voltar a perguntar enquanto ela está lendo, e é assim que a
     moldura avisa que é para ler de novo. */
  const [versao, setVersao] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')

  /* Erro limpo no sucesso em todos os ramos -- armadilha 9. Esta tela relê ao
     puxar. */
  const carregar = useCallback(async () => {
    switch (secao) {
      case 'terapeutico': {
        const r = await planoTerapeuticoDaPaciente(pacienteId)
        if (r.tipo === 'ok') {
          setErro('')
          setTerapeutico(r.plano)
        } else setErro(r.mensagem)
        return
      }
      case 'consultas': {
        const r = await consultasDaPaciente(pacienteId)
        if (r.tipo === 'ok') {
          setErro('')
          setConsultas(r.consultas)
        } else setErro(r.mensagem)
        return
      }
      case 'anamnese': {
        const r = await anamnesesDaPaciente(pacienteId)
        if (r.tipo === 'ok') {
          setErro('')
          setAnamneses(r.anamneses)
        } else setErro(r.mensagem)
        return
      }
      case 'exames': {
        const r = await examesDaPaciente(pacienteId)
        if (r.tipo === 'ok') {
          setErro('')
          setExames(r.exames)
        } else setErro(r.mensagem)
        return
      }
      case 'energetico': {
        const r = await calculosDaPaciente(pacienteId)
        if (r.tipo === 'ok') {
          setErro('')
          setCalculos(r.calculos)
        } else setErro(r.mensagem)
        return
      }
      case 'evolucao': {
        /* `medidasDaPaciente` não rejeita e não devolve erro: falhou, vem
           vazia, e a tela diz "sem avaliação". É o preço de ela ser a mesma
           função da ficha, que precisa dela assim. */
        setErro('')
        setMedidas(await medidasDaPaciente(pacienteId, AVALIACOES_NA_EVOLUCAO))
        return
      }
      case 'resumo':
        /* Lê sozinho -- ver `versao`. */
        setVersao(v => v + 1)
        return
    }
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

  const titulo = tituloDaSecao(secao, nome)

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
          {!erro && secao === 'anamnese' && <Anamneses anamneses={anamneses} nome={nome} />}
          {!erro && secao === 'exames' && <Exames exames={exames} nome={nome} />}
          {!erro && secao === 'energetico' && <Energetico calculos={calculos} nome={nome} />}
          {!erro && secao === 'evolucao' && <Evolucao medidas={medidas} nome={nome} />}
          {/* O resumo tem o próprio erro e a própria espera: ele continua
              perguntando enquanto a Aurora lê, e um erro de rede numa das
              voltas não pode apagar o resumo que já está na tela. */}
          {secao === 'resumo' && <ResumoDaAurora pacienteId={pacienteId} nome={nome} versao={versao} />}
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
     que já foi vencido é histórico, e histórico se lê depois. `statusAtual`
     traduz os legados (`ativo` virou `em_andamento` numa renomeação no
     sistema, e o banco não tem CHECK na coluna). */
  const andando = plano.objetivos.filter(o => statusAtual(o.status) === 'em_andamento')
  const resto = plano.objetivos.filter(o => statusAtual(o.status) !== 'em_andamento')

  /* A área só aparece como linha própria quando o título NÃO é ela -- senão a
     tela diria "Introdução alimentar" duas vezes seguidas. */
  const area = plano.area ? rotuloDaArea(plano.area) : ''
  const detalhes = [
    area && area !== plano.titulo ? area : '',
    plano.periodo ? rotuloDoPeriodo(plano.periodo) : '',
    plano.inicio ? 'desde ' + soData(plano.inicio) : '',
  ].filter(Boolean)

  return (
    <>
      <View style={styles.topo}>
        <Text style={styles.tituloGrande}>{plano.titulo}</Text>
        <View style={styles.linhaDoTopo}>
          {!!plano.status && (
            <View style={[styles.selo, seloDoStatus(styles, plano.status)]}>
              <Text style={styles.textoDoSelo}>{rotuloDoStatusTerapeutico(plano.status)}</Text>
            </View>
          )}
          {!!detalhes.length && <Text style={styles.situacao}>{detalhes.join(' · ')}</Text>}
        </View>
      </View>

      {/* As anotações dela sobre o caso. É texto que ELA escreveu no sistema
          para lembrar do que importa -- vai inteiro e selecionável. */}
      {!!plano.notas && (
        <View style={styles.notasDoPlano}>
          <Text style={styles.rotuloDasNotas}>SUAS ANOTAÇÕES</Text>
          <Text style={styles.notasDoPlanoTexto} selectable>
            {plano.notas}
          </Text>
        </View>
      )}

      {plano.objetivos.length === 0 && (
        <Text style={styles.ondeSeFaz}>Este plano ainda não tem metas.</Text>
      )}

      {andando.map(o => (
        <Meta key={o.id} meta={o} />
      ))}

      {resto.length > 0 && (
        <>
          <Text style={styles.rotuloDeSecao}>Fora de andamento</Text>
          {resto.map(o => (
            <Meta key={o.id} meta={o} apagada />
          ))}
        </>
      )}

      <Text style={styles.ondeSeFaz}>
        Registrar exposição e mudar meta continuam no sistema, no computador.
      </Text>
    </>
  )
}

/* ──────────────────── UMA META ──────────────────── */

function Meta({ meta: o, apagada = false }: { meta: PlanoTerapeuticoDaPaciente['objetivos'][number]; apagada?: boolean }) {
  const styles = estilos()

  const melhor = melhorPasso(o.exposicoes)
  const tendencia = tendenciaDe(o.exposicoes)
  const alerta = alertaDeReacao(o.exposicoes)
  const sozinho = comeSozinho(o.exposicoes)
  const ultima = o.exposicoes.length ? o.exposicoes[o.exposicoes.length - 1]!.data : null

  return (
    <View style={[styles.meta, apagada && styles.metaApagada]}>
      <View style={styles.topoDaMeta}>
        <Text style={[styles.nomeDaMeta, apagada && styles.apagado]} numberOfLines={2}>
          {o.alimento ?? 'Meta sem alimento'}
        </Text>
        {!!o.status && (
          <View style={[styles.selo, seloDoStatus(styles, o.status)]}>
            <Text style={styles.textoDoSelo}>{rotuloDoStatusTerapeutico(o.status)}</Text>
          </View>
        )}
      </View>

      {/* O QUE ela quer que aconteça. A primeira versão desta tela não lia, e
          era a frase mais importante de cada meta. */}
      {!!o.objetivo && <Text style={styles.objetivo}>{o.objetivo}</Text>}

      {/* ── A ESCALADA: "está evoluindo ou não?" ──
          Seis faixas, de Tolerar a Comer, preenchidas até a mais alta que a
          criança já alcançou com este alimento. A Escalada é cumulativa: chegar
          em Tocar quer dizer que Tolerar, Interagir e Cheirar já foram. */}
      {melhor !== null ? (
        <View style={styles.escalada}>
          <View style={styles.faixas}>
            {BANDAS.slice(1).map(b => (
              <View
                key={b.banda}
                style={[styles.faixa, melhor >= b.primeiro && styles.faixaAlcancada]}
              />
            ))}
          </View>
          <Text style={styles.ondeEsta}>
            {melhor === 0
              ? 'Ainda recusa'
              : `${bandaDoPasso(melhor).rotulo} · passo ${melhor} de 32`}
          </Text>
          {melhor > 0 && !!descricaoDoPasso(melhor) && (
            <Text style={styles.passo}>{descricaoDoPasso(melhor)}</Text>
          )}
        </View>
      ) : (
        <Text style={styles.semExposicao}>Nenhuma exposição registrada ainda.</Text>
      )}

      {/* A TENDÊNCIA, com a régua do sistema: só com 3 exposições ou mais, e 2
          passos de diferença para dizer que mudou. Abaixo disso a tela não
          afirma nada -- conta quantas houve. */}
      {tendencia ? (
        <Text style={styles.tendencia}>
          {tendencia.direcao === 'subiu'
            ? `↑ Subiu de ${tendencia.de} para ${tendencia.para}`
            : tendencia.direcao === 'desceu'
              ? `↓ Desceu de ${tendencia.de} para ${tendencia.para}`
              : `→ Estável em ${tendencia.para}`}
        </Text>
      ) : o.exposicoes.length > 0 ? (
        <Text style={styles.tendencia}>
          {o.exposicoes.length === 1 ? '1 exposição' : `${o.exposicoes.length} exposições`} até agora
          {' '}— poucas para dizer se está evoluindo
        </Text>
      ) : null}

      {!!ultima && <Text style={styles.ultima}>Última exposição em {soData(ultima)}</Text>}

      {/* "Come sozinho" com a mesma régua do pôster do sistema: 2 das 3 últimas
          no passo 32. Uma vez só não sustenta uma afirmação sobre o presente. */}
      {sozinho && (
        <View style={styles.conquista}>
          <Ionicons name="star" size={14} color={paleta().cores.verde} />
          <Text style={styles.textoDaConquista}>Já come sozinho</Text>
        </View>
      )}

      {/* O alerta, com o texto do sistema. Âmbar e não vermelho: não é erro de
          ninguém, é um sinal para ajustar o ritmo. */}
      {alerta && (
        <View style={styles.alerta}>
          <Ionicons name="alert-circle-outline" size={16} color={paleta().cores.ink} />
          <Text style={styles.textoDoAlerta}>
            Reações negativas nas últimas exposições. Considere recuar um degrau na
            Escalada e reduzir a exigência antes de avançar.
          </Text>
        </View>
      )}

      {!!o.criterio && (
        <Text style={styles.criterio}>
          <Text style={styles.rotuloInline}>Para avançar: </Text>
          {o.criterio}
        </Text>
      )}

      {/* ── AS ATIVIDADES ──
          Todas, e não só a de casa. A primeira versão escondia as do
          consultório -- mas é ELA quem está lendo, e a do consultório é
          justamente a que ela vai fazer. */}
      {o.atividades.map((a, i) => (
        <View key={i} style={styles.atividade}>
          <Text style={styles.nomeDaAtividade}>{a.nome}</Text>
          {(a.ambiente || a.frequencia || a.responsavel) && (
            <Text style={styles.detalheDaAtividade}>
              {[
                a.ambiente ? rotuloDoAmbiente(a.ambiente) : '',
                a.frequencia ?? '',
                a.responsavel ? 'com ' + rotuloDoResponsavel(a.responsavel).toLowerCase() : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
          {!!a.orientacoes && <Text style={styles.orientacoes}>{a.orientacoes}</Text>}
          {/* O que precisa ter em mãos -- "a lista de compra do plano
              terapêutico", pedida em 09/09. */}
          {!!a.recursos && (
            <Text style={styles.recursos}>
              <Text style={styles.rotuloInline}>Precisa: </Text>
              {a.recursos}
            </Text>
          )}
        </View>
      ))}
    </View>
  )
}

/* "12/08/2026", a partir de "2026-08-12" ou de um instante. Data pura NÃO passa
   por `Date`: interpretada como UTC, ela vira o dia anterior no Brasil. */
function soData(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(bruto ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/* A cor do selo sai do status JÁ traduzido do legado. Andamento neutro,
   atingido verde, parcial âmbar, não atingido acinzentado -- sem vermelho: em
   terapia alimentar "não atingido" é informação para replanejar, e vermelho na
   tela da nutricionista com a mãe da criança do lado lê como fracasso. */
function seloDoStatus(styles: ReturnType<typeof estilos>, status: string) {
  switch (statusAtual(status)) {
    case 'atingido':
      return styles.seloAtingido
    case 'parcial':
      return styles.seloParcial
    case 'nao_atingido':
      return styles.seloNaoAtingido
    default:
      return styles.seloAndamento
  }
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
    topoDaMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    objetivo: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, lineHeight: 20 },

    linhaDoTopo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    selo: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    seloAndamento: { backgroundColor: t.cores.trilho },
    seloAtingido: { backgroundColor: t.cores.verdeMenta },
    seloParcial: { backgroundColor: t.cores.trilho },
    seloNaoAtingido: { backgroundColor: t.cores.trilho },
    textoDoSelo: { fontFamily: FONTE.meia, fontSize: 11.5, color: t.cores.ink },

    notasDoPlano: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderLeftWidth: 3,
      borderLeftColor: t.cores.verde,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 4,
    },
    rotuloDasNotas: { fontFamily: FONTE.forte, fontSize: 10.5, color: t.cores.verde, letterSpacing: 0.8 },
    notasDoPlanoTexto: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, lineHeight: 20 },

    escalada: { gap: 4, paddingTop: 6 },
    faixas: { flexDirection: 'row', gap: 3 },
    faixa: { flex: 1, height: 7, borderRadius: 4, backgroundColor: t.cores.trilho },
    faixaAlcancada: { backgroundColor: t.cores.verde },
    ondeEsta: { fontFamily: FONTE.meia, fontSize: 13, color: t.cores.ink },
    passo: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco },
    semExposicao: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco, paddingTop: 4 },
    tendencia: { fontFamily: FONTE.meia, fontSize: 13, color: t.inkSuave, paddingTop: 2 },
    ultima: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco },

    conquista: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
    textoDaConquista: { fontFamily: FONTE.meia, fontSize: 13, color: t.cores.verde },

    alerta: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: t.cores.verdeMenta,
      borderRadius: 10,
      padding: 10,
      marginTop: 4,
    },
    textoDoAlerta: { flex: 1, fontFamily: FONTE.normal, fontSize: 12.5, color: t.cores.ink, lineHeight: 18 },

    criterio: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkSuave, lineHeight: 19, paddingTop: 4 },
    rotuloInline: { fontFamily: FONTE.meia, color: t.cores.ink },

    atividade: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: t.cores.borda,
      gap: 2,
    },
    nomeDaAtividade: { fontFamily: FONTE.meia, fontSize: 14, color: t.cores.ink },
    detalheDaAtividade: { fontFamily: FONTE.normal, fontSize: 12.5, color: t.inkFraco },
    recursos: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkSuave, lineHeight: 19, paddingTop: 2 },
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
