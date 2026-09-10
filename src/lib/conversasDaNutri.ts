import { Platform } from 'react-native'
import { supabase } from './supabase'
import { falha, mensagemDoBanco } from './erros'
import { notificacoes } from './lembretes'

/* As conversas com os pacientes, do lado dela.
 *
 * ──────────────────── Nenhuma função nova no banco, e isso não é sorte ────────────────────
 * `nutri_conversas`, `nutri_marcar_lidas` e `nutri_enviar_mensagem` já existem
 * desde 31/08, escritas para a caixa de mensagens do site. São `security
 * definer`, enxergam pela CARTEIRA (`get_nutricionista_id()`) e não pelo login,
 * conferem `func_pode('{pacientes,acessar}')`, e estão concedidas a
 * `authenticated` -- que é o que a sessão dela no app é.
 *
 * Eu comecei escrevendo uma agregação à mão aqui: baixar as últimas 400
 * mensagens, agrupar por conta, contar as não lidas, buscar os nomes numa
 * segunda leitura. Funcionava, e estava errado -- é a armadilha 5 pelo lado do
 * assunto em vez do lado do nome. Duas somas do mesmo número divergem, e a que
 * divergiria era esta: o site conta por carteira e eu contaria por RLS, o site
 * traz vínculo sem mensagem nenhuma e eu não traria.
 *
 * ──────────────────── O que a lista tem e a do site não ────────────────────
 * O aviso. No computador ela está OLHANDO a tela; no celular, não -- e o pedido
 * dele é exatamente esse: "se ela não tiver no computador o paciente mandar uma
 * mensagem, notifica ela aqui".
 *
 * ──────────────────── E até onde o aviso vai, sem promessa ────────────────────
 * Enquanto o app estiver ABERTO. A inscrição de tempo real é um websocket que
 * vive no processo do app; com o app fechado não há processo, e não há aviso.
 * Chegar com o app fechado é PUSH, e push exige development build (o Expo Go não
 * recebe push no Android desde o SDK 53) mais um serviço para disparar.
 *
 * Então: mensagem que chega com ela no app -- em qualquer aba -- toca e aparece
 * o balão. Mensagem que chegou com o app fechado aparece como não lida quando
 * ela abre. É o que dá para entregar hoje, e dizer isso é melhor do que ela
 * descobrir sozinha num dia em que importava. */

export type ConversaDaNutri = {
  contaId: string
  nome: string
  ultima: string | null
  ultimaDe: string | null
  ultimaEm: string | null
  naoLidas: number
  ultimaAnexoTipo: string | null
}

export type ResultadoDasConversas =
  | { tipo: 'ok'; conversas: ConversaDaNutri[] }
  | { tipo: 'erro'; mensagem: string }

type LinhaDeConversa = {
  conta_id: string
  nome: string | null
  ultima: string | null
  ultima_de: string | null
  ultima_em: string | null
  nao_lidas: number | string | null
  ultima_anexo_tipo?: string | null
}

/**
 * Todo mundo com quem ela tem vínculo, ordenado pela última mensagem.
 *
 * Inclusive quem nunca trocou uma palavra: é o que permite ela COMEÇAR a
 * conversa, e é por isso que a função do banco parte de `app_vinculos` e não de
 * `app_mensagens`. Esses chegam com tudo nulo, e a tela mostra o convite.
 */
export async function conversasDaNutri(): Promise<ResultadoDasConversas> {
  const { data, error } = await supabase.rpc('nutri_conversas')

  if (error) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar as conversas agora.', error),
    }
  }

  return {
    tipo: 'ok',
    conversas: ((data ?? []) as LinhaDeConversa[]).map(l => ({
      contaId: String(l.conta_id),
      /* Nome vazio ainda abre a conversa. Uma conta sem nome preenchido é
         estranha, não é impossível -- e esconder a linha esconderia a mensagem
         junto. */
      nome: (l.nome ?? '').trim() || 'Paciente sem nome',
      ultima: l.ultima,
      ultimaDe: l.ultima_de,
      ultimaEm: l.ultima_em,
      /* `count(*)` volta como bigint, e o PostgREST manda bigint como STRING
         quando ele passa dos 2^53 -- e como número abaixo disso. `Number` cobre
         os dois; sem ele, `naoLidas > 0` sobre a string "0" daria verdadeiro e
         o ponto vermelho ficaria aceso em toda conversa. */
      naoLidas: Number(l.nao_lidas ?? 0) || 0,
      ultimaAnexoTipo: l.ultima_anexo_tipo ?? null,
    })),
  }
}

