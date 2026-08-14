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

  return { tipo: 'ok', alimentos: (data ?? []) as Alimento[] }
}

/* Quanto do nutriente cabe na quantidade escolhida. Devolve null quando a base
   não tem o dado — zero seria mentira, e somaria como se fosse verdade. */
export function porcao(por100g: number | null, gramas: number): number | null {
  if (por100g === null || por100g === undefined) return null
  return (por100g * gramas) / 100
}
