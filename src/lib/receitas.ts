import { porcao } from './alimentos'
import { supabase } from './supabase'
import type { AlimentoEscolhido, Nutrientes } from './plano'

/* Receitas do paciente: o que ele come junto e repete.
 *
 * Banana, aveia, leite e mel são quatro buscas e quatro quantidades — toda
 * manhã. E viram quatro linhas no diário, quando o que a pessoa comeu foi uma
 * coisa só: uma vitamina.
 *
 * ── O que a receita é, e o que ela não é ───────────────────────────────────
 * É um atalho de composição, não um cadastro paralelo de alimento. Ela existe
 * para virar consumo ou item de plano, e no diário chega DESMONTADA em
 * alimentos — que é o que a nutricionista precisa ver do outro lado. Uma linha
 * chamada "minha vitamina" não diria nada a ela.
 *
 * Ver a migração 20260828090000. */

export type ItemReceita = Nutrientes & {
  /* Chave de tela, como em plano.ts: o mesmo alimento pode entrar duas vezes. */
  chave: string
  alimentoId: number | null
  nome: string
  marca: string | null
  descricao: string
}

export type Receita = {
  id: string
  nome: string
  /* Quantas porções o total rende. Um por padrão — quem monta uma vitamina
     pensa no copo que vai beber, não em rendimento. */
  porcoes: number
  criadoEm: string
  itens: ItemReceita[]
}

export type ResultadoReceitas =
  | { tipo: 'ok'; receitas: Receita[] }
  | { tipo: 'erro'; mensagem: string }

const numero = (v: number | null) => (v === null || v === undefined ? null : Number(v))

type LinhaItem = {
  id: string
  alimento_id: number | null
  nome: string
  marca: string | null
  descricao: string
  gramas: number | null
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  posicao: number
}

type LinhaReceita = {
  id: string
  nome: string
  porcoes: number
  criado_em: string
  app_receita_itens: LinhaItem[]
}

const daLinha = (l: LinhaReceita): Receita => ({
  id: l.id,
  nome: l.nome,
  porcoes: l.porcoes,
  criadoEm: l.criado_em,
  itens: [...(l.app_receita_itens ?? [])]
    /* O banco não garante ordem sem ORDER BY na tabela aninhada, e uma lista
       que se reordena a cada leitura parece outra lista. */
    .sort((a, b) => a.posicao - b.posicao)
    .map(i => ({
      chave: i.id,
      alimentoId: i.alimento_id,
      nome: i.nome,
      marca: i.marca,
      descricao: i.descricao,
      gramasTotais: numero(i.gramas),
      caloriasPor100g: numero(i.calorias),
      proteinasPor100g: numero(i.proteinas),
      carboidratosPor100g: numero(i.carboidratos),
      gordurasPor100g: numero(i.gorduras),
      fibrasPor100g: numero(i.fibras),
    })),
})

const COLUNAS = `
  id, nome, porcoes, criado_em,
  app_receita_itens (
    id, alimento_id, nome, marca, descricao, gramas,
    calorias, proteinas, carboidratos, gorduras, fibras, posicao
  )
`

export async function carregarReceitas(contaId: string): Promise<ResultadoReceitas> {
  const { data, error } = await supabase
    .from('app_receitas')
    .select(COLUNAS)
    .eq('conta_id', contaId)
    .order('criado_em', { ascending: false })

  if (error) return { tipo: 'erro', mensagem: error.message }
  return { tipo: 'ok', receitas: ((data ?? []) as unknown as LinhaReceita[]).map(daLinha) }
}

export type ResultadoSalvar = { tipo: 'ok'; id: string } | { tipo: 'erro'; mensagem: string }

/* Grava a receita inteira numa transação. Ver o comentário da função no banco:
   inserts soltos daqui deixariam uma receita sem itens se a rede caísse no
   meio, e receita vazia é pior que receita nenhuma — parece que os alimentos
   sumiram. */
export async function salvarReceita({
  id,
  nome,
  porcoes,
  itens,
}: {
  id: string | null
  nome: string
  porcoes: number
  itens: ItemReceita[]
}): Promise<ResultadoSalvar> {
  const { data, error } = await supabase.rpc('app_salvar_receita', {
    p_receita_id: id,
    p_nome: nome.trim(),
    p_porcoes: porcoes,
    p_itens: itens.map(i => ({
      alimento_id: i.alimentoId,
      nome: i.nome,
      marca: i.marca,
      descricao: i.descricao,
      gramas: i.gramasTotais,
      calorias: i.caloriasPor100g,
      proteinas: i.proteinasPor100g,
      carboidratos: i.carboidratosPor100g,
      gorduras: i.gordurasPor100g,
      fibras: i.fibrasPor100g,
    })),
  })

  if (error) return { tipo: 'erro', mensagem: error.message }
  return { tipo: 'ok', id: data as string }
}

export async function apagarReceita(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_receitas').delete().eq('id', id)
  return error ? { erro: error.message } : null
}

/* ── Da receita para o prato ───────────────────────────────────────────────*/

/* Os alimentos de UMA porção, prontos para virar consumo ou item de plano.
 *
 * Dividir o peso pelo rendimento é o que faz a receita servir: uma vitamina que
 * rende dois copos e da qual se bebeu um vale metade de cada ingrediente. Os
 * nutrientes por 100 g não mudam — quem muda é a quantidade. */
export function porcaoDaReceita(receita: Receita, quantasPorcoes = 1): AlimentoEscolhido[] {
  const fator = quantasPorcoes / Math.max(receita.porcoes, 1)

  return receita.itens.map(i => ({
    chave: `${i.chave}-${quantasPorcoes}`,
    alimentoId: i.alimentoId,
    nome: i.nome,
    marca: i.marca,
    /* A descrição diz de onde veio, porque no diário estes itens aparecem
       soltos: sem isto, "banana 60 g" no meio do café da manhã não se liga à
       vitamina de onde saiu. */
    descricao: `${i.descricao} · ${receita.nome}`,
    gramasTotais: i.gramasTotais === null ? null : arredondar(i.gramasTotais * fator),
    caloriasPor100g: i.caloriasPor100g,
    proteinasPor100g: i.proteinasPor100g,
    carboidratosPor100g: i.carboidratosPor100g,
    gordurasPor100g: i.gordurasPor100g,
    fibrasPor100g: i.fibrasPor100g,
  }))
}

const arredondar = (n: number) => Math.round(n * 10) / 10

/* As calorias de uma porção, para a lista poder mostrar sem montar tudo.
   Null quando nenhum item tem peso ou caloria: zero diria que a receita não
   tem caloria, o que é diferente de não sabermos. */
export function caloriasDaPorcao(receita: Receita): number | null {
  let total = 0
  let houve = false

  for (const i of receita.itens) {
    if (i.gramasTotais === null) continue
    const v = porcao(i.caloriasPor100g, i.gramasTotais)
    if (v === null) continue
    total += v
    houve = true
  }

  if (!houve) return null
  return arredondar(total / Math.max(receita.porcoes, 1))
}
