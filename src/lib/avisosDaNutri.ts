import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { falha } from './erros'
import { notificacoes } from './lembretes'

/* Os avisos que ela escreve para si mesma.
 *
 * "Me lembra daqui duas horas de ligar para o laboratório." É a coisa mais
 * simples desta área inteira, e a que ela vai usar mais vezes por dia do que
 * qualquer relatório.
 *
 * ──────────────────── LOCAL, e não push ────────────────────
 * Mesma decisão dos lembretes do paciente, e pelo mesmo motivo escrito lá:
 * notificação local é agendada no próprio aparelho e não precisa de servidor,
 * de token nem de cron. Push exigiria development build -- o Expo Go não recebe
 * push no Android desde o SDK 53 -- e um serviço para disparar.
 *
 * A consequência honesta é que os avisos vivem NO APARELHO: não aparecem no
 * computador, e somem se ela reinstalar o app. Para "me lembra daqui duas
 * horas" isso é o certo -- o aviso morre no mesmo dia. Para compromisso, o
 * lugar é a agenda, e é para lá que o teto de 30 dias em `quandoDoAviso`
 * empurra.
 *
 * ──────────────────── Por que uma lib própria, e não dentro de `lembretes.ts` ────────────────────
 * Porque a FORMA é outra. Lá são interruptores: liga o lembrete de refeição e
 * ele reagenda sozinho a partir do plano, todo dia, para sempre. Aqui é uma
 * LISTA de coisas avulsas que ela escreve e que tocam uma vez.
 *
 * Misturar as duas faria `cancelarDoTipo` de um mexer no outro -- e o comentário
 * de lá conta que isso já aconteceu entre refeição e água, com um interruptor
 * calando o outro em silêncio. O tipo `'nutri'` no `data` da notificação é o
 * que mantém os dois mundos separados no sistema. */

const CHAVE = 'avisos.nutri'

/* O teto existe para o mesmo motivo do teto de qualquer lista guardada: sem
   ele, um aparelho com dois anos de uso acumula avisos vencidos que ninguém
   apaga, e a leitura da tela vai ficando lenta sem ninguém saber por quê. */
const TETO = 50

export type Aviso = {
  id: string
  texto: string
  /** Instante em que toca, em milissegundos. */
  quando: number
  /** O que o sistema devolveu ao agendar. Vazio quando não deu para agendar. */
  idDaNotificacao: string
}

async function guardados(): Promise<Aviso[]> {
  try {
    const cru = await AsyncStorage.getItem(CHAVE)
    if (!cru) return []
    const lidos = JSON.parse(cru)
    if (!Array.isArray(lidos)) return []
    /* Cada campo conferido, e não um `as Aviso[]`: isto vem do disco, e um
       registro pela metade -- de uma versão antiga, de uma escrita interrompida
       -- viraria `undefined` no meio da tela. */
    return lidos.filter(
      (a): a is Aviso =>
        a && typeof a.id === 'string' &&
        typeof a.texto === 'string' &&
        Number.isFinite(a.quando) &&
        typeof a.idDaNotificacao === 'string',
    )
  } catch (e) {
    falha('Não consegui ler os seus avisos.', e)
    return []
  }
}

async function gravar(avisos: Aviso[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(avisos.slice(0, TETO)))
  } catch (e) {
    falha('Não consegui guardar o aviso.', e)
  }
}

/**
 * Os avisos que ainda vão tocar, do mais próximo ao mais distante.
 *
 * O que já tocou é apagado aqui, e não mostrado apagado: um aviso que já
 * cumpriu o papel dele não é histórico, é lixo -- e uma lista que só cresce
 * faz ela parar de olhar. Quem quiser histórico tem a agenda.
 */
export async function avisosPendentes(agora: number = Date.now()): Promise<Aviso[]> {
  const todos = await guardados()
  const vivos = todos.filter(a => a.quando > agora).sort((a, b) => a.quando - b.quando)
  /* Só grava se mudou: escrever no disco a cada abertura de tela é trabalho
     para nada, e AsyncStorage não é de graça. */
  if (vivos.length !== todos.length) await gravar(vivos)
  return vivos
}

