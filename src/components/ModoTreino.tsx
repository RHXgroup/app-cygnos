import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createAudioPlayer } from 'expo-audio'
import { RASCUNHO, apagarRascunho, guardarRascunho, lerRascunho } from '../lib/rascunho'
import { relogio } from '../lib/voz'
import { estilosDe, paleta } from '../lib/tema'
import { gravarSerie, ultimaVezDoExercicio, type Exercicio, type UltimaVez } from '../lib/treino'
import { dataISO } from '../lib/formatar'

/* O modo treino: o telefone conduz a sessão, em vez de esperar ser alimentado.
 *
 * ── O que havia antes, e por que estava errado ────────────────────────────
 * Um cronômetro solto. Ele contava o tempo e o descanso, e não sabia que
 * exercício era — então descansava sempre o mesmo tempo escolhido na mão, em
 * toda série de todo treino. Quem está com a barra na mão não vai parar para
 * escolher "90 segundos" antes de cada uma.
 *
 * Aqui a rotina do dia CONDUZ: um exercício por vez, um botão grande, e o
 * descanso já começa com o tempo daquele exercício. A regra é que a pessoa
 * pegue no telefone uma vez por série, e não três.
 *
 * ── O aviso do fim do descanso ────────────────────────────────────────────
 * Som E vibração. Eu tinha escrito no arquivo antigo que isso "exige
 * agendamento que o Expo Go não faz" — estava errado, e nunca testei: o
 * `expo-audio` já está no projeto (o ditado usa) e a `Vibration` é do próprio
 * React Native. Nada disso precisa de notificação agendada, porque o app está
 * aberto na mão da pessoa.
 *
 * A vibração vem primeiro na ordem de importância: no volume da academia, com
 * fone ou sem, é ela que a pessoa sente. O som é o reforço. */

/* Quanto tempo um treino interrompido ainda vale para retomar.
 *
 * Seis horas. Quem saiu da academia e volta amanhã não quer continuar o treino
 * de ontem — quer começar o de hoje —, e oferecer isso seria pior do que não
 * oferecer nada. Mas o telefone bloquear no meio da série e o Android recolher
 * o app é questão de minutos, e é esse o caso que precisa ser coberto. */
const HORAS_DE_RASCUNHO = 6

const PADRAO_DE_DESCANSO = 60
const PASSO = 15
const MIN = 5
const MAX = 600

/* Dois toques curtos e um longo. Padrão diferente do de mensagem, para não se
   confundir com notificação de outro app no meio do treino. */
const PADRAO_DA_VIBRACAO = [0, 200, 120, 200, 120, 450]

type Fase = 'parado' | 'treinando' | 'descansando'

/* O primeiro número de "8-12", "10", "até a falha".
 *
 * Texto, e não número, porque é assim que se escreve repetição — e é assim que
 * a ficha da academia vem. Quando não há número nenhum ("até a falha"), volta
 * nulo: inventar 10 gravaria um dado que ninguém mediu. */
function primeiroNumero(texto: string | null): number | null {
  const achado = /\d+/.exec(texto ?? '')
  if (!achado) return null
  const n = Number(achado[0])
  return Number.isFinite(n) && n > 0 && n <= 1000 ? n : null
}

