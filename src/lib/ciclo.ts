import { falha } from './erros'
import { supabase } from './supabase'
import type { Ciclo, CicloInformado } from './cicloDaPessoa'

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
export type EstadoDoCompartilhamento = {
  ligado: boolean
  temNutricionista: boolean
  /* O que ela respondeu sobre o próprio ciclo, quando respondeu.
   *
   * Vem junto porque sai da MESMA linha de `app_contas` que a preferência de
   * compartilhamento: buscar em duas chamadas seria uma ida à rede a mais por
   * abertura da tela, para ler dois inteiros que estão ali do lado. */
  informado: CicloInformado
}

export async function estadoDoCompartilhamento(
  contaId: string,
): Promise<EstadoDoCompartilhamento> {
  const [conta, vinculos] = await Promise.all([
    supabase
      .from('app_contas')
      .select('compartilha_ciclo, ciclo_duracao_informada, ciclo_fluxo_informado')
      .eq('id', contaId)
      .maybeSingle(),
    /* Lista, e não `maybeSingle()`.
     *
     * A chave primária de `app_vinculos` é (conta_id, nutricionista_id): uma
     * conta pode ter VÁRIOS vínculos, um por profissional. `maybeSingle()`
     * REJEITA quando volta mais de uma linha — a tela quebraria inteira, e
     * quebraria só para quem tem duas nutricionistas, que é o caso que ninguém
     * testa.
     *
     * E `paciente_id` pode ser nulo: vínculo sem paciente não tem ficha onde
     * escrever, então não conta como "tem nutricionista para mandar". */
    supabase.from('app_vinculos').select('paciente_id').eq('conta_id', contaId),
  ])

  if (conta.error) falha('Não consegui ler a sua preferência de compartilhamento.', conta.error)
  if (vinculos.error) falha('Não consegui verificar o seu vínculo.', vinculos.error)

  const validos = (vinculos.data ?? []).filter(v => v.paciente_id !== null)

  return {
    ligado: conta.data?.compartilha_ciclo === true,
    informado: {
      duracao: numeroOuNulo(conta.data?.ciclo_duracao_informada),
      diasDeFluxo: numeroOuNulo(conta.data?.ciclo_fluxo_informado),
    },
    /* EXATAMENTE um. Com dois, o servidor se recusa a mandar — escolher entre
       profissionais é decisão dela, e não há tela para isso —, e a chave tem de
       aparecer desligada aqui pelo mesmo motivo. */
    temNutricionista: validos.length === 1,
  }
}

/* O `smallint` chega como número, mas a coluna aceita nulo e o PostgREST pode
   devolver a linha inteira ausente. `Number(null)` é 0, e um ciclo de zero dias
   entraria em toda conta desta tela sem erro nenhum — por isso a conversão
   passa por aqui e não por um `Number()` solto. */
const numeroOuNulo = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/* O que ela respondeu sobre o próprio ciclo.
 *
 * ── Por que perguntar, em vez de assumir 28 ───────────────────────────────
 * A mulher sabe quanto dura o ciclo dela — é a primeira coisa que qualquer
 * médico pergunta. O app perguntava isso para a NUTRICIONISTA, no questionário,
 * e não perguntava para a dona do ciclo; e enquanto não perguntava, ou não
 * previa nada (primeiro mês inteiro sem o app servir para coisa nenhuma) ou
 * chutava a média da população.
 *
 * Os dois campos são independentes de propósito: dá para saber a duração e não
 * lembrar quantos dias de fluxo. Um `null` aqui quer dizer "ela não respondeu",
 * e não "zero" — ver `numeroOuNulo`.
 *
 * A validação de faixa mora no banco (`check` entre 15 e 45, e entre 1 e 15) e
 * também em `situacaoDoCiclo`, que descarta o que estiver fora antes de prever.
 * Repetido de propósito: o banco protege o dado, e a função protege a conta de
 * quem já tem um valor estranho gravado. */
export async function salvarCicloInformado(
  contaId: string,
  informado: CicloInformado,
): Promise<{ erro: string } | null> {
  const { error } = await supabase
    .from('app_contas')
    .update({
      ciclo_duracao_informada: informado.duracao,
      ciclo_fluxo_informado: informado.diasDeFluxo,
    })
    .eq('id', contaId)

  if (!error) return null
  return { erro: falha('Não consegui guardar os dados do seu ciclo agora.', error) }
}

/* ── O dia do calendário ───────────────────────────────────────────────────*/

