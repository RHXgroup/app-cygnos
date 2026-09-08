import { supabase } from './supabase'
import { falha } from './erros'

/* Quem entrou: paciente, nutricionista, ou ninguém disso.
 *
 * ── Por que a mesma conta serve os dois ───────────────────────────────────
 * O site e o aplicativo dividem o MESMO projeto de autenticação. A conta dela
 * já valia no app desde sempre — o que o app fazia era, depois de autenticar,
 * perguntar `ehContaDePaciente()` e mandá-la embora com "entre pelo site".
 *
 * Não há conta nova, senha nova nem cadastro novo. O que muda é o destino
 * depois da porta.
 *
 * ── E por que NÃO pelo código MT ──────────────────────────────────────────
 * `nutricionistas.mt_code` existe e está preenchido nas 21 contas, e a ideia de
 * usá-lo para entrar apareceu. Ele fica de fora de propósito.
 *
 * Um identificador curto e memorizável é ótimo para ela ditar ao telefone, e
 * ruim como credencial: ele é curto, é sequencial o bastante para se adivinhar,
 * e circula por fora — quem recebe o código para se vincular passa a ter metade
 * do login de alguém. Aceitar mais um jeito de entrar é aumentar a superfície
 * de uma porta que já funciona, para resolver um problema que não existe: ela
 * já tem e-mail, usuário e senha, e o app já aceita os três.
 *
 * ── A ordem das perguntas importa ─────────────────────────────────────────
 * Paciente PRIMEIRO. Uma conta pode, em teoria, existir nas duas tabelas — a
 * nutricionista que também é paciente de si mesma, ou um cadastro de teste. Se
 * a resposta fosse "nutricionista" nesse caso, ela perderia o próprio
 * acompanhamento sem entender por quê. O contrário é reversível: quem entrar
 * como paciente ainda vê tudo o que sempre viu.
 *
 * ── Falhar aqui não pode trancar ninguém ──────────────────────────────────
 * `null` quer dizer "não deu para perguntar" — sem rede, servidor fora. Quem
 * chama trata isso como paciente, que é o comportamento de sempre e o único que
 * não deixa alguém olhando uma tela vazia por causa de um túnel. */

export type QuemEntrou = 'paciente' | 'nutricionista' | 'nenhum'

export type PerfilDaNutri = {
  id: string
  nome: string
  /* Como o app se refere a ela — 'ela', 'ele', ou nulo enquanto ninguém
     respondeu. Ver lib/tratamentoDaNutri. */
  tratamento: string | null
}

export async function quemEntrou(): Promise<QuemEntrou | null> {
  const { data: sessao } = await supabase.auth.getSession()
  const id = sessao.session?.user.id
  if (!id) return null

  /* As duas perguntas ao mesmo tempo: são tabelas diferentes, e esperar uma
     para começar a outra dobraria a espera na abertura do app. */
  const [conta, nutri] = await Promise.all([
    supabase.from('app_contas').select('id').eq('id', id).maybeSingle(),
    supabase.from('nutricionistas').select('id').eq('id', id).maybeSingle(),
  ])

  /* Erro em QUALQUER uma das duas devolve nulo. Responder "nutricionista"
     porque a consulta de paciente falhou seria trocar o app de alguém por
     causa de um erro de rede. */
  if (conta.error || nutri.error) {
    falha('Não consegui identificar a sua conta agora.', conta.error ?? nutri.error)
    return null
  }

  if (conta.data !== null) return 'paciente'
  if (nutri.data !== null) return 'nutricionista'
  return 'nenhum'
}

/* Os dados dela, para o cabeçalho da tela.
 *
 * O filtro por `id` é redundante com a RLS (`nutri_le_proprio` já limita a
 * própria linha) e entra pelo mesmo motivo do irmão em `conta.ts`: sem ele,
 * esta leitura dependeria inteira de uma política que mora noutro repositório.
 * Com ele, o pior caso volta a ser uma resposta errada só sobre ela mesma. */
export async function carregarPerfilDaNutri(): Promise<PerfilDaNutri | null> {
  const { data: sessao } = await supabase.auth.getSession()
  const id = sessao.session?.user.id
  if (!id) return null

  const { data, error } = await supabase
    .from('nutricionistas')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    if (error) falha('Não consegui carregar o seu perfil agora.', error)
    return null
  }

  const linha = data as { id: string; nome: string | null }

  /* O tratamento vem da OUTRA tabela, e a falta dele não pode derrubar o
     cabeçalho: sem ele a tela só deixa de saber como se dirigir a ela. */
  const { data: perfil } = await supabase
    .from('perfil_nutricionista')
    .select('tratamento, nome_completo')
    .eq('nutricionista_id', id)
    .maybeSingle()

  const p = perfil as { tratamento: string | null; nome_completo: string | null } | null

  return {
    id: linha.id,
    nome: p?.nome_completo?.trim() || linha.nome?.trim() || 'Você',
    tratamento: p?.tratamento ?? null,
  }
}

/* O primeiro nome, para o cabeçalho.
 *
 * "Bom dia, Ana" cabe e soa como gente; "Bom dia, Ana Carolina Menezes
 * Figueiredo" quebra em duas linhas e soa como cabeçalho de documento. Mesma
 * decisão do recado do paciente — e o mesmo formato, de propósito. */
export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome
