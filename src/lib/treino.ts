import { dataISO } from './formatar'
import { supabase } from './supabase'
import { falha } from './erros'
import type { DiaSemana } from './plano'

/* Treino: a rotina que a pessoa monta e as sessões que ela de fato fez.
 *
 * Era a última opção do "+" que ainda caía em "Em breve". As tabelas existem
 * desde agosto, completamente desenhadas, e nenhuma linha do app as usava — ver
 * a migração 20260803000002.
 *
 * ── Duas coisas diferentes, de propósito ───────────────────────────────────
 * A ROTINA é o que se pretende fazer em cada dia da semana: "segunda é peito e
 * tríceps, com supino 4x8". Ela quase não muda.
 *
 * A SESSÃO é o que aconteceu: "segunda-feira, 50 minutos, esforço 4". É o que
 * se registra, e é o que a nutricionista lê para estimar gasto e ver constância.
 *
 * ── Por que a sessão guarda tempo e esforço, e não séries e cargas ─────────
 * Isto é um app de NUTRIÇÃO. O que a nutricionista faz com treino é estimar
 * gasto e ver constância; quanto a pessoa levantou no supino não entra em conta
 * nenhuma dela. Série, repetição e carga ficam na ROTINA, onde servem de
 * lembrete para quem treina. */

/* ── A rotina ──────────────────────────────────────────────────────────────*/

export type Exercicio = {
  id: string
  dia: DiaSemana
  nome: string
  ordem: number
  series: number | null
  /* Texto, e não número: "8-12", "até a falha" e "30s" são respostas comuns, e
     nenhuma delas cabe num inteiro. */
  repeticoes: string | null
  cargaKg: number | null
  observacao: string | null
  /* O nome do exercício ORIGINAL, quando este entrou no lugar dele por causa de
     uma limitação física. Nulo no exercício comum.

     Existe para a rotina continuar legível: "Leg press" sozinho, no lugar onde
     havia "Agachamento livre", some sem explicação — e daqui a um mês ninguém,
     nem ela, sabe por que mudou. É também o que a nutricionista precisa ver, já
     que o resultado sozinho não conta que houve uma troca. */
  adaptadoDe: string | null
  /* Segundos de descanso ENTRE AS SÉRIES deste exercício.
   *
   * Era texto dentro de `observacao` — a frase "Descanso 90s", que a IA
   * devolvia como número e o app transformava em prosa. Dado que vira frase não
   * volta a ser dado: o cronômetro não tinha como saber quanto descansar, e por
   * isso descansava sempre o mesmo tempo escolhido na mão, em toda série de todo
   * treino. É a diferença entre um cronômetro e um treino. */
  descansoSeg: number | null
}

export type ResultadoRotina =
  | { tipo: 'ok'; exercicios: Exercicio[] }
  | { tipo: 'erro'; mensagem: string }

const numero = (v: number | null) => (v === null || v === undefined ? null : Number(v))

type LinhaExercicio = {
  id: string
  dia: number
  nome: string
  ordem: number
  series: number | null
  repeticoes: string | null
  carga_kg: number | null
  observacao: string | null
  adaptado_de: string | null
  descanso_seg: number | null
}

const COLUNAS_EXERCICIO =
  'id, dia, nome, ordem, series, repeticoes, carga_kg, observacao, adaptado_de, descanso_seg'

const doExercicio = (l: LinhaExercicio): Exercicio => ({
  id: l.id,
  dia: l.dia as DiaSemana,
  nome: l.nome,
  ordem: l.ordem,
  series: numero(l.series),
  repeticoes: l.repeticoes,
  cargaKg: numero(l.carga_kg),
  observacao: l.observacao,
  adaptadoDe: l.adaptado_de ?? null,
  descansoSeg: numero(l.descanso_seg),
})

/* A rotina inteira, de todos os dias. A tela mostra um dia por vez, mas a
   consulta traz tudo: são poucas linhas, e uma ida por dia da semana seriam
   sete idas para montar uma tela só. */
export async function carregarRotina(contaId: string): Promise<ResultadoRotina> {
  const { data, error } = await supabase
    .from('app_treino_exercicios')
    .select(COLUNAS_EXERCICIO)
    .eq('conta_id', contaId)
    .order('dia', { ascending: true })
    .order('ordem', { ascending: true })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar a sua rotina de treino. Verifique a conexão.', error),
    }
  return { tipo: 'ok', exercicios: ((data ?? []) as LinhaExercicio[]).map(doExercicio) }
}

