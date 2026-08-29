import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Confirmacao } from '../components/Confirmacao'
import {
  NOME_DO_ESFORCO,
  adicionarExercicio,
  apagarExercicio,
  apagarSessao,
  carregarRotina,
  carregarSessoes,
  registrarSessao,
  sequencia,
  sessoesNaSemana,
  type Exercicio,
  type Sessao,
} from '../lib/treino'
import { DIAS_CURTOS, dataNumerica } from '../lib/formatar'
import type { DiaSemana } from '../lib/plano'
import { estilosDe, paleta } from '../lib/tema'

/* Treino.
 *
 * Duas coisas que parecem uma: a ROTINA é o que se pretende fazer em cada dia
 * da semana e quase não muda; a SESSÃO é o que aconteceu hoje, e é o que se
 * registra. Misturá-las numa tela só faria a pessoa editar a rotina quando
 * queria anotar o treino de hoje.
 *
 * ── O que o registro pede, e o que ele não pede ────────────────────────────
 * Tempo e esforço, e nada mais. Este é um app de nutrição: o que a nutricionista
 * faz com treino é estimar gasto e ver constância. Pedir série, repetição e
 * carga a cada sessão transformaria trinta segundos de registro em três
 * minutos, e ninguém registra por três minutos, todo dia. Isso mora na rotina,
 * onde serve de lembrete. */

type Aba = 'hoje' | 'rotina'

