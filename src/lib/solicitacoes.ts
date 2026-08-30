import { supabase } from './supabase'
import { assinados } from './arquivos'
import { falha } from './erros'

/* O primeiro contato, que parte SEMPRE do paciente.
 *
 * Ele acha a nutricionista no catálogo, escreve uma frase e pede. Ela recebe na
 * caixa dela, e aceita ou não. Só depois do aceite existe vínculo, e só com
 * vínculo existe conversa — antes disso é pedido, não conversa.
 *
 * A direção é de mão única de propósito: ela não navega paciente, não busca
 * ninguém e não vê quem usa o app. Enxerga quem pediu por ela e quem já é dela.
 * Nenhuma função aqui, nem no lado dela, lista paciente solto.
 *
 * ── Quantos pedidos ────────────────────────────────────────────────────────
 * Sem limite de quantas profissionais ele procura — isso é direito dele, e
 * consultar três antes de escolher é o normal. O que o banco impede é um
 * segundo pedido EM ABERTO para a MESMA pessoa, que só encheria a caixa dela
 * com a mesma coisa repetida. */

export type StatusSolicitacao = 'enviada' | 'aceita' | 'recusada' | 'cancelada'

export type Solicitacao = {
  id: number
  nutricionistaId: string
  nome: string
  /* Já assinada quando veio como URL pública de bucket privado. Null quando ela
     não tem foto, ou escolheu não mostrá-la no app. */
  fotoUrl: string | null
  /* Texto cru do banco, e não a união: os quatro acima são os de hoje, e o app
     não tem como impedir que amanhã chegue um quinto. Ver a armadilha 10. */
  status: string
  criadaEm: string
  respondidaEm: string | null
}

export type ResultadoSolicitacoes =
  | { tipo: 'ok'; solicitacoes: Solicitacao[] }
  | { tipo: 'erro'; mensagem: string }

/* Falha aqui devolve a frase do BANCO, e não uma nossa.
 *
 * As recusas são escritas em português para alguém ler — "Você já é acompanhada
 * por uma nutricionista.", "Esta nutricionista não está disponível no
 * aplicativo." Traduzir isso seria perder o motivo. Mesma exceção documentada
 * em lib/agenda.ts, e pelo mesmo motivo: quem sabe por que recusou é quem
 * recusou. */
export type ResultadoPedido = { tipo: 'ok' } | { tipo: 'erro'; mensagem: string }

type Linha = {
  id: number
  nutricionista_id: string
  nome: string
  foto_url: string | null
  status: string
  criada_em: string
  respondida_em: string | null
}

export async function carregarMinhasSolicitacoes(): Promise<ResultadoSolicitacoes> {
  const { data, error } = await supabase.rpc('app_minhas_solicitacoes')

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus pedidos. Verifique a conexão.', error),
    }

  const linhas = (data ?? []) as Linha[]
  if (linhas.length === 0) return { tipo: 'ok', solicitacoes: [] }

  const comFoto = linhas.filter(l => l.foto_url)
  const enderecos = await assinados(comFoto.map(l => l.foto_url as string))
  const porOriginal = new Map<string, string>()
  comFoto.forEach((l, i) => porOriginal.set(l.foto_url as string, enderecos[i]))

  return {
    tipo: 'ok',
    solicitacoes: linhas.map(l => ({
      id: l.id,
      nutricionistaId: l.nutricionista_id,
      nome: l.nome,
      fotoUrl: l.foto_url ? (porOriginal.get(l.foto_url) ?? l.foto_url) : null,
      status: l.status,
      criadaEm: l.criada_em,
      respondidaEm: l.respondida_em,
    })),
  }
}

export async function solicitarVinculo(
  nutricionistaId: string,
  mensagem: string,
): Promise<ResultadoPedido> {
  const { error } = await supabase.rpc('app_solicitar_vinculo', {
    p_nutricionista_id: nutricionistaId,
    p_mensagem: mensagem.trim() || null,
  })

  if (error) return { tipo: 'erro', mensagem: error.message }
  return { tipo: 'ok' }
}

/* Aqui NÃO se repassa o texto do banco, ao contrário do pedido logo acima.
 *
 * A diferença é quem escreveu a frase. `app_solicitar_vinculo` levanta mensagem
 * para gente ler — é ela que explica por que o toque não virou pedido. Desfazer
 * é um update: o que chega até aqui é falha de rede, de permissão, ou um pedido
 * que deixou de estar em aberto porque ela respondeu enquanto a tela estava na
 * mão da pessoa.
 *
 * A frase cobre os três sem chutar qual foi, e manda fazer a única coisa que
 * resolve os três — reler. Mesma escolha do cancelar de lib/agenda.ts. */
export async function cancelarSolicitacao(id: number): Promise<ResultadoPedido> {
  const { error } = await supabase.rpc('app_cancelar_solicitacao_vinculo', { p_id: id })
  if (error)
    return {
      tipo: 'erro',
      mensagem: falha(
        'Não consegui desfazer este pedido. Ele pode já ter sido respondido — puxe para atualizar.',
        error,
      ),
    }
  return { tipo: 'ok' }
}

/* ── Apresentação ──────────────────────────────────────────────────────────*/

type Estado = { titulo: string; explicacao: string; icone: 'hourglass-outline' | 'checkmark-circle' | 'close-circle-outline' }

const ESTADOS: Record<StatusSolicitacao, Estado> = {
  enviada: {
    titulo: 'Aguardando resposta',
    explicacao: 'Ela ainda não respondeu. Enquanto isso, você pode procurar outras.',
    icone: 'hourglass-outline',
  },
  aceita: {
    titulo: 'Pedido aceito',
    explicacao: 'Vocês estão conectados. O acompanhamento dela já aparece no app.',
    icone: 'checkmark-circle',
  },
  recusada: {
    titulo: 'Não pôde atender',
    explicacao: 'Ela não pôde aceitar agora. Você pode procurar outra nutricionista.',
    icone: 'close-circle-outline',
  },
  cancelada: {
    titulo: 'Pedido desfeito',
    explicacao: 'Este pedido não está mais em aberto.',
    icone: 'close-circle-outline',
  },
}

const DESCONHECIDO: Estado = {
  titulo: 'Pedido',
  explicacao: 'Não foi possível identificar a situação deste pedido.',
  icone: 'hourglass-outline',
}

/* Nunca o índice cru: um status novo devolveria undefined e a linha seguinte
   leria `.titulo` dele. Ver a armadilha 10 do AGENTS.md. */
export const estadoDaSolicitacao = (s: string): Estado =>
  ESTADOS[s as StatusSolicitacao] ?? DESCONHECIDO

export const estaEmAberto = (s: string) => s === 'enviada'