export type ExercicioNovo = Omit<Exercicio, 'id'>

export async function adicionarExercicio(
  contaId: string,
  e: ExercicioNovo,
): Promise<{ tipo: 'ok'; exercicio: Exercicio } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_treino_exercicios')
    .insert({
      conta_id: contaId,
      dia: e.dia,
      nome: e.nome.trim(),
      ordem: e.ordem,
      series: e.series,
      repeticoes: e.repeticoes?.trim() || null,
      carga_kg: e.cargaKg,
      observacao: e.observacao?.trim() || null,
      adaptado_de: e.adaptadoDe?.trim() || null,
      descanso_seg: e.descansoSeg,
    })
    .select(COLUNAS_EXERCICIO)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui adicionar o exercício agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', exercicio: doExercicio(data as LinhaExercicio) }
}

/* Corrige um exercício que já está na rotina.
 *
 * Existe porque a ficha vem de FOTO de letra pequena, e o nome sai errado de
 * vez em quando. Enquanto só dava para remover, corrigir "Rosca dirota" custava
 * apagar a linha e redigitar as quatro informações — que é justamente o
 * trabalho que a importação por foto existe para poupar.
 *
 * Não toca em `adaptado_de`: corrigir a grafia de um exercício adaptado não
 * desfaz a adaptação, e apagar a origem aqui seria perder a única pista de que
 * houve troca. Quem mexe naquela coluna é a `trocarPorAdaptado`, abaixo.
 *
 * Nem em `dia` e `ordem`: mudar de dia é mover o bloco, e tem caminho próprio
 * na conferência da rotina. */
export async function editarExercicio(
  id: string,
  campos: { nome: string; series: number | null; repeticoes: string | null; cargaKg: number | null },
): Promise<{ tipo: 'ok'; exercicio: Exercicio } | { tipo: 'erro'; mensagem: string }> {
  const nome = campos.nome.trim()
  if (nome.length < 2) {
    return { tipo: 'erro', mensagem: 'Dê um nome ao exercício.' }
  }

  const { data, error } = await supabase
    .from('app_treino_exercicios')
    .update({
      nome,
      series: campos.series,
      repeticoes: campos.repeticoes?.trim() || null,
      carga_kg: campos.cargaKg,
    })
    .eq('id', id)
    .select(COLUNAS_EXERCICIO)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar a alteração agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', exercicio: doExercicio(data as LinhaExercicio) }
}

/* Troca o nome de um exercício por causa de uma limitação, guardando qual era.
 *
 * Uma função só para isto, e não um `atualizarExercicio` genérico, porque as
 * duas colunas andam juntas: gravar o nome novo sem gravar o antigo apaga a
 * única pista de que houve troca, e é exatamente o descuido que um atualizador
 * de campos soltos convida. */
export async function trocarPorAdaptado(
  id: string,
  nomeNovo: string,
  nomeOriginal: string,
): Promise<{ tipo: 'ok'; exercicio: Exercicio } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_treino_exercicios')
    .update({ nome: nomeNovo.trim(), adaptado_de: nomeOriginal.trim() })
    .eq('id', id)
    .select(COLUNAS_EXERCICIO)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui trocar o exercício agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', exercicio: doExercicio(data as LinhaExercicio) }
}

/* O descanso que ela ajustou no meio do treino.
 *
 * Grava e segue: se falhar, o ajuste vale para a sessão de hoje e volta ao
 * anterior amanhã. Interromper um treino com "não consegui salvar o descanso"
 * seria trocar um incômodo pequeno por um grande — e ela está com a barra na
 * mão. O erro vai para o console, que é onde eu leio. */
export async function salvarDescanso(id: string, segundos: number): Promise<void> {
  const { error } = await supabase
    .from('app_treino_exercicios')
    .update({ descanso_seg: segundos })
    .eq('id', id)
  if (error) falha('Não consegui guardar o descanso deste exercício.', error)
}

/* A carga que ela ajustou no meio do treino, guardada no exercício.
 *
 * ── A assimetria que isto conserta ────────────────────────────────────────
 * O DESCANSO ajustado já persistia; a CARGA não. Ela subia o peso na terceira
 * semana, o número ia para a série registrada — e o exercício continuava com o
 * peso da primeira semana, para ser corrigido de novo no treino seguinte.
 *
 * E é justamente a carga que muda toda semana: progressão de carga é o motivo
 * de um treino de força existir. O campo que mais muda era o único que não
 * lembrava. */
