import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { hhmm } from '../lib/diaDaNutri'
import { reais } from '../lib/financeiroDoDia'
import { tituloDoDia, diaLocalDe } from '../lib/calendarioDaAgenda'
import {
  buscarPacientes,
  fichaDoPaciente,
  idadeDe,
  type FichaDoPaciente,
  type PacienteDaLista,
} from '../lib/pacientesDaNutri'
import { useDesvioDoTeclado } from '../lib/teclado'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'

/* A carteira dela, no bolso.
 *
 * ──────────────────── O que entra na ficha, e o que NÃO entra ────────────────────
 * Entra o que ela precisa com a pessoa na frente: quem é, quando foi a última,
 * quando é a próxima, qual plano está valendo, o que está em aberto, e se ele
 * usa o app.
 *
 * Não entra prontuário -- exame, antropometria, anamnese. Não por limitar: é
 * que os três são ENTRADA de muitos números, onde errar um dígito muda a
 * conduta, e uma tela estreita é o pior lugar possível para digitar dezoito
 * campos. Ler eles aqui viria depois; digitar continua no computador.
 *
 * ──────────────────── A busca espera ela parar de digitar ────────────────────
 * Sem isso, "Marina" manda seis consultas ao banco -- uma por letra -- e a
 * resposta da terceira pode chegar depois da sexta e sobrescrever a lista certa
 * com a de "Mar". */

/* 350 ms: acima disso a busca parece travada, abaixo ela dispara no meio da
   palavra. Medido no que dá para digitar sem pausa. */
const ESPERA_DA_BUSCA = 350

