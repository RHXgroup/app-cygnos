import { supabase } from './supabase'
import { falha } from './erros'

/* Perguntar à Aurora, do lado dela.
 *
 * ──────────────────── O que NÃO vai no corpo ────────────────────
 * Nenhum id. Nem o dela, nem de paciente, nem de consulta. A função monta o
 * contexto no servidor, lendo com o token de quem chamou, e é a RLS que
 * recorta. Mandar um id daqui transformaria a função em algo que responde
 * sobre a agenda de qualquer uma para quem mandasse outro número. */

export type Papel = 'nutri' | 'aurora'

/* O que a Aurora QUER fazer, esperando o sim dela.
 *
 * ──────────────────── Por que a ação volta pelo aparelho ────────────────────
 * Guardar o estado da conversa no servidor exigiria uma tabela com prazo de
 * validade e faxina, para uma coisa que é estado de tela. E o risco de ela
 * mexer nos argumentos no caminho é nulo pelo que importa: as funções rodam
 * COMO ELA, e a RLS recorta igual. Trocar um id ali só permitiria fazer o que
 * ela já pode fazer pelo site. */
export type AcaoPendente = {
  ferramenta: string
  argumentos: Record<string, unknown>
  /* O que o cartão mostra, escrito pelo servidor. Vem de lá, e não daqui, para
     não haver duas descrições da mesma ação divergindo no dia em que uma delas
     mudar. */
  resumo: string
}

export type Fala = {
  /* Chave da lista. `Date.now()` colide quando duas falas nascem no mesmo
     milissegundo -- e nascem, porque a resposta chega e a pergunta some do
     campo no mesmo instante. Contador simples resolve e não depende de nada. */
  id: number
  papel: Papel
  texto: string
  /* Quando existe, esta fala é um cartão de confirmação, e não um balão. */
  acao?: AcaoPendente
  /* Fala escrita pelo APLICATIVO, que NÃO vai no histórico para o servidor.
   *
   * Existe por causa de um nome: quando a Aurora abre de dentro da ficha, a
   * primeira fala é "Sobre Maria Alves. O que você quer saber?" -- e essa frase
   * viraria histórico na pergunta seguinte, mandando à IA exatamente o nome que
   * o recorte do DPA 1.7 mantém aqui dentro. O paciente viaja como `#412`; o
   * nome fica no aparelho.
   *
   * Vale também para a resposta do menu, que é texto nosso e não ensina nada ao
   * modelo. */
  local?: boolean
  /* Esta fala é uma FALHA, e a pergunta que a produziu está em `pergunta`.
     Guardar as duas coisas é o que permite oferecer "tentar de novo" sem ela
     redigitar -- e sem sinal no consultório isso acontece o tempo todo. */
  falhou?: boolean
  pergunta?: string
  /* O que ela decidiu. Enquanto for `undefined`, os botões aparecem. Guardado
     na própria fala, e não num estado à parte, para o histórico continuar
     legível depois: rolar para cima e ver "Confirmado" é o que responde
     "eu marquei mesmo aquela consulta?". */
  decidida?: 'feita' | 'cancelada'
}

let proximoId = 1
export const novaFala = (papel: Papel, texto: string): Fala => ({
  id: proximoId++,
  papel,
  texto,
})

export type RespostaDaAurora =
  | { tipo: 'ok'; texto: string }
  | { tipo: 'confirmar'; texto: string | null; acao: AcaoPendente }
  | { tipo: 'erro'; mensagem: string }

/* "Não posso NUNCA" não é "não posso AGORA".
 *
 * A conta em teste grátis recebe 403 com `{ error: <frase>, aurora_no_teste:
 * true }` -- e o `error` ali NÃO é um código como `forbidden`: é uma frase em
 * português escrita para a pessoa ler. Sem tratar, ela caía na última linha
 * daqui e a nutri em teste lia "verifique a conexão" para um problema que a
 * conexão dela não tem, e tentava de novo a tarde inteira.
 *
 * Quem manda é a FLAG, e não a frase: o próprio servidor diz que as flags são
 * contrato e que a redação vai mudar. E a frase é repassada porque é o caso do
 * item 12 do AGENTS em que repassar é melhor do que traduzir -- quem sabe por
 * que recusou é quem recusou, e ela já vem em português, sem jargão, dizendo o
 * que fazer ("Assine para liberar"). */
