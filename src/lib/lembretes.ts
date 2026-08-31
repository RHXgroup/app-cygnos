import AsyncStorage from '@react-native-async-storage/async-storage'
import { LogBox, Platform } from 'react-native'
import type { PlanoCompleto } from './plano'
import { falha } from './erros'
import { ACAO_COPO, copoDoAviso } from './copoDoAviso'
import { textoDaSequencia } from './sequenciaDaPessoa' 

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
const CHAVE_IDS_SEQUENCIA = 'lembretes.ids.sequencia'
const CHAVE_SEQUENCIA = 'lembretes.sequencia'

/* Os três tipos que o app agenda. O tipo viaja dentro de `data` da notificação
   e é o que permite cancelar um sem calar os outros — ver `cancelarDoTipo`. */
type TipoDeLembrete = 'refeicao' | 'agua' | 'sequencia'

/* A que horas o lembrete da sequência toca.
 *
 * Vinte horas. É tarde o bastante para o dia ter acontecido — quem ia registrar
 * o almoço já registrou — e cedo o bastante para ainda dar tempo de fazer
 * alguma coisa. Um aviso às 23h chega quando a pessoa não tem mais o que fazer
 * com ele, e aí só resta a culpa. */
const HORA_DA_SEQUENCIA = 20

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

/* O par de `lerIds`. Existe para o agendamento da sequência não repetir o
   `JSON.stringify` solto que os outros dois fazem — e para falhar em silêncio
   do mesmo jeito: sem armazenamento, o cancelamento pelo SISTEMA ainda funciona
   (é ele que `cancelarDoTipo` consulta), então perder a lista não deixa aviso
   preso para sempre. */
async function guardarIds(chave: string, ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(chave, JSON.stringify(ids))
  } catch {
    /* Ver acima: o sistema continua sabendo, pela marca em `data.tipo`. */
  }
}

/* Cancela só o que este tipo agendou, e esquece os identificadores.
 *
 * Falhar em cancelar um não impede os outros: o que sobra é um aviso a mais,
 * e parar no meio deixaria a lista inteira pendurada. */