export function ModoTreino({
  visivel,
  contaId,
  exercicios,
  onDescansoMudou,
  onTerminar,
  onFechar,
}: {
  visivel: boolean
  contaId: string
  /* Os do DIA, já na ordem. Vazio é possível — a tela diz o que fazer. */
  exercicios: Exercicio[]
  /* A pessoa ajustou o descanso deste exercício. Persiste, porque ajustar de
     novo toda semana é exatamente o atrito que este modo existe para tirar. */
  onDescansoMudou: (exercicioId: string, segundos: number) => void
  /* Os minutos medidos. Quem grava a sessão é a tela. */
  onTerminar: (minutos: number) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [fase, setFase] = useState<Fase>('parado')
  const [indice, setIndice] = useState(0)
  /* Quantas séries já foram feitas de cada exercício, pelo id. */
  const [feitas, setFeitas] = useState<Record<string, number>>({})
  /* O descanso ajustado nesta sessão, antes de virar dado no banco. */
  const [descansos, setDescansos] = useState<Record<string, number>>({})

  /* O tempo conta por CARIMBO, e não por um contador que soma 1 a cada segundo:
     o Android congela `setInterval` quando o app sai da frente, e o treino
     inteiro sairia menor do que foi. */
  const [inicio, setInicio] = useState<number | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [fimDoDescanso, setFimDoDescanso] = useState<number | null>(null)

  const tocador = useRef<ReturnType<typeof createAudioPlayer> | null>(null)
  /* Enquanto o rascunho não foi lido, não dá para gravar por cima dele — senão
     o primeiro render (com tudo zerado) apagaria o treino que estava salvo. */
  const [restaurado, setRestaurado] = useState(false)

  /* O peso e a repetição EM USO nesta sessão, por exercício.
   *
   * Nascem do plano. Quem levantou o de sempre não toca em nada e o "fiz a
   * série" grava o valor certo — zero toque a mais do que antes. Só mexe quem
   * mudou a carga, que é exatamente quem quer que aquilo fique registrado. */
  const [cargas, setCargas] = useState<Record<string, number | null>>({})
  const [reps, setReps] = useState<Record<string, number | null>>({})
  /* O que ela fez neste exercício da última vez. É a informação que se procura
     no caderninho, e a que transforma cronômetro em acompanhamento. */
  const [ultima, setUltima] = useState<UltimaVez | null>(null)

  useEffect(() => {
    if (!visivel) return
    const id = setInterval(() => setAgora(Date.now()), 250)
    return () => clearInterval(id)
  }, [visivel])

  useEffect(() => {
    if (visivel) return
    setFase('parado')
    setIndice(0)
    setFeitas({})
    setInicio(null)
    setFimDoDescanso(null)
    setRestaurado(false)
  }, [visivel])

  /* O TREINO INTERROMPIDO.
   *
   * O Android mata app em segundo plano quando precisa de memória, e a tela do
   * treino fica aberta 50 minutos — boa parte deles com o telefone no bolso,
   * que é exatamente quando o sistema recolhe. Sem isto, voltar significava
   * cronômetro zerado, sem saber em que exercício estava nem quantas séries
   * havia feito: a sessão inteira perdida no meio dela, no cenário para o qual
   * este modo foi feito.
   *
   * O que volta é o INÍCIO, e não o tempo decorrido: o tempo é sempre calculado
   * de `agora - inicio`, então retomar recupera os minutos que passaram
   * inclusive com o app fechado — que é o que de fato aconteceu. */
  useEffect(() => {
    if (!visivel) return
    let vivo = true
    void lerRascunho<{ inicio: number; indice: number; feitas: Record<string, number> }>(
      RASCUNHO.treino,
      HORAS_DE_RASCUNHO,
    ).then(r => {
      if (!vivo) return
      if (r && typeof r.inicio === 'number') {
        setInicio(r.inicio)
        setIndice(Math.min(r.indice ?? 0, Math.max(0, exercicios.length - 1)))
        setFeitas(r.feitas ?? {})
        setFase('treinando')
      }
      setRestaurado(true)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel])

  /* Guarda a cada mudança do que importa. Não guarda o descanso em andamento:
     retomar no meio de uma contagem que já passou seria mostrar um número que
     não quer dizer nada. */
  useEffect(() => {
    if (!visivel || !restaurado) return
    if (inicio === null) return
    void guardarRascunho(RASCUNHO.treino, { inicio, indice, feitas })
  }, [visivel, restaurado, inicio, indice, feitas])

  /* Um tocador por sessão, criado na primeira vez que precisa. Criar a cada
     descanso deixaria um por série pendurado até o app fechar. */
  function avisar() {
    Vibration.vibrate(PADRAO_DA_VIBRACAO)
    try {
      if (!tocador.current) {
        tocador.current = createAudioPlayer(require('../../assets/fim-do-descanso.wav'))
      }
      tocador.current.seekTo(0)
      tocador.current.play()
    } catch {
      /* Sem som a vibração já avisou. Um treino não pode parar porque o áudio
         do aparelho está ocupado por outro app. */
    }
  }

  const exercicio = exercicios[indice] as Exercicio | undefined
  const descansoDe = (e: Exercicio) =>
    descansos[e.id] ?? e.descansoSeg ?? PADRAO_DE_DESCANSO
  const cargaDe = (e: Exercicio) => (e.id in cargas ? cargas[e.id] : e.cargaKg)
  const repsDe = (e: Exercicio) => (e.id in reps ? reps[e.id] : primeiroNumero(e.repeticoes))

  /* Busca o histórico quando o exercício muda. Uma ida por exercício, e não
     uma por série: o que ela fez da última vez não muda no meio do treino. */
  useEffect(() => {
    if (!visivel || !exercicio) {
      setUltima(null)
      return
    }
    let vivo = true
    setUltima(null)
    void ultimaVezDoExercicio(contaId, exercicio.id, dataISO(new Date())).then(u => {
      if (vivo) setUltima(u)
    })
    return () => {
      vivo = false
    }
  }, [visivel, contaId, exercicio?.id])

  const restamNoDescanso =
    fimDoDescanso === null ? 0 : Math.max(0, Math.round((fimDoDescanso - agora) / 1000))

  /* O fim do descanso é detectado aqui, e o aviso sai UMA vez.
     `fimDoDescanso` vira null no mesmo passo, então o efeito não repete. */
  useEffect(() => {
    if (fase !== 'descansando' || fimDoDescanso === null) return
    if (agora < fimDoDescanso) return
    setFimDoDescanso(null)
    setFase('treinando')
    avisar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agora, fase, fimDoDescanso])

  const minutos = inicio === null ? 0 : Math.max(0, Math.round((agora - inicio) / 60000))
  const segundosDeTreino = inicio === null ? 0 : Math.floor((agora - inicio) / 1000)

  function comecar() {
    setInicio(Date.now())
    setFase('treinando')
  }

  function terminar() {
    void apagarRascunho(RASCUNHO.treino)
    onTerminar(Math.max(1, minutos))
  }

  function fizASerie() {
    if (!exercicio) return
    const jaFeitas = (feitas[exercicio.id] ?? 0) + 1
    setFeitas(f => ({ ...f, [exercicio.id]: jaFeitas }))

    /* Sem `await`: a gravação não pode segurar o começo do descanso. Ela não
       rejeita — o pior caso é uma linha de histórico perdida, e o melhor caso
       de esperar seria um treino travado com a pessoa segurando a barra. */
    void gravarSerie(contaId, {
      exercicioId: exercicio.id,
      nome: exercicio.nome,
      data: dataISO(new Date()),
      serie: jaFeitas,
      cargaKg: cargaDe(exercicio),
      repeticoes: repsDe(exercicio),
    })

    const alvo = exercicio.series
    const acabou = alvo !== null && jaFeitas >= alvo

    /* Última série do exercício: passa para o próximo SEM descansar, porque o
       descanso entre exercícios é outro assunto e a pessoa costuma andar até o
       aparelho. Descansar aqui prenderia ela olhando o telefone à toa. */
    if (acabou && indice < exercicios.length - 1) {
      setIndice(i => i + 1)
      return
    }
    if (acabou) return

    setFimDoDescanso(Date.now() + descansoDe(exercicio) * 1000)
    setFase('descansando')
  }

  function ajustarDescanso(delta: number) {
    if (!exercicio) return
    const novo = Math.min(MAX, Math.max(MIN, descansoDe(exercicio) + delta))
    setDescansos(d => ({ ...d, [exercicio.id]: novo }))
    onDescansoMudou(exercicio.id, novo)
    /* Ajustar DURANTE o descanso move o fim junto, senão o número muda na tela
       e a contagem continua a antiga — que é a pior combinação possível. */
    if (fimDoDescanso !== null) setFimDoDescanso(Date.now() + novo * 1000)
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <View style={[styles.tela, { paddingTop: top + 8 }]}>
        <View style={styles.cabecalho}>
          <Pressable
            onPress={onFechar}
            style={styles.botaoVoltar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Sair do modo treino"
          >
            <Ionicons name="chevron-down" size={24} color={paleta().cores.ink} />
          </Pressable>
          <Text style={styles.relogioTopo}>{relogio(segundosDeTreino)}</Text>
          <View style={styles.botaoVoltar} />
        </View>

        {exercicios.length === 0 ? (
          <View style={styles.centro}>
            <Text style={styles.titulo}>Nenhum exercício hoje</Text>
            <Text style={styles.explicacao}>
              Monte a rotina deste dia e o modo treino conduz a sessão inteira: uma série por
              toque, com o descanso certo de cada exercício.
            </Text>
          </View>
        ) : !restaurado ? (
          <View style={styles.centro}>
            <ActivityIndicator color={paleta().cores.verde} />
          </View>
        ) : fase === 'parado' ? (
          <View style={styles.centro}>
            <Text style={styles.titulo}>{exercicios.length} exercícios hoje</Text>
            <Text style={styles.explicacao}>
              Toque em "fiz a série" a cada uma. O descanso começa sozinho, e o aparelho avisa
              com som e vibração — você não precisa olhar.
            </Text>
            <Pressable onPress={comecar} style={styles.botaoGrande} accessibilityRole="button">
              <Text style={styles.textoBotaoGrande}>Começar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={styles.conteudo}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.posicao}>
                {indice + 1} de {exercicios.length}
              </Text>
              <Text style={styles.nomeExercicio}>{exercicio?.nome}</Text>

              <Text style={styles.detalhe}>
                {[
                  exercicio?.series ? `${exercicio.series} séries` : null,
                  exercicio?.repeticoes ? `${exercicio.repeticoes} reps` : null,
                  exercicio?.cargaKg ? `${exercicio.cargaKg} kg` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'à vontade'}
              </Text>

              {/* O que ela fez da última vez. Vem ANTES dos controles porque é
                  a referência: a pessoa olha isto para decidir o peso de hoje,
                  e não depois de escolher. */}
              {ultima && (
                <View style={styles.ultimaVez}>
                  <Ionicons name="trending-up-outline" size={15} color={paleta().cores.verde} />
                  <Text style={styles.textoUltima}>
                    Da última vez: {ultima.series}{' '}
                    {ultima.series === 1 ? 'série' : 'séries'}
                    {ultima.repeticoes ? ` de ${ultima.repeticoes}` : ''}
                    {ultima.cargaKg !== null ? ` com ${ultima.cargaKg} kg` : ''}
                  </Text>
                </View>
              )}

              {/* Peso e repetição JÁ PREENCHIDOS com o plano. Quem levantou o de
                  sempre não toca aqui, e o "fiz a série" grava o valor certo:
                  zero toque a mais do que antes. */}
              {exercicio && (
                <View style={styles.linhaCargas}>
                  <Ajuste
                    rotulo="kg"
                    valor={cargaDe(exercicio)}
                    passo={2.5}
                    onMudar={n => setCargas(c => ({ ...c, [exercicio.id]: n }))}
                    styles={styles}
                  />
                  <Ajuste
                    rotulo="reps"
                    valor={repsDe(exercicio)}
                    passo={1}
                    onMudar={n => setReps(r => ({ ...r, [exercicio.id]: n }))}
                    styles={styles}
                  />
                </View>
              )}

              {/* As séries como bolinhas: quantas faltam se lê de relance, e de
                  relance é como se olha o telefone no meio de um treino. */}
              {exercicio?.series ? (
                <View style={styles.bolinhas}>
                  {Array.from({ length: exercicio.series }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.bolinha,
                        i < (feitas[exercicio.id] ?? 0) && styles.bolinhaFeita,
                      ]}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.detalhe}>
                  {feitas[exercicio?.id ?? ''] ?? 0} séries feitas
                </Text>
              )}
            </ScrollView>

            <View style={[styles.rodape, { paddingBottom: bottom + 16 }]}>
              {fase === 'descansando' ? (
                <>
                  <Text style={styles.rotuloDescanso}>Descanso</Text>
                  <Text style={styles.contagem}>{restamNoDescanso}</Text>

                  <View style={styles.linhaAjuste}>
                    <Pressable
                      onPress={() => ajustarDescanso(-PASSO)}
                      style={styles.botaoAjuste}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Menos quinze segundos"
                    >
                      <Text style={styles.textoAjuste}>−{PASSO}s</Text>
                    </Pressable>
                    <Text style={styles.descansoAtual}>
                      {exercicio ? descansoDe(exercicio) : PADRAO_DE_DESCANSO}s neste exercício
                    </Text>
                    <Pressable
                      onPress={() => ajustarDescanso(PASSO)}
                      style={styles.botaoAjuste}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Mais quinze segundos"
                    >
                      <Text style={styles.textoAjuste}>+{PASSO}s</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => {
                      setFimDoDescanso(null)
                      setFase('treinando')
                    }}
                    style={styles.botaoPular}
                    accessibilityRole="button"
                  >
                    <Text style={styles.textoPular}>Pular o descanso</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={fizASerie}
                    style={({ pressed }) => [styles.botaoGrande, pressed && styles.pressionado]}
                    accessibilityRole="button"
                    accessibilityLabel="Fiz a série"
                  >
                    <Text style={styles.textoBotaoGrande}>Fiz a série</Text>
                  </Pressable>

                  <View style={styles.linhaNavegar}>
                    <Pressable
                      onPress={() => setIndice(i => Math.max(0, i - 1))}
                      disabled={indice === 0}
                      style={styles.botaoNavegar}
                      accessibilityRole="button"
                      accessibilityLabel="Exercício anterior"
                    >
                      <Ionicons
                        name="chevron-back"
                        size={20}
                        color={indice === 0 ? paleta().inkFraco : paleta().cores.ink}
                      />
                    </Pressable>
                    <Pressable
                      onPress={terminar}
                      style={styles.botaoTerminar}
                      accessibilityRole="button"
                    >
                      <Text style={styles.textoTerminar}>Terminar treino</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setIndice(i => Math.min(exercicios.length - 1, i + 1))}
                      disabled={indice >= exercicios.length - 1}
                      style={styles.botaoNavegar}
                      accessibilityRole="button"
                      accessibilityLabel="Próximo exercício"
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={
                          indice >= exercicios.length - 1 ? paleta().inkFraco : paleta().cores.ink
                        }
                      />
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  )
}

/* Um número com menos e mais. Toque grande, porque isto é usado de pé, com a
   mão suada, e errar o alvo aqui grava o peso errado. */
function Ajuste({
  rotulo,
  valor,
  passo,
  onMudar,
  styles,
}: {
  rotulo: string
  valor: number | null
  passo: number
  onMudar: (n: number | null) => void
  styles: ReturnType<typeof estilos>
}) {
  const mudar = (delta: number) => {
    const base = valor ?? 0
    const novo = Math.round((base + delta) * 100) / 100
    /* Abaixo de zero volta a "—": peso do corpo é 0, e menos que isso não
       existe. O nulo é o "não registrei", e é diferente do zero. */
    onMudar(novo < 0 ? null : novo)
  }
  return (
    <View style={styles.ajuste}>
      <Pressable
        onPress={() => mudar(-passo)}
        style={styles.botaoNumero}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Menos ${passo} ${rotulo}`}
      >
        <Text style={styles.sinal}>−</Text>
      </Pressable>
      <View style={styles.valorBloco}>
        <Text style={styles.valor}>{valor === null ? '—' : valor}</Text>
        <Text style={styles.rotuloValor}>{rotulo}</Text>
      </View>
      <Pressable
        onPress={() => mudar(passo)}
        style={styles.botaoNumero}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Mais ${passo} ${rotulo}`}
      >
        <Text style={styles.sinal}>+</Text>
      </Pressable>
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
    },
    botaoVoltar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    relogioTopo: {
      fontSize: 17,
      fontWeight: '800',
      color: t.inkMedio,
      fontVariant: ['tabular-nums'],
    },

    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
    titulo: { fontSize: 22, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
    explicacao: { fontSize: 14, color: t.inkMedio, lineHeight: 21, textAlign: 'center' },

    conteudo: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
    posicao: {
      fontSize: 12.5,
      fontWeight: '800',
      color: t.inkFraco,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    /* Grande de propósito: é para ser lido de longe, com o telefone apoiado no
       banco do supino. */
    nomeExercicio: { fontSize: 30, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.8, lineHeight: 36 },
    detalhe: { fontSize: 15, color: t.inkMedio },

    ultimaVez: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
    textoUltima: { flex: 1, fontSize: 13.5, color: t.cores.verde, fontWeight: '700' },

    linhaCargas: { flexDirection: 'row', gap: 10, marginTop: 10 },
    ajuste: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    botaoNumero: {
      width: 42,
      height: 42,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.superficie,
    },
    sinal: { fontSize: 21, fontWeight: '800', color: t.cores.ink, lineHeight: 24 },
    valorBloco: { alignItems: 'center' },
    valor: {
      fontSize: 20,
      fontWeight: '800',
      color: t.cores.ink,
      fontVariant: ['tabular-nums'],
    },
    rotuloValor: { fontSize: 10.5, color: t.inkFraco, fontWeight: '700' },

    bolinhas: { flexDirection: 'row', gap: 8, marginTop: 6 },
    bolinha: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: t.cores.borda,
    },
    bolinhaFeita: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },

    rodape: { paddingHorizontal: 20, gap: 10, alignItems: 'center' },
    rotuloDescanso: {
      fontSize: 12.5,
      fontWeight: '800',
      color: t.inkFraco,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    /* O número do descanso ocupa a tela. Quem está sem fôlego não procura
       dígito pequeno. */
    contagem: {
      fontSize: 76,
      fontWeight: '800',
      color: t.cores.verde,
      fontVariant: ['tabular-nums'],
      lineHeight: 82,
    },
    linhaAjuste: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    botaoAjuste: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoAjuste: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
    descansoAtual: { fontSize: 12.5, color: t.inkFraco },

    botaoGrande: {
      alignSelf: 'stretch',
      backgroundColor: t.cores.verde,
      borderRadius: 18,
      height: 76,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressionado: { opacity: 0.85 },
    textoBotaoGrande: { color: t.cores.branco, fontSize: 20, fontWeight: '800' },

    botaoPular: { paddingVertical: 12 },
    textoPular: { fontSize: 14, fontWeight: '700', color: t.inkMedio },

    linhaNavegar: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
    botaoNavegar: {
      width: 48,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    botaoTerminar: {
      flex: 1,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoTerminar: { fontSize: 14, fontWeight: '700', color: t.inkMedio },
  }),
)