export type ResultadoDoAviso =
  | { tipo: 'ok'; aviso: Aviso }
  | { tipo: 'sem_permissao' }
  | { tipo: 'erro'; mensagem: string }

/**
 * Cria e agenda um aviso.
 *
 * A permissão é pedida AQUI, e não na abertura da tela: pedir o microfone ou a
 * notificação antes de a pessoa querer alguma coisa é como se ganha um "não"
 * que depois ninguém sabe desfazer.
 */
export async function criarAviso(texto: string, quando: Date): Promise<ResultadoDoAviso> {
  const limpo = texto.trim()
  if (!limpo) return { tipo: 'erro', mensagem: 'Escreva do que você quer ser lembrada.' }

  const instante = quando.getTime()
  if (!Number.isFinite(instante) || instante <= Date.now()) {
    return { tipo: 'erro', mensagem: 'Esse horário já passou.' }
  }

  /* O MESMO carregador dos lembretes do paciente, e não um `import` novo aqui.
     Ver o comentário na exportação dele: um segundo carregador nasceria sem o
     embrulho protegido e sem o `catch` que impede a promessa de nunca resolver
     -- e o sintoma disso, na migração para o SDK 57, não pareceu notificação:
     pareceu o app inteiro quebrado. */
  const N = await notificacoes()

  try {
    const atual = await N.getPermissionsAsync()
    if (!atual.granted) {
      const pedida = await N.requestPermissionsAsync()
      if (!pedida.granted) return { tipo: 'sem_permissao' }
    }

    /* Canal próprio, e não o de refeição. No Android o canal carrega som e
       importância, e a pessoa desliga POR CANAL nas configurações do sistema --
       então dividir o canal com outro assunto faria desligar um calar o outro,
       sem nada na nossa tela explicando. */
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('avisos-nutri', {
        name: 'Meus avisos',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      })
    }

    const idDaNotificacao = await N.scheduleNotificationAsync({
      content: {
        title: 'Lembrete',
        body: limpo,
        /* O tipo viaja dentro da notificação. É o que permite reconhecer os
           avisos DELA olhando o sistema, sem depender só da lista no disco --
           que é justamente o que se perde. Mesma saída de `lembretes.ts`. */
        data: { tipo: 'nutri' },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: new Date(instante),
        ...(Platform.OS === 'android' ? { channelId: 'avisos-nutri' } : {}),
      },
    })

    const aviso: Aviso = {
      /* Instante mais um sufixo aleatório. Só o instante colidiria em dois
         avisos criados para o mesmo minuto, e aí apagar um apagaria os dois. */
      id: String(instante) + '-' + Math.random().toString(36).slice(2, 8),
      texto: limpo,
      quando: instante,
      idDaNotificacao,
    }

    /* Grava DEPOIS de agendar. Ao contrário, um erro no agendamento deixaria na
       tela um aviso que nunca vai tocar -- e ela confiaria nele. */
    await gravar([aviso, ...(await avisosPendentes())])
    return { tipo: 'ok', aviso }
  } catch (e) {
    return { tipo: 'erro', mensagem: falha('Não consegui criar o aviso agora.', e) }
  }
}

/** Apaga o aviso e cancela a notificação dele. */
export async function apagarAviso(id: string): Promise<void> {
  const todos = await guardados()
  const alvo = todos.find(a => a.id === id)

  /* Cancela primeiro. Ao contrário, um erro no cancelamento deixaria a
     notificação viva depois de a linha sumir da tela -- e ela seria avisada de
     uma coisa que apagou, sem ter onde desligar. */
  if (alvo?.idDaNotificacao) {
    try {
      await (await notificacoes()).cancelScheduledNotificationAsync(alvo.idDaNotificacao)
    } catch (e) {
      falha('Não consegui cancelar o aviso no sistema.', e)
    }
  }

  await gravar(todos.filter(a => a.id !== id))
}
