import { falha } from './erros'
import { supabase } from './supabase'

/* A limitação física da pessoa, guardada uma vez e usada em tudo.
 *
 * ── Por que ela existe ─────────────────────────────────────────────────────
 * Quem tem problema no ombro precisa adaptar TODO exercício que carrega o
 * ombro. Quem tem o joelho estourado, todo agachamento. Não é uma marca num
 * exercício — é uma condição da pessoa, que atravessa a rotina inteira e não
 * muda de mês para mês.
 *
 * Antes ela era digitada no formulário da rotina por IA, sumia quando a tela
 * fechava, e não valia para mais nada: a ficha importada da academia não sabia
 * dela, quem montava na mão não era avisado, e no mês seguinte tudo de novo.
 *
 * ── E ela faz coisas DIFERENTES em cada lugar ──────────────────────────────
 * Esta distinção é o desenho todo, e vem do uso real:
 *
 *   ROTINA MONTADA PELA IA — regra absoluta. A rotina nasce já sem exercício
 *   que carregue a região.
 *
 *   FICHA DA ACADEMIA, importada por foto — AVISA e não muda. Alguém montou
 *   aquela ficha e a pessoa decidiu usá-la; reescrever a prescrição de outro
 *   profissional em silêncio seria o app se achar dono de um treino que não é
 *   dele. Ela vê o aviso ao lado do exercício e decide.
 *
 *   ADAPTAR UM EXERCÍCIO — só quando ela pede, no que ela escolher.
 *
 * ── Texto livre, e não uma lista de regiões ────────────────────────────────
 * "Dor no ombro direito quando levanto acima da cabeça" diz o que "ombro" não
 * diz — e é a diferença entre trocar o desenvolvimento militar e trocar também
 * a elevação lateral, que não precisava. Uma lista fechada obrigaria a escolher
 * entre caixas que eu imaginei, e a lesão de cada um não cabe nelas. */

const TAMANHO_MAX = 500

export type ResultadoLimitacoes =
  | { tipo: 'ok'; limitacoes: string }
  | { tipo: 'erro'; mensagem: string }

export async function carregarLimitacoes(contaId: string): Promise<ResultadoLimitacoes> {
  const { data, error } = await supabase
    .from('app_contas')
    .select('limitacoes')
    .eq('id', contaId)
    .maybeSingle()

  if (error)
    return { tipo: 'erro', mensagem: falha('Não consegui ler as suas limitações agora.', error) }
  return { tipo: 'ok', limitacoes: (data?.limitacoes as string | null) ?? '' }
}

export async function salvarLimitacoes(
  contaId: string,
  texto: string,
): Promise<{ erro: string } | null> {
  const limpo = texto.trim().slice(0, TAMANHO_MAX)
  const { error } = await supabase
    .from('app_contas')
    /* Vazio vira NULL, e não string vazia. A função do servidor recusa a
       adaptação quando não há limitação declarada, e ela testa o comprimento —
       string vazia passaria o teste de "existe" em algum caminho futuro e
       viraria "sem limitação nenhuma", que é a resposta perigosa. */
    .update({ limitacoes: limpo || null })
    .eq('id', contaId)

  if (!error) return null
  return { erro: falha('Não consegui salvar isso agora. Verifique a conexão.', error) }
}
