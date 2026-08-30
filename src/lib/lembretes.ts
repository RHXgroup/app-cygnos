import AsyncStorage from '@react-native-async-storage/async-storage'
import { LogBox, Platform } from 'react-native'
import type { PlanoCompleto } from './plano'
import { falha } from './erros'

/* Lembretes de refeição e de água.
 *
 * O app só existia quando a pessoa lembrava dele, e lembrar de registrar é
 * justamente o que não acontece no meio do dia. Todo concorrente tem isso —
 * inclusive o Dietbox, que manda alerta de refeição e do diário.
 *
 * ── Por que local, e não push ──────────────────────────────────────────────
 * Notificação local é agendada no próprio aparelho e não precisa de servidor,
 * de token nem de conta. Push exigiria development build (o Expo Go não recebe
 * push no Android desde o SDK 53) e um serviço para disparar. Para "são 12:30,
 * hora do seu almoço" o aparelho já sabe tudo o que precisa saber.
 *
 * ── Por que a partir do plano ──────────────────────────────────────────────
 * Quem tem plano tem os horários DELE — "Almoço 12:30", "Pré-treino 16:00" —, e
 * é a diferença entre este app e um contador genérico: o lembrete fala dos
 * horários que a própria pessoa (ou a nutricionista dela) definiu. Sem plano,
 * não há o que lembrar, e inventar horário padrão seria avisar sobre uma
 * refeição que talvez nem exista na rotina dela. */

const CHAVE_LIGADO = 'lembretes.ligado'
const CHAVE_AGUA = 'lembretes.agua'

/* Os identificadores do que está agendado, por tipo.
 *
 * Existem porque `cancelAllScheduledNotificationsAsync` apaga TUDO, sem saber
 * distinguir. Com os dois interruptores na tela — refeição e água —, ligar um
 * apagaria silenciosamente o outro, e a pessoa descobriria isso só ao não ser
 * avisada. Guardando o que cada tipo agendou, cada um cancela o seu. */
const CHAVE_IDS_REFEICOES = 'lembretes.ids.refeicoes'
const CHAVE_IDS_AGUA = 'lembretes.ids.agua'

/* ── O botão dentro do aviso de água ───────────────────────────────────────
 *
 * "Toque para registrar um copo" custava: abrir o app, esperar carregar, achar
 * a água, tocar. Quatro passos para dizer que bebeu — e quem está com as mãos
 * ocupadas simplesmente não diz, o que faz o número do dia mentir para baixo.
 *
 * Com a categoria, o aviso vem com um botão e o copo entra sem o app abrir.
 * Funciona no Expo Go, porque é notificação LOCAL: o que saiu do Expo Go no SDK
 * 53 foi o push.
 *
 * A chave da última resposta atendida é gravada porque o mesmo toque pode
 * chegar duas vezes — pelo ouvinte e pela consulta de abertura —, e dois copos
 * por um toque é pior do que nenhum. */
const CATEGORIA_AGUA = 'cygnos.agua'
export const ACAO_COPO = 'registrar-copo'
const CHAVE_ULTIMO_COPO = 'lembretes.ultimoCopo'

/* A faxina única da versão anterior, que agendava sem guardar identificador.
 *
 * Quem já tinha lembretes ligados antes disto tem avisos no sistema que nenhuma
 * lista conhece — e sem esta limpeza eles tocariam para sempre, sem nada no app
 * capaz de desligá-los. Roda uma vez por aparelho. */
const CHAVE_FAXINA = 'lembretes.faxina.v2'

const HORA_INICIO = 9
const HORA_FIM = 21
/* De três em três horas: 9, 12, 15, 18 e 21. Cinco avisos por dia é o limite do
   que ajuda — acima disso a pessoa desliga tudo, inclusive o da refeição. */
const INTERVALO_HORAS = 3

/* O pacote é carregado sob demanda, e não no topo do arquivo.
 *
 * Ao ser importado, o expo-notifications reclama em VERMELHO no console que
 * push no Android saiu do Expo Go no SDK 53. É verdade e é irrelevante para nós
 * — o que usamos é notificação local, que continua funcionando —, mas o aviso
 * aparecia a cada abertura do app, para todo mundo, inclusive para quem nunca
 * ligou um lembrete. Um erro vermelho que não é erro treina quem desenvolve a
 * ignorar erros vermelhos.
 *
 * Assim ele só é carregado por quem abre a aba Mais e liga os lembretes, e de
 * quebra o app inicia sem esse custo. */