/* Cada dia que ela toca no calendário pode virar uma linha aqui. Duas
 * categorias, e a diferença entre elas é o desenho todo:
 *
 *   O QUE SOBE para a nutricionista, quando ela ligou o compartilhamento:
 *   fluxo, sintomas, humor, vontade alimentar e o recado escrito PARA ela.
 *   Cólica e inchaço mudam o que se recomenda; vontade de doce na fase lútea é
 *   conversa de nutrição.
 *
 *   O QUE NUNCA SOBE: se teve relação, se foi com proteção, e a nota privada.
 *   Isso não é uma chave desligada — é ausência de código: a função de espelho
 *   no banco não lê essas três colunas. Quem quiser mandá-las vai ter de
 *   escrevê-las lá.
 *
 * A tela diz as duas coisas com todas as letras, e é por isso que os campos
 * ficam em blocos separados e não numa lista só. */

/* 'escape' é sangramento fora do período, e NÃO é fluxo leve: é outra coisa, e
   é justamente o que faz alguém procurar ajuda. Chamá-lo de leve some com a
   informação dentro da média. */
export type Fluxo = 'nenhum' | 'escape' | 'leve' | 'moderado' | 'intenso'
export type Humor = 'bem' | 'feliz' | 'irritada' | 'triste' | 'ansiosa' | 'oscilando'

/* As cinco categorias que vieram da comparação com o Clue.
 *
 * Todas têm a opção POSITIVA, e essa é a lição maior daquela comparação: sem
 * ela só quem está mal registra, e o padrão que o app devolve sai sempre
 * negativo — a pessoa abre e lê que fica mal todo mês, porque os dias bons ela
 * nunca teve onde marcar. */
export type Energia = 'energizada' | 'normal' | 'baixa' | 'exausta'
export type Digestao = 'bem' | 'inchada' | 'gases' | 'enjoada' | 'presa' | 'solta'
/* O marcador de fertilidade que a pessoa observa sem depender de exame. */
export type Secrecao = 'seca' | 'pegajosa' | 'cremosa' | 'clara_de_ovo' | 'atipica'
export type Cabeca = 'focada' | 'calma' | 'dispersa' | 'estressada'
export type Pele = 'boa' | 'oleosa' | 'seca' | 'acne'

export type DiaDoCiclo = {
  data: string
  fluxo: Fluxo | null
  sintomas: string[]
  humor: Humor | null
  energia: Energia | null
  digestao: Digestao | null
  secrecao: Secrecao | null
  cabeca: Cabeca | null
  pele: Pele | null
  desejoAlimentar: string[]
  observacao: string | null
  /* Os três que ficam. */
  relacao: boolean | null
  relacaoProtegida: boolean | null
  notaPrivada: string | null
}

type LinhaDia = {
  data: string
  fluxo: string | null
  sintomas: string[] | null
  humor: string | null
  energia: string | null
  digestao: string | null
  secrecao: string | null
  cabeca: string | null
  pele: string | null
  desejo_alimentar: string[] | null
  observacao: string | null
  relacao: boolean | null
  relacao_protegida: boolean | null
  nota_privada: string | null
}

/* Literal de uma linha só, e não concatenação.
 *
 * O cliente do Supabase lê ESTE texto em tempo de tipo para saber o formato do
 * retorno. Quebrado em duas partes com `+`, ele deixa de ser literal, a
 * inferência morre, e o `as LinhaDia` vira erro de conversão impossível.
 * Comprido é o preço. */
const COLUNAS_DIA =
  'data, fluxo, sintomas, humor, energia, digestao, secrecao, cabeca, pele, desejo_alimentar, observacao, relacao, relacao_protegida, nota_privada'

const doDia = (l: LinhaDia): DiaDoCiclo => ({
  data: l.data,
  fluxo: (l.fluxo as Fluxo | null) ?? null,
  sintomas: l.sintomas ?? [],
  humor: (l.humor as Humor | null) ?? null,
  energia: (l.energia as Energia | null) ?? null,
  digestao: (l.digestao as Digestao | null) ?? null,
  secrecao: (l.secrecao as Secrecao | null) ?? null,
  cabeca: (l.cabeca as Cabeca | null) ?? null,
  pele: (l.pele as Pele | null) ?? null,
  desejoAlimentar: l.desejo_alimentar ?? [],
  observacao: l.observacao,
  relacao: l.relacao,
  relacaoProtegida: l.relacao_protegida,
  notaPrivada: l.nota_privada,
})

