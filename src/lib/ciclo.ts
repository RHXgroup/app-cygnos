import { falha } from './erros'
import { supabase } from './supabase'
import type { Ciclo } from './cicloDaPessoa'

/* O que fala com o banco sobre o ciclo. O que DECIDE mora em `cicloDaPessoa`,
 * que não importa nada de execução e por isso tem teste de verdade — mesmo
 * corte de `planoIA`/`sugestaoParaPlano` e `avisos`/`montarAvisos`.
 *
 * Aqui não há regra nenhuma: lê, grava, apaga. Se aparecer um `if` sobre fase,
 * duração ou previsão neste arquivo, ele está no lugar errado. */

export type RegistroCiclo = Ciclo & {
  id: string
  observacao: string | null
}

export type ResultadoCiclos =
  | { tipo: 'ok'; registros: RegistroCiclo[] }
  | { tipo: 'erro'; mensagem: string }

type Linha = {
  id: string
  comecou: string
  terminou: string | null
  observacao: string | null
}

const doRegistro = (l: Linha): RegistroCiclo => ({
  id: l.id,
  comecou: l.comecou,
  terminou: l.terminou,
  observacao: l.observacao,
})

/* Quantos registros a tela carrega.
 *
 * 24 é o teto por ser dois anos de ciclos, e a mediana só usa os últimos — mas
 * a lista é dela, e apagar um registro de dez meses atrás precisa ser possível
 * sem paginação numa tela que quase ninguém vai rolar até o fim. */
const QUANTOS = 24

export async function carregarCiclos(contaId: string): Promise<ResultadoCiclos> {
  const { data, error } = await supabase
    .from('app_ciclo_registros')
    .select('id, comecou, terminou, observacao')
    .eq('conta_id', contaId)
    .order('comecou', { ascending: false })
    .limit(QUANTOS)

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus registros agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', registros: ((data ?? []) as Linha[]).map(doRegistro) }
}

export type ResultadoRegistro =
  | { tipo: 'ok'; registro: RegistroCiclo }
  | { tipo: 'erro'; mensagem: string }

/* Marca o começo de uma menstruação.
 *
 * Upsert por (conta_id, comecou): tocar duas vezes no mesmo dia é correção, e
 * não ciclo novo. Sem isso o segundo toque levaria o erro de chave única do
 * Postgres para a tela — "duplicate key value violates unique constraint" —,
 * que não diz nada a quem só queria anotar que menstruou. */
export async function registrarComeco(
  contaId: string,
  comecou: string,
): Promise<ResultadoRegistro> {
  const { data, error } = await supabase
    .from('app_ciclo_registros')
    .upsert({ conta_id: contaId, comecou }, { onConflict: 'conta_id,comecou' })
    .select('id, comecou, terminou, observacao')
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui registrar isso agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', registro: doRegistro(data as Linha) }
}

/* Marca o fim do fluxo, ou desmarca.
 *
 * `null` apaga a data em vez de deixar a linha travada com um fim errado: quem
 * marcou o fim um dia cedo demais precisa poder voltar atrás, e o caminho de
 * volta não pode ser apagar o ciclo inteiro. */
export async function marcarFim(
  id: string,
  terminou: string | null,
): Promise<ResultadoRegistro> {
  const { data, error } = await supabase
    .from('app_ciclo_registros')
    .update({ terminou })
    .eq('id', id)
    .select('id, comecou, terminou, observacao')
    .single()

  if (error)
    return {
      tipo: 'erro',
      /* O banco recusa fim antes do começo e fluxo de mais de 15 dias. A frase
         diz o que fazer, porque o texto do constraint não diz. */
      mensagem: falha(
        'Não consegui salvar esse fim. Ele precisa ser depois do começo e no mesmo fluxo.',
        error,
      ),
    }
  return { tipo: 'ok', registro: doRegistro(data as Linha) }
}

export async function apagarCiclo(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_ciclo_registros').delete().eq('id', id)
  if (!error) return null
  return { erro: falha('Não consegui apagar esse registro agora. Verifique a conexão.', error) }
}
