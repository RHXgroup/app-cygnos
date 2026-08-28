import { supabase } from './supabase'

/* Todos os valores são POR 100 g — é assim que a tabela guarda, e converter na
   hora de exibir é mais barato que converter na hora de gravar. */
export type Alimento = {
  id: number
  nome: string
  marca: string | null
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null

  /* ── O detalhe que a tabela já guardava e ninguém via ────────────────────
   *
   * Estas colunas existem em app_alimentos desde a migração 20260730000006, e
   * a função de busca devolve a linha inteira — elas chegavam ao aparelho e
   * eram descartadas por não estarem declaradas aqui.
   *
   * São o que a nutricionista pede para o paciente vigiar: gordura saturada e
   * trans no rótulo, e açúcar ADICIONADO, que é diferente do açúcar da fruta.
   * Todas continuam podendo ser null — a base não tem tudo de todo alimento, e
   * zero somaria como se fosse verdade. */
  gorduraSaturada: number | null
  gorduraTrans: number | null
  acucaresTotais: number | null
  acucaresAdicionados: number | null

  /* Classificação NOVA: 1 in natura, 2 ingrediente culinário, 3 processado,
     4 ultraprocessado. É a leitura mais direta que existe sobre a qualidade do
     que se está comendo, e ela já estava gravada. */
  nova: number | null
  grupo: string | null
}

export type ResultadoBusca =
  | { tipo: 'ok'; alimentos: Alimento[] }
  | { tipo: 'erro'; mensagem: string }

/* A busca passa por uma função no banco por causa do acento: comparar "maca"
   com "maçã" precisa do unaccent, que vive lá. A tabela é `app_alimentos`, do
   próprio app — ver a migração 20260730000006. */
export async function buscarAlimentos(termo: string): Promise<ResultadoBusca> {
  const { data, error } = await supabase.rpc('app_buscar_alimentos', { p_termo: termo })

  if (error) {
    /* Devolvido, e não engolido: sem isto, banco fora do ar, migração não
       aplicada e busca sem resultado viram a mesma lista vazia na tela — e não
       há como saber qual dos três é. */
    return { tipo: 'erro', mensagem: error.message }
  }

  /* O banco devolve as colunas em snake_case; o app fala camelCase. A tradução
     acontece aqui, na fronteira, e não espalhada pelas telas. */
  type Linha = Alimento & {
    gordura_saturada_g: number | null
    gordura_trans_g: number | null
    acucares_totais_g: number | null
    acucares_adicionados_g: number | null
  }

  const alimentos = ((data ?? []) as Linha[]).map(l => ({
    ...l,
    /* numeric volta como string do PostgREST quando não cabe em float sem
       perda — o Number cobre os dois casos, e null continua null. */
    gorduraSaturada: numero(l.gordura_saturada_g),
    gorduraTrans: numero(l.gordura_trans_g),
    acucaresTotais: numero(l.acucares_totais_g),
    acucaresAdicionados: numero(l.acucares_adicionados_g),
  }))

  return { tipo: 'ok', alimentos }
}

const numero = (v: number | null | undefined) =>
  v === null || v === undefined ? null : Number(v)

/* Como se lê a classificação NOVA. O número sozinho não diz nada a quem não
   conhece a escala, e é justamente quem não conhece que mais precisa da
   informação. */
export const NOME_NOVA: Record<number, string> = {
  1: 'In natura',
  2: 'Ingrediente culinário',
  3: 'Processado',
  4: 'Ultraprocessado',
}

/* Quanto do nutriente cabe na quantidade escolhida. Devolve null quando a base
   não tem o dado — zero seria mentira, e somaria como se fosse verdade. */
export function porcao(por100g: number | null, gramas: number): number | null {
  if (por100g === null || por100g === undefined) return null
  return (por100g * gramas) / 100
}