export function PacientesDaNutriScreen() {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<PacienteDaLista[]>([])
  const [temMais, setTemMais] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<number | null>(null)

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  /* Qual busca está valendo. Sem isto, a resposta de uma consulta antiga que
     demorou sobrescreve a da atual -- e a lista passa a mostrar o resultado de
     um texto que não está mais no campo. */
  const daVez = useRef(0)

  const buscar = useCallback(async (texto: string) => {
    const minha = ++daVez.current
    const r = await buscarPacientes(texto)
    if (minha !== daVez.current) return

    if (r.tipo === 'ok') {
      setErro('')
      setLista(r.pacientes)
      setTemMais(r.temMais)
    } else {
      setErro(r.mensagem)
    }
  }, [])

  useEffect(() => {
    setCarregando(true)
    const id = setTimeout(() => {
      void buscar(termo).finally(() => setCarregando(false))
    }, termo ? ESPERA_DA_BUSCA : 0)
    return () => clearTimeout(id)
  }, [termo, buscar])

  /* Ela cadastra no computador e volta ao celular -- item 8. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void buscar(termo)
    })
    return () => sub.remove()
  }, [buscar, termo])

  if (aberto !== null) {
    return <Ficha id={aberto} onFechar={() => setAberto(null)} />
  }

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <Text style={styles.titulo}>Pacientes</Text>

      <View style={styles.busca}>
        <Ionicons name="search" size={17} color={paleta().inkFraco} />
        <TextInput
          value={termo}
          onChangeText={setTermo}
          placeholder="Procurar pelo nome"
          placeholderTextColor={paleta().inkFraco}
          keyboardAppearance="dark"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.campoBusca}
          accessibilityLabel="Procurar paciente pelo nome"
        />
        {termo.length > 0 && (
          <Pressable
            onPress={() => setTermo('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Limpar a busca"
          >
            <Ionicons name="close-circle" size={17} color={paleta().inkFraco} />
          </Pressable>
        )}
      </View>

      {!!erro && <Text style={styles.erro}>{erro}</Text>}

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: 24 + respiro }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={puxando}
              onRefresh={() => {
                setPuxando(true)
                void buscar(termo).finally(() => setPuxando(false))
              }}
              tintColor={paleta().cores.verde}
              colors={[paleta().cores.verde]}
              progressBackgroundColor={paleta().cores.cartao}
            />
          }
        >
          {lista.length === 0 ? (
            <View style={styles.vazio}>
              <Ionicons name="people-outline" size={22} color={paleta().inkFraco} />
              <Text style={styles.textoVazio}>
                {termo
                  ? 'Nenhum paciente com esse nome.'
                  : 'Nenhum paciente ativo na sua carteira.'}
              </Text>
            </View>
          ) : (
            <View style={styles.listaCartao}>
              {lista.map(p => (
                <Pressable
                  key={p.id}
                  onPress={() => setAberto(p.id)}
                  style={({ pressed }) => [styles.linha, pressed && styles.pressionado]}
                  accessibilityRole="button"
                  accessibilityLabel={p.nome}
                >
                  <View style={styles.textosDaLinha}>
                    <Text style={styles.nome} numberOfLines={1}>
                      {p.nome}
                    </Text>
                    {(p.celular || p.status !== 'ativo') && (
                      <Text style={styles.abaixoDoNome} numberOfLines={1}>
                        {p.status !== 'ativo' ? 'Inativo' : ''}
                        {p.status !== 'ativo' && p.celular ? ' · ' : ''}
                        {p.celular ?? ''}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Dito por escrito porque lista que acaba sem avisar é pior do que
              lista curta: ela veria terminar no meio do alfabeto e não teria
              como desconfiar. */}
          {temMais && (
            <Text style={styles.temMais}>
              Mostrando os primeiros. Escreva o nome para achar quem falta.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Ficha({ id, onFechar }: { id: number; onFechar: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [ficha, setFicha] = useState<FichaDoPaciente | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const r = await fichaDoPaciente(id)
    if (r.tipo === 'ok') {
      setErro('')
      setFicha(r.ficha)
    } else {
      setErro(r.mensagem)
    }
  }, [id])

  useEffect(() => {
    setCarregando(true)
    void carregar().finally(() => setCarregando(false))
  }, [carregar])

  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void carregar()
    })
    return () => sub.remove()
  }, [carregar])

  const idade = idadeDe(ficha?.nascimento ?? null)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalhoDaFicha}>
        <Pressable
          onPress={onFechar}
          hitSlop={10}
          style={styles.voltar}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaFicha} numberOfLines={1}>
          {ficha?.nome ?? 'Ficha'}
        </Text>
        <View style={styles.voltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          {ficha && (
            <>
              <View style={styles.cartao}>
                <Text style={styles.nomeGrande}>{ficha.nome}</Text>
                <Text style={styles.subtitulo}>
                  {[
                    idade !== null ? idade + ' anos' : null,
                    ficha.genero,
                    ficha.status !== 'ativo' ? 'Inativo' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sem dados de cadastro'}
                </Text>

                {/* O telefone é selecionável, e não um botão de ligar: abrir o
                    discador daqui interrompe o que ela estava fazendo, e na
                    maioria das vezes ela só quer copiar para o WhatsApp. */}
                {!!ficha.celular && (
                  <Text style={styles.contato} selectable>
                    {ficha.celular}
                  </Text>
                )}
                {!!ficha.email && (
                  <Text style={styles.contato} selectable>
                    {ficha.email}
                  </Text>
                )}
              </View>

              <View style={styles.cartao}>
                <Text style={styles.rotuloDoBloco}>CONSULTAS</Text>
                <Item
                  rotulo="Próxima"
                  valor={
                    ficha.proximaConsulta
                      ? tituloDoDia(diaLocalDe(ficha.proximaConsulta)) +
                        ', ' +
                        hhmm(ficha.proximaConsulta)
                      : 'Nenhuma marcada'
                  }
                  aviso={!ficha.proximaConsulta}
                />
                <Item
                  rotulo="Última realizada"
                  valor={
                    ficha.ultimaConsulta
                      ? tituloDoDia(diaLocalDe(ficha.ultimaConsulta))
                      : 'Ainda não teve'
                  }
                />
              </View>

              <View style={styles.cartao}>
                <Text style={styles.rotuloDoBloco}>ACOMPANHAMENTO</Text>
                <Item
                  rotulo="Plano ativo"
                  valor={ficha.planoAtivo ?? 'Nenhum plano ativo'}
                  aviso={!ficha.planoAtivo}
                />
                <Item rotulo="Usa o aplicativo" valor={ficha.usaOApp ? 'Sim' : 'Não'} />
              </View>

              {/* O financeiro só aparece quando HÁ algo em aberto. Zero aqui não
                  é resposta: a política de `contas_receber` exige permissão de
                  financeiro, e quem não a tem recebe zero linha SEM erro --
                  idêntico a "não deve nada". Item 6. */}
              {ficha.quantasEmAberto > 0 && (
                <View style={styles.cartao}>
                  <Text style={styles.rotuloDoBloco}>EM ABERTO</Text>
                  <Item
                    rotulo={
                      ficha.quantasEmAberto === 1
                        ? '1 conta a receber'
                        : ficha.quantasEmAberto + ' contas a receber'
                    }
                    valor={reais(ficha.emAberto)}
                  />
                </View>
              )}

              {/* Dito por escrito porque a ausência do prontuário é decisão, e
                  não tela pela metade. */}
              <Text style={styles.rodape}>
                Exames, antropometria e anamnese continuam no sistema, no
                computador · são muitos números para digitar numa tela estreita,
                e um dígito errado ali muda a conduta.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Item({ rotulo, valor, aviso = false }: { rotulo: string; valor: string; aviso?: boolean }) {
  const styles = estilos()
  return (
    <View style={styles.item}>
      <Text style={styles.rotuloDoItem}>{rotulo}</Text>
      <Text style={[styles.valorDoItem, aviso && styles.valorAusente]} numberOfLines={2}>
        {valor}
      </Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    titulo: {
      fontSize: 22,
      fontWeight: '800',
      color: t.cores.ink,
      letterSpacing: -0.3,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },

    busca: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 13,
      backgroundColor: t.cores.superficie,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    campoBusca: { flex: 1, fontSize: 15, color: t.cores.ink, padding: 0 },

    erro: {
      marginHorizontal: 16,
      marginBottom: 8,
      fontSize: 13.5,
      color: t.cores.ink,
      backgroundColor: t.cores.verdeMenta,
      padding: 12,
      borderRadius: 10,
    },

    conteudo: { paddingHorizontal: 16, gap: 12 },

    listaCartao: {
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      paddingHorizontal: 14,
    },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
    textosDaLinha: { flex: 1 },
    nome: { fontSize: 15.5, color: t.cores.ink },
    abaixoDoNome: { fontSize: 12.5, color: t.inkFraco, marginTop: 1 },
    temMais: { fontSize: 12, color: t.inkFraco, textAlign: 'center', paddingTop: 4 },

    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
    },
    textoVazio: { fontSize: 14, color: t.inkSuave, textAlign: 'center', paddingHorizontal: 24 },

    cabecalhoDaFicha: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloDaFicha: { flex: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },

    cartao: {
      backgroundColor: t.cores.cartao,
      borderRadius: RAIO_CARTAO,
      padding: 16,
      gap: 3,
    },
    nomeGrande: { fontSize: 20, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
    subtitulo: { fontSize: 13.5, color: t.inkSuave },
    contato: { fontSize: 14, color: t.cores.verde, marginTop: 6 },

    rotuloDoBloco: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 1.1,
      color: t.inkFraco,
      paddingBottom: 6,
    },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 7 },
    rotuloDoItem: { flex: 1, fontSize: 13.5, color: t.inkSuave },
    valorDoItem: { flex: 1.3, fontSize: 14, color: t.cores.ink, textAlign: 'right' },
    /* Ausência em tom apagado, e não em vermelho: não ter plano ativo não é
       erro, é um fato que ela pode querer resolver. */
    valorAusente: { color: t.inkFraco },

    rodape: { fontSize: 12, color: t.inkFraco, lineHeight: 18, paddingHorizontal: 4, paddingTop: 4 },
    pressionado: { opacity: 0.7 },
  }),
)