/** Quantas mensagens de pacientes estão esperando resposta, somando tudo. */
export function totalNaoLidas(conversas: ConversaDaNutri[]): number {
  return conversas.reduce((s, c) => s + c.naoLidas, 0)
}

/* ──────────────────── UMA CONVERSA ──────────────────── */

export type MensagemDaConversa = {
  id: number
  de: string
  texto: string
  criadaEm: string
  /* O CAMINHO no balde privado, e não o endereço: endereço assinado vence em
     uma hora, e guardá-lo aqui faria o anexo quebrar depois do almoço numa tela
     que fica aberta. Armadilha 7. */
  anexoPath: string | null
  anexoTipo: string | null
}

export type ResultadoDaConversa =
  | { tipo: 'ok'; mensagens: MensagemDaConversa[] }
  | { tipo: 'erro'; mensagem: string }

type LinhaDeMensagem = {
  id: number
  de: string
  texto: string | null
  criada_em: string
  anexo_path: string | null
  anexo_tipo: string | null
}

const daLinha = (l: LinhaDeMensagem): MensagemDaConversa => ({
  id: Number(l.id),
  /* Texto cru, sem virar união de dois valores: quem decide de quem é a
     mensagem é o banco, e um valor novo na coluna não pode derrubar a tela em
     que alguém está esperando resposta de gente. Armadilha 10. */
  de: String(l.de ?? ''),
  texto: l.texto ?? '',
  criadaEm: String(l.criada_em ?? ''),
  anexoPath: l.anexo_path ?? null,
  anexoTipo: l.anexo_tipo ?? null,
})

/**
 * A conversa inteira, da mais antiga para a mais nova.
 *
 * Leitura DIRETA na tabela, e não por função: é a mesma escolha do lado do
 * paciente e do lado do site, e o motivo é a política -- "nutri le as conversas
 * dela" já recorta por carteira e por `func_pode`, então a função só
 * acrescentaria uma segunda cópia da mesma regra.
 */
export async function conversaCom(contaId: string): Promise<ResultadoDaConversa> {
  const { data, error } = await supabase
    .from('app_mensagens')
    .select('id, de, texto, criada_em, anexo_path, anexo_tipo')
    .eq('conta_id', contaId)
    .order('criada_em', { ascending: true })

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir a conversa agora.', error) }
  }
  return { tipo: 'ok', mensagens: ((data ?? []) as LinhaDeMensagem[]).map(daLinha) }
}

export type ResultadoDoEnvio = { tipo: 'ok' } | { tipo: 'erro'; mensagem: string }

/**
 * Responde. Quem decide que a mensagem é DELA é o banco.
 *
 * `de` não viaja daqui, e nem o `nutricionista_id`: se viajassem, a tela
 * escolheria em nome de quem a linha nasce. A função confere o vínculo, confere
 * a permissão, e escreve `'nutricionista'` de dentro.
 */
export async function responder(contaId: string, texto: string): Promise<ResultadoDoEnvio> {
  const { error } = await supabase.rpc('nutri_enviar_mensagem', {
    p_conta_id: contaId,
    p_texto: texto,
  })

  if (error) {
    return {
      tipo: 'erro',
      /* A frase do banco quando ela foi escrita para gente ler -- "Este paciente
         não está vinculado a você", "Você não tem permissão para conversar com
         pacientes" -- e a nossa quando o que voltou foi "Network request
         failed". `mensagemDoBanco` decide pela CARA do texto. Armadilha 12. */
      mensagem: mensagemDoBanco(error, 'Não consegui enviar agora. Verifique a conexão.'),
    }
  }
  return { tipo: 'ok' }
}

/** Marca como lidas as que o paciente mandou. Melhor esforço, em silêncio. */
export async function marcarLidas(contaId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('nutri_marcar_lidas', { p_conta_id: contaId })
    /* Falhar em marcar não impede de LER, e um aviso vermelho por causa disso
       interromperia a conversa por um detalhe de contabilidade. O ponto some na
       próxima abertura. */
    if (error) falha('Não consegui marcar a conversa como lida.', error)
  } catch (e) {
    falha('Não consegui marcar a conversa como lida.', e)
  }
}