async function cancelarDoTipo(chave: string, tipo?: TipoDeLembrete): Promise<void> {
  const Notifications = await notificacoes()

  /* Os identificadores guardados MAIS o que o sistema tiver com esta marca.
   *
   * A lista guardada some quando o armazenamento é apagado, e aí desligar não
   * desligava nada: o interruptor virava "off" e o aparelho continuava
   * avisando, sem nada no app capaz de parar. Perguntar ao sistema fecha esse
   * buraco, e os dois caminhos juntos cobrem também os avisos agendados por
   * versões antigas, que não tinham marca. */
  const doSistema: string[] = []
  if (tipo) {
    try {
      const agendados = await Notifications.getAllScheduledNotificationsAsync()
      for (const a of agendados) {
        if ((a.content?.data as { tipo?: string } | undefined)?.tipo === tipo) {
          doSistema.push(a.identifier)
        }
      }
    } catch {
      /* Sem a lista do sistema, sobra a guardada — que é o que havia antes. */
    }
  }

  for (const id of [...new Set([...(await lerIds(chave)), ...doSistema])]) {
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

/* Limpa uma vez o que ficou órfão. Ver CHAVE_FAXINA.
 *
 * ── Ela roda de novo quando o armazenamento é apagado, e isso é o certo ────
 * No Expo Go tudo que o app guarda vive dentro dos dados do PRÓPRIO Expo Go:
 * quando ele se atualiza, ou o Android limpa os dados dele, some a sessão e
 * somem as preferências — inclusive a lista de quais avisos este app agendou.
 *
 * Os avisos, porém, NÃO somem: eles vivem no sistema Android. Sem a lista, o
 * `cancelarDoTipo` não tem o que cancelar e os antigos continuam agendados,
 * agora invisíveis para o app. A marca da faxina mora no mesmo armazenamento
 * que foi apagado, então ela some junto e a limpeza roda de novo — que é
 * exatamente o que precisa acontecer.
 *
 * ── E apaga também o que já foi ENTREGUE ──────────────────────────────────
 * Cancelar agendamento não tira da gaveta de notificações o aviso que já caiu
 * lá. Depois de perder o armazenamento, a pessoa remarcava os lembretes e via
 * ressurgir um aviso velho — que ela leu como o app repetindo coisa antiga, e
 * não como resíduo. `dismissAll` só alcança as notificações deste app. */
async function faxinaUnica(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(CHAVE_FAXINA)) === '1') return
    const Notifications = await notificacoes()
    await Notifications.cancelAllScheduledNotificationsAsync()
    await Notifications.dismissAllNotificationsAsync()
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

/* O interruptor está ligado?
 *
 * ── Por que a resposta não pode sair só do armazenamento ───────────────────
 * No Expo Go, tudo que o app guarda vive dentro dos dados do PRÓPRIO Expo Go.
 * Quando ele se atualiza — ou o Android limpa os dados dele — some a sessão e
 * somem as preferências. Os avisos agendados NÃO somem: eles vivem no sistema
 * Android.
 *
 * O resultado, relatado por quem usa: o celular atualizou, o app deslogou, e os
 * dois interruptores apareceram DESMARCADOS — sobre lembretes que continuavam
 * agendados e tocando. A tela mentia e mandava remarcar o que já estava lá.
 *
 * Então a preferência guardada vira ATALHO, e não verdade. Um "1" é aceito de
 * cara porque é barato. Qualquer outra coisa — "0", ou nada, que é o caso de
 * quem perdeu o armazenamento — é conferida contra o sistema, que sabe o que
 * está agendado de verdade.
 *
 * O "0" também é conferido de propósito: desligar grava "0" e cancela, mas se o
 * cancelamento falhar no meio, o armazenamento diz desligado e o aparelho
 * continua avisando. Conferir corrige os dois sentidos.
 *
 * O custo é carregar o expo-notifications, e por isso ele só é pago quando a
 * resposta rápida diz "não" — que é raro depois do primeiro uso. */
async function ligadoDeVerdade(chave: string, tipo: TipoDeLembrete): Promise<boolean> {
  let guardado: string | null = null
  try {
    guardado = await AsyncStorage.getItem(chave)
  } catch {
    /* Sem armazenamento, só resta perguntar ao sistema — que é o que vem
       abaixo. */
  }
  if (guardado === '1') return true

  try {
    const Notifications = await notificacoes()
    const agendados = await Notifications.getAllScheduledNotificationsAsync()
    const tem = agendados.some(a => (a.content?.data as { tipo?: string } | undefined)?.tipo === tipo)

    /* Reescreve o atalho, para a próxima abertura não pagar de novo. */
    if (tem) {
      try {
        await AsyncStorage.setItem(chave, '1')
      } catch {
        /* Sem armazenamento continua funcionando, só mais devagar. */
      }
    }
    return tem
  } catch {
    /* Módulo indisponível: fica com o que o armazenamento disse. */
    return guardado === '1'
  }
}

export const lembretesLigados = () => ligadoDeVerdade(CHAVE_LIGADO, 'refeicao')
export const lembretesDeAguaLigados = () => ligadoDeVerdade(CHAVE_AGUA, 'agua')

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

    await cancelarDoTipo(CHAVE_IDS_REFEICOES, 'refeicao')

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
          /* Marcado com o tipo, igual ao da água. É o que permite reconhecer os
             avisos deste app olhando o SISTEMA, sem depender de uma lista de
             identificadores guardada no aparelho — que é justamente o que se
             perde. Ver `ligadoDeVerdade`. */
          data: { tipo: 'refeicao' },
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
  await cancelarDoTipo(CHAVE_IDS_REFEICOES, 'refeicao')
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

    await cancelarDoTipo(CHAVE_IDS_AGUA, 'agua')

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
  await cancelarDoTipo(CHAVE_IDS_AGUA, 'agua')
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

/* Confirma na tela do celular que o copo entrou.
 *
 * ── Por que é preciso, e por que é uma notificação ────────────────────────
 * O botão "Registrei" grava sem abrir o app. Isso é o valor dele — e é também o
 * problema: a pessoa toca, o aviso some, e nada diz se funcionou. Ela abre o app
 * para conferir, que é exatamente o que o botão existia para evitar.
 *
 * Foi levantado que confirmar transformaria um toque em DUAS notificações. Por
 * isso esta some sozinha em segundos e entra num canal de importância mínima —
 * sem som, sem vibrar, sem saltar na tela. Ela aparece na gaveta, é lida de
 * relance, e vai embora.
 *
 * ── Ela diz o TOTAL, não só "ok" ──────────────────────────────────────────
 * "Copo registrado" confirma o toque. "3º copo de hoje · 990 ml" confirma o
 * toque E responde a pergunta seguinte, que é a que faria a pessoa abrir o app.
 * Uma notificação que evita uma abertura paga o próprio incômodo. */
export async function confirmarCopo(ml: number, totalDoDia: number, copoDoDia: number): Promise<void> {
  try {
    const Notifications = await notificacoes()

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('agua-confirma', {
        name: 'Confirmações de água',
        /* MIN, e não DEFAULT como a do lembrete: aquela precisa interromper,
           esta precisa apenas existir. Som ou vibração aqui seria cobrar
           atenção por uma coisa que a pessoa acabou de fazer. */
        importance: Notifications.AndroidImportance.MIN,
      })
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${copoDoDia}º copo de hoje`,
        body: `${ml} ml registrados. ${totalDoDia} ml no dia.`,
        ...(Platform.OS === 'android' ? { autoDismiss: true } : {}),
      },
      /* Imediata. `null` dispara na hora. */
      trigger: null,
    })
  } catch {
    /* Falhar em confirmar não desfaz o copo, que já está gravado. Ficar sem a
       confirmação é o comportamento de antes — chato, e não errado. */
  }
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
 * A leitura do objeto cru mora em lib/copoDoAviso.ts, que não importa nada de
 * runtime e tem os casos de mesa: é dado montado pelo Android e pelo iOS, sem
 * tipo e sem garantia, e um `as` otimista ali registra o copo errado calado. */
export function ouvirBotaoDeAgua(
  aoRegistrar: (ml: number, quando: Date) => void,
): () => void {
  let vivo = true

  const atender = async (resposta: unknown) => {
    if (!vivo) return

    /* Quem lê o objeto cru é `copoDoAviso`, que não importa nada de runtime e
       tem os casos de mesa. Aqui sobra o que precisa do aparelho: o guarda de
       repetição, porque o mesmo toque chega pelos dois caminhos — o ouvinte e a
       consulta de abertura — e dois copos por um toque é pior do que nenhum. */
    const copo = copoDoAviso(resposta, new Date())
    if (!copo) return

    /* Chave nula quer dizer "não dá para saber se é repetido", e aí registra
       assim mesmo. O aviso é DIÁRIO e reusa o identificador; sem a data da
       entrega, conferir repetição faria o botão morrer calado do segundo dia em
       diante. Um copo a mais aparece na lista do dia e some com um toque — um
       botão morto não avisa ninguém. */
    if (copo.chave) {
      try {
        if ((await AsyncStorage.getItem(CHAVE_ULTIMO_COPO)) === copo.chave) return
        await AsyncStorage.setItem(CHAVE_ULTIMO_COPO, copo.chave)
      } catch {
        /* Sem armazenamento, o risco vira registrar duas vezes em vez de
           nenhuma. Segue: um copo a mais é corrigível na tela da água com um
           toque, e nenhum copo não é corrigível porque ninguém sabe que faltou. */
      }
    }

    aoRegistrar(copo.ml, copo.quando)
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

/* ── O lembrete da sequência ───────────────────────────────────────────────
 *
 * ── O problema que ele resolve, e por que os outros dois não resolvem ─────
 * Os lembretes de refeição e de água tocam por HORÁRIO: 12:30 é 12:30 tenha
 * ela almoçado ou não. Isso serve para "está na hora", e não serve para "o seu
 * dia vai fechar vazio" — que é a hora em que um empurrão vale alguma coisa.
 *
 * A medida diz que aviso na hora em que dá para AGIR abre muito mais do que
 * aviso genérico. Às 20h, quem não registrou nada ainda tem a noite; e quem já
 * registrou não precisa ouvir nada.
 *
 * ── A dificuldade de verdade ──────────────────────────────────────────────
 * Notificação local é agendada com antecedência e NÃO SABE, na hora de tocar,
 * o que aconteceu no dia. Um `DAILY` às 20h tocaria também nos dias em que ela
 * já registrou — e é exatamente assim que lembrete vira chateação e a pessoa
 * desliga tudo, inclusive o que servia.
 *
 * A saída é não usar `DAILY`: agenda-se UM aviso por vez, para a próxima noite
 * em que ele pode importar, e ele é reagendado toda vez que o app abre ou que
 * ela registra alguma coisa. Registrou? O da noite é cancelado na hora.
 *
 * ── E o texto não pode mentir se ele escapar ──────────────────────────────
 * Se ela registrar e não abrir mais o app, o aviso da noite ainda toca. Por
 * isso o texto NUNCA afirma "você não registrou hoje": fala do número que ela
 * tem, que é verdade nos dois casos. Um app que acusa errado perde a próxima
 * dez vezes que estiver certo.
 *
 * ── Quem não tem sequência não é lembrado ─────────────────────────────────
 * Com zero dias, nada é agendado. Não há o que proteger, e cutucar quem ainda
 * não começou é o começo de virar o app que a pessoa silencia. */

export const lembreteDaSequenciaLigado = () => ligadoDeVerdade(CHAVE_SEQUENCIA, 'sequencia')

/* Agenda (ou reagenda) o único aviso da sequência.
 *
 * Chamada em toda abertura da tela inicial e a cada registro. É barata: cancela
 * o que havia e agenda no máximo um. */
export async function reagendarSequencia(
  dias: number,
  hojeFeito: boolean,
  agora = new Date(),
): Promise<void> {
  if (!(await lembreteDaSequenciaLigado())) return

  const Notifications = await notificacoes()
  await cancelarDoTipo(CHAVE_IDS_SEQUENCIA, 'sequencia')

  /* Sem sequência não há o que proteger. E se ela já registrou hoje, o aviso de
     hoje deixa de existir: o de amanhã será agendado quando ela abrir o app
     amanhã, ou pelo próprio registro de amanhã. */
  if (dias <= 0 || hojeFeito) {
    await guardarIds(CHAVE_IDS_SEQUENCIA, [])
    return
  }

  /* Já passou das 20h: não adianta agendar para hoje — o gatilho de data no
     passado dispara na hora, e um aviso que chega no mesmo instante em que a
     pessoa fecha o app é ruído. */
  const alvo = new Date(agora)
  alvo.setHours(HORA_DA_SEQUENCIA, 0, 0, 0)
  if (alvo.getTime() <= agora.getTime()) {
    await guardarIds(CHAVE_IDS_SEQUENCIA, [])
    return
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sequencia', {
        name: 'Sequência',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    const { title, body } = textoDaSequencia(dias)
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { tipo: 'sequencia' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alvo,
        channelId: 'sequencia',
      },
    })
    await guardarIds(CHAVE_IDS_SEQUENCIA, [id])
  } catch (e) {
    /* Falhar em agendar não pode derrubar a tela inicial: o console fica com o
       motivo e a pessoa continua usando o app sem o lembrete. */
    falha('Não consegui agendar o lembrete da sequência.', e)
  }
}

export async function ligarLembreteDaSequencia(): Promise<ResultadoLembretes> {
  const Notifications = await notificacoes()
  if (!(await temPermissao())) return { tipo: 'negado' }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sequencia', {
        name: 'Sequência',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }
    await AsyncStorage.setItem(CHAVE_SEQUENCIA, '1')
    /* O agendamento em si acontece na próxima abertura da tela inicial, que é
       quem sabe o número de dias. Ligar aqui só abre a porta. */
    return { tipo: 'ok', quantos: 1, proximo: `${HORA_DA_SEQUENCIA}:00` }
  } catch (e) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui ligar o lembrete da sequência.', e),
    }
  }
}

export async function desligarLembreteDaSequencia(): Promise<void> {
  await cancelarDoTipo(CHAVE_IDS_SEQUENCIA, 'sequencia')
  try {
    await AsyncStorage.setItem(CHAVE_SEQUENCIA, '0')
  } catch {
    /* Sem armazenamento, o cancelamento acima já tirou o que estava agendado. */
  }
}
