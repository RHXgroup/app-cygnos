import { supabase } from './supabase'
import { falha } from './erros'
import { carregarConsumoPeriodo } from './consumo'
import { carregarPeso } from './peso'
import { gastoReal, type GastoReal } from './gastoReal'
import { tendenciaDoPeso } from './tendenciaDoPeso'
import { dataISO } from './formatar'
import {
  aplicarPrescricao,
  carregarMetasPrescritas,
  type CamposPrescritos,
  type MetasPrescritas,
} from './metasPrescritas'

/* Conjuntos de metas que a pessoa define para si mesma. Vários por conta, com um
 * ativo — como os planos alimentares e os cálculos energéticos. Ver a migração
 * 20260801000005.
 *
 * Nada aqui conversa com as metas do sistema web (metas_planos, metas_otimizadas
 * e companhia): aquilo é a ferramenta da nutricionista, com plano, períodos e
 * tarefas, presa à carteira dela. Estas metas são da conta do app e só dela. */

/* `null` é "não acompanho isso", e é diferente de zero em toda parte: uma meta
   de fibras nula não desenha barra de fibras nenhuma; uma meta de fibras zero
   desenharia uma barra sempre estourada. */
export type Metas = {
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  /* Água e copo sempre têm valor: a tela de Água precisa de um número para
     desenhar qualquer coisa, e "sem meta" ali não é um estado possível. */
  aguaMl: number
  copoMl: number
  passos: number | null
  /* Por semana, ao contrário de todo o resto. */
  treinosSemana: number | null
  sonoHoras: number | null
}

/* O conjunto salvo: as metas mais a identidade da linha. */
export type MetasSalvas = Metas & {
  id: string
  nome: string
  ativo: boolean
  criadoEm: string
}

export const AGUA_PADRAO_ML = 2000
export const COPO_PADRAO_ML = 250

/* Conta que nunca salvou nada não tem linha nenhuma, e isso não é erro. */
export const METAS_VAZIAS: Metas = {
  calorias: null,
  proteinas: null,
  carboidratos: null,
  gorduras: null,
  fibras: null,
  aguaMl: AGUA_PADRAO_ML,
  copoMl: COPO_PADRAO_ML,
  passos: null,
  treinosSemana: null,
  sonoHoras: null,
}

/* Os limites são os dos constraints do banco. Repetidos aqui de propósito: é o
   que deixa a tela recusar antes de enviar, com uma frase que explica — o erro
   do Postgres diria "violates check constraint" e mais nada. */
export const LIMITES = {
  calorias: { min: 500, max: 10000 },
  proteinas: { min: 1, max: 1000 },
  carboidratos: { min: 1, max: 1000 },
  gorduras: { min: 1, max: 1000 },
  fibras: { min: 1, max: 200 },
  aguaMl: { min: 500, max: 10000 },
  copoMl: { min: 50, max: 500 },
  passos: { min: 500, max: 100000 },
  treinosSemana: { min: 1, max: 14 },
  sonoHoras: { min: 3, max: 14 },
} as const

export type CampoMeta = keyof typeof LIMITES

export type ResultadoMetas =
  | {
      tipo: 'ok'
      /* O que vale AGORA: as pessoais com a prescrição da nutricionista por
         cima, campo a campo. É este o número que toda tela desenha. */
      metas: Metas
      /* Quais desses campos vieram dela. Vazio quando não há nutricionista, que
         é o caso da maior parte de quem baixa. A tela usa para poder dizer de
         quem é o número — sem isso, a pessoa vê a meta mudar sozinha e não tem
         como descobrir por quê. */
      prescritos: CamposPrescritos
      /* A prescrição crua, para quem precisa do nome do plano e do objetivo.
         Vem preenchida MESMO quando nada foi aplicado — plano detalhado, ou
         montado por semana — justamente para a tela conseguir explicar por que
         existe prescrição e os números não mudaram. */
      prescricao: MetasPrescritas | null
    }
  | { tipo: 'erro'; mensagem: string }
export type ResultadoListaMetas =
  | { tipo: 'ok'; lista: MetasSalvas[] }
  | { tipo: 'erro'; mensagem: string }

const COLUNAS =
  'id, nome, ativo, criado_em, calorias, proteinas, carboidratos, gorduras, fibras, agua_ml, copo_ml, passos, treinos_semana, sono_horas'

type LinhaMetas = {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  agua_ml: number
  copo_ml: number
  passos: number | null
  treinos_semana: number | null
  sono_horas: number | null
}