/* ──────────────────── O TEMPO REAL, E O AVISO ──────────────────── */

export type MensagemQueChegou = MensagemDaConversa & { contaId: string }

/**
 * Avisa quando um PACIENTE escreve, sem a tela precisar perguntar.
 *
 * Devolve a função de desligar. Chamá-la no desmonte não é zelo: uma inscrição
 * que sobrevive à tela continua recebendo e mirando um componente que já não
 * existe -- e, pior, uma segunda montagem reusaria o canal pelo nome e o
 * Supabase recusa com "cannot add postgres_changes after subscribe()". Isso
 * aconteceu do lado do site e derrubou a tela inteira.
 *
 * Sem `filter`: a política já recorta as linhas dela, e o realtime do Supabase
 * entrega o que a política deixa ler. Filtrar por `nutricionista_id` exigiria a
 * carteira aqui -- uma ida ao banco a mais, antes de poder ouvir -- e ela é
 * justamente o que a recepcionista NÃO tem no `auth.uid()`.
 */
export function ouvirConversas(aoChegar: (m: MensagemQueChegou) => void): () => void {
  const canal = supabase
    .channel('conversas_da_nutri')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'app_mensagens' },
      carga => {
        const l = carga.new as LinhaDeMensagem & { conta_id: string }
        /* Só o que o paciente escreve. O que ela mesma manda já entra na tela
           pelo envio, e reagir ao próprio insert faria a mensagem aparecer
           duas vezes -- e o aviso tocar para a própria resposta dela. */
        if (!l || l.de !== 'paciente') return
        aoChegar({ ...daLinha(l), contaId: String(l.conta_id) })
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(canal)
  }
}

/**
 * O balão no alto da tela quando chega mensagem com o app aberto.
 *
 * Notificação local disparada na hora (`trigger: null`), e não push: ver o
 * cabeçalho. O handler de primeiro plano que `lembretes.ts` instala é o que faz
 * ela aparecer com o app na frente -- sem ele, o sistema engole a notificação
 * de um app que já está aberto, e o aviso só existiria para quem estivesse em
 * outra aba do celular.
 *
 * Nunca rejeita, e nunca pede permissão. Pedir aqui seria pedir no meio de uma
 * conversa, sem a pessoa ter pedido nada -- e é assim que se ganha um "não" que
 * depois ninguém sabe desfazer. A permissão que já existe (dos avisos dela)
 * vale; sem ela, o contador na tela continua funcionando e só o balão não vem.
 */
export async function avisarQueChegou(nome: string, previa: string): Promise<void> {
  try {
    const N = await notificacoes()

    /* `atual?.granted`, e não `atual.granted`: no Expo Go o embrulho de
       `lembretes.ts` devolve `undefined` para o que o módulo não tiver, e ler
       `.granted` de `undefined` levantaria erro a CADA mensagem que chegasse —
       uma linha vermelha por mensagem, por um balão que nem ia aparecer. */
    const atual = await N.getPermissionsAsync()
    if (!atual?.granted) return

    /* Canal próprio. No Android a pessoa desliga POR CANAL nas configurações do
       sistema, e dividir o canal com "Meus avisos" faria desligar um calar o
       outro sem nada na nossa tela explicando. Mesma decisão de
       `avisosDaNutri.ts`. */
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('mensagens-nutri', {
        name: 'Mensagens de pacientes',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      })
    }

    await N.scheduleNotificationAsync({
      content: {
        title: nome,
        /* A prévia, e não "Você recebeu uma mensagem". Metade das mensagens se
           resolve na tela de bloqueio -- "cheguei" não precisa de resposta. */
        body: previa || 'Mandou uma mensagem',
        data: { tipo: 'conversa-nutri' },
      },
      /* Agora. `null` é o gatilho imediato. */
      trigger: null,
    })
  } catch (e) {
    /* Engole. Função de apoio de UI não rejeita: uma rejeição sem dono aqui
       derrubaria a área inteira por causa de um balão que não apareceu.
       Armadilha 11. */
    falha('Não consegui avisar da mensagem nova.', e)
  }
}