function recusaDoTesteGratis(
  resposta: { error?: string; aurora_no_teste?: boolean } | null,
): string | null {
  if (!resposta?.aurora_no_teste) return null
  return resposta.error?.trim() || 'A Aurora não está incluída no teste grátis.'
}

export async function perguntarAAurora(
  pergunta: string,
  /* As falas anteriores, para "e a de depois?" fazer sentido. A função corta no
     tamanho e na quantidade do lado de lá -- campo sem teto é custo sem teto. */
  historico: Fala[],
): Promise<RespostaDaAurora> {
  const { data, error } = await supabase.functions.invoke('app-aurora-nutri', {
    body: {
      pergunta,
      /* As falas LOCAIS ficam de fora: são escritas pelo aplicativo, e uma
         delas carrega o nome do paciente, que não sai daqui. Ver `local`. */
      historico: historico.filter(f => !f.local).map(f => ({ papel: f.papel, texto: f.texto })),
    },
  })

  /* `invoke` deixa `data` nulo fora do 2xx e joga o corpo em `error.context`.
     Aqui os desfechos não mudam a tela -- todos viram uma frase --, mas ler o
     corpo é o que distingue "a IA está fora" de "a rede caiu", e as duas
     merecem conselhos diferentes. */
  let resposta = data as {
    resposta?: string | null
    error?: string
    /* A flag do teste grátis. Ver `recusaDoTesteGratis`. */
    aurora_no_teste?: boolean
    acao?: { ferramenta?: string; argumentos?: Record<string, unknown>; resumo?: string }
  } | null
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        resposta = await ctx.json()
      } catch {
        resposta = null
      }
    }
    falha('A Aurora não respondeu.', error)
  }

  /* A ação vem ANTES do texto na ordem de leitura, e não depois: quando as duas
     vêm juntas, o texto é a pergunta do modelo ("confirma para quinta?") e o
     cartão é a resposta. Tratar o texto primeiro esconderia o cartão. */
  if (resposta?.acao?.ferramenta) {
    return {
      tipo: 'confirmar',
      texto: resposta.resposta?.trim() || null,
      acao: {
        ferramenta: resposta.acao.ferramenta,
        argumentos: resposta.acao.argumentos ?? {},
        resumo: resposta.acao.resumo ?? 'Confirmar esta ação?',
      },
    }
  }

  if (resposta?.resposta?.trim()) return { tipo: 'ok', texto: resposta.resposta.trim() }

  const emTeste = recusaDoTesteGratis(resposta)
  if (emTeste) return { tipo: 'erro', mensagem: emTeste }

  if (resposta?.error === 'forbidden') {
    return { tipo: 'erro', mensagem: 'Esta conta não tem acesso à Aurora do consultório.' }
  }
  if (resposta?.error === 'ia_indisponivel') {
    return { tipo: 'erro', mensagem: 'A Aurora está fora do ar agora. Tente daqui a pouco.' }
  }
  return { tipo: 'erro', mensagem: 'Não consegui falar com a Aurora. Verifique a conexão.' }
}

/* Ela confirmou. Agora sim executa.
 *
 * ──────────────────── E o texto do "pronto" vem do SERVIDOR ────────────────────
 * Não há segunda ida ao modelo. É mais barato, mas o motivo é outro: um modelo
 * pedido para narrar o que aconteceu pode escrever "agendei para quinta"
 * quando a função recusou por choque de horário. Quem gravou é quem conta -- e
 * é por isso que a recusa chega com o nome de quem já está naquele horário. */
