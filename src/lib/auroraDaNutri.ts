import { supabase } from './supabase'
import { falha } from './erros'

/* Perguntar à Aurora, do lado dela. Só pergunta -- nada aqui grava.
 *
 * ──────────────────── O que NÃO vai no corpo ────────────────────
 * Nenhum id. Nem o dela, nem de paciente, nem de consulta. A função monta o
 * contexto no servidor, lendo com o token de quem chamou, e é a RLS que
 * recorta. Mandar um id daqui transformaria a função em algo que responde
 * sobre a agenda de qualquer uma para quem mandasse outro número. */

export type Papel = 'nutri' | 'aurora'

export type Fala = {
  /* Chave da lista. `Date.now()` colide quando duas falas nascem no mesmo
     milissegundo -- e nascem, porque a resposta chega e a pergunta some do
     campo no mesmo instante. Contador simples resolve e não depende de nada. */
  id: number
  papel: Papel
  texto: string
}

let proximoId = 1
export const novaFala = (papel: Papel, texto: string): Fala => ({
  id: proximoId++,
  papel,
  texto,
})

export type RespostaDaAurora =
  | { tipo: 'ok'; texto: string }
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
    falha('A Aurora não respondeu.', error)
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

/* O que oferecer antes de ela digitar qualquer coisa.
 *
 * Não é enfeite: uma caixa de texto vazia com "pergunte alguma coisa" não diz
 * o que a Aurora SABE, e a primeira pergunta de quem não sabe costuma ser
 * justamente a que ela não responde -- "remarca a Maria" --, o que ensina em
 * dez segundos que não serve para nada. Três exemplos do que ela responde HOJE
 * valem mais que qualquer texto de ajuda. */
export const PERGUNTAS_DE_EXEMPLO = [
  'Quem é o meu próximo paciente?',
  'Quanto eu recebi hoje?',
  'Quem está sem retorno?',
  'Como está a minha agenda de amanhã?',
]
