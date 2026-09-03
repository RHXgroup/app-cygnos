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
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createAudioPlayer, setAudioModeAsync, useAudioRecorder } from 'expo-audio'
import * as Speech from 'expo-speech'
import { PREPARO_MS, acaoDoMomento, restam, type Fase } from '../lib/faseDoTreino'
import { RASCUNHO, apagarRascunho, guardarRascunho, lerRascunho } from '../lib/rascunho'
import { mmss } from '../lib/voz'
import { estilosDe, paleta } from '../lib/tema'
import {
  gravarSerie,
  ultimaVezDoExercicio,
  type Exercicio,
  type SerieFeita,
  type UltimaVez,
} from '../lib/treino'
import { FimDoTreino } from './FimDoTreino'
import { dataISO } from '../lib/formatar'
import { RESPOSTA, comandoDoTexto, naoEntendi, type Comando } from '../lib/comandoDeVoz'
import { OPCOES_DITADO, prepararMicrofone, transcrever } from '../lib/voz'

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

/* Um toque só, curto. O fim da série ela já sabe — acabou de largar o peso —,
   e o aviso aqui é confirmação, não chamado. Vibrar igual ao fim do descanso
   faria os dois se confundirem com o telefone no bolso. */
const VIBRACAO_DA_SERIE = [0, 90]



/* A voz.
 *
 * ── Por que falar, e não só apitar ────────────────────────────────────────
 * O apito diz que ALGO aconteceu; a voz diz O QUE aconteceu. Com o telefone no
 * chão e a pessoa de costas, "bip" e "bip" são a mesma coisa — e ela tem de
 * voltar para olhar a tela, que é exatamente o que o modo treino existe para
 * evitar.
 *
 * Falar é barato: roda no aparelho, sem rede, sem permissão e sem bateria
 * relevante. É o contrário de OUVIR, que exigiria o microfone aberto o tempo
 * todo — são coisas opostas, e só esta está aqui. */
/* A MELHOR voz de português instalada, e não a que vier.
 *
 * ── Por que escolher ──────────────────────────────────────────────────────
 * Sem escolher, o sistema usa a padrão — que no Android costuma ser a mais
 * simples das instaladas, e soa como robô de menu de telefone. A pessoa ri e
 * desliga, e aí a voz inteira não serve para nada.
 *
 * Quase todo aparelho tem mais de uma. As "enhanced" (iOS) e as de rede
 * (Google, no Android) são muito melhores, e é só pedir pelo identificador.
 *
 * ── Escolhida uma vez, e nunca de novo ────────────────────────────────────
 * Listar as vozes é ida ao sistema; fazer isso a cada número da contagem
 * atrasaria justamente o "três, dois, um". */
let vozEscolhida: string | undefined
let jaProcurei = false

async function acharVoz() {
  if (jaProcurei) return
  jaProcurei = true
  try {
    const vozes = await Speech.getAvailableVoicesAsync()
    const nossas = vozes.filter(v => /^pt[-_]?BR/i.test(v.language))
    if (nossas.length === 0) return

    /* Melhor primeiro: qualidade declarada, depois as de rede — que no Android
       são as que não parecem robô. `network` e `wavenet` aparecem no
       identificador das boas do Google; `x-afm` e `x-pte` são as locais. */
    const nota = (v: (typeof nossas)[number]) => {
      let n = 0
      if (String(v.quality).toLowerCase() === 'enhanced') n += 4
      if (/network|wavenet|neural/i.test(v.identifier)) n += 3
      /* As compactas do iOS são as piores de todas. */
      if (/compact/i.test(v.identifier)) n -= 3
      return n
    }
    vozEscolhida = [...nossas].sort((a, b) => nota(b) - nota(a))[0]?.identifier
  } catch {
    /* Sem lista, fica a padrão. Voz ruim ainda é melhor do que voz nenhuma
       quando o telefone está no chão. */
  }
}

/* Um pouco mais grave e um pouco mais devagar que o padrão.
 *
 * A voz padrão sai fina e corrida, e é isso que faz soar de brinquedo. `pitch`
 * abaixo de 1 e `rate` em 0,95 dão o tom de quem está contando uma série, e não
 * lendo uma notificação. */
function falar(texto: string) {
  try {
    /* PARA o que estiver falando antes de falar de novo.
     *
     * Sem isto as falas EMPILHAM: "Acabou o descanso" leva mais de um segundo,
     * e o "três" entra na fila atrás dela em vez de tocar na hora. A contagem
     * atrasa, o "um" e o "Vai" chegam depois de a série já ter começado — e foi
     * exatamente o que apareceu no teste: ele falava "três, dois" e quebrava.
     *
     * O mais novo sempre vence, porque numa contagem o número velho não
     * interessa mais. */
    Speech.stop()
    Speech.speak(texto, {
      language: 'pt-BR',
      voice: vozEscolhida,
      rate: 0.95,
      pitch: 0.92,
    })
  } catch {
    /* Sem voz, o apito e a vibração continuam avisando. Nada aqui pode parar
       um treino. */
  }
}

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
  pesoKg,
  exercicios,
  onCargaMudou,
  onDescansoMudou,
  onTerminar,
  onFechar,
}: {
  visivel: boolean
  contaId: string
  /* Para estimar a caloria do treino. Sem ele a estimativa não sai, e isso é
     melhor do que chutar 70 kg — quem pesa 55 receberia um número 27% maior e
     não teria como saber. */
  pesoKg: number | null
  /* Os do DIA, já na ordem. Vazio é possível — a tela diz o que fazer. */
  exercicios: Exercicio[]
  /* A pessoa ajustou o descanso deste exercício. Persiste, porque ajustar de
     novo toda semana é exatamente o atrito que este modo existe para tirar. */
  /* A carga que ela ajustou. Persiste pelo mesmo motivo do descanso — e com
     mais razão, porque é o número que muda toda semana. */
  onCargaMudou: (exercicioId: string, kg: number | null) => void
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
  /* Quando esta série começou.
   *
   * ── Por que começa sozinha ────────────────────────────────────────────
   * O caminho natural seria pedir um toque para começar e outro para terminar.
   * Mas quem está com a barra na mão não toca em nada — e uma série que a
   * pessoa esqueceu de iniciar aparece com tempo zero, que é pior do que não
   * ter tempo nenhum, porque entra na média.
   *
   * Então ele começa quando o descanso acaba, e para quando ela marca a série.
   * Continua um toque por série, e o tempo vem de graça.
   *
   * Nulo enquanto ela está descansando ou ainda não começou. */
  const [inicioDaSerie, setInicioDaSerie] = useState<number | null>(null)
  /* Quando a contagem de preparação acaba, ou nulo se não há contagem. */
  const [fimDoPreparo, setFimDoPreparo] = useState<number | null>(null)
  /* O último número já falado, para não repetir a cada quadro: o relógio bate a
     cada 250 ms, e sem isto o "três" sairia quatro vezes. */
  const ultimoFalado = useRef<number | null>(null)

  /* Começa a preparação: cinco segundos, com a voz contando o fim.
   *
   * Usado nos dois caminhos — o toque em "Iniciar a série" e o fim do
   * descanso —, porque nos dois a pessoa está longe do telefone. */
  function prepararSerie(anuncio = 'Prepare-se') {
    ultimoFalado.current = null
    setFimDoPreparo(Date.now() + PREPARO_MS)
    setFase('preparando')
    falar(anuncio)
  }

  /* Dois tocadores, e não um: trocar a fonte de um tocador só custa recarregar
     o arquivo no meio do treino, e é justamente quando não pode atrasar. */
  const somDoDescanso = useRef<ReturnType<typeof createAudioPlayer> | null>(null)
  const somDaSerie = useRef<ReturnType<typeof createAudioPlayer> | null>(null)
  /* Quando o último toque em "fiz a série" foi aceito.
   *
   * Achado varrendo os caminhos de escrita: o botão não tinha guarda de toque
   * duplo. Na última série de um exercício, ele PASSA para o próximo em vez de
   * ir para o descanso — então dois toques rápidos marcavam uma série no
   * exercício A e outra no B, que não foi feita, e as duas iam para o banco.
   *
   * Mão suada e luva de treino produzem toque duplo o tempo todo. Meio segundo
   * é curto o bastante para não atrapalhar quem faz série rápida de aquecimento
   * e longo o bastante para o repique não passar. */
  const ultimoToque = useRef(0)
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
  /* O que foi feito nesta sessão, na ordem. Alimenta a tela de fim de treino
     sem uma ida à rede: são exatamente as séries que acabaram de ser gravadas. */
  const [feitasNaSessao, setFeitasNaSessao] = useState<SerieFeita[]>([])
  const [terminando, setTerminando] = useState(false)

  useEffect(() => {
    if (!visivel) return
    const id = setInterval(() => setAgora(Date.now()), 250)
    return () => clearInterval(id)
  }, [visivel])

  useEffect(() => {
    if (visivel) return
    setFase('parado')
    /* Os prazos e o cronômetro da série saem JUNTO.
       Sem isto, fechar o modo treino no meio de uma série e reabrir amanhã
       mostrava "Fazendo a série · 847:12" — o cronômetro continuava contando um
       instante que não existe mais. */
    setFimDoPreparo(null)
    setFimDoDescanso(null)
    setInicioDaSerie(null)
    setIndice(0)
    setFeitas({})
    setInicio(null)
    setFimDoDescanso(null)
    setRestaurado(false)
    setFeitasNaSessao([])
    setTerminando(false)
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

  /* ── O modo de áudio, uma vez por abertura do modo treino ───────────────
   *
   * Sem isto o apito some em dois casos que são exatamente os da academia:
   * no iPhone com o interruptor de silencioso ligado — que é como quase todo
   * mundo anda —, e no Android depois de o ditado ter gravado áudio, porque a
   * sessão fica em modo de gravação e a reprodução sai baixa.
   *
   * `shouldPlayInBackground` fica falso: o aviso é para quem está olhando o
   * treino, e áudio em segundo plano pediria permissão que este app não tem
   * motivo para ter. */
  useEffect(() => {
    if (!visivel) return
    /* Procura a voz boa ao abrir o modo treino, e não no meio da contagem. */
    void acharVoz()
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      /* Não interrompe música: quem treina ouvindo som quer o apito POR CIMA,
         e não no lugar. */
      interruptionMode: 'mixWithOthers',
    }).catch(() => {
      /* Sem o modo, o som ainda toca — só mais baixo. A vibração não depende
         disto, e é ela que a pessoa sente com o telefone no bolso. */
    })
  }, [visivel])

  /* Um tocador por som, criado na primeira vez que precisa. Criar a cada
     descanso deixaria um por série pendurado até o app fechar. */
  function tocar(qual: 'descanso' | 'serie') {
    const ref = qual === 'descanso' ? somDoDescanso : somDaSerie
    try {
      if (!ref.current) {
        ref.current = createAudioPlayer(
          qual === 'descanso'
            ? require('../../assets/fim-do-descanso.wav')
            : require('../../assets/fim-da-serie.wav'),
        )
      }
      ref.current.volume = 1
      ref.current.seekTo(0)
      ref.current.play()
    } catch {
      /* Sem som a vibração já avisou. Um treino não pode parar porque o áudio
         do aparelho está ocupado por outro app. */
    }
  }

  /* FIM DO DESCANSO: som subindo, e a vibração longa. É o "vai". */
  function avisar() {
    Vibration.vibrate(PADRAO_DA_VIBRACAO)
    tocar('descanso')
  }

  /* FIM DA SÉRIE: som descendo, e um toque curto. É o "para".
   *
   * Dois sons diferentes de propósito: com o mesmo, quem está de fone teria de
   * olhar a tela para saber qual dos dois aconteceu — que é exatamente o que o
   * som existe para evitar. */
  function avisarFimDaSerie() {
    Vibration.vibrate(VIBRACAO_DA_SERIE)
    tocar('serie')
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

  const segundosDaSerie =
    inicioDaSerie === null ? null : Math.max(0, Math.round((agora - inicioDaSerie) / 1000))

  const restamNoPreparo = restam(fimDoPreparo, agora)

  /* ── O QUE ACONTECE AGORA ───────────────────────────────────────────────
   *
   * Eram dois efeitos lendo o relógio na mão, um para a preparação e outro para
   * o descanso, e as regras moravam dentro deles — onde não dava para
   * exercitar. O defeito da contagem quebrando só apareceu na academia, com a
   * pessoa no meio de uma série.
   *
   * Agora quem decide é `acaoDoMomento`, que roda no Node com 45 casos e uma
   * sonda de 6000 instantes. Aqui sobrou o que fala, apita e guarda. */
  useEffect(() => {
    const a = acaoDoMomento({ fase, fimDoPreparo, fimDoDescanso, agora })

    if (a.fimDoPreparo !== undefined) setFimDoPreparo(a.fimDoPreparo)
    if (a.fimDoDescanso !== undefined) setFimDoDescanso(a.fimDoDescanso)
    if (a.fase !== null) setFase(a.fase)
    if (a.comecarSerie) setInicioDaSerie(Date.now())

    if (a.contar !== null && ultimoFalado.current !== a.contar) {
      ultimoFalado.current = a.contar
      falar(String(a.contar))
    }

    if (a.falar === 'descanso acabou') {
      ultimoFalado.current = null
      falar('Descanso acabou')
    }

    if (a.falar === 'vai') {
      /* Com o peso e as repetições junto: é o que ela olharia na tela antes de
         pegar a barra, e é justamente o que ela não pode olhar agora. */
      const carga = exercicio ? cargaDe(exercicio) : null
      const reps = exercicio ? repsDe(exercicio) : null
      falar(
        carga && reps
          ? `Vai. ${carga} quilos, ${reps} repetições.`
          : reps
            ? `Vai. ${reps} repetições.`
            : 'Vai',
      )
    }

    if (a.apitar) avisar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agora, fase, fimDoPreparo, fimDoDescanso])

  const restamNoDescanso = restam(fimDoDescanso, agora)


  const minutos = inicio === null ? 0 : Math.max(0, Math.round((agora - inicio) / 60000))
  const segundosDeTreino = inicio === null ? 0 : Math.floor((agora - inicio) / 1000)

  /* ── FALAR em vez de tocar, durante o treino ───────────────────────────
   *
   * Toque-e-fala, e não escuta contínua: mãos-livres de verdade exige
   * reconhecimento nativo, que não roda no Expo Go, e deixa o microfone aberto
   * o treino inteiro — bateria e uma promessa de privacidade difícil de manter.
   *
   * Aqui a pessoa toca uma vez, fala duas palavras, e solta. Resolve o problema
   * real: mexer no telefone com a mão suada, no meio da série.
   *
   * O que ela ouviu FICA NA TELA. Reconhecimento de fala erra, e uma ação que
   * acontece sem dizer o que entendeu deixa a pessoa sem saber se a série foi
   * contada — e a série contada errado entra no histórico do treino. */
  const gravadorDeComando = useAudioRecorder(OPCOES_DITADO)
  const [ouvindo, setOuvindo] = useState(false)
  const [entendendo, setEntendendo] = useState(false)
  const [respostaDaVoz, setRespostaDaVoz] = useState('')
  const ouvindoAgora = useRef(false)

  /* Solta o microfone ao sair, mesmo no meio. Recurso nativo aberto mantém o
     ponto vermelho do sistema aceso depois que a pessoa já fechou o treino. */
  useEffect(
    () => () => {
      if (ouvindoAgora.current) gravadorDeComando.stop().catch(() => {})
    },
    [],
  )

  async function ouvirComando() {
    if (entendendo) return

    if (ouvindo) {
      /* Segundo toque: para, transcreve, obedece. */
      ouvindoAgora.current = false
      setOuvindo(false)
      setEntendendo(true)
      try {
        await gravadorDeComando.stop()
        const uri = gravadorDeComando.uri
        const r = uri ? await transcrever(uri, 3) : { tipo: 'erro' as const, mensagem: '' }
        if (r.tipo === 'ok') {
          const c = comandoDoTexto(r.texto)
          if (c) {
            setRespostaDaVoz(RESPOSTA[c])
            obedecer(c)
          } else {
            setRespostaDaVoz(naoEntendi(r.texto))
          }
        } else {
          setRespostaDaVoz('Não consegui ouvir. Toque no botão mesmo.')
        }
      } catch {
        setRespostaDaVoz('Não consegui ouvir. Toque no botão mesmo.')
      }
      setEntendendo(false)
      return
    }

    const permissao = await prepararMicrofone()
    if (permissao.tipo !== 'ok') {
      setRespostaDaVoz(permissao.mensagem)
      return
    }
    try {
      await gravadorDeComando.prepareToRecordAsync()
      gravadorDeComando.record()
      ouvindoAgora.current = true
      setOuvindo(true)
      setRespostaDaVoz('')
    } catch {
      setRespostaDaVoz('Não consegui abrir o microfone.')
    }
  }

  /* O comando faz o MESMO que o botão faria — chama a mesma função.
   *
   * Um segundo caminho para "contar a série" divergiria do primeiro no dia em
   * que um deles mudasse, e o que diverge aqui entra no histórico do treino
   * sem ninguém conferir. */
  function obedecer(c: Comando) {
    if (c === 'fiz') fizASerie()
    else if (c === 'pausar') setFase('parado')
    else if (c === 'continuar') prepararSerie()
    else if (c === 'mais_descanso') ajustarDescanso(15)
    else if (c === 'menos_descanso') ajustarDescanso(-15)
    else if (c === 'pular_descanso') setFimDoDescanso(Date.now())
    else if (c === 'terminar') terminar()
  }

  function comecar() {
    setInicio(Date.now())
    setFase('treinando')
  }

  /* Terminar MOSTRA o que aquele treino valeu, e só depois fecha.
   *
   * Fechar direto era o que havia antes, e é o defeito de desenho que este app
   * tinha inteiro: pedia, guardava, e no fim a pessoa não levava nada. */
  function terminar() {
    void apagarRascunho(RASCUNHO.treino)
    setTerminando(true)
  }

  function fizASerie() {
    if (!exercicio) return
    const agoraMs = Date.now()
    if (agoraMs - ultimoToque.current < 500) return
    ultimoToque.current = agoraMs
    const jaFeitas = (feitas[exercicio.id] ?? 0) + 1
    setFeitas(f => ({ ...f, [exercicio.id]: jaFeitas }))

    /* Sem `await`: a gravação não pode segurar o começo do descanso. Ela não
       rejeita — o pior caso é uma linha de histórico perdida, e o melhor caso
       de esperar seria um treino travado com a pessoa segurando a barra. */
    const feita: SerieFeita = {
      exercicioId: exercicio.id,
      nome: exercicio.nome,
      data: dataISO(new Date()),
      serie: jaFeitas,
      cargaKg: cargaDe(exercicio),
      repeticoes: repsDe(exercicio),
    }
    /* O tempo desta série fica só nesta sessão: a coluna não existe no banco, e
       inventá-la aqui seria gravar num lugar que ninguém lê. O que ela vê é o
       cronômetro na tela; guardar isso é assunto de outra alteração. */
    setInicioDaSerie(null)
    void gravarSerie(contaId, feita)
    /* Guardado aqui também: a tela de fim de treino usa isto em vez de reler do
       banco, e assim ela aparece na hora — que é o único momento em que a
       devolução vale alguma coisa. */
    setFeitasNaSessao(atuais => [
      ...atuais.filter(x => !(x.exercicioId === feita.exercicioId && x.serie === feita.serie)),
      feita,
    ])

    const alvo = exercicio.series
    const acabou = alvo !== null && jaFeitas >= alvo

    /* Última série do exercício: passa para o próximo SEM descansar, porque o
       descanso entre exercícios é outro assunto e a pessoa costuma andar até o
       aparelho. Descansar aqui prenderia ela olhando o telefone à toa. */
    if (acabou && indice < exercicios.length - 1) {
      /* O nome do PRÓXIMO, falado.
         É o momento em que ela precisa andar até outro aparelho, e o único jeito
         de saber para onde era voltar e ler a tela. */
      const proximo = exercicios[indice + 1]
      falar(
        `Acabou ${exercicio.nome}. Agora: ${proximo.nome}` +
          (proximo.series ? `, ${proximo.series} séries.` : '.'),
      )
      setIndice(i => i + 1)
      /* O exercício novo começa PARADO, esperando o "Iniciar a série".
         Continuar contando daria a este exercício o tempo da caminhada até o
         outro aparelho, que não é série de ninguém. */
      setInicioDaSerie(null)
      return
    }
    if (acabou) return

    /* O apito do FIM DA SÉRIE, junto com o começo do descanso. É o que faltava:
       o modo treino só avisava quando o descanso acabava, e não quando ele
       começava — quem está de fone não sabia que o telefone tinha registrado. */
    avisarFimDaSerie()

    /* A voz diz ONDE ela está e QUANTO vai descansar.
     *
     * Três apitos diferentes ainda são três apitos: com o telefone no chão e a
     * pessoa de costas, ela sabe que ALGO aconteceu e não o quê. "Série dois de
     * quatro. Descanse sessenta segundos." responde as duas perguntas que ela
     * teria de voltar até a tela para responder. */
    const segundos = descansoDe(exercicio)
    const ondeEstou = exercicio.series
      ? `Série ${jaFeitas} de ${exercicio.series}. `
      : `Série ${jaFeitas}. `
    falar(`${ondeEstou}Descanse ${segundos} segundos.`)

    setFimDoDescanso(Date.now() + segundos * 1000)
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

  /* A devolução, por cima de tudo. Sem cabeçalho e sem voltar: daqui só se sai
     pelo "Pronto", porque o que está na tela é o resultado do que ela acabou de
     fazer, e não uma etapa a atravessar. */
  if (terminando) {
    return (
      <Modal visible={visivel} animationType="slide" onRequestClose={() => onTerminar(Math.max(1, minutos))}>
        <FimDoTreino
          contaId={contaId}
          series={feitasNaSessao}
          minutos={Math.max(1, minutos)}
          pesoKg={pesoKg}
          onPronto={() => onTerminar(Math.max(1, minutos))}
        />
      </Modal>
    )
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
          <Text style={styles.relogioTopo}>{mmss(segundosDeTreino)}</Text>
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
              /* `flex: 1` na ROLAGEM, e nao so no container.
               Sem isto ela se dimensiona pelo conteudo e o rodape fixo -- irmao
               dela -- para onde o conteudo achar que acabou: no MEIO da tela.
               `contentContainerStyle` NAO resolve: ele estiliza o conteudo
               dentro da rolagem, e nao a rolagem. */
              style={styles.rolagem}
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
                    onMudar={n => {
                      setCargas(c => ({ ...c, [exercicio.id]: n }))
                      onCargaMudou(exercicio.id, n)
                    }}
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
              {/* DIZ o que as bolinhas são.
                   Elas apareciam sozinhas embaixo do exercício, e "quatro
                   bolinhas" não é nada até alguém contar que são as séries. */}
              {exercicio?.series ? (
                <>
                  <Text style={styles.rotuloBolinhas}>
                    {feitas[exercicio.id] ?? 0} de {exercicio.series}{' '}
                    {exercicio.series === 1 ? 'série' : 'séries'}
                  </Text>
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
                </>
              ) : (
                <Text style={styles.detalhe}>
                  {feitas[exercicio?.id ?? ''] ?? 0} séries feitas
                </Text>
              )}
            </ScrollView>

            <View style={[styles.rodape, { paddingBottom: bottom + 16 }]}>
              {fase === 'preparando' ? (
                <>
                  <Text style={styles.rotuloDescanso}>Começa em</Text>
                  <Text style={styles.contagem}>{restamNoPreparo}</Text>
                  <Text style={styles.avisoPreparo}>
                    Pode largar o telefone. Eu aviso na hora de começar.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setFimDoPreparo(null)
                      setFase('treinando')
                      setInicioDaSerie(Date.now())
                    }}
                    style={styles.botaoPular}
                    accessibilityRole="button"
                  >
                    <Text style={styles.textoPular}>Começar agora</Text>
                  </Pressable>
                </>
              ) : fase === 'descansando' ? (
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
                      /* Pular o descanso também passa pela preparação: quem
                         pulou está indo para a barra AGORA, e é justamente
                         quem mais precisa dos segundos para largar o
                         telefone. */
                      prepararSerie()
                    }}
                    style={styles.botaoPular}
                    accessibilityRole="button"
                  >
                    <Text style={styles.textoPular}>Pular o descanso</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {/* O TEMPO DESTA SÉRIE.
                      Só aparece depois que o descanso acabou uma vez — na
                      primeira série do treino não há de onde começar a contar,
                      e um zero parado ali seria um cronômetro quebrado. */}
                  {segundosDaSerie !== null && (
                    <Text style={styles.tempoDaSerie}>
                      Fazendo a série · {Math.floor(segundosDaSerie / 60)}:
                      {String(segundosDaSerie % 60).padStart(2, '0')}
                    </Text>
                  )}

                  {/* O DESCANSO, ajustável ANTES de descansar.
                      Este controle só existia dentro do descanso, e por isso
                      ninguém achava: para mudar o tempo era preciso já estar
                      descansando naquele tempo. Aqui ele fica no caminho de
                      quem está entre séries, que é quando se decide. */}
                  <View style={styles.linhaAjuste}>
                    <Pressable
                      onPress={() => ajustarDescanso(-PASSO)}
                      style={styles.botaoAjuste}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Menos quinze segundos de descanso"
                    >
                      <Text style={styles.textoAjuste}>−{PASSO}s</Text>
                    </Pressable>
                    <Text style={styles.descansoAtual}>
                      Descanso de {exercicio ? descansoDe(exercicio) : PADRAO_DE_DESCANSO}s
                    </Text>
                    <Pressable
                      onPress={() => ajustarDescanso(PASSO)}
                      style={styles.botaoAjuste}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Mais quinze segundos de descanso"
                    >
                      <Text style={styles.textoAjuste}>+{PASSO}s</Text>
                    </Pressable>
                  </View>

                  {/* DOIS estados, e não um.
                   *
                   * Só existia "Fiz a série", e o cronômetro tinha de começar
                   * sozinho — o que funciona depois do descanso, e não na
                   * PRIMEIRA série nem ao trocar de exercício, porque ali não
                   * houve descanso nenhum antes. Nesses dois momentos a pessoa
                   * ficava olhando um botão que só sabia terminar uma série que
                   * nunca tinha começado.
                   *
                   * Agora: "Iniciar a série" quando está parada, "Terminei a
                   * série" enquanto corre. Depois do descanso ele já entra
                   * correndo, que é o que ela pediu — quem acabou de descansar
                   * está indo para a barra, e um toque a mais ali é um toque
                   * com o peso na mão. */}
                  {inicioDaSerie === null ? (
                    <Pressable
                      onPress={() => prepararSerie()}
                      style={({ pressed }) => [styles.botaoGrande, pressed && styles.pressionado]}
                      accessibilityRole="button"
                      accessibilityLabel="Iniciar a série"
                    >
                      <Ionicons name="play" size={19} color={paleta().cores.branco} />
                      <Text style={styles.textoBotaoGrande}>Iniciar a série</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={fizASerie}
                      style={({ pressed }) => [styles.botaoGrande, pressed && styles.pressionado]}
                      accessibilityRole="button"
                      accessibilityLabel="Terminei a série"
                    >
                      <Ionicons name="checkmark" size={20} color={paleta().cores.branco} />
                      <Text style={styles.textoBotaoGrande}>Terminei a série</Text>
                    </Pressable>
                  )}

                  {/* O microfone fica ABAIXO do botão grande, e não no lugar
                      dele: falar é atalho para quem está com a mão ocupada, e
                      o toque continua sendo o caminho principal.
                      A resposta do que foi ouvido aparece aqui mesmo, colada
                      no botão — não adianta confirmar num canto que ninguém
                      olha no meio de uma série. */}
                  <Pressable
                    onPress={ouvirComando}
                    disabled={entendendo}
                    style={({ pressed }) => [
                      styles.botaoVoz,
                      ouvindo && styles.botaoVozOuvindo,
                      pressed && styles.pressionado,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={ouvindo ? 'Parar de ouvir' : 'Falar um comando'}
                  >
                    {entendendo ? (
                      <ActivityIndicator size="small" color={paleta().cores.verde} />
                    ) : (
                      <Ionicons
                        name={ouvindo ? 'stop' : 'mic-outline'}
                        size={17}
                        color={ouvindo ? paleta().cores.branco : paleta().cores.verde}
                      />
                    )}
                    <Text style={[styles.textoBotaoVoz, ouvindo && styles.textoBotaoVozOuvindo]}>
                      {entendendo
                        ? 'Entendendo…'
                        : ouvindo
                          ? 'Fale e toque para parar'
                          : 'Falar em vez de tocar'}
                    </Text>
                  </Pressable>

                  {!!respostaDaVoz && <Text style={styles.respostaVoz}>{respostaDaVoz}</Text>}

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
    rolagem: { flex: 1 },
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
      borderRadius: 12,
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
    /* Discreto: é informação, e não o botão. Quem está entre séries decide pelo
     botão grande logo abaixo, e um número gritando aqui competiria com ele. */
  tempoDaSerie: {
    fontSize: 13,
    fontWeight: '700',
    color: t.inkMedio,
    textAlign: 'center',
    marginBottom: 10,
  },
  rotuloBolinhas: {
    fontSize: 12,
    fontWeight: '700',
    color: t.inkMedio,
    textAlign: 'center',
    marginTop: 14,
  },
  avisoPreparo: {
    fontSize: 12.5,
    color: t.inkMedio,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    textoAjuste: { fontSize: 15, fontWeight: '800', color: t.cores.ink },
    descansoAtual: { fontSize: 12.5, color: t.inkFraco },

    botaoGrande: {
    flexDirection: 'row',
    gap: 9,
      alignSelf: 'stretch',
      backgroundColor: t.cores.verde,
      borderRadius: 16,
      height: 76,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressionado: { opacity: 0.85 },
    textoBotaoGrande: { color: t.cores.branco, fontSize: 20, fontWeight: '800' },

    botaoPular: { paddingVertical: 12 },
    textoPular: { fontSize: 14, fontWeight: '700', color: t.inkMedio },

    botaoVoz: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    marginTop: 10,
    backgroundColor: t.cores.verdeMenta,
    borderWidth: 1,
    borderColor: t.cores.verde,
  },
  botaoVozOuvindo: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
  textoBotaoVoz: { fontSize: 13.5, fontWeight: '700', color: t.cores.verdeEscuro },
  textoBotaoVozOuvindo: { color: t.cores.branco },
  respostaVoz: { marginTop: 8, fontSize: 13, color: t.inkMedio, textAlign: 'center' },

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