export async function confirmarAcao(acao: AcaoPendente): Promise<RespostaDaAurora> {
  const { data, error } = await supabase.functions.invoke('app-aurora-nutri', {
    body: { confirmar: { ferramenta: acao.ferramenta, argumentos: acao.argumentos } },
  })

  let resposta = data as { resposta?: string; error?: string; aurora_no_teste?: boolean } | null
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        resposta = await ctx.json()
      } catch {
        resposta = null
      }
    }
    falha('A Aurora não conseguiu executar.', error)
  }

  if (resposta?.resposta?.trim()) return { tipo: 'ok', texto: resposta.resposta.trim() }

  /* A recusa do teste grátis também acontece AQUI, e não só na pergunta: a
     trava do servidor vale para as duas chamadas. Vai com a frase de que nada
     foi gravado colada, porque ela acabou de tocar em Confirmar -- saber que
     precisa assinar não responde "e a consulta, entrou ou não?". */
  const emTeste = recusaDoTesteGratis(resposta)
  if (emTeste) return { tipo: 'erro', mensagem: emTeste + ' Nada foi gravado.' }

  /* Falha DEPOIS do sim dela é o pior momento possível para uma frase vaga: ela
     acabou de aprovar e precisa saber se aconteceu ou não. A frase diz que NÃO
     aconteceu, porque é o que a ausência de resposta significa -- a função só
     devolve texto depois de a RPC responder. */
  return {
    tipo: 'erro',
    mensagem: 'Não consegui completar. Nada foi gravado -- confira e tente de novo.',
  }
}

/* Os exemplos e os textos de abertura moram em `menuDaAurora.ts`, e não aqui:
   este arquivo importa o Supabase, e nada que o importe roda no Node. Lá são
   texto e decisão puros, e por isso têm teste. */

/* ──────────────────── A CONVERSA SOBREVIVE A FECHAR A TELA ────────────────────
 *
 * A tela da Aurora é montada e desmontada a cada abertura (`AreaDaNutri` a
 * renderiza por condição), então o `useState` das falas nascia vazio toda vez.
 * Na prática: ela perguntava alguma coisa, saía para conferir a agenda, voltava
 * -- e a conversa tinha sumido. Recomeçar do zero por ter olhado outra tela é
 * exatamente o que faz alguém achar que a assistente não presta atenção.
 *
 * ── Por que uma variável de módulo, e não contexto nem armazenamento ──────
 * CONTEXTO obrigaria a mexer na tela que hospeda as abas, que é de outra
 * sessão, e prop-drilling para um estado que só uma tela usa.
 *
 * ARMAZENAMENTO (AsyncStorage) faria a conversa sobreviver a fechar o APP -- e
 * aí o que fica gravado, sem cifra, no aparelho, é nome de paciente com dado
 * clínico ao lado. Não é o mesmo problema de guardar em memória: é o problema
 * de guardar. Enquanto ninguém decidir isso com o cuidado que a decisão pede,
 * a conversa morre quando o app morre.
 *
 * A variável de módulo dá exatamente o tempo de vida certo: dura a sessão do
 * app, some com ela, e não escreve em lugar nenhum. */
let conversaGuardada: Fala[] = []

/* De quem é a conversa que está guardada, quando ela nasceu de dentro de uma
   ficha. Sem isto, abrir a ficha da Maria e depois a do João continuaria a
   conversa da Maria com o João no título -- e a pergunta seguinte iria com o
   número errado, que é o pior desfecho possível: resposta certa sobre a pessoa
   errada. */
let pacienteDaConversa: number | null = null

export const conversaAnterior = (): Fala[] => conversaGuardada
export const dequemEAConversa = (): number | null => pacienteDaConversa

export const guardarConversa = (falas: Fala[], paciente?: number | null): void => {
  conversaGuardada = falas
  if (paciente !== undefined) pacienteDaConversa = paciente
}

export const esquecerConversa = (): void => {
  conversaGuardada = []
  pacienteDaConversa = null
}
