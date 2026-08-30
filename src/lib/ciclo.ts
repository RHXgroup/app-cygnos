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

/* ── Compartilhar com a nutricionista ──────────────────────────────────────*/

/* O sistema dela JÁ TEM controle de ciclo — `ciclos_menstruais`, e a tela dela
 * já escreve "Paciente, pelo app" quando `origem = 'paciente'`. O outro lado
 * foi desenhado esperando isto; só nunca chegou nada. Então aqui não há tabela
 * nem tela nova: há uma chave, e um espelho.
 *
 * A chave começa DESLIGADA, e desligar apaga o que já foi enviado. Um
 * consentimento retirado que só interrompe o fluxo futuro deixa para trás
 * exatamente o dado que a pessoa decidiu não compartilhar mais.
 *
 * Quem decide o que sai é o servidor: as duas funções leem `auth.uid()` e o
 * vínculo, e não aceitam paciente nem nutricionista por parâmetro. Sem isso o
 * app escolheria para quem mandar dado menstrual. */

export type Compartilhamento = { compartilhando: boolean; enviados: number }

const doRetorno = (d: unknown): Compartilhamento => {
  const r = (d ?? {}) as { compartilhando?: unknown; enviados?: unknown }
  return {
    compartilhando: r.compartilhando === true,
    enviados: typeof r.enviados === 'number' ? r.enviados : 0,
  }
}

/* Espelha o que mudou, quando a chave está ligada. Desligada, não faz nada —
 * então a tela pode chamar sempre, sem perguntar antes.
 *
 * Nunca rejeita: falhar em espelhar não pode derrubar o registro que a pessoa
 * acabou de fazer. O ciclo dela já está gravado; o espelho é consequência, e a
 * próxima chamada refaz tudo do zero. */
export async function sincronizarCiclo(): Promise<Compartilhamento> {
  try {
    const { data, error } = await supabase.rpc('app_ciclo_sincronizar')
    if (error) {
      falha('Não consegui atualizar o que a sua nutricionista vê.', error)
      return { compartilhando: false, enviados: 0 }
    }
    return doRetorno(data)
  } catch {
    return { compartilhando: false, enviados: 0 }
  }
}

export type ResultadoCompartilhar =
  | { tipo: 'ok'; estado: Compartilhamento }
  | { tipo: 'erro'; mensagem: string }

/* Liga ou desliga, e já sincroniza na mesma ida. Esta REJEITA para a tela — ao
 * contrário da de cima —, porque aqui a pessoa acabou de tocar num interruptor
 * de privacidade: deixá-lo mudar de posição sem ter mudado nada no servidor é o
 * pior desfecho possível desta tela. */
export async function compartilharCiclo(ligado: boolean): Promise<ResultadoCompartilhar> {
  const { data, error } = await supabase.rpc('app_ciclo_compartilhar', { p_ligado: ligado })
  if (error)
    return {
      tipo: 'erro',
      mensagem: falha(
        ligado
          ? 'Não consegui ligar o compartilhamento agora. Verifique a conexão.'
          : 'Não consegui desligar agora. Tente de novo — nada foi enviado a mais.',
        error,
      ),
    }
  return { tipo: 'ok', estado: doRetorno(data) }
}

/* Se a conta está compartilhando, e se existe vínculo para isso.
 *
 * A leitura é da própria linha em `app_contas`, e o vínculo vem separado porque
 * a tela precisa saber a diferença entre "desligado" e "não tem para quem
 * mandar": um interruptor apagado sem explicação faz a pessoa achar que o app
 * quebrou. */
export type EstadoDoCompartilhamento = { ligado: boolean; temNutricionista: boolean }

export async function estadoDoCompartilhamento(
  contaId: string,
): Promise<EstadoDoCompartilhamento> {
  const [conta, vinculo] = await Promise.all([
    supabase.from('app_contas').select('compartilha_ciclo').eq('id', contaId).maybeSingle(),
    supabase.from('app_vinculos').select('paciente_id').eq('conta_id', contaId).maybeSingle(),
  ])

  if (conta.error) falha('Não consegui ler a sua preferência de compartilhamento.', conta.error)
  if (vinculo.error) falha('Não consegui verificar o seu vínculo.', vinculo.error)

  return {
    ligado: conta.data?.compartilha_ciclo === true,
    temNutricionista: !!vinculo.data,
  }
}