const daLinha = (l: LinhaMetas): MetasSalvas => ({
  id: l.id,
  nome: l.nome,
  ativo: l.ativo,
  criadoEm: l.criado_em,
  calorias: l.calorias,
  proteinas: l.proteinas,
  carboidratos: l.carboidratos,
  gorduras: l.gorduras,
  fibras: l.fibras,
  aguaMl: l.agua_ml,
  copoMl: l.copo_ml,
  passos: l.passos,
  treinosSemana: l.treinos_semana,
  /* numeric volta como string do PostgREST quando não cabe em float sem perda;
     o Number cobre os dois casos. */
  sonoHoras: l.sono_horas === null ? null : Number(l.sono_horas),
})

/* O conjunto que vale: o ativo da conta.
 *
 * A data entra como desempate, e não como filtro reserva — mesma lógica de
 * carregarPlanoAtivo: se por algum caminho a conta ficar sem ativo, vale o mais
 * recente, em vez de a tela voltar aos padrões e dizer que não há meta nenhuma. */
export async function carregarMetas(contaId: string): Promise<ResultadoMetas> {
  /* As duas juntas, e não uma depois da outra: são consultas independentes, e
     encadeá-las dobraria a espera da tela inicial por nada.

     `carregarMetasPrescritas` nunca rejeita nem devolve erro — sem vínculo, sem
     plano ou sem sinal, ela devolve null e o app fica com as metas pessoais. É
     o que impede uma consulta A MAIS de derrubar a tela de quem nunca teve
     nutricionista, que é a maior parte de quem usa. */
  const [{ data, error }, prescricao] = await Promise.all([
    supabase
      .from('app_metas')
      .select(COLUNAS)
      .eq('conta_id', contaId)
      .order('ativo', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    carregarMetasPrescritas(),
  ])

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar as suas metas. Verifique a conexão.', error),
    }

  const pessoais = data ? daLinha(data as LinhaMetas) : METAS_VAZIAS
  const { metas, prescritos } = aplicarPrescricao(pessoais, prescricao)
  return { tipo: 'ok', metas, prescritos, prescricao }
}

/* O mesmo, mas com a identidade da linha — para quem precisa saber QUAL conjunto
   está editando, e não só os números. */
export async function carregarMetasAtivas(
  contaId: string,
): Promise<{ tipo: 'ok'; metas: MetasSalvas | null } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_metas')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .order('ativo', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar as metas que estão valendo. Verifique a conexão.', error),
    }
  return { tipo: 'ok', metas: data ? daLinha(data as LinhaMetas) : null }
}

export async function carregarListaDeMetas(contaId: string): Promise<ResultadoListaMetas> {
  const { data, error } = await supabase
    .from('app_metas')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .order('criado_em', { ascending: false })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus conjuntos de metas. Verifique a conexão.', error),
    }
  return { tipo: 'ok', lista: ((data ?? []) as LinhaMetas[]).map(daLinha) }
}

const paraOBanco = (m: Metas) => ({
  calorias: m.calorias,
  proteinas: m.proteinas,
  carboidratos: m.carboidratos,
  gorduras: m.gorduras,
  fibras: m.fibras,
  agua_ml: m.aguaMl,
  copo_ml: m.copoMl,
  passos: m.passos,
  treinos_semana: m.treinosSemana,
  sono_horas: m.sonoHoras,
})

/* Grava um conjunto: novo quando `id` é null, sobrescreve quando vem preenchido.
 *
 * Tudo de uma vez, e não campo a campo: a tela tem um botão de salvar só, e uma
 * escrita por campo deixaria metade das metas novas e metade velhas se a rede
 * caísse no meio. */
export async function salvarMetas(
  contaId: string,
  { id, nome, metas }: { id: string | null; nome: string; metas: Metas },
): Promise<{ tipo: 'ok'; id: string } | { tipo: 'erro'; mensagem: string }> {
  if (id) {
    const { error } = await supabase
      .from('app_metas')
      .update({ nome: nome.trim(), ...paraOBanco(metas) })
      .eq('id', id)

    if (error)
      return {
        tipo: 'erro',
        mensagem: falha('Não consegui salvar as suas metas agora. Verifique a conexão.', error),
      }
    return { tipo: 'ok', id }
  }

  const { data, error } = await supabase
    .from('app_metas')
    /* Sem `ativo` no corpo: quem decide isso é o gatilho da tabela, que também
       desliga o anterior. Mandar daqui criaria um segundo lugar dizendo a mesma
       regra. */
    .insert({ conta_id: contaId, nome: nome.trim(), ...paraOBanco(metas) })
    .select('id')
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar as suas metas agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', id: data.id as string }
}

/* Passa a ser este o conjunto que vale. Desligar o anterior e ligar este é uma
   coisa só, e acontece no banco — ver a migração 20260801000005. */