type ModuloNotificacoes = typeof import('expo-notifications')

let modulo: Promise<ModuloNotificacoes> | null = null

function notificacoes(): Promise<ModuloNotificacoes> {
  if (!modulo) {
    /* Cala um aviso que não é sobre nós, e que aparece como TELA VERMELHA.
     *
     * `expo-notifications` registra um ouvinte de push assim que é importado —
     * é efeito colateral de módulo, em DevicePushTokenAutoRegistration.fx, e o
     * `index` reexporta esse arquivo, então não há import que escape. No Expo
     * Go do Android o push foi removido no SDK 53, e esse registro vira um
     * `console.error` que o LogBox transforma em tela vermelha por cima do app.
     *
     * Ela aparece exatamente quando a pessoa LIGA um lembrete, e diz que o push
     * remoto não funciona — sobre um app que só usa lembrete LOCAL, agendado no
     * próprio aparelho, que funciona. Quem está testando lê "erro" e conclui que
     * o lembrete quebrou.
     *
     * Silenciar aqui, e não no App: fica ao lado da causa, e a ordem é garantida
     * — o `ignoreLogs` roda antes do import que dispara o aviso. Some sozinho no
     * dia do build de verdade, onde o push existe e o aviso não é emitido. */
    LogBox.ignoreLogs([/expo-notifications: Android Push notifications/])

    modulo = import('expo-notifications').then(n => {
      /* Como a notificação se comporta com o app aberto. Sem isto o Android
         engole a que chega em primeiro plano, e quem está com o app na mão — o
         caso mais comum na hora da refeição — não vê nada. */
      n.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      })
      return n
    })
  }
  return modulo
}

async function lerIds(chave: string): Promise<string[]> {
  try {
    const cru = await AsyncStorage.getItem(chave)
    const l = cru ? JSON.parse(cru) : []
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/* Cancela só o que este tipo agendou, e esquece os identificadores.
 *
 * Falhar em cancelar um não impede os outros: o que sobra é um aviso a mais,
 * e parar no meio deixaria a lista inteira pendurada. */
async function cancelarDoTipo(chave: string): Promise<void> {
  const Notifications = await notificacoes()
  for (const id of await lerIds(chave)) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id)
    } catch {
      /* Já não existia. */
    }
  }
  try {
    await AsyncStorage.removeItem(chave)
  } catch {
    /* Na próxima tentativa a lista antiga é lida de novo e o cancelamento de um
       identificador que já não existe é inofensivo. */
  }
}

/* Limpa uma vez o que a versão anterior agendou sem identificar. Ver CHAVE_FAXINA. */
async function faxinaUnica(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(CHAVE_FAXINA)) === '1') return
    const Notifications = await notificacoes()
    await Notifications.cancelAllScheduledNotificationsAsync()
    await AsyncStorage.setItem(CHAVE_FAXINA, '1')
  } catch {
    /* Sem storage a faxina roda de novo na próxima vez. Cancelar duas vezes não
       machuca; o que machucaria é nunca cancelar. */
  }
}

/* "15:00" — o primeiro horário que ainda vai acontecer hoje, ou o primeiro de
   amanhã quando o dia já passou de todos. Só para a tela ter o que dizer. */
function proximaHora(horas: number[]): string | null {
  if (horas.length === 0) return null

  const agora = new Date()
  const decimalDeAgora = agora.getHours() + agora.getMinutes() / 60
  const ordenadas = [...horas].sort((a, b) => a - b)
  const alvo = ordenadas.find(h => h > decimalDeAgora) ?? ordenadas[0]

  const h = Math.floor(alvo)
  const m = Math.round((alvo - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function lembretesLigados(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAVE_LIGADO)) === '1'
  } catch {
    /* Storage indisponível não é motivo para a tela quebrar: sem a preferência
       lida, o estado mostrado é "desligado", que é o padrão de quem nunca
       ligou. */
    return false
  }
}

export async function lembretesDeAguaLigados(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAVE_AGUA)) === '1'
  } catch {
    return false
  }
}