export async function salvarCarga(id: string, kg: number | null): Promise<void> {
  const { error } = await supabase
    .from('app_treino_exercicios')
    .update({ carga_kg: kg })
    .eq('id', id)
  if (error) falha('Não consegui guardar a carga deste exercício.', error)
}

export async function apagarExercicio(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_treino_exercicios').delete().eq('id', id)
  if (!error) return null
  return {
    erro: falha('Não consegui remover o exercício agora. Verifique a conexão.', error),
  }
}

/* ── As sessões ────────────────────────────────────────────────────────────*/

export type Sessao = {
  id: string
  data: string
  /* De qual dia da rotina veio, quando veio. Nulo quando foi treino avulso —
     jogar bola no sábado é treino e não está em rotina nenhuma. */
  dia: DiaSemana | null
  /* Como a pessoa chamou, quando não veio da rotina: "corrida", "natação". */
  titulo: string | null
  duracaoMin: number | null
  /* 1 a 5, percepção de esforço. Mesma escala da qualidade do sono: duas
     escalas diferentes no mesmo app seriam duas chances de ler errado. */
  esforco: number | null
  observacao: string | null
  /* A foto do treino, quando ela tirou uma. CAMINHO no bucket privado, e nao
     endereco: endereco assinado vence em uma hora, e guardar um na linha faria
     a foto quebrar depois do almoco (item 7 do AGENTS.md). */
  fotoPath: string | null
}

export type ResultadoSessoes =
  | { tipo: 'ok'; sessoes: Sessao[] }
  | { tipo: 'erro'; mensagem: string }

type LinhaSessao = {
  id: string
  data: string
  dia: number | null
  titulo: string | null
  duracao_min: number | null
  esforco: number | null
  observacao: string | null
  foto_path?: string | null
}

const daSessao = (l: LinhaSessao): Sessao => ({
  id: l.id,
  data: l.data,
  dia: l.dia === null ? null : (l.dia as DiaSemana),
  titulo: l.titulo,
  duracaoMin: numero(l.duracao_min),
  esforco: numero(l.esforco),
  observacao: l.observacao,
  fotoPath: l.foto_path ?? null,
})

const COLUNAS_SESSAO =
  'id, data, dia, titulo, duracao_min, esforco, observacao, foto_path'

/* As últimas sessões, da mais recente para a mais antiga. */
export async function carregarSessoes(
  contaId: string,
  quantas = 30,
): Promise<ResultadoSessoes> {
  const { data, error } = await supabase
    .from('app_treino_sessoes')
    .select(COLUNAS_SESSAO)
    .eq('conta_id', contaId)
    .order('data', { ascending: false })
    .order('registrado_em', { ascending: false })
    .limit(quantas)

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus treinos. Verifique a conexão.', error),
    }
  return { tipo: 'ok', sessoes: ((data ?? []) as LinhaSessao[]).map(daSessao) }
}

export type SessaoNova = {
  dia: DiaSemana | null
  titulo: string | null
  duracaoMin: number | null
  esforco: number | null
  observacao: string | null
}

export async function registrarSessao(
  contaId: string,
  s: SessaoNova,
  quando = new Date(),
): Promise<{ tipo: 'ok'; sessao: Sessao } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_treino_sessoes')
    .insert({
      conta_id: contaId,
      data: dataISO(quando),
      dia: s.dia,
      titulo: s.titulo?.trim() || null,
      duracao_min: s.duracaoMin,
      esforco: s.esforco,
      observacao: s.observacao?.trim() || null,
    })
    .select(COLUNAS_SESSAO)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui registrar o treino agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', sessao: daSessao(data as LinhaSessao) }
}

/* Refina uma sessão que já foi registrada.
 *
 * Existe por causa da ordem em que a tela pergunta as coisas. Antes ela pedia
 * tempo e esforço ANTES do botão: nada era obrigatório, mas três campos em cima
 * e o botão embaixo se leem como formulário, e formulário é o que faz alguém
 * desistir de anotar que treinou.
 *
 * Agora registra primeiro, com um toque, e o tempo e o esforço viram uma linha
 * opcional DEPOIS — em cima de uma sessão que já existe. Quem não tocar, não
 * perde nada: a marca de que houve treino é o dado que sustenta a constância, e
 * ela já está gravada. */
