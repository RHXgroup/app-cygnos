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

export async function perguntarAAurora(
  pergunta: string,
  /* As falas anteriores, para "e a de depois?" fazer sentido. A função corta no
     tamanho e na quantidade do lado de lá -- campo sem teto é custo sem teto. */
  historico: Fala[],
): Promise<RespostaDaAurora> {
  const { data, error } = await supabase.functions.invoke('app-aurora-nutri', {
    body: {
      pergunta,
      historico: historico.map(f => ({ papel: f.papel, texto: f.texto })),
    },
  })

  /* `invoke` deixa `data` nulo fora do 2xx e joga o corpo em `error.context`.
     Aqui os desfechos não mudam a tela -- todos viram uma frase --, mas ler o
     corpo é o que distingue "a IA está fora" de "a rede caiu", e as duas
     merecem conselhos diferentes. */
  let resposta = data as {
    resposta?: string | null
    error?: string
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

  let resposta = data as { resposta?: string; error?: string } | null
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