export type ResultadoLembretes =
  /* `proximo` é 'HH:MM' e existe para a tela poder provar que funcionou.
     Ligar um lembrete às dez da noite não produz nada visível até o dia
     seguinte, e sem essa frase a única leitura possível é "não funcionou". */
  | { tipo: 'ok'; quantos: number; proximo: string | null }
  | { tipo: 'negado' }
  | { tipo: 'erro'; mensagem: string }

/* Liga os lembretes: pede a permissão, limpa o que havia e agenda um por
 * refeição do plano, repetindo todo dia no horário dela.
 *
 * Sempre apaga antes de agendar. Agendar por cima duplicaria o aviso a cada vez
 * que a pessoa mexesse no plano — e um app que avisa duas vezes a mesma coisa é
 * desinstalado mais rápido do que um que não avisa. */
async function temPermissao(): Promise<boolean> {
  const Notifications = await notificacoes()
  const permissao = await Notifications.getPermissionsAsync()
  if (permissao.granted) return true
  return (await Notifications.requestPermissionsAsync()).granted
}

export async function ligarLembretes(plano: PlanoCompleto | null): Promise<ResultadoLembretes> {
  const Notifications = await notificacoes()
  if (!(await temPermissao())) return { tipo: 'negado' }

  try {
    /* Antes de agendar qualquer coisa, e nunca depois: a faxina cancela TUDO, e
       rodando no meio ela levaria junto o que o outro interruptor acabou de
       agendar. */
    await faxinaUnica()
    /* O canal é obrigatório no Android para a notificação aparecer; no iOS a
       chamada não faz nada e é ignorada. */
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('refeicoes', {
        name: 'Refeições',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    await cancelarDoTipo(CHAVE_IDS_REFEICOES)

    const refeicoes = plano?.refeicoes ?? []
    const ids: string[] = []
    const horasDoPlano: number[] = []

    for (const r of refeicoes) {
      const [hora, minuto] = r.hora.split(':').map(Number)
      /* Horário inválido no plano não derruba os outros lembretes: pula este e
         segue. A tela de edição valida a hora, mas um plano antigo pode ter
         entrado por outro caminho. */
      if (!Number.isFinite(hora) || !Number.isFinite(minuto)) continue

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: r.rotulo,
          /* O corpo diz o que fazer, e não só que está na hora: "hora do
             almoço" é informação que o relógio já dá. */
          body:
            r.itens.length > 0
              ? `${r.itens.length} ${r.itens.length === 1 ? 'item' : 'itens'} no seu plano. Toque para registrar.`
              : 'Toque para registrar o que você comeu.',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hora,
          minute: minuto,
          channelId: 'refeicoes',
        },
      })
      ids.push(id)
      horasDoPlano.push(hora + minuto / 60)
    }

    await AsyncStorage.setItem(CHAVE_IDS_REFEICOES, JSON.stringify(ids))
    await AsyncStorage.setItem(CHAVE_LIGADO, '1')
    return { tipo: 'ok', quantos: ids.length, proximo: proximaHora(horasDoPlano) }
  } catch (e) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui agendar os lembretes agora. Tente de novo.', e),
    }
  }
}

export async function desligarLembretes(): Promise<void> {
  /* Só as refeições. Antes isto apagava tudo — e com o interruptor da água ao
     lado, desligar um calaria o outro sem avisar. */
  await cancelarDoTipo(CHAVE_IDS_REFEICOES)
  try {
    await AsyncStorage.setItem(CHAVE_LIGADO, '0')
  } catch {
    /* A preferência não gravou, mas os lembretes já foram cancelados — que é o
       que a pessoa pediu. Na próxima abertura a tela mostrará "ligado" por
       engano, e um toque resolve; deixar os avisos tocando seria pior. */
  }
}

/* ── Água ──────────────────────────────────────────────────────────────────
 *
 * Aqui não há plano de onde tirar horário, e por isso a regra é outra: de três
 * em três horas, das 9 às 21. Cinco avisos por dia.
 *
 * Não sai da meta de água da pessoa de propósito. Meta alta viraria dez avisos,
 * e o décimo não faz ninguém beber mais água — faz desligar a notificação, e
 * junto vai a da refeição, que é a que importa. Um ritmo previsível vale mais
 * que um número exato aqui.
 *
 * Também não olha o que já foi bebido: saber que a pessoa bateu a meta às 15h
 * exigiria ler o banco a cada aviso, e notificação local não roda código. O
 * texto assume isso e não acusa ninguém de nada — quem já bebeu ignora. */
