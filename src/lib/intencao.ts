import { dataISO } from './formatar'
import { intencaoDaIA, type Convertida, type Intencao, type RespostaDaIA } from './intencaoDaIA'
import { supabase } from './supabase'
import { falha } from './erros'

/* Falar o que vai acontecer, e o app parar de cobrar o que já foi avisado.
 *
 * A conversão mora em `intencaoDaIA`, sem import de runtime, e é exercitada
 * fora do aparelho com 42 casos. Aqui fica só o que fala com a rede e com o
 * banco — a mesma separação do plano, do treino e do ditado. */

export type IntencaoSalva = Intencao & {
  id: string
  /* Marcada como cumprida, ou desmarcada. Nula enquanto o dia não chegou. */
  cumprida: boolean | null
}

type Linha = {
  id: string
  tipo: string
  quando: string | null
  ate: string | null
  refeicao: string | null
  texto: string
  cumprida: boolean | null
}

const daLinha = (l: Linha): IntencaoSalva => ({
  id: l.id,
  tipo: l.tipo as Intencao['tipo'],
  quando: l.quando,
  ate: l.ate,
  refeicao: l.refeicao,
  texto: l.texto,
  cumprida: l.cumprida,
})

const COLUNAS = 'id, tipo, quando, ate, refeicao, texto, cumprida'

export type ResultadoLeitura =
  | { tipo: 'ok'; convertida: Convertida }
  | { tipo: 'limite'; mensagem: string }
  | { tipo: 'erro'; mensagem: string }

/* Manda a fala para a IA e devolve o que ela entendeu, já validado.
 *
 * NÃO grava: a pessoa confere na tela e confirma. Mesma doutrina de tudo que a
 * IA produz neste app — e aqui ela vale ainda mais, porque uma intenção
 * fantasma faz o app deixar de cobrar um registro que deveria cobrar, e isso
 * não deixa rastro na tela para alguém desconfiar. */
export async function lerIntencao(
  fala: string,
  nomesDasRefeicoes: string[] = [],
): Promise<ResultadoLeitura> {
  /* O dia de hoje vai do APARELHO. A função do servidor roda em UTC, e às nove
     da noite em São Paulo já é o dia seguinte lá — "amanhã" viraria depois de
     amanhã, sem nada estranho aparecer na tela. */
  const hoje = dataISO(new Date())

  let bruto: RespostaDaIA
  try {
    const { data, error } = await supabase.functions.invoke('app-ler-intencao', {
      body: { fala, hoje, refeicoes: nomesDasRefeicoes },
    })

    if (error) {
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      const codigo = corpo?.error as string | undefined

      if (codigo === 'sem_fala') {
        return {
          tipo: 'erro',
          mensagem: String(corpo?.message ?? '') || 'Me diga o que você está planejando.',
        }
      }
      if (codigo === 'forbidden' || codigo === 'unauthorized') {
        return { tipo: 'erro', mensagem: 'Sua sessão expirou. Entre de novo.' }
      }
      if (codigo === 'nao_liberado') {
        return {
          tipo: 'erro',
          mensagem: String(corpo?.message ?? '') || 'Falar o que você planeja ainda não foi liberado.',
        }
      }
      if (codigo === 'limite') {
        return {
          tipo: 'limite',
          mensagem: String(corpo?.message ?? '') || 'Muitos planos em pouco tempo. Tente mais tarde.',
        }
      }
      return {
        tipo: 'erro',
        mensagem: 'Não consegui entender agora. Verifique a conexão e tente de novo.',
      }
    }

    bruto = (data?.intencao ?? {}) as RespostaDaIA
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui falar com o servidor. Verifique a conexão.' }
  }

  return { tipo: 'ok', convertida: intencaoDaIA(bruto, hoje) }
}

export type ResultadoIntencoes =
  | { tipo: 'ok'; intencoes: IntencaoSalva[] }
  | { tipo: 'erro'; mensagem: string }

/* As intenções que ainda importam: as de hoje em diante, mais os propósitos,
 * que não têm data.
 *
 * O passado fica de fora porque ninguém volta para reler o que planejou para
 * terça retrasada — e trazê-lo faria a lista crescer para sempre. */
export async function carregarIntencoes(contaId: string): Promise<ResultadoIntencoes> {
  const hoje = dataISO(new Date())
  const { data, error } = await supabase
    .from('app_intencoes')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    /* `or` e não dois filtros: o propósito tem `quando` nulo, e um `gte` sozinho
       o descartaria — nulo não é maior nem menor que nada em SQL. */
    .or(`quando.gte.${hoje},quando.is.null`)
    .order('quando', { ascending: true, nullsFirst: false })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus planos agora.', error),
    }
  return { tipo: 'ok', intencoes: (data as Linha[]).map(daLinha) }
}

export async function salvarIntencoes(
  contaId: string,
  intencoes: Intencao[],
): Promise<{ tipo: 'ok'; salvas: IntencaoSalva[] } | { tipo: 'erro'; mensagem: string }> {
  if (intencoes.length === 0) return { tipo: 'ok', salvas: [] }

  const { data, error } = await supabase
    .from('app_intencoes')
    .insert(
      intencoes.map(i => ({
        conta_id: contaId,
        tipo: i.tipo,
        quando: i.quando,
        ate: i.ate,
        refeicao: i.refeicao,
        texto: i.texto,
      })),
    )
    .select(COLUNAS)

  if (error)
    return { tipo: 'erro', mensagem: falha('Não consegui guardar os seus planos agora.', error) }
  return { tipo: 'ok', salvas: (data as Linha[]).map(daLinha) }
}

export async function apagarIntencao(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_intencoes').delete().eq('id', id)
  if (!error) return null
  return { erro: falha('Não consegui apagar esse plano agora.', error) }
}

/* Marca o propósito como cumprido ou desmarcado.
 *
 * Só o propósito precisa disto: os outros tipos se resolvem sozinhos quando o
 * dia passa. "Quero comer menos à noite" não passa — ele fica, e a pessoa
 * decide se valeu. É o que dá sentido a ele existir. */
export async function marcarCumprida(
  id: string,
  cumprida: boolean | null,
): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_intencoes').update({ cumprida }).eq('id', id)
  if (!error) return null
  return { erro: falha('Não consegui salvar isso agora.', error) }
}
