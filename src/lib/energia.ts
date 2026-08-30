import { supabase } from './supabase'
import { falha } from './erros'

/* Cálculo energético: quanto o corpo gasta, e qual é o alvo a partir disso.
 *
 * As fórmulas são as mesmas do motor do sistema web (src/lib/calculoEnergetico.ts
 * de lá) — portadas, não importadas: são dois aplicativos separados, e nada aqui
 * lê a tabela `calculo_energetico`, que é da nutricionista.
 *
 * O que muda é a superfície. Lá são dezessete fórmulas à escolha de quem sabe
 * por que Cunningham exige massa livre de gordura. Aqui o app escolhe por idade
 * e explica a escolha, e a pessoa só responde o que sabe sobre a própria vida. */

export type Sexo = 'M' | 'F'

/* ── A fórmula ─────────────────────────────────────────────────────────────*/

export type Formula = 'mifflin' | 'fao_who_crianca'

/* Para mostrar um cálculo já salvo, onde só existe o slug gravado. */
export const NOME_DA_FORMULA: Record<Formula, string> = {
  mifflin: 'Mifflin-St Jeor',
  fao_who_crianca: 'FAO/OMS',
}

/* O slug vem do banco, e uma fórmula nova sairia como "undefined" no meio da
   linha do cálculo salvo. Ver a armadilha 10. */
export const nomeDaFormula = (f: string): string =>
  NOME_DA_FORMULA[f as Formula] ?? 'fórmula não identificada'

export type SobreAFormula = {
  chave: Formula
  nome: string
  porque: string
  /* Aviso que a tela precisa dar junto do resultado, ou null. */
  ressalva: string | null
}

/* Mifflin-St Jeor para adulto; FAO/OMS para quem ainda está crescendo.
 *
 * Mifflin é a mais validada para a população geral e usa exatamente os quatro
 * dados que o app tem. Katch-McArdle e Cunningham são mais precisas, MAS partem
 * da massa livre de gordura — que só sai de adipômetro ou bioimpedância.
 * Oferecê-las aqui seria prometer precisão que depende de um número que a pessoa
 * não tem, e receber um chute no lugar dele. */
export function formulaPara(idade: number): SobreAFormula {
  if (idade < 19) {
    return {
      chave: 'fao_who_crianca',
      nome: 'FAO/OMS',
      porque:
        'Em quem ainda está crescendo, as equações de adulto erram: parte da energia vai para o crescimento, e elas não contam isso.',
      ressalva:
        'Na fase de crescimento este número é uma estimativa grosseira. Nenhuma dieta deve ser montada com ele sem acompanhamento de uma nutricionista.',
    }
  }

  return {
    chave: 'mifflin',
    nome: 'Mifflin-St Jeor',
    porque:
      'É a equação mais validada para adultos e usa só peso, altura, idade e sexo — que é o que dá para saber sem exame nenhum.',
    ressalva: null,
  }
}

/* Taxa metabólica basal: o que o corpo gasta parado, só para funcionar.
   Coeficientes idênticos aos do motor do web. */
export function calcularTMB(
  formula: Formula,
  peso: number,
  alturaCm: number,
  idade: number,
  sexo: Sexo,
): number {
  if (formula === 'fao_who_crianca') {
    return sexo === 'M'
      ? idade < 3
        ? 60.9 * peso - 54
        : idade < 10
          ? 22.7 * peso + 495
          : 17.5 * peso + 651
      : idade < 3
        ? 61.0 * peso - 51
        : idade < 10
          ? 22.5 * peso + 499
          : 12.2 * peso + 746
  }

  return sexo === 'M'
    ? 10 * peso + 6.25 * alturaCm - 5 * idade + 5
    : 10 * peso + 6.25 * alturaCm - 5 * idade - 161
}

/* ── Atividade ─────────────────────────────────────────────────────────────*/

export type ChaveAtividade = 'sedentario' | 'pouco_ativo' | 'moderado' | 'muito_ativo' | 'extremo'

export type Atividade = {
  chave: ChaveAtividade
  rotulo: string
  /* O que a nutricionista vê no sistema web, palavra por palavra. */
  descricao: string
  fator: number
}

/* Os mesmos cinco níveis e os mesmos fatores do sistema web. Manter idênticos
   importa: no dia em que a nutricionista abrir os dois lados, os números têm de
   ser comparáveis — um app que usasse 1,4 onde o web usa 1,375 produziria uma
   divergência sem explicação. */
export const ATIVIDADES: Atividade[] = [
  {
    chave: 'sedentario',
    rotulo: 'Sedentário',
    descricao: 'Pouco ou nenhum exercício',
    fator: 1.2,
  },
  {
    chave: 'pouco_ativo',
    rotulo: 'Pouco ativo',
    descricao: 'Exercício leve 1 a 3× por semana',
    fator: 1.375,
  },
  {
    chave: 'moderado',
    rotulo: 'Moderadamente ativo',
    descricao: 'Exercício 3 a 5× por semana',
    fator: 1.55,
  },
  {
    chave: 'muito_ativo',
    rotulo: 'Muito ativo',
    descricao: 'Exercício intenso 6 a 7× por semana',
    fator: 1.725,
  },
  {
    chave: 'extremo',
    rotulo: 'Extremamente ativo',
    descricao: 'Atleta ou trabalho físico pesado',
    fator: 1.9,
  },
]