export async function refinarSessao(
  id: string,
  campos: { duracaoMin?: number | null; esforco?: number | null; fotoPath?: string | null },
): Promise<{ tipo: 'ok'; sessao: Sessao } | { tipo: 'erro'; mensagem: string }> {
  const mudanca: Record<string, number | string | null> = {}
  if ('duracaoMin' in campos) mudanca.duracao_min = campos.duracaoMin ?? null
  if ('esforco' in campos) mudanca.esforco = campos.esforco ?? null
  /* CAMINHO, e não endereço: endereço assinado vence em uma hora, e guardar um
     na linha faria a foto quebrar depois do almoço (item 7). */
  if ('fotoPath' in campos) mudanca.foto_path = campos.fotoPath ?? null

  const { data, error } = await supabase
    .from('app_treino_sessoes')
    .update(mudanca)
    .eq('id', id)
    .select(COLUNAS_SESSAO)
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar esse detalhe agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', sessao: daSessao(data as LinhaSessao) }
}

export async function apagarSessao(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_treino_sessoes').delete().eq('id', id)
  if (!error) return null
  return {
    erro: falha('Não consegui apagar este treino agora. Verifique a conexão.', error),
  }
}

/* ── Leitura ───────────────────────────────────────────────────────────────*/

/* Como se lê o esforço. O número sozinho não diz nada a quem não conhece a
   escala, e é justamente quem não conhece que vai marcar. */
export const NOME_DO_ESFORCO: Record<number, string> = {
  1: 'Muito leve',
  2: 'Leve',
  3: 'Moderado',
  4: 'Puxado',
  5: 'Máximo',
}

/* A escala é de 1 a 5, e o número vem do banco. Um 0 ou um 7 — de uma versão
   futura, ou de um registro torto — sairia como "undefined" ao lado da duração
   da sessão. Ver a armadilha 10. */
export const nomeDoEsforco = (n: number): string => NOME_DO_ESFORCO[n] ?? `esforço ${n}`

/* Quantas sessões nos últimos sete dias. É a leitura que interessa: constância,
   e não total histórico — quem treinou 200 vezes no ano passado e nenhuma neste
   mês não está treinando. */
export function sessoesNaSemana(sessoes: Sessao[], hoje = new Date()): number {
  const limite = new Date(hoje)
  limite.setDate(limite.getDate() - 6)
  const de = dataISO(limite)
  const ate = dataISO(hoje)

  return sessoes.filter(s => s.data >= de && s.data <= ate).length
}

/* A sequência de dias seguidos com treino, terminando hoje ou ontem.
 *
 * Ontem entra: quem treinou ontem e ainda não treinou hoje às nove da manhã não
 * perdeu a sequência — perderia só se o dia acabasse sem treino. Cortar no
 * relógio faria a sequência sumir toda manhã e voltar toda noite. */
