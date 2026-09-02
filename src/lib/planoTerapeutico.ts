import { falha, mensagemDoBanco } from './erros'
import { supabase } from './supabase'
import type { ChaveReacao, Registro } from './escadaDaAceitacao'
import { REACOES } from './escadaDaAceitacao'

/* A ponte da escada de aceitação.
 *
 * ── O que ela liga ────────────────────────────────────────────────────────
 * A nutricionista prescreve "ofereça cenoura cozida em cubos, três vezes na
 * semana, em casa". Até agora a mãe saía do consultório com isso na memória, e
 * o registro do que aconteceu era preenchido POR ELA, no consultório, a partir
 * do que a mãe lembrava um mês depois.
 *
 * Quem viu a criança tocar o alimento pela primeira vez foi a mãe, na cozinha.
 * Esse é o dado que estas três funções trazem para o lugar certo.
 *
 * ── Por que só agora ─────────────────────────────────────────────────────
 * A escada do app está pronta há dias — lógica, cores, desenhos e as duas
 * telas. O que faltava eram três funções do lado do sistema, e o pedido
 * detalhado delas estava escrito… no repositório do APP. Nenhuma sessão do
 * sistema olha ali. Ficou parecendo esquecimento e era endereço errado. */

/* ── Uma linha do plano ────────────────────────────────────────────────────
 * O que a mãe vê: um alimento, uma preparação, o que fazer e com que
 * frequência. Sem `objetivo_principal` e sem `criterio_evolucao` — os dois são
 * texto de profissional para profissional, e jargão sobre o próprio filho é
 * pior que silêncio, porque ela não pergunta. */
export type ObjetivoDoPlano = {
  objetivoId: number
  alimento: string
  alimentoBaseId: number | null
  preparacaoId: number | null
  preparacao: string | null
  orientacoes: string | null
  frequencia: string | null
  /* Primeiro nome, para o botão dizer "Mostrar ao Téo". */
  nomeDaCrianca: string
}

type LinhaDoPlano = {
  objetivo_id: number
  alimento: string | null
  alimento_base_id: number | null
  preparacao_id: number | null
  preparacao: string | null
  orientacoes: string | null
  frequencia: string | null
  nome_da_crianca: string | null
}

export type ResultadoDoPlano =
  | { tipo: 'ok'; objetivos: ObjetivoDoPlano[] }
  | { tipo: 'erro'; mensagem: string }

/* Linha sem alimento não vira cartão.
 *
 * `alimento_base_id` é anulável do lado do sistema, e um objetivo sem alimento
 * produziria um cartão perguntando "como foi com ?" — pergunta que não dá para
 * responder. Some da lista em vez de aparecer quebrado. */
const doPlano = (l: LinhaDoPlano): ObjetivoDoPlano | null =>
  l.alimento && l.alimento.trim()
    ? {
        objetivoId: l.objetivo_id,
        alimento: l.alimento.trim(),
        alimentoBaseId: l.alimento_base_id,
        preparacaoId: l.preparacao_id,
        preparacao: l.preparacao?.trim() || null,
        orientacoes: l.orientacoes?.trim() || null,
        frequencia: l.frequencia?.trim() || null,
        nomeDaCrianca: l.nome_da_crianca?.trim() ?? '',
      }
    : null

export async function carregarPlanoTerapeutico(): Promise<ResultadoDoPlano> {
  const { data, error } = await supabase.rpc('app_plano_terapeutico')
  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o plano da sua nutricionista agora.', error),
    }
  const objetivos = ((data ?? []) as LinhaDoPlano[])
    .map(doPlano)
    .filter((o): o is ObjetivoDoPlano => o !== null)
  return { tipo: 'ok', objetivos }
}

/* ── O histórico de um objetivo ────────────────────────────────────────────
 * Sem ele o app não sabe se é a 1ª ou a 5ª oferta, e o limite das cinco
 * exposições — o ponto em que o ganho estabiliza e o app PARA de pedir a
 * próxima — não tem como funcionar.
 *
 * Devolve lista vazia em caso de falha, e não erro: o histórico é contexto, e
 * uma tela que não abre porque o histórico falhou é pior do que uma que abre
 * dizendo "primeira vez". Quem decide isso é aqui, não a tela. */
export async function carregarExposicoes(objetivoId: number): Promise<Registro[]> {
  const { data, error } = await supabase.rpc('app_exposicoes_do_objetivo', {
    p_objetivo_id: objetivoId,
  })
  if (error) {
    falha('Não consegui ler o histórico deste alimento.', error)
    return []
  }
  return ((data ?? []) as { data_exposicao: string; aceitacao: string | null; reacao_emocional: string | null }[]).map(
    l => ({ data: l.data_exposicao, aceitacao: l.aceitacao, reacao: l.reacao_emocional }),
  )
}

/* ── O registro ────────────────────────────────────────────────────────────
 * A peça que muda o tratamento: nasce na cozinha, no dia, por quem viu.
 *
 * `degrau` vai como está — a chave do degrau É o valor gravado em `aceitacao`,
 * e `degrauDe` sabe ler tanto as chaves de hoje quanto as antigas.
 *
 * A reação é traduzida para o vocabulário do banco (`positiva`/`neutra`/
 * `negativa`), que é diferente do que a tela mostra. A tradução mora em
 * `REACOES`, junto das palavras que a mãe lê, para as duas não divergirem. */
export type ResultadoDoRegistro = { tipo: 'ok' } | { tipo: 'erro'; mensagem: string }

export async function registrarExposicao(entrada: {
  objetivoId: number
  alimentoBaseId: number | null
  preparacaoId: number | null
  degrau: string
  reacao: ChaveReacao | null
  observacao?: string | null
}): Promise<ResultadoDoRegistro> {
  const { error } = await supabase.rpc('app_registrar_exposicao', {
    p_objetivo_id: entrada.objetivoId,
    p_alimento_base_id: entrada.alimentoBaseId,
    p_preparacao_id: entrada.preparacaoId,
    p_aceitacao: entrada.degrau,
    p_reacao: entrada.reacao
      ? (REACOES.find(r => r.chave === entrada.reacao)?.noBanco ?? null)
      : null,
    p_observacao: entrada.observacao ?? null,
  })
  if (error)
    return {
      tipo: 'erro',
      /* O banco escreve frase para gente aqui — "Esse objetivo não é do seu
         acompanhamento", "ainda não tem uma preparação definida" —, e repassar
         é melhor do que traduzir: quem sabe por que recusou é quem recusou.
         `mensagemDoBanco` só repassa o que tem cara de português escrito para
         alguém ler, e cai na nossa frase em "permission denied" e afins. */
      mensagem: mensagemDoBanco(error, 'Não consegui guardar este registro agora.'),
    }
  return { tipo: 'ok' }
}