export function TreinoScreen({
  contaId,
  onFechar,
  onMudou,
}: {
  contaId: string
  onFechar: () => void
  onMudou: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [aba, setAba] = useState<Aba>('hoje')
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [rotina, setRotina] = useState<Exercicio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mudou, setMudou] = useState(false)
  const [apagandoSessao, setApagandoSessao] = useState<Sessao | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([carregarSessoes(contaId), carregarRotina(contaId)]).then(([rS, rR]) => {
      if (!vivo) return
      if (rS.tipo === 'erro') setErro(rS.mensagem)
      else {
        setErro('')
        setSessoes(rS.sessoes)
      }
      if (rR.tipo === 'ok') setRotina(rR.exercicios)
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [contaId])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      fechar()
      return true
    })
    return () => sub.remove()
  })

  function fechar() {
    if (mudou) onMudou()
    onFechar()
  }

  async function apagar(s: Sessao) {
    setApagandoSessao(null)
    setSessoes(atuais => atuais.filter(x => x.id !== s.id))

    const falha = await apagarSessao(s.id)
    if (falha) {
      setSessoes(atuais => [...atuais, s].sort((a, b) => b.data.localeCompare(a.data)))
      setErro(falha.erro)
      return
    }
    setMudou(true)
  }

  const naSemana = sessoesNaSemana(sessoes)
  const seguidos = sequencia(sessoes)

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
        <Text style={styles.tituloTela}>Treino</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <View style={styles.abas}>
        {(['hoje', 'rotina'] as Aba[]).map(a => (
          <Pressable
            key={a}
            onPress={() => setAba(a)}
            style={[styles.aba, aba === a && styles.abaAtiva]}
            accessibilityRole="tab"
            accessibilityState={{ selected: aba === a }}
          >
            <Text style={[styles.textoAba, aba === a && styles.textoAbaAtivo]}>
              {a === 'hoje' ? 'Registrar' : 'Minha rotina'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {carregando ? (
          <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />
        ) : aba === 'hoje' ? (
          <>
            {/* Constância antes do formulário: é o que responde "estou treinando
                ou não", que é a pergunta de quem abre esta tela. */}
            <View style={styles.placar}>
              <View style={styles.numeroPlacar}>
                <Text style={styles.valorPlacar}>{naSemana}</Text>
                <Text style={styles.rotuloPlacar}>
                  {naSemana === 1 ? 'treino nos\núltimos 7 dias' : 'treinos nos\núltimos 7 dias'}
                </Text>
              </View>
              <View style={styles.divisor} />
              <View style={styles.numeroPlacar}>
                <Text style={styles.valorPlacar}>{seguidos}</Text>
                <Text style={styles.rotuloPlacar}>
                  {seguidos === 1 ? 'dia seguido' : 'dias seguidos'}
                </Text>
              </View>
            </View>

            <RegistrarTreino
              contaId={contaId}
              rotina={rotina}
              onRegistrou={s => {
                setSessoes(atuais => [s, ...atuais])
                setMudou(true)
                setErro('')
              }}
              onErro={setErro}
            />

            {!!erro && <Text style={styles.erro}>{erro}</Text>}

            {sessoes.length > 0 && (
              <>
                <Text style={styles.tituloSecao}>Seus treinos</Text>
                {sessoes.map(s => (
                  <View key={s.id} style={styles.linhaSessao}>
                    <View style={styles.textoSessao}>
                      <Text style={styles.nomeSessao} numberOfLines={1}>
                        {s.titulo || (s.dia !== null ? DIAS_CURTOS[s.dia] : 'Treino')}
                      </Text>
                      <Text style={styles.detalheSessao}>
                        {dataNumerica(comoData(s.data))}
                        {s.duracaoMin !== null && ` · ${s.duracaoMin} min`}
                        {s.esforco !== null && ` · ${NOME_DO_ESFORCO[s.esforco]}`}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setApagandoSessao(s)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Apagar este treino"
                    >
                      <Ionicons name="close" size={16} color={paleta().inkFraco} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <Rotina
            contaId={contaId}
            exercicios={rotina}
            onMudou={setRotina}
            onErro={setErro}
            erro={erro}
          />
        )}
      </ScrollView>

      <Confirmacao
        visivel={apagandoSessao !== null}
        titulo="Apagar este treino?"
        mensagem="O registro sai do seu histórico e da contagem de constância."
        rotuloConfirmar="Apagar"
        destrutiva
        onCancelar={() => setApagandoSessao(null)}
        onConfirmar={() => apagandoSessao && apagar(apagandoSessao)}
      />
    </KeyboardAvoidingView>
  )
}

/* ── Registrar o treino de hoje ────────────────────────────────────────────*/

/* Durações que cobrem quase tudo. Números redondos porque ninguém cronometra o
   próprio treino: "uns 45 minutos" é a resposta real. */
const DURACOES = [20, 30, 45, 60, 90]

function RegistrarTreino({
  contaId,
  rotina,
  onRegistrou,
  onErro,
}: {
  contaId: string
  rotina: Exercicio[]
  onRegistrou: (s: Sessao) => void
  onErro: (m: string) => void
}) {
  const styles = estilos()
  const hoje = new Date().getDay() as DiaSemana
  const daRotina = rotina.filter(e => e.dia === hoje)

  const [titulo, setTitulo] = useState('')
  const [duracao, setDuracao] = useState<number | null>(null)
  const [esforco, setEsforco] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function registrar() {
    setSalvando(true)
    const r = await registrarSessao(contaId, {
      /* Veio da rotina quando o dia de hoje tem exercícios e a pessoa não deu
         outro nome. É o que liga a sessão ao que estava planejado. */
      dia: daRotina.length > 0 && !titulo.trim() ? hoje : null,
      titulo: titulo.trim() || null,
      duracaoMin: duracao,
      esforco,
      observacao: null,
    })
    setSalvando(false)

    if (r.tipo === 'erro') {
      onErro(r.mensagem)
      return
    }

    onRegistrou(r.sessao)
    setTitulo('')
    setDuracao(null)
    setEsforco(null)
  }

  return (
    <View style={styles.cartao}>
      {daRotina.length > 0 ? (
        <>
          <Text style={styles.tituloCartao}>Hoje na sua rotina</Text>
          <Text style={styles.listaRotina} numberOfLines={3}>
            {daRotina.map(e => e.nome).join(' · ')}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.tituloCartao}>O que você treinou?</Text>
          <TextInput
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Corrida, natação, academia…"
            placeholderTextColor={paleta().inkFraco}
            keyboardAppearance="dark"
            maxLength={40}
            style={styles.campo}
            accessibilityLabel="O que você treinou"
          />
        </>
      )}

      <Text style={styles.rotulo}>Quanto tempo</Text>
      <View style={styles.chips}>
        {DURACOES.map(d => (
          <Pressable
            key={d}
            onPress={() => setDuracao(duracao === d ? null : d)}
            style={({ pressed }) => [
              styles.chip,
              duracao === d && styles.chipAtivo,
              pressed && styles.pressionado,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: duracao === d }}
          >
            <Text style={[styles.textoChip, duracao === d && styles.textoChipAtivo]}>
              {d} min
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.rotulo}>Quão puxado foi</Text>
      <View style={styles.chips}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable
            key={n}
            onPress={() => setEsforco(esforco === n ? null : n)}
            style={({ pressed }) => [
              styles.chipEsforco,
              esforco === n && styles.chipAtivo,
              pressed && styles.pressionado,
            ]}
            accessibilityRole="button"
            accessibilityLabel={NOME_DO_ESFORCO[n]}
            accessibilityState={{ selected: esforco === n }}
          >
            <Text style={[styles.textoChip, esforco === n && styles.textoChipAtivo]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {esforco !== null && <Text style={styles.legendaEsforco}>{NOME_DO_ESFORCO[esforco]}</Text>}

      <Pressable
        onPress={registrar}
        disabled={salvando}
        style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
        accessibilityRole="button"
      >
        {salvando ? (
          <ActivityIndicator size="small" color={paleta().cores.branco} />
        ) : (
          <>
            <Ionicons name="checkmark" size={18} color={paleta().cores.branco} />
            <Text style={styles.textoBotao}>Registrar treino de hoje</Text>
          </>
        )}
      </Pressable>

      {/* Nada é obrigatório: registrar que treinou já é o dado principal, e
          exigir tempo e esforço faria a pessoa pular o registro nos dias em que
          não lembra. Tempo e esforço refinam; a marca de que houve treino é o
          que sustenta a constância. */}
      <Text style={styles.ajuda}>
        Tempo e esforço são opcionais. O que conta é marcar que você treinou.
      </Text>
    </View>
  )
}

/* ── A rotina da semana ────────────────────────────────────────────────────*/

function Rotina({
  contaId,
  exercicios,
  onMudou,
  onErro,
  erro,
}: {
  contaId: string
  exercicios: Exercicio[]
  onMudou: (e: Exercicio[]) => void
  onErro: (m: string) => void
  erro: string
}) {
  const styles = estilos()
  const [dia, setDia] = useState<DiaSemana>(() => new Date().getDay() as DiaSemana)
  const [nome, setNome] = useState('')
  const [series, setSeries] = useState('')
  const [repeticoes, setRepeticoes] = useState('')
  const [carga, setCarga] = useState('')
  const [salvando, setSalvando] = useState(false)

  const doDia = exercicios.filter(e => e.dia === dia)

  async function adicionar() {
    const limpo = nome.trim()
    if (!limpo) {
      onErro('Dê um nome ao exercício.')
      return
    }

    setSalvando(true)
    const r = await adicionarExercicio(contaId, {
      dia,
      nome: limpo,
      ordem: doDia.length,
      series: series ? Number(series) : null,
      repeticoes: repeticoes || null,
      cargaKg: carga ? Number(carga.replace(',', '.')) : null,
      observacao: null,
    })
    setSalvando(false)

    if (r.tipo === 'erro') {
      onErro(r.mensagem)
      return
    }

    onMudou([...exercicios, r.exercicio])
    setNome('')
    setSeries('')
    setRepeticoes('')
    setCarga('')
    onErro('')
  }

  async function remover(e: Exercicio) {
    onMudou(exercicios.filter(x => x.id !== e.id))
    const falha = await apagarExercicio(e.id)
    if (falha) {
      onMudou([...exercicios])
      onErro(falha.erro)
    }
  }

  return (
    <>
      <View style={styles.seletorDias}>
        {([0, 1, 2, 3, 4, 5, 6] as DiaSemana[]).map(d => {
          const tem = exercicios.some(e => e.dia === d)
          return (
            <Pressable
              key={d}
              onPress={() => setDia(d)}
              style={[styles.diaChip, dia === d && styles.diaChipAtivo]}
              accessibilityRole="button"
              accessibilityState={{ selected: dia === d }}
              accessibilityLabel={DIAS_CURTOS[d]}
            >
              <Text style={[styles.textoDia, dia === d && styles.textoDiaAtivo]}>
                {DIAS_CURTOS[d]}
              </Text>
              {/* O ponto diz quais dias já têm treino sem precisar visitá-los um
                  a um — é a leitura da semana inteira num relance. */}
              {tem && <View style={[styles.pontoDia, dia === d && styles.pontoDiaAtivo]} />}
            </Pressable>
          )
        })}
      </View>

      {doDia.length === 0 ? (
        <Text style={styles.vazio}>
          Nada em {DIAS_CURTOS[dia]} ainda. Monte aqui o que você pretende fazer, e no dia o
          registro já vem com o nome certo.
        </Text>
      ) : (
        doDia.map(e => (
          <View key={e.id} style={styles.linhaExercicio}>
            <View style={styles.textoSessao}>
              <Text style={styles.nomeSessao} numberOfLines={1}>
                {e.nome}
              </Text>
              <Text style={styles.detalheSessao}>{descreverExercicio(e)}</Text>
            </View>
            <Pressable
              onPress={() => remover(e)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Remover ${e.nome}`}
            >
              <Ionicons name="close" size={16} color={paleta().inkFraco} />
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Adicionar em {DIAS_CURTOS[dia]}</Text>

        <TextInput
          value={nome}
          onChangeText={setNome}
          placeholder="Supino reto"
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          maxLength={60}
          style={styles.campo}
          accessibilityLabel="Nome do exercício"
        />

        <View style={styles.linhaCampos}>
          <View style={styles.campoPequeno}>
            <Text style={styles.rotuloPequeno}>Séries</Text>
            <TextInput
              value={series}
              onChangeText={t => setSeries(t.replace(/[^0-9]/g, ''))}
              placeholder="4"
              placeholderTextColor={paleta().inkFraco}
              keyboardType="number-pad"
              keyboardAppearance="dark"
              maxLength={2}
              style={styles.campo}
              accessibilityLabel="Séries"
            />
          </View>

          <View style={styles.campoPequeno}>
            {/* Texto livre: "8-12", "até a falha" e "30s" são respostas comuns, e
                nenhuma cabe num número. A coluna do banco é texto pelo mesmo
                motivo. */}
            <Text style={styles.rotuloPequeno}>Repetições</Text>
            <TextInput
              value={repeticoes}
              onChangeText={setRepeticoes}
              placeholder="8-12"
              placeholderTextColor={paleta().inkFraco}
              keyboardAppearance="dark"
              maxLength={20}
              style={styles.campo}
              accessibilityLabel="Repetições"
            />
          </View>

          <View style={styles.campoPequeno}>
            <Text style={styles.rotuloPequeno}>Carga</Text>
            <TextInput
              value={carga}
              onChangeText={t => setCarga(t.replace(/[^0-9.,]/g, ''))}
              placeholder="40"
              placeholderTextColor={paleta().inkFraco}
              keyboardType="decimal-pad"
              keyboardAppearance="dark"
              maxLength={6}
              style={styles.campo}
              accessibilityLabel="Carga em quilos"
            />
          </View>
        </View>

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={adicionar}
          disabled={salvando}
          style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          {salvando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <>
              <Ionicons name="add" size={18} color={paleta().cores.branco} />
              <Text style={styles.textoBotao}>Adicionar exercício</Text>
            </>
          )}
        </Pressable>
      </View>
    </>
  )
}

function descreverExercicio(e: Exercicio): string {
  const partes: string[] = []
  if (e.series !== null && e.repeticoes) partes.push(`${e.series}x${e.repeticoes}`)
  else if (e.series !== null) partes.push(`${e.series} séries`)
  else if (e.repeticoes) partes.push(e.repeticoes)
  if (e.cargaKg !== null) partes.push(`${e.cargaKg} kg`)
  return partes.join(' · ') || 'Sem detalhes'
}

/* "2026-08-28" para Date, montado campo a campo. `new Date('2026-08-28')` é
   lido como UTC e, num fuso negativo, devolve o dia anterior. */
function comoData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
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
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  abas: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  aba: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  abaAtiva: { backgroundColor: t.cores.superficie, borderColor: t.cores.verde },
  textoAba: { fontSize: 13.5, fontWeight: '700', color: t.inkSuave },
  textoAbaAtivo: { color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, gap: 10 },
  girando: { marginTop: 40 },

  placar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.cores.cartao,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 16,
  },
  numeroPlacar: { flex: 1, alignItems: 'center', gap: 2 },
  valorPlacar: { fontSize: 30, fontWeight: '800', color: t.cores.limao, letterSpacing: -0.8 },
  rotuloPlacar: { fontSize: 11.5, color: t.inkSuave, textAlign: 'center', lineHeight: 16 },
  divisor: { width: 1, height: 40, backgroundColor: t.cores.borda },

  cartao: {
    backgroundColor: t.cores.cartao,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.cores.borda,
    padding: 16,
    gap: 8,
  },
  tituloCartao: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
  listaRotina: { fontSize: 13, color: t.inkMedio, lineHeight: 19 },

  rotulo: { fontSize: 12.5, fontWeight: '700', color: t.inkMedio, marginTop: 6 },
  ajuda: { fontSize: 11.5, color: t.inkFraco, lineHeight: 17 },

  campo: {
    backgroundColor: t.cores.superficie,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
    color: t.cores.ink,
  },
  linhaCampos: { flexDirection: 'row', gap: 8 },
  campoPequeno: { flex: 1, gap: 4 },
  rotuloPequeno: { fontSize: 11.5, color: t.inkSuave },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  chipEsforco: {
    width: 46,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
  },
  chipAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoChip: { fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  textoChipAtivo: { color: t.cores.sobreLimao },
  legendaEsforco: { fontSize: 12, color: t.inkSuave },

  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: t.cores.verde,
    marginTop: 6,
  },
  textoBotao: { fontSize: 14.5, fontWeight: '800', color: t.cores.branco },
  pressionado: { opacity: 0.75 },

  tituloSecao: {
    fontSize: 12,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 12,
  },

  linhaSessao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.cores.cartao,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  linhaExercicio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.cores.cartao,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  textoSessao: { flex: 1, gap: 1 },
  nomeSessao: { fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  detalheSessao: { fontSize: 12, color: t.inkSuave },

  seletorDias: { flexDirection: 'row', gap: 6 },
  diaChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  diaChipAtivo: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },
  textoDia: { fontSize: 12, fontWeight: '700', color: t.inkMedio },
  textoDiaAtivo: { color: t.cores.sobreLimao },
  pontoDia: { width: 4, height: 4, borderRadius: 2, backgroundColor: t.cores.verde },
  pontoDiaAtivo: { backgroundColor: t.cores.sobreLimao },

  vazio: { fontSize: 13.5, color: t.inkSuave, lineHeight: 20, paddingVertical: 8 },
  erro: { fontSize: 13, color: t.cores.erroTexto, lineHeight: 19 },
  }),
)