export const atividadePor = (chave: ChaveAtividade) =>
  ATIVIDADES.find(a => a.chave === chave) ?? ATIVIDADES[0]

/* ── O alvo ────────────────────────────────────────────────────────────────*/

/* Sugestões de ajuste por foco declarado no Perfil.
 *
 * Percentuais e não kcal fixas: -500 kcal é metade do gasto de uma pessoa
 * pequena e um quinto do de uma grande, e o mesmo número produziria dietas de
 * agressividade completamente diferente. */
export const AJUSTE_SUGERIDO = { perda: -15, manter: 0, ganho: 12 } as const

export const AJUSTE_MIN = -40
export const AJUSTE_MAX = 40

/* Quanto o alvo pode descer.
 *
 * O piso é a TMB, e é inegociável: abaixo dela o corpo não recebe o necessário
 * para funcionar em repouso. Um déficit de 30% sobre o GET de quem é sedentário
 * cai abaixo da TMB com facilidade — e o app não pode oferecer esse número num
 * campo livre e deixar a pessoa achar que ele foi calculado para ela. */
export const alvoDe = (get: number, ajustePct: number, tmb: number) =>
  Math.max(get * (1 + ajustePct / 100), tmb)

export const alvoFoiTravado = (get: number, ajustePct: number, tmb: number) =>
  get * (1 + ajustePct / 100) < tmb

/* Quantos quilos por semana um desvio de energia representa, em módulo.
 *
 * 7.700 kcal por quilo é a regra clássica de Wishnofsky. É uma aproximação
 * grosseira — na prática o corpo se adapta e o ritmo desacelera —, e a tela diz
 * "cerca de" por isso. Serve para dar ordem de grandeza a um percentual, que
 * sozinho não significa nada para ninguém. */
const KCAL_POR_KG = 7700

export const ritmoSemanal = (get: number, alvo: number) =>
  (Math.abs(alvo - get) * 7) / KCAL_POR_KG

/* ── Macros ────────────────────────────────────────────────────────────────*/

/* Proteína por quilo e carboidrato em porcentagem da energia — a mesma forma
   que o sistema web guarda, e a forma como se prescreve. A gordura é o que
   sobra: gravar os três criaria a chance de eles não fecharem 100%. */
export const KCAL_POR_GRAMA = { proteinas: 4, carboidratos: 4, gorduras: 9 } as const

/* Pontos de partida por foco. Proteína mais alta em déficit para preservar massa
   magra, que é o consenso; em ganho ela sobe pelo mesmo motivo, com o excedente
   indo para o carboidrato. */
export const MACROS_SUGERIDOS = {
  perda: { proteinaGkg: 1.8, carboPct: 40 },
  manter: { proteinaGkg: 1.6, carboPct: 50 },
  ganho: { proteinaGkg: 1.8, carboPct: 50 },
} as const

export type Macros = {
  proteinaG: number
  carboG: number
  gorduraG: number
  gorduraPct: number
  /* A gordura é o resto, e o resto pode ficar negativo se a proteína e o
     carboidrato juntos passarem do total. Nesse caso a combinação é impossível,
     e é a tela que precisa dizer isso — devolver zero calado esconderia o erro. */
  possivel: boolean
}

export function macrosDe(alvoKcal: number, peso: number, proteinaGkg: number, carboPct: number): Macros {
  const proteinaG = proteinaGkg * peso
  const proteinaPct = ((proteinaG * KCAL_POR_GRAMA.proteinas) / alvoKcal) * 100
  const gorduraPct = 100 - proteinaPct - carboPct

  return {
    proteinaG,
    carboG: ((carboPct / 100) * alvoKcal) / KCAL_POR_GRAMA.carboidratos,
    gorduraG: gorduraPct > 0 ? ((gorduraPct / 100) * alvoKcal) / KCAL_POR_GRAMA.gorduras : 0,
    gorduraPct: Math.max(0, gorduraPct),
    /* Abaixo de 15% de gordura a dieta deixa de ser praticável e começa a
       comprometer a absorção de vitaminas lipossolúveis e a produção hormonal. */
    possivel: gorduraPct >= 15,
  }
}

/* ── Banco ─────────────────────────────────────────────────────────────────*/

export type CalculoSalvo = {
  id: string
  nome: string
  peso: number
  alturaCm: number
  idade: number
  sexo: Sexo
  formula: Formula
  atividade: ChaveAtividade
  fatorAtividade: number
  tmb: number
  get: number
  ajustePct: number
  alvoKcal: number
  proteinaGkg: number
  carboPct: number
  ativo: boolean
  criadoEm: string
}

export type ResultadoCalculos =
  | { tipo: 'ok'; calculos: CalculoSalvo[] }
  | { tipo: 'erro'; mensagem: string }