export function sequencia(sessoes: Sessao[], hoje = new Date()): number {
  if (sessoes.length === 0) return 0

  const dias = new Set(sessoes.map(s => s.data))
  const cursor = new Date(hoje)

  /* Começa em hoje; se hoje não tem, tenta ontem antes de desistir. */
  if (!dias.has(dataISO(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!dias.has(dataISO(cursor))) return 0
  }

  let total = 0
  while (dias.has(dataISO(cursor))) {
    total++
    cursor.setDate(cursor.getDate() - 1)
  }

  return total
}

/* ── A série feita ─────────────────────────────────────────────────────────*/

/* O que foi LEVANTADO, e não o que estava planejado.
 *
 * `app_treino_exercicios.carga_kg` é uma linha só, sobrescrita: é o plano. Sem
 * esta tabela, "há seis semanas você fazia 40 kg, hoje fez 55" era impossível
 * de dizer — não por falta de tela, por falta de dado. O app pedia, guardava, e
 * no fim da semana a pessoa não levava nada.
 *
 * E não custa um toque a mais: o modo treino já tem o "fiz a série", e ele
 * passa a gravar peso e repetição JÁ PREENCHIDOS com o plano. Só mexe quem
 * mudou a carga — que é exatamente quem quer que aquilo fique registrado. */

export type SerieFeita = {
  exercicioId: string | null
  nome: string
  data: string
  serie: number
  cargaKg: number | null
  repeticoes: number | null
}

type LinhaSerie = {
  exercicio_id: string | null
  nome: string
  data: string
  serie: number
  carga_kg: number | null
  repeticoes: number | null
}

const daSerie = (l: LinhaSerie): SerieFeita => ({
  exercicioId: l.exercicio_id,
  nome: l.nome,
  data: l.data,
  serie: l.serie,
  cargaKg: numero(l.carga_kg),
  repeticoes: l.repeticoes,
})

const COLUNAS_SERIE = 'exercicio_id, nome, data, serie, carga_kg, repeticoes'

/* Grava a série, ou corrige a que já estava lá.
 *
 * Upsert pela mesma (exercício, dia, número): tocar duas vezes por engano não
 * vira duas séries, e voltar para ajustar o peso corrige em vez de acrescentar.
 *
 * Nunca rejeita para a tela. Está no meio de um treino: falhar em gravar uma
 * série não pode parar a sessão nem abrir uma caixa de erro com a pessoa
 * segurando a barra. O que se perde é uma linha de histórico; o que se
 * perderia interrompendo é o treino. */
export async function gravarSerie(contaId: string, s: SerieFeita): Promise<void> {
  const { error } = await supabase.from('app_treino_series').upsert(
    {
      conta_id: contaId,
      exercicio_id: s.exercicioId,
      nome: s.nome.trim() || 'Exercício',
      data: s.data,
      serie: s.serie,
      carga_kg: s.cargaKg,
      repeticoes: s.repeticoes,
    },
    { onConflict: 'conta_id,exercicio_id,data,serie' },
  )
  if (error) falha('Não consegui guardar essa série.', error)
}

export type UltimaVez = {
  data: string
  series: number
  /* A maior carga daquele dia. A maior, e não a média: é o que a pessoa lembra
     e é o que ela quer bater. */
  cargaKg: number | null
  repeticoes: number | null
}

/* O que ela fez neste exercício da ÚLTIMA vez, antes de hoje.
 *
 * É a informação que qualquer pessoa na academia procura no caderninho, e a que
 * transforma o modo treino de cronômetro em acompanhamento.
 *
 * Busca pelo id do exercício, e não pelo nome: exercício adaptado troca de nome
 * e mantém o id, e é a mesma história. */
export async function ultimaVezDoExercicio(
  contaId: string,
  exercicioId: string,
  hoje: string,
): Promise<UltimaVez | null> {
  const { data, error } = await supabase
    .from('app_treino_series')
    .select(COLUNAS_SERIE)
    .eq('conta_id', contaId)
    .eq('exercicio_id', exercicioId)
    .lt('data', hoje)
    .order('data', { ascending: false })
    .limit(20)

  if (error) {
    falha('Não consegui ver o que você fez da última vez.', error)
    return null
  }

  const linhas = ((data ?? []) as LinhaSerie[]).map(daSerie)
  if (linhas.length === 0) return null

  /* Só o dia mais recente. As 20 linhas cobrem com folga um dia de séries, e
     pegar mais de um dia misturaria treinos diferentes na mesma frase. */
  const dia = linhas[0].data
  const doDia = linhas.filter(l => l.data === dia)

  const cargas = doDia.map(l => l.cargaKg).filter((c): c is number => c !== null)
  const reps = doDia.map(l => l.repeticoes).filter((r): r is number => r !== null)

  return {
    data: dia,
    series: doDia.length,
    cargaKg: cargas.length ? Math.max(...cargas) : null,
    repeticoes: reps.length ? Math.max(...reps) : null,
  }
}

/* Tudo o que foi feito nestes exercícios ANTES de hoje.
 *
 * Uma ida à rede para o resumo inteiro, e não uma por exercício: a tela de fim
 * de treino aparece quando a pessoa acabou de terminar, e é o pior momento para
 * ela esperar seis chamadas em fila.
 *
 * O teto de 400 linhas cobre meses de histórico de um treino de seis
 * exercícios. Acima disso o que sobra são séries antigas, e o resumo só olha o
 * dia mais recente de cada um mesmo. */
export async function historicoDosExercicios(
  contaId: string,
  exercicioIds: string[],
  hoje: string,
): Promise<SerieFeita[]> {
  if (exercicioIds.length === 0) return []

  const { data, error } = await supabase
    .from('app_treino_series')
    .select(COLUNAS_SERIE)
    .eq('conta_id', contaId)
    .in('exercicio_id', exercicioIds)
    .lt('data', hoje)
    .order('data', { ascending: false })
    .limit(400)

  if (error) {
    /* Silêncio: sem histórico o resumo mostra o treino de hoje e não compara.
       Uma caixa de erro no fim do treino trocaria a recompensa por um aviso. */
    falha('Não consegui carregar o seu histórico de treino.', error)
    return []
  }
  return ((data ?? []) as LinhaSerie[]).map(daSerie)
}
