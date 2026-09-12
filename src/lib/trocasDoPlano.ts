import { supabase } from './supabase'
import { falha } from './erros'
import { rotuloDaTroca, type TrocaLida } from './rotuloDaTroca.ts'

/* As trocas de cada item do plano -- o "pode trocar por" da página do link.
 *
 * ──────────────────── De onde vêm ────────────────────
 * De `plano_item_substituicoes`, que a nutricionista preenche item a item no
 * sistema. O app do paciente lê pela função `app_substituicoes_do_plano()`
 * (migração 20260911220000), que recorta pelo MESMO critério de
 * `app_plano_do_paciente` -- qual plano é dele e quais itens ele vê.
 *
 * ──────────────────── Nunca derruba o plano ────────────────────
 * Devolve mapa vazio quando falha. O plano é o essencial; a troca é o
 * acessório, e perder a lista de refeições porque uma leitura secundária falhou
 * seria trocar um pelo outro. Item 11. */
export type TrocaDoItem = {
  nome: string
  /* "269 g", "2 unidades" -- já pronto para a tela. */
  detalhe: string | null
}

/* Chave: o id do item, em TEXTO -- é assim que os dois lados guardam o item
   (`ItemSalvo.id` é `String(item_id)`), e casar número com texto daria um mapa
   que nunca encontra nada. */
export type TrocasPorItem = Map<string, TrocaDoItem[]>

type Linha = {
  item_id: number | string | null
  nome: string | null
  quantidade_g: number | string | null
  medida_caseira: string | null
}

export async function trocasDoMeuPlano(): Promise<TrocasPorItem> {
  try {
    const { data, error } = await supabase.rpc('app_substituicoes_do_plano')
    if (error) {
      falha('Não consegui ler as trocas do plano.', error)
      return new Map()
    }
    return agrupar((data ?? []) as Linha[])
  } catch (e) {
    falha('Não consegui ler as trocas do plano.', e)
    return new Map()
  }
}

/* As trocas do plano de UMA paciente, do lado da nutricionista.
 *
 * Leitura direta, e não a função do paciente: aquela resolve a pessoa por
 * `auth.uid()` e não serve aqui. As políticas de `plano_item_substituicoes` já
 * recortam pela carteira dela.
 *
 * Duas idas, e não um `embed`: o PostgREST derruba a consulta INTEIRA quando
 * não enxerga a relação, e aí a tela perderia as trocas de todos os itens por
 * causa de uma junção. Separadas, o pior caso é a troca vir sem nome -- e essa
 * fica de fora. */
export async function trocasDoPlanoDaPaciente(idsDosItens: number[]): Promise<TrocasPorItem> {
  if (idsDosItens.length === 0) return new Map()
  try {
    const { data, error } = await supabase
      .from('plano_item_substituicoes')
      .select('item_id, alimento_id, receita_id, quantidade_g, medida_caseira, ordem')
      .in('item_id', idsDosItens)
      .order('ordem', { ascending: true })
    if (error) {
      falha('Não consegui ler as trocas do plano.', error)
      return new Map()
    }

    const linhas = (data ?? []) as {
      item_id: number
      alimento_id: number | null
      receita_id: number | null
      quantidade_g: number | string | null
      medida_caseira: string | null
    }[]

    const idsDeAlimento = [...new Set(linhas.map(l => l.alimento_id).filter((x): x is number => !!x))]
    const idsDeReceita = [...new Set(linhas.map(l => l.receita_id).filter((x): x is number => !!x))]

    const [alimentos, receitas] = await Promise.all([
      idsDeAlimento.length
        ? supabase.from('alimentos').select('id, nome').in('id', idsDeAlimento)
        : Promise.resolve({ data: [], error: null }),
      idsDeReceita.length
        ? supabase.from('receitas').select('id, nome').in('id', idsDeReceita)
        : Promise.resolve({ data: [], error: null }),
    ])

    const nomes = new Map<string, string>()
    for (const a of (alimentos.data ?? []) as { id: number; nome: string | null }[]) {
      if (a.nome) nomes.set('a' + a.id, a.nome)
    }
    for (const r of (receitas.data ?? []) as { id: number; nome: string | null }[]) {
      if (r.nome) nomes.set('r' + r.id, r.nome)
    }

    return agrupar(
      linhas.map(l => ({
        item_id: l.item_id,
        nome:
          (l.alimento_id ? nomes.get('a' + l.alimento_id) : null) ??
          (l.receita_id ? nomes.get('r' + l.receita_id) : null) ??
          null,
        quantidade_g: l.quantidade_g,
        medida_caseira: l.medida_caseira,
      })),
    )
  } catch (e) {
    falha('Não consegui ler as trocas do plano.', e)
    return new Map()
  }
}

function agrupar(linhas: Linha[]): TrocasPorItem {
  const mapa: TrocasPorItem = new Map()
  for (const l of linhas) {
    const id = l.item_id === null || l.item_id === undefined ? '' : String(l.item_id)
    const nome = typeof l.nome === 'string' ? l.nome.trim() : ''
    /* Troca sem nome não entra: seria uma linha com a quantidade e um vazio
       onde deveria estar o alimento. */
    if (!id || !nome) continue
    const lida: TrocaLida = { quantidadeG: l.quantidade_g, medidaCaseira: l.medida_caseira }
    const lista = mapa.get(id) ?? []
    lista.push({ nome, detalhe: rotuloDaTroca(lida) })
    mapa.set(id, lista)
  }
  return mapa
}