const COLUNAS =
  'id, nome, peso, altura_cm, idade, sexo, formula, atividade, fator_atividade, tmb, get_total, ajuste_pct, alvo_kcal, proteina_gkg, carbo_pct, ativo, criado_em'

const daLinha = (l: Record<string, unknown>): CalculoSalvo => ({
  id: l.id as string,
  nome: l.nome as string,
  /* numeric volta como string do PostgREST quando não cabe em float sem perda. */
  peso: Number(l.peso),
  alturaCm: Number(l.altura_cm),
  idade: Number(l.idade),
  sexo: l.sexo as Sexo,
  formula: l.formula as Formula,
  atividade: l.atividade as ChaveAtividade,
  fatorAtividade: Number(l.fator_atividade),
  tmb: Number(l.tmb),
  get: Number(l.get_total),
  ajustePct: Number(l.ajuste_pct),
  alvoKcal: Number(l.alvo_kcal),
  proteinaGkg: Number(l.proteina_gkg),
  carboPct: Number(l.carbo_pct),
  ativo: Boolean(l.ativo),
  criadoEm: l.criado_em as string,
})

export async function carregarCalculos(contaId: string): Promise<ResultadoCalculos> {
  const { data, error } = await supabase
    .from('app_calculos_energeticos')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .order('criado_em', { ascending: false })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar os seus cálculos. Verifique a conexão.', error),
    }
  return { tipo: 'ok', calculos: (data ?? []).map(daLinha) }
}

/* O cálculo que vale: o ativo da conta.
 *
 * A data entra como desempate, e não como filtro reserva — mesma lógica de
 * carregarPlanoAtivo: se por algum caminho a conta ficar sem ativo, vale o mais
 * recente, em vez de a tela ficar dizendo que não há cálculo nenhum. */
export async function carregarCalculoAtivo(
  contaId: string,
): Promise<{ tipo: 'ok'; calculo: CalculoSalvo | null } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_calculos_energeticos')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .order('ativo', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o cálculo que está valendo. Verifique a conexão.', error),
    }
  return { tipo: 'ok', calculo: data ? daLinha(data) : null }
}

export type ParaSalvar = Omit<CalculoSalvo, 'id' | 'ativo' | 'criadoEm'>

export async function salvarCalculo(
  contaId: string,
  c: ParaSalvar,
): Promise<{ tipo: 'ok'; id: string } | { tipo: 'erro'; mensagem: string }> {
  const { data, error } = await supabase
    .from('app_calculos_energeticos')
    .insert({
      conta_id: contaId,
      nome: c.nome.trim(),
      peso: c.peso,
      altura_cm: c.alturaCm,
      idade: c.idade,
      sexo: c.sexo,
      formula: c.formula,
      atividade: c.atividade,
      fator_atividade: c.fatorAtividade,
      /* Arredondados na gravação: as colunas têm duas casas, e mandar o float
         cru só empurraria o arredondamento para o banco fazer em silêncio. */
      tmb: Math.round(c.tmb * 100) / 100,
      get_total: Math.round(c.get * 100) / 100,
      ajuste_pct: c.ajustePct,
      alvo_kcal: Math.round(c.alvoKcal * 100) / 100,
      proteina_gkg: c.proteinaGkg,
      carbo_pct: c.carboPct,
    })
    .select('id')
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar o cálculo agora. Verifique a conexão.', error),
    }
  return { tipo: 'ok', id: data.id as string }
}

/* Passa a ser este o cálculo que vale. Desligar o anterior e ligar este é uma
   coisa só, e acontece no banco — ver a migração 20260801000004. */
export async function ativarCalculo(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.rpc('app_ativar_calculo', { p_calculo_id: id })
  if (!error) return null
  return {
    erro: falha('Não consegui ativar este cálculo agora. Verifique a conexão.', error),
  }
}

export async function apagarCalculo(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_calculos_energeticos').delete().eq('id', id)
  if (!error) return null
  return {
    erro: falha('Não consegui remover este cálculo agora. Verifique a conexão.', error),
  }
}

/* A altura fica no cadastro para não ser perguntada a cada cálculo. */
export async function salvarAltura(contaId: string, alturaCm: number): Promise<{ erro: string } | null> {
  const { error } = await supabase
    .from('app_contas')
    .update({ altura_cm: Math.round(alturaCm) })
    .eq('id', contaId)

  if (!error) return null
  return {
    erro: falha('Não consegui salvar a sua altura agora. Verifique a conexão.', error),
  }
}

/* '1990-04-27' → idade em anos completos hoje. Contada na mão porque a
   diferença de datas em milissegundos erra em ano bissexto. */
export function idadeDe(nascimentoISO: string, hoje = new Date()): number {
  const [ano, mes, dia] = nascimentoISO.split('-').map(Number)
  let idade = hoje.getFullYear() - ano
  const jaFezAniversario =
    hoje.getMonth() + 1 > mes || (hoje.getMonth() + 1 === mes && hoje.getDate() >= dia)
  if (!jaFezAniversario) idade--
  return idade
}
