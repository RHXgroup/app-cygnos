import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import type { PlanoCompleto } from './plano'

/* Lembrete de refeição.
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

/* Como a notificação se comporta com o app aberto. Sem isto o Android engole a
   que chega em primeiro plano, e quem está com o app na mão — o caso mais comum
   na hora da refeição — não vê nada. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

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

export type ResultadoLembretes =
  | { tipo: 'ok'; quantos: number }
  | { tipo: 'negado' }
  | { tipo: 'erro'; mensagem: string }

/* Liga os lembretes: pede a permissão, limpa o que havia e agenda um por
 * refeição do plano, repetindo todo dia no horário dela.
 *
 * Sempre apaga antes de agendar. Agendar por cima duplicaria o aviso a cada vez
 * que a pessoa mexesse no plano — e um app que avisa duas vezes a mesma coisa é
 * desinstalado mais rápido do que um que não avisa. */
export async function ligarLembretes(plano: PlanoCompleto | null): Promise<ResultadoLembretes> {
  const permissao = await Notifications.getPermissionsAsync()
  let concedida = permissao.granted

  if (!concedida) {
    const pedido = await Notifications.requestPermissionsAsync()
    concedida = pedido.granted
  }

  if (!concedida) return { tipo: 'negado' }

  try {
    /* O canal é obrigatório no Android para a notificação aparecer; no iOS a
       chamada não faz nada e é ignorada. */
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('refeicoes', {
        name: 'Refeições',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    await Notifications.cancelAllScheduledNotificationsAsync()

    const refeicoes = plano?.refeicoes ?? []
    let quantos = 0

    for (const r of refeicoes) {
      const [hora, minuto] = r.hora.split(':').map(Number)
      /* Horário inválido no plano não derruba os outros lembretes: pula este e
         segue. A tela de edição valida a hora, mas um plano antigo pode ter
         entrado por outro caminho. */
      if (!Number.isFinite(hora) || !Number.isFinite(minuto)) continue

      await Notifications.scheduleNotificationAsync({
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
      quantos++
    }

    await AsyncStorage.setItem(CHAVE_LIGADO, '1')
    return { tipo: 'ok', quantos }
  } catch (e) {
    return { tipo: 'erro', mensagem: (e as Error).message }
  }
}

export async function desligarLembretes(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync()
  try {
    await AsyncStorage.setItem(CHAVE_LIGADO, '0')
  } catch {
    /* A preferência não gravou, mas os lembretes já foram cancelados — que é o
       que a pessoa pediu. Na próxima abertura a tela mostrará "ligado" por
       engano, e um toque resolve; deixar os avisos tocando seria pior. */
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
