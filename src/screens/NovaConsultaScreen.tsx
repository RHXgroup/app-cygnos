import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { buscarPacientes, type PacienteDaLista } from '../lib/pacientesDaNutri'
import {
  TIPOS_DE_FABRICA,
  marcarConsulta,
  tiposDeConsulta,
  type TipoDeConsulta,
} from '../lib/marcarConsulta'
import {
  fimDaConsulta,
  horarioPorExtenso,
  lerHorarioDaConsulta,
} from '../lib/horarioDaConsulta'
import { mascaraData, mascaraHora } from '../lib/formulario'
import { dataISO } from '../lib/formatar'
import { useDesvioDoTeclado } from '../lib/teclado'
import { estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'

/* Marcar consulta pelo aplicativo.
 *
 * ──────────────────── O pedido ────────────────────
 * "Não posso inserir uma agenda. Estou num dia que não tem nenhum, não deixa
 * incluir. O aplicativo é pra funcionar igual sistema." A agenda mostrava o dia
 * inteiro, inclusive os buracos, e não deixava marcar nada em nenhum deles --
 * ela via o vazio e tinha de ir ao computador para preenchê-lo.
 *
 * ──────────────────── O que esta tela NÃO decide ────────────────────
 * Choque de horário. Quem confere é `app_agendar_consulta`, no banco, que
 * tranca o dia e olha o intervalo inteiro -- inclusive o pedido do paciente que
 * ainda espera resposta. A tela manda e mostra a frase que voltar. Conferir
 * aqui TAMBÉM seria duas regras de agenda, e a que errasse marcaria duas
 * pessoas no mesmo horário (armadilha 5).
 *
 * ──────────────────── O caminho curto ────────────────────
 * Aberta de um horário livre, ela já vem com o dia e a hora daquele buraco
 * preenchidos: sobra escolher o paciente e tocar em marcar. Foi o caminho que
 * ele descreveu -- "estou no dia, quero incluir aqui". */
export function NovaConsultaScreen({
  dataInicial,
  horaInicial,
  pacienteInicial,
  onFechar,
  onMarcou,
}: {
  /** "12/09/2026". Vem do dia aberto na agenda. */
  dataInicial?: string
  /** "14:30". Vem do horário livre em que ela tocou. */
  horaInicial?: string
  /** Quando abre de dentro da ficha, o paciente já está escolhido. */
  pacienteInicial?: { id: number; nome: string }
  onFechar: () => void
  /** O dia em que a consulta entrou (ISO), para a agenda ir para lá e reler. */
  onMarcou: (diaISO: string, mensagem: string) => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [paciente, setPaciente] = useState<{ id: number; nome: string } | null>(
    pacienteInicial ?? null,
  )
  const [buscaAberta, setBuscaAberta] = useState(false)

  const [data, setData] = useState(dataInicial ?? '')
  const [hora, setHora] = useState(horaInicial ?? '')
  const [observacoes, setObservacoes] = useState('')

  const [tipos, setTipos] = useState<TipoDeConsulta[]>(TIPOS_DE_FABRICA)
  const [tipo, setTipo] = useState<string | null>(null)
  const [duracao, setDuracao] = useState(60)
  /* Verdadeiro depois de ela tocar numa duração: o tipo deixa de mandar na
     duração a partir daí. Sem isto, escolher "retorno" depois de ajustar para
     90 minutos jogaria a escolha dela fora sem avisar. */
  const [duracaoEscolhida, setDuracaoEscolhida] = useState(false)

  const [marcando, setMarcando] = useState(false)
  const marcandoAgora = useRef(false)
  const [erro, setErro] = useState('')

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  /* A duração escolhida à mão manda; o tipo só decide enquanto ela não
     escolheu. Num `ref` porque o efeito que lê os tipos roda uma vez e não pode
     depender deste estado -- ler os tipos de novo a cada toque na duração seria
     uma ida ao banco por tecla. */
  const escolheuDuracao = useRef(false)
  escolheuDuracao.current = duracaoEscolhida

  useEffect(() => {
    let vivo = true
    void tiposDeConsulta().then(lista => {
      if (!vivo) return
      setTipos(lista)
      /* O primeiro da lista é o padrão do sistema dela (a ordem é a que ela
         definiu lá), e a duração vem junto. */
      setTipo(atual => atual ?? lista[0]?.slug ?? null)
      if (!escolheuDuracao.current && lista[0]) setDuracao(lista[0].duracaoMin)
    })
    return () => {
      vivo = false
    }
  }, [])

  /* Armadilha 1: a busca abre POR CIMA desta tela, e o voltar do aparelho
     precisa descascar uma camada por vez. Com lista de dependências porque esta
     tela hospeda a busca -- sem ela, qualquer renderização daqui (uma tecla no
     campo) a re-registraria na frente da de dentro. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (buscaAberta) {
        setBuscaAberta(false)
        return true
      }
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [buscaAberta, onFechar])

  const lido = lerHorarioDaConsulta(data, hora)
  const pronto = paciente !== null && lido.tipo === 'ok'

  async function marcar() {
    if (marcando || marcandoAgora.current) return
    if (!paciente) {
      setErro('Escolha o paciente.')
      return
    }
    if (lido.tipo === 'erro') {
      setErro(lido.mensagem)
      return
    }

    marcandoAgora.current = true
    setMarcando(true)
    setErro('')

    const r = await marcarConsulta({
      pacienteId: paciente.id,
      quando: lido.quando,
      duracaoMin: duracao,
      tipo,
      observacoes,
    })

    marcandoAgora.current = false
    setMarcando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    onMarcou(dataISO(lido.quando), r.mensagem)
  }

  if (buscaAberta) {
    return (
      <BuscaDePaciente
        onEscolher={p => {
          setPaciente({ id: p.id, nome: p.nome })
          setBuscaAberta(false)
          setErro('')
        }}
        onFechar={() => setBuscaAberta(false)}
      />
    )
  }

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Nova consulta</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: respiro + 32 }]}
        showsVerticalScrollIndicator={false}
        /* Campo e botão na mesma rolagem: sem isto, o primeiro toque em "Marcar"
           com o teclado aberto só fecharia o teclado. */
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.rotulo}>QUEM</Text>
        <Pressable
          onPress={() => setBuscaAberta(true)}
          style={({ pressed }) => [styles.campoToque, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityLabel={paciente ? 'Paciente: ' + paciente.nome + '. Trocar' : 'Escolher o paciente'}
        >
          <Ionicons
            name={paciente ? 'person' : 'person-add-outline'}
            size={18}
            color={paciente ? paleta().cores.verde : paleta().inkFraco}
          />
          <Text style={[styles.textoDoCampo, !paciente && styles.textoVazio]} numberOfLines={1}>
            {paciente ? paciente.nome : 'Escolher o paciente'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
        </Pressable>

        <Text style={styles.rotulo}>QUANDO</Text>
        <View style={styles.linhaDeCampos}>
          <View style={styles.campoData}>
            <Text style={styles.rotuloDoCampo}>Dia</Text>
            <TextInput
              value={data}
              onChangeText={t => setData(mascaraData(t))}
              placeholder="12/09/2026"
              placeholderTextColor={paleta().inkFraco}
              keyboardType="number-pad"
              maxLength={10}
              style={styles.campo}
              accessibilityLabel="Dia da consulta"
            />
          </View>
          <View style={styles.campoHora}>
            <Text style={styles.rotuloDoCampo}>Hora</Text>
            <TextInput
              value={hora}
              onChangeText={t => setHora(mascaraHora(t))}
              placeholder="14:30"
              placeholderTextColor={paleta().inkFraco}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.campo}
              accessibilityLabel="Hora da consulta"
            />
          </View>
        </View>

        <View style={styles.atalhos}>
          {ATALHOS.map(a => (
            <Chip
              key={a.rotulo}
              rotulo={a.rotulo}
              ativo={false}
              onPress={() => setData(emDias(a.dias))}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.rotulo}>TIPO</Text>
        <View style={styles.chips}>
          {tipos.map(t => (
            <Chip
              key={t.slug}
              rotulo={t.nome}
              ativo={tipo === t.slug}
              onPress={() => {
                setTipo(t.slug)
                /* A duração do tipo só entra enquanto ela não escolheu uma. */
                if (!duracaoEscolhida) setDuracao(t.duracaoMin)
              }}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.rotulo}>DURAÇÃO</Text>
        <View style={styles.chips}>
          {DURACOES.map(m => (
            <Chip
              key={m}
              rotulo={m + ' min'}
              ativo={duracao === m}
              onPress={() => {
                setDuracao(m)
                setDuracaoEscolhida(true)
              }}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.rotulo}>OBSERVAÇÃO (OPCIONAL)</Text>
        <TextInput
          value={observacoes}
          onChangeText={setObservacoes}
          placeholder="O motivo, o que ela precisa levar, um lembrete…"
          placeholderTextColor={paleta().inkFraco}
          multiline
          style={[styles.campo, styles.campoLongo]}
          accessibilityLabel="Observação da consulta"
        />

        {/* A conferência por extenso, e não só o que está nos campos: ninguém
            confere dia da semana de cabeça, e é lendo "sábado" que ela percebe
            que queria sexta. */}
        {lido.tipo === 'ok' && (
          <View style={styles.confirmacao}>
            <Ionicons name="calendar-outline" size={16} color={paleta().cores.verde} />
            <Text style={styles.textoDaConfirmacao}>
              {horarioPorExtenso(lido.quando)} até {fimDaConsulta(lido.quando, duracao)}
            </Text>
          </View>
        )}
        {lido.tipo === 'erro' && (data.length > 0 || hora.length > 0) && (
          <Text style={styles.aviso}>{lido.mensagem}</Text>
        )}

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={() => void marcar()}
          disabled={!pronto || marcando}
          style={({ pressed }) => [
            styles.botao,
            (!pronto || marcando) && styles.botaoApagado,
            pressed && styles.pressionado,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !pronto || marcando }}
          accessibilityLabel="Marcar consulta"
        >
          {marcando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoDoBotao}>Marcar consulta</Text>
          )}
        </Pressable>

        <Text style={styles.nota}>
          Ela entra como pendente, igual ao sistema — é o confirmar que avisa
          {paciente ? ' ' + primeiroNome(paciente.nome) : ' o paciente'}.
        </Text>
      </ScrollView>
    </View>
  )
}

const DURACOES = [30, 45, 60, 90]

const ATALHOS = [
  { rotulo: 'Hoje', dias: 0 },
  { rotulo: 'Amanhã', dias: 1 },
  { rotulo: 'Semana que vem', dias: 7 },
]

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

/* "12/09/2026", daqui a N dias. Pelo calendário do APARELHO -- o "hoje" dela é
   o do consultório, e não o de Greenwich. */
function emDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  const dois = (n: number) => String(n).padStart(2, '0')
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear()
}

function Chip({
  rotulo,
  ativo,
  onPress,
  styles,
}: {
  rotulo: string
  ativo: boolean
  onPress: () => void
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, ativo && styles.chipAtivo, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
    >
      <Text style={[styles.textoDoChip, ativo && styles.textoDoChipAtivo]}>{rotulo}</Text>
    </Pressable>
  )
}

/* A busca, por cima da tela de marcar.
 *
 * Lista os ativos sem digitar nada -- marcar consulta para quem ela vê todo dia
 * não pode exigir escrever o nome -- e procura pelo que ela digitar. */
function BuscaDePaciente({
  onEscolher,
  onFechar,
}: {
  onEscolher: (p: PacienteDaLista) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<PacienteDaLista[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    /* Espera o dedo parar: uma ida ao banco por letra é a tela engasgando
       enquanto ela digita. */
    const id = setTimeout(
      () => {
        void buscarPacientes(termo).then(r => {
          if (!vivo) return
          setCarregando(false)
          if (r.tipo === 'erro') {
            setErro(r.mensagem)
            return
          }
          setErro('')
          setLista(r.pacientes)
        })
      },
      termo ? 250 : 0,
    )
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [termo])

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Para quem</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <View style={styles.caixaDeBusca}>
        <Ionicons name="search" size={16} color={paleta().inkFraco} />
        <TextInput
          value={termo}
          onChangeText={setTermo}
          placeholder="Procurar pelo nome"
          placeholderTextColor={paleta().inkFraco}
          autoFocus
          style={styles.campoDeBusca}
          accessibilityLabel="Procurar paciente pelo nome"
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!erro && <Text style={styles.erro}>{erro}</Text>}
        {carregando && lista.length === 0 && (
          <ActivityIndicator color={paleta().cores.verde} style={styles.girando} />
        )}
        {!carregando && lista.length === 0 && !erro && (
          <Text style={styles.vazio}>
            {termo ? 'Ninguém com esse nome.' : 'Você ainda não tem pacientes ativos.'}
          </Text>
        )}
        {lista.map(p => (
          <Pressable
            key={p.id}
            onPress={() => onEscolher(p)}
            style={({ pressed }) => [styles.linhaDaBusca, pressed && styles.pressionado]}
            accessibilityRole="button"
            accessibilityLabel={p.nome}
          >
            <Text style={styles.nomeDaBusca} numberOfLines={1}>
              {p.nome}
            </Text>
            {p.status !== 'ativo' && <Text style={styles.selo}>{p.status}</Text>}
            <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
          </Pressable>
        ))}
      </ScrollView>
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
    tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

    conteudo: { paddingHorizontal: 16, gap: 10 },

    rotulo: {
      marginTop: 10,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: t.inkFraco,
    },
    rotuloDoCampo: { fontSize: 12, color: t.inkSuave, marginBottom: 4 },

    campoToque: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: t.cores.superficie,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    textoDoCampo: { flex: 1, fontSize: 15, fontWeight: '700', color: t.cores.ink },
    textoVazio: { fontWeight: '600', color: t.inkFraco },

    linhaDeCampos: { flexDirection: 'row', gap: 10 },
    campoData: { flex: 1.4 },
    campoHora: { flex: 1 },
    campo: {
      backgroundColor: t.cores.superficie,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: t.cores.ink,
      fontFamily: FONTE.normal,
    },
    campoLongo: { minHeight: 74, textAlignVertical: 'top' },

    atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipAtivo: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    textoDoChip: { fontSize: 13, fontWeight: '700', color: t.inkSuave },
    textoDoChipAtivo: { color: t.cores.branco },

    confirmacao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    textoDaConfirmacao: { flex: 1, fontSize: 14, fontWeight: '700', color: t.cores.ink },
    aviso: { fontSize: 13, color: t.cores.gold, marginTop: 4 },
    erro: { fontSize: 13, color: t.cores.erroTexto, marginTop: 4 },

    botao: {
      marginTop: 14,
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    botaoApagado: { opacity: 0.45 },
    textoDoBotao: { fontSize: 15, fontWeight: '800', color: t.cores.branco },
    pressionado: { opacity: 0.75 },
    nota: { fontSize: 12, lineHeight: 17, color: t.inkFraco, marginTop: 8 },

    caixaDeBusca: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: t.cores.superficie,
      borderRadius: 12,
      paddingHorizontal: 12,
    },
    campoDeBusca: {
      flex: 1,
      paddingVertical: 11,
      fontSize: 15,
      color: t.cores.ink,
      fontFamily: FONTE.normal,
    },
    linhaDaBusca: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.cores.borda,
    },
    nomeDaBusca: { flex: 1, fontSize: 15, fontWeight: '700', color: t.cores.ink },
    selo: { fontSize: 11, fontWeight: '700', color: t.inkFraco, textTransform: 'uppercase' },
    vazio: { fontSize: 14, color: t.inkFraco, marginTop: 16, textAlign: 'center' },
    girando: { marginTop: 20 },
  }),
)