export async function ativarMetas(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.rpc('app_ativar_metas', { p_metas_id: id })
  if (!error) return null
  return {
    erro: falha('Não consegui ativar este conjunto de metas agora. Verifique a conexão.', error),
  }
}

export async function apagarMetas(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_metas').delete().eq('id', id)
  if (!error) return null
  return {
    erro: falha('Não consegui remover este conjunto de metas agora. Verifique a conexão.', error),
  }
}

/* Só a meta de água, para a tela de Água poder ajustá-la sem abrir Metas.
 *
 * Escreve no conjunto ATIVO. Se não houver nenhum, cria — o gatilho da tabela o
 * faz nascer ativo. Duas idas em vez de um upsert porque `conta_id` deixou de
 * ser único quando as metas viraram lista, e sem chave única não há em cima do
 * que o ON CONFLICT resolver. */
export async function salvarMetaAgua(
  contaId: string,
  { metaMl, copoMl }: { metaMl: number; copoMl: number },
): Promise<{ erro: string } | null> {
  const valores = { agua_ml: Math.round(metaMl), copo_ml: Math.round(copoMl) }

  const { data, error } = await supabase
    .from('app_metas')
    .update(valores)
    .eq('conta_id', contaId)
    .eq('ativo', true)
    .select('id')

  if (error)
    return {
      erro: falha('Não consegui salvar a sua meta de água agora. Verifique a conexão.', error),
    }
  /* Alguma linha respondeu: era a ativa, e já está atualizada. */
  if ((data ?? []).length > 0) return null

  const { error: erroInsert } = await supabase
    .from('app_metas')
    .insert({ conta_id: contaId, nome: 'Minhas metas', ...paraOBanco({ ...METAS_VAZIAS, aguaMl: valores.agua_ml, copoMl: valores.copo_ml }) })

  return erroInsert ? { erro: erroInsert.message } : null
}

/* ── Foco do peso ──────────────────────────────────────────────────────────
   Mora em app_contas, e não numa linha de metas: é um por PESSOA. Ficando no
   conjunto, trocar de metas mudaria em silêncio o que foi marcado no Perfil —
   e um campo editado num lugar não pode mudar porque se mexeu em outro. */

export type ObjetivoPeso = 'perda' | 'manter' | 'ganho' | null

/* Como se lê o foco na tela. Verbo no infinitivo porque é sempre usado depois de
   "Seu foco é…" ou dentro de um botão. */
export const NOME_DO_OBJETIVO: Record<Exclude<ObjetivoPeso, null>, string> = {
  perda: 'Perder peso',
  manter: 'Manter o peso',
  ganho: 'Ganhar peso',
}

/* Nunca o índice cru quando o valor veio do BANCO.
 *
 * `NOME_DO_OBJETIVO[objetivo]` devolve undefined para qualquer palavra fora das
 * três, e duas telas faziam `.toLowerCase()` no resultado — o que não mostra
 * texto torto, DERRUBA a tela inteira por causa de um valor novo numa coluna.
 *
 * Ver a armadilha 10 do AGENTS.md. O texto de reserva admite que o app não
 * sabe, em vez de chutar um dos três: dizer "perder peso" para quem marcou
 * outra coisa é pior do que não dizer nada. */
export const nomeDoObjetivo = (o: string | null): string =>
  o === null ? 'sem foco definido' : (NOME_DO_OBJETIVO[o as Exclude<ObjetivoPeso, null>] ?? 'um foco que este app ainda não conhece')

export async function carregarObjetivoPeso(
  contaId: string,
): Promise<{ tipo: 'ok'; objetivo: ObjetivoPeso } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_contas')
    .select('objetivo_peso')
    /* maybeSingle: conta do Auth sem cadastro não é erro, é o caminho de teste. */
    .eq('id', contaId)
    .maybeSingle()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o seu foco de peso. Verifique a conexão.', error),
    }
  /* Filtrado, e não convertido com `as`.
   *
   * O `as` fazia o TypeScript acreditar que a coluna só tem os três valores, e
   * quem acredita não confere. Qualquer outra palavra passava por aqui intacta
   * e ia estourar lá na frente, na tela. Valor que o app não conhece vira null:
   * é o mesmo que "não escolheu", que é o único tratamento honesto para um foco
   * que ele não sabe seguir. */
  const cru = data?.objetivo_peso
  const conhecido = cru === 'perda' || cru === 'manter' || cru === 'ganho'
  return { tipo: 'ok', objetivo: conhecido ? cru : null }
}