export async function ligarLembretesDeAgua(
  /* Os horários vêm de fora, calculados a partir da meta e das noites
     registradas — ver lib/ritmoDeAgua.ts. Sem eles, cai no ritmo genérico. */
  horarios?: number[],
  /* Quanto o botão "Registrei" grava, também calculado lá fora. Sem ele o botão
     some: um botão que não sabe quanto registrar registraria um número
     inventado, e um copo inventado suja a soma do dia para sempre. */
  mlDoGole?: number,
): Promise<ResultadoLembretes> {
  const Notifications = await notificacoes()
  if (!(await temPermissao())) return { tipo: 'negado' }

  try {
    await faxinaUnica()

    /* A categoria precisa existir ANTES do agendamento: o aviso guarda o nome
       dela, e um nome que não corresponde a nada vira aviso sem botão. */
    await Notifications.setNotificationCategoryAsync(CATEGORIA_AGUA, [
      {
        identifier: ACAO_COPO,
        buttonTitle: 'Registrei',
        /* Não abre o app. É o ponto inteiro do botão — abrir o app para
           registrar é o que já dava para fazer tocando no aviso. */
        options: { opensAppToForeground: false },
      },
    ])

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('agua', {
        name: 'Água',
        /* A mesma importância da refeição, e não menos.
         *
         * Estava em LOW, com a justificativa de que beber água meia hora depois
         * não tem consequência. Só que LOW no Android quer dizer sem som e sem
         * aparecer na tela: o aviso entrava calado na gaveta, e quem ligou o
         * lembrete concluiu — com razão — que ele não funcionava.
         *
         * Um lembrete que não interrompe não é um lembrete. Quem achar demais
         * desliga, e desligar é um toque. */
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    await cancelarDoTipo(CHAVE_IDS_AGUA)

    /* Em minutos desde a meia-noite. Sem o ritmo da pessoa, o antigo de três em
       três horas — que continua valendo para quem nunca registrou uma noite. */
    const emMinutos =
      horarios && horarios.length > 0
        ? horarios
        : (() => {
            const padrao: number[] = []
            for (let h = HORA_INICIO; h <= HORA_FIM; h += INTERVALO_HORAS) padrao.push(h * 60)
            return padrao
          })()

    const ids: string[] = []

    for (const minuto of emMinutos) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hora de beber água',
          body: mlDoGole
            ? `Cerca de ${mlDoGole} ml agora deixa o dia no ritmo.`
            : 'Toque para registrar um copo.',
          /* SEM meta definida não há botão.
           *
           * O botão registra um número, e o número sai da meta. Sem ela, ele
           * apareceria e não faria nada — e um botão que não faz nada é pior do
           * que botão nenhum: a pessoa toca, acha que registrou, e o dia fecha
           * com menos água do que ela bebeu. Quem não tem meta recebe o aviso
           * comum, que abre o app. */
          ...(mlDoGole ? { categoryIdentifier: CATEGORIA_AGUA } : {}),
          /* Quanto o botão registra. Vai no aviso, e não numa conta refeita na
             hora de responder: quando a pessoa toca, o app pode estar
             carregando — e o número certo é o de quando o aviso foi montado. */
          data: { tipo: 'agua', ml: mlDoGole ?? null },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          /* O horário pode passar da meia-noite quando alguém dorme muito
             tarde; o módulo espera 0 a 23. */
          hour: Math.floor(minuto / 60) % 24,
          minute: minuto % 60,
          channelId: 'agua',
        },
      })
      ids.push(id)
    }

    await AsyncStorage.setItem(CHAVE_IDS_AGUA, JSON.stringify(ids))
    await AsyncStorage.setItem(CHAVE_AGUA, '1')

    return {
      tipo: 'ok',
      quantos: ids.length,
      proximo: proximaHora(emMinutos.map(m => m / 60)),
    }
  } catch (e) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui agendar os lembretes agora. Tente de novo.', e),
    }
  }
}

