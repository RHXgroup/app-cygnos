import { supabase } from './supabase'
import { falha } from './erros'
import type { TimbradoDaNutri } from './folhaDoPlano'

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

  /* ──────────────────── A FUNCIONÁRIA DO CONSULTÓRIO ────────────────────
   *
   * Ela não está em nenhuma das duas tabelas: mora em `funcionarios`, ligada ao
   * Auth por `auth_user_id`. E não adianta perguntar lá direto -- a RLS daquela
   * tabela exige `func_pode('{funcionarios,acessar}')`, que é a permissão de
   * GERENCIAR funcionários, e a maioria das recepcionistas não a tem. Ela nem a
   * própria linha consegue ler.
   *
   * Sem isto o desfecho é o pior possível: ela entra com o MT do consultório, o
   * usuário e a senha certos, o login FUNCIONA -- e o app responde que a conta
   * dela não existe e a desconecta.
   *
   * ──────────────────── Por que só agora, e não na primeira pergunta ────────────────────
   * Duas razões. A chamada custa uma ida a mais, e o caso comum é paciente ou
   * nutricionista -- os dois já responderam acima. E, principalmente: enquanto a
   * migração 20260908200000 não rodar, esta função NÃO EXISTE no banco, e o erro
   * cai no `catch` devolvendo 'nenhum' -- que é exatamente o comportamento de
   * hoje. Nada quebra antes do SQL rodar. */
  /* ──────────────────── FALHAR AQUI NÃO PODE DESCONECTAR NINGUÉM ────────────────────
   *
   * Este ramo devolvia 'nenhum' quando a chamada FALHAVA, e 'nenhum' faz o App
   * mostrar "esta conta não tem cadastro" e chamar `signOut()`. Ou seja: uma
   * falha de rede de um segundo expulsava do app uma funcionária com a
   * credencial certa -- e ela voltaria para o login lendo que a conta dela não
   * existe.
   *
   * É o erro que o próprio arquivo já avisava para não cometer, duas telas
   * acima: confundir "não deu para perguntar" com "a resposta é não". Aconteceu
   * de verdade, em teste, tocando na Aurora.
   *
   * Agora só uma RESPOSTA do banco decide. Erro devolve `null`, que quer dizer
   * "não sei" -- e quem chama trata isso deixando entrar. */
  const perguntar = async (): Promise<QuemEntrou | null> => {
    try {
      const { data, error } = await supabase.rpc('app_quem_sou')
      if (error) return null
      const quem = data as { tipo?: string } | null
      if (quem?.tipo === 'funcionario' || quem?.tipo === 'nutricionista') return 'nutricionista'
      /* O banco respondeu, e a resposta foi 'nenhum'. Essa sim é decisão. */
      return quem?.tipo === 'nenhum' ? 'nenhum' : null
    } catch {
      return null
    }
  }

  /* Uma segunda tentativa, e só uma.
   *
   * O custo de insistir é meio segundo na abertura; o custo de desistir é
   * mandar embora quem tinha direito de entrar. E duas é o bastante: o que
   * derruba a primeira é o pacote perdido do elevador, e não um servidor fora
   * do ar -- esse não melhora com a terceira. */
  const primeira = await perguntar()
  if (primeira !== null) return primeira

  await new Promise(r => setTimeout(r, 400))
  return perguntar()
}

/* Os dados dela, para o cabeçalho da tela.
 *
 * O filtro por `id` é redundante com a RLS (`nutri_le_proprio` já limita a
 * própria linha) e entra pelo mesmo motivo do irmão em `conta.ts`: sem ele,
 * esta leitura dependeria inteira de uma política que mora noutro repositório.
 * Com ele, o pior caso volta a ser uma resposta errada só sobre ela mesma. */
/* O TIMBRADO da folha impressa: nome, registro e a linha de contato.
 *
 * "O PDF tem que sair no padrão dos relatórios do sistema." Lá o cabeçalho sai
 * de `perfil_nutricionista`, com os mesmos campos -- `SELECT_PERFIL_RELATORIO`,
 * em `relatorioClinico.ts`. Aqui são os mesmos, menos as imagens: logo, foto e
 * assinatura moram em balde privado, precisariam de endereço assinado (que
 * vence) e, se não carregassem, deixariam um buraco no papel.
 *
 * NUNCA rejeita e nunca vira erro na tela: sem o timbrado o PDF sai com o nome
 * do sistema, que é melhor do que não sair. Item 11.
 *
 * O TIPO mora em `folhaDoPlano`, que é quem desenha a folha: dois tipos de mesmo
 * nome e mesma forma em dois arquivos são a armadilha 5 -- o compilador aceita a
 * troca, e o dia em que um ganhar um campo o outro não ganha. */
export async function timbradoDaNutri(): Promise<TimbradoDaNutri | null> {
  try {
    const { data: sessao } = await supabase.auth.getSession()
    const id = sessao.session?.user.id
    if (!id) return null

    /* `select('*')`: os nomes das colunas do perfil não estão conferidos neste
       repositório, e uma coluna errada numa lista derruba a leitura inteira --
       o que apagaria o timbrado em vez de só um campo. */
    const { data, error } = await supabase
      .from('perfil_nutricionista')
      .select('*')
      .eq('nutricionista_id', id)
      .maybeSingle()
    if (error) falha('Não consegui ler o seu timbrado.', error)

    const p = (data ?? {}) as Record<string, unknown>
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

    const nome = texto(p.nome_completo)
    const endereco = texto(p.logradouro)
      ? [
          texto(p.logradouro) + (texto(p.numero) ? ', ' + texto(p.numero) : ''),
          texto(p.bairro),
          texto(p.cidade) + (texto(p.uf) ? '/' + texto(p.uf) : ''),
        ].filter(Boolean).join(' · ')
      : ''
    const instagram = texto(p.instagram) ? '@' + texto(p.instagram).replace(/^@+/, '') : ''
    const contato = [
      texto(p.telefone) ? 'Tel. ' + texto(p.telefone) : '',
      endereco,
      instagram,
    ].filter(Boolean).join(' · ')

    /* Sem nome no perfil, o nome do cadastro serve: o papel precisa dizer de
       quem é. */
    const doCadastro = await carregarPerfilDaNutri()
    return {
      nome: nome || doCadastro?.nome || 'Cygnos',
      crn: texto(p.crn) || null,
      contato: contato || null,
    }
  } catch (e) {
    falha('Não consegui ler o seu timbrado.', e)
    return null
  }
}

export async function carregarPerfilDaNutri(): Promise<PerfilDaNutri | null> {
  const { data: sessao } = await supabase.auth.getSession()
  const id = sessao.session?.user.id
  if (!id) return null

  const { data, error } = await supabase
    .from('nutricionistas')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()

  /* Linha ausente não quer dizer erro: pode ser a FUNCIONÁRIA, que não está em
     `nutricionistas`. Nesse caso o nome vem da mesma função que a identificou,
     e o cabeçalho a cumprimenta pelo nome dela em vez de ficar sem nome. */
  if (!data) {
    if (error) falha('Não consegui carregar o seu perfil agora.', error)
    const { data: quem } = await supabase.rpc('app_quem_sou')
    const q = quem as { tipo?: string; nome?: string | null } | null
    if (q?.tipo === 'funcionario' && q.nome?.trim()) {
      return { id, nome: q.nome.trim(), tratamento: null }
    }
    return null
  }

  if (error) {
    falha('Não consegui carregar o seu perfil agora.', error)
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