export async function salvarObjetivoPeso(
  contaId: string,
  objetivo: ObjetivoPeso,
): Promise<{ erro: string } | null> {
  const { error } = await supabase
    .from('app_contas')
    .update({ objetivo_peso: objetivo })
    .eq('id', contaId)

  if (!error) return null
  return {
    erro: falha('Não consegui salvar o seu foco de peso agora. Verifique a conexão.', error),
  }
}

/* O movimento do peso vai no sentido que a pessoa pediu?
 *
 * `null` quando não dá para responder — sem foco declarado, ou sem variação que
 * conte. E null é resposta legítima: a tela mostra o fato e cala sobre o resto. */
export function seguindoOFoco(
  objetivo: ObjetivoPeso,
  sentido: 'ganho' | 'perda' | 'manteve',
): boolean | null {
  if (objetivo === null) return null

  /* Manutenção é o único caso em que ficar parado é o acerto — nos outros dois,
     não sair do lugar não é ir na direção pedida. */
  if (objetivo === 'manter') return sentido === 'manteve'
  if (sentido === 'manteve') return false

  return objetivo === sentido
}

/* ── Coerência entre calorias e macros ──────────────────────────────────────
   Quanto cada macro rende de energia: fatores de Atwater arredondados, os mesmos
   de qualquer rótulo. Iguais aos de lib/plano.ts de propósito — as duas contas
   têm de dar o mesmo número, senão a tela do plano e a das metas discordam. */
const KCAL_POR_GRAMA = { proteinas: 4, carboidratos: 4, gorduras: 9 } as const

/* As calorias que os macros escolhidos somam, ou null se nenhum foi definido.
 *
 * Serve para AVISAR, nunca para corrigir. Alguém que põe 2.000 kcal e macros que
 * somam 2.520 não cometeu um erro de digitação necessariamente — pode estar
 * mirando os macros e usando a caloria como referência frouxa. */
export function kcalDosMacros(m: Pick<Metas, 'proteinas' | 'carboidratos' | 'gorduras'>): number | null {
  if (m.proteinas === null && m.carboidratos === null && m.gorduras === null) return null

  return (
    (m.proteinas ?? 0) * KCAL_POR_GRAMA.proteinas +
    (m.carboidratos ?? 0) * KCAL_POR_GRAMA.carboidratos +
    (m.gorduras ?? 0) * KCAL_POR_GRAMA.gorduras
  )
}

/* Quantos por cento os macros estão longe da meta de calorias. Abaixo de 5% a
   tela não diz nada: arredondamento de grama sempre produz uma diferença
   pequena, e um aviso que aparece sempre deixa de ser lido. */
export const TOLERANCIA_KCAL = 0.05

export function diferencaDeCalorias(metas: Metas): { kcalMacros: number; diferenca: number } | null {
  const kcalMacros = kcalDosMacros(metas)
  if (kcalMacros === null || metas.calorias === null || metas.calorias <= 0) return null

  const diferenca = (kcalMacros - metas.calorias) / metas.calorias
  if (Math.abs(diferenca) < TOLERANCIA_KCAL) return null

  return { kcalMacros, diferenca }
}

/* ── O corpo dela, para as metas se calcularem sozinhas ────────────────────
 *
 * A tela de metas pedia onze números, e a pessoa que baixou um aplicativo de
 * nutrição não sabe quantos gramas de gordura deve comer por dia — é por isso
 * que ela baixou o aplicativo.
 *
 * O app já tinha tudo: peso na última pesagem, altura, nascimento e sexo na
 * conta, e o alvo do cálculo energético quando ela fez um. Faltava juntar.
 *
 * Três leituras em paralelo, e cada uma que falhar vira nulo em vez de derrubar
 * as outras: com peso e cálculo dá para sugerir; só com peso, não dá; e a tela
 * precisa saber a diferença sem receber um erro. */