export async function desligarLembretesDeAgua(): Promise<void> {
  await cancelarDoTipo(CHAVE_IDS_AGUA)
  try {
    await AsyncStorage.setItem(CHAVE_AGUA, '0')
  } catch {
    /* Mesmo caso do desligar da refeição: os avisos já foram cancelados, que é
       o que a pessoa pediu. */
  }
}

/* Reagenda quando o plano muda, e só se já estiverem ligados.
 *
 * Sem isto, quem liga os lembretes e depois muda o almoço das 12:30 para as 13h
 * continua sendo avisado no horário velho — e não tem como saber por quê. */
export async function reagendarSeLigados(plano: PlanoCompleto | null): Promise<void> {
  if (!(await lembretesLigados())) return
  await ligarLembretes(plano)
}

/* O mesmo para a água, que não tinha.
 *
 * O ritmo dela sai da meta e das noites registradas, e as duas mudam: a pessoa
 * dobra a meta de água, ou passa a dormir às onze em vez das duas. Sem isto os
 * avisos continuavam no ritmo antigo para sempre — e, pior que errado, era
 * invisível: nada na tela dizia por qual conta os horários tinham saído.
 *
 * Os horários vêm de fora pelo mesmo motivo de `ligarLembretesDeAgua`: quem
 * calcula fala com o banco, e este arquivo não fala. */
export async function reagendarAguaSeLigada(
  horarios?: number[],
  mlDoGole?: number,
): Promise<void> {
  if (!(await lembretesDeAguaLigados())) return
  await ligarLembretesDeAgua(horarios, mlDoGole)
}

/* ── Responder ao botão ────────────────────────────────────────────────────
 *
 * Dois caminhos, e os dois precisam existir:
 *
 *   ouvinte  → o app está de pé (em primeiro plano ou só na memória, que é o
 *              caso comum no Android). O copo entra na hora.
 *   abertura → o app tinha sido encerrado. A resposta ficou guardada pelo
 *              sistema e chega na próxima abertura.
 *
 * No segundo caso o copo NÃO entra com a hora de agora: entra com a hora em que
 * o aviso foi entregue. Quem tocou "Registrei" às dez da manhã bebeu às dez, e
 * gravar meio-dia porque foi quando o app abriu estragaria o gráfico de horário
 * — que é justamente a tela que existe para mostrar como o dia se distribui.
 *
 * A mesma resposta pode chegar pelos dois caminhos, e por isso a chave da
 * última atendida fica gravada: dois copos por um toque é pior do que nenhum. */
export function ouvirBotaoDeAgua(
  aoRegistrar: (ml: number, quando: Date) => void,
): () => void {
  let vivo = true

  const atender = async (resposta: unknown) => {
    if (!vivo || !resposta) return

    const r = resposta as {
      actionIdentifier?: string
      notification?: { date?: number; request?: { identifier?: string } }
    }
    if (r.actionIdentifier !== ACAO_COPO) return

    const entregue = r.notification?.date
    const chave = `${r.notification?.request?.identifier ?? '?'}:${entregue ?? '?'}`

    try {
      if ((await AsyncStorage.getItem(CHAVE_ULTIMO_COPO)) === chave) return
      await AsyncStorage.setItem(CHAVE_ULTIMO_COPO, chave)
    } catch {
      /* Sem armazenamento, o risco vira registrar duas vezes em vez de nenhuma.
         Segue: um copo a mais é corrigível na tela da água com um toque, e
         nenhum copo não é corrigível porque ninguém sabe que faltou. */
    }

    const ml = Number(
      (r as { notification?: { request?: { content?: { data?: { ml?: unknown } } } } })
        .notification?.request?.content?.data?.ml,
    )
    if (!Number.isFinite(ml) || ml <= 0) return

    /* `date` vem em milissegundos. Ausente — o sistema nem sempre manda —, cai
       em agora, que é o melhor palpite disponível. */
    aoRegistrar(ml, entregue ? new Date(entregue) : new Date())
  }

  const inscricao = notificacoes().then(Notifications => {
    /* A resposta que ABRIU o app, para o caso de ele estar encerrado. */
    Notifications.getLastNotificationResponseAsync().then(atender)
    return Notifications.addNotificationResponseReceivedListener(atender)
  })

  return () => {
    vivo = false
    inscricao.then(sub => sub.remove()).catch(() => {
      /* O módulo nem chegou a carregar: não há o que desligar. */
    })
  }
}