export const diaVazio = (data: string): DiaDoCiclo => ({
  data,
  fluxo: null,
  sintomas: [],
  humor: null,
  energia: null,
  digestao: null,
  secrecao: null,
  cabeca: null,
  pele: null,
  desejoAlimentar: [],
  observacao: null,
  relacao: null,
  relacaoProtegida: null,
  notaPrivada: null,
})

export type ResultadoDias =
  | { tipo: 'ok'; dias: DiaDoCiclo[] }
  | { tipo: 'erro'; mensagem: string }

/* Os dias de um intervalo. A tela pede o mês inteiro de uma vez, e não um dia
   por célula: trinta e uma idas à rede para desenhar um calendário. */
export async function carregarDias(
  contaId: string,
  de: string,
  ate: string,
): Promise<ResultadoDias> {
  const { data, error } = await supabase
    .from('app_ciclo_dias')
    .select(COLUNAS_DIA)
    .eq('conta_id', contaId)
    .gte('data', de)
    .lte('data', ate)
    .order('data', { ascending: true })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o seu calendário agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', dias: ((data ?? []) as LinhaDia[]).map(doDia) }
}

/* Grava o dia inteiro de uma vez.
 *
 * Upsert por (conta_id, data): voltar num dia CORRIGE o que estava lá, e não
 * acrescenta linha. Sem isto, o segundo toque no mesmo dia levaria o erro de
 * chave única do Postgres para a tela — e "duplicate key value violates unique
 * constraint" não diz nada para quem só queria mudar de "leve" para "moderado". */
export async function salvarDia(
  contaId: string,
  d: DiaDoCiclo,
): Promise<{ tipo: 'ok'; dia: DiaDoCiclo } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_ciclo_dias')
    .upsert(
      {
        conta_id: contaId,
        data: d.data,
        fluxo: d.fluxo,
        sintomas: d.sintomas,
        humor: d.humor,
        energia: d.energia,
        digestao: d.digestao,
        secrecao: d.secrecao,
        cabeca: d.cabeca,
        pele: d.pele,
        desejo_alimentar: d.desejoAlimentar,
        observacao: d.observacao?.trim() || null,
        relacao: d.relacao,
        /* O banco recusa proteção sem relação, e com razão: seria um "sim"
           solto na tela. Aqui a coerência é garantida antes de sair. */
        relacaoProtegida: undefined,
        relacao_protegida: d.relacao === true ? d.relacaoProtegida : null,
        nota_privada: d.notaPrivada?.trim() || null,
      },
      { onConflict: 'conta_id,data' },
    )
    .select(COLUNAS_DIA)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar esse dia agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', dia: doDia(data as LinhaDia) }
}

/* O dia não tem nada anotado? Serve para não gravar linha vazia e para a tela
   saber se pinta o ponto. */
export const diaTemAlgo = (d: DiaDoCiclo): boolean =>
  d.fluxo !== null ||
  d.sintomas.length > 0 ||
  d.humor !== null ||
  d.energia !== null ||
  d.digestao !== null ||
  d.secrecao !== null ||
  d.cabeca !== null ||
  d.pele !== null ||
  d.desejoAlimentar.length > 0 ||
  (d.observacao ?? '').trim() !== '' ||
  d.relacao !== null ||
  (d.notaPrivada ?? '').trim() !== ''

/* Só o que SOBE. É o que a tela usa para dizer "isto aqui a sua nutricionista
   vê" sem repetir a regra em dois lugares — e para o ponto do calendário não
   revelar, sozinho, que aquele dia teve só coisa privada. */
export const diaTemAlgoClinico = (d: DiaDoCiclo): boolean =>
  d.fluxo !== null ||
  d.sintomas.length > 0 ||
  d.humor !== null ||
  d.energia !== null ||
  d.digestao !== null ||
  d.secrecao !== null ||
  d.cabeca !== null ||
  d.pele !== null ||
  d.desejoAlimentar.length > 0 ||
  (d.observacao ?? '').trim() !== ''

export async function apagarDia(contaId: string, data: string): Promise<{ erro: string } | null> {
  const { error } = await supabase
    .from('app_ciclo_dias')
    .delete()
    .eq('conta_id', contaId)
    .eq('data', data)
  if (!error) return null
  return { erro: falha('Não consegui limpar esse dia agora. Verifique a conexão.', error) }
}