export async function carregarCorpoDaConta(contaId: string): Promise<{
  pesoKg: number | null
  alturaCm: number | null
  idade: number | null
  sexo: 'M' | 'F' | null
  alvoKcalDoCalculo: number | null
}> {
  const [conta, peso, calculo] = await Promise.all([
    supabase
      .from('app_contas')
      .select('data_nascimento, genero, altura_cm')
      .eq('id', contaId)
      .maybeSingle(),
    supabase
      .from('app_peso_registros')
      .select('kg')
      .eq('conta_id', contaId)
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('app_calculos_energeticos')
      .select('alvo_kcal')
      .eq('conta_id', contaId)
      .order('ativo', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (conta.error) falha('Não consegui ler os seus dados para calcular as metas.', conta.error)
  if (peso.error) falha('Não consegui ler o seu último peso.', peso.error)
  if (calculo.error) falha('Não consegui ler o seu cálculo energético.', calculo.error)

  const n = (v: unknown): number | null => {
    const x = typeof v === 'string' ? Number(v) : v
    return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null
  }

  /* A idade sai do nascimento, e não é `ano de hoje menos ano de nascimento`:
     quem faz aniversário em dezembro seria envelhecido em onze meses, e a
     Mifflin conta 5 kcal por ano. */
  let idade: number | null = null
  const nasc = conta.data?.data_nascimento
  if (typeof nasc === 'string' && /^\d{4}-\d{2}-\d{2}/.test(nasc)) {
    const [a, m, d] = nasc.slice(0, 10).split('-').map(Number)
    const hoje = new Date()
    let anos = hoje.getFullYear() - a
    const jaFez = hoje.getMonth() + 1 > m || (hoje.getMonth() + 1 === m && hoje.getDate() >= d)
    if (!jaFez) anos--
    if (anos > 0 && anos < 120) idade = anos
  }

  /* O gênero da conta é texto livre do cadastro; a fórmula só conhece dois
     valores. Qualquer outra coisa vira nulo, e aí a sugestão não sai — melhor
     não sugerir do que sugerir pela fórmula errada. */
  const g = typeof conta.data?.genero === 'string' ? conta.data.genero.trim().toUpperCase() : ''
  const sexo = g.startsWith('M') ? 'M' : g.startsWith('F') ? 'F' : null

  return {
    pesoKg: n(peso.data?.kg),
    alturaCm: n(conta.data?.altura_cm),
    idade,
    sexo,
    alvoKcalDoCalculo: n(calculo.data?.alvo_kcal),
  }
}

/* O gasto MEDIDO dela, quando há registro suficiente.
 *
 * ── Por que isto vale mais que a fórmula ──────────────────────────────────
 * A análise pública do MacroFactor mostra que fórmula estática erra de 15 a 25%
 * por pessoa. Errar 20% em 2.000 kcal são 400 kcal por dia — quem come 400 a
 * mais do que pensa não emagrece, conclui que "dieta não funciona comigo", e
 * larga.
 *
 * A conta que substitui é aritmética simples: o que ela comeu, mais o que o
 * peso perdido valia. Mora em `gastoReal`, que é puro e tem teste; aqui só se
 * busca o que ela precisa.
 *
 * ── Oito semanas ──────────────────────────────────────────────────────────
 * Longo o bastante para a média ter chão e curto o bastante para o número
 * descrever o corpo de AGORA. Metabolismo se adapta em déficit prolongado, e um
 * gasto medido em seis meses de histórico descreveria uma pessoa que já mudou.
 *
 * Devolve null em qualquer falha — item 11. A tela cai na fórmula, que é o que
 * ela já fazia. */
/* Devolve o GASTO INTEIRO, e não só o número.
 *
 * Devolvia `.kcal` e jogava o resto fora — a média consumida, quanto o peso
 * andou, quantos dias entraram na conta. E é justamente esse resto que responde
 * a pergunta que vem depois do número: de onde ele saiu.
 *
 * `fraseDoGasto`, que existe para escrever isso, ficou sem chamador nenhum no
 * app por causa deste `?.kcal`. Apareceu na lista do `npm run orfaos`. */
export async function carregarGastoMedido(contaId: string): Promise<GastoReal | null> {
  const DIAS = 56

  const ate = new Date()
  const de = new Date()
  de.setDate(de.getDate() - DIAS)

  const [consumo, pesos] = await Promise.all([
    carregarConsumoPeriodo(contaId, dataISO(de), dataISO(ate)),
    carregarPeso(contaId),
  ])

  if (consumo.tipo !== 'ok' || pesos.tipo !== 'ok') return null

  /* Calorias somadas por dia. Itens sem caloria não entram — item 6: zero no
     lugar do desconhecido somaria como se fosse verdade, e aqui isso puxaria a
     média para baixo e inflaria o gasto. */
  const porDia = new Map<string, number>()
  for (const i of consumo.itens) {
    if (i.calorias === null) continue
    porDia.set(i.data, (porDia.get(i.data) ?? 0) + i.calorias)
  }

  return gastoReal(
    [...porDia].map(([data, calorias]) => ({ data, calorias: Math.round(calorias) })),
    /* A LINHA DE TENDÊNCIA, e não a balança: dois quilos entre duas pesagens
       podem ser água, e um gasto calculado em cima disso erraria por centenas
       de calorias. */
    tendenciaDoPeso(pesos.peso.registros).map(t => ({
      data: t.data,
      tendencia: t.tendencia,
    })),
  )
}
