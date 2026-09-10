/* A soma da lista de compras.
 *
 * ──────────────────── Por que separado de `comprasDaSemana` ────────────────────
 * Só a decisão mora aqui, e a leitura mora lá. Este arquivo não importa NADA de
 * runtime -- e é isso que permite exercitá-lo no Node, com três sessões pedindo
 * o mesmo item em unidades diferentes, sem aparelho e sem banco.
 *
 * A primeira versão disto ficou junto com a leitura, e o teste tentou EXTRAIR a
 * função do arquivo como texto para avaliá-la. Não funcionou -- o código é
 * TypeScript e `new Function` só recebe JavaScript --, e ainda bem: era
 * esperteza para não fazer o corte que este projeto já faz em `buracosDaAgenda`
 * e em `ferramentasDoAparelho`. Lá o que fala com a rede, aqui o que decide.
 */

export type ItemDeCompra = {
  nome: string
  /** Nulo quando as unidades divergem e não dava para somar. */
  quantidade: number | null
  unidade: string | null
  /** Em quantas sessões diferentes ele aparece. */
  sessoes: number
}

/* Junta por nome + unidade. A chave leva a unidade junto de propósito: sem ela,
   "2 unidades" e "500 g" do mesmo alimento somariam em "502", que é um número
   inventado com cara de certo. */
export function somar(linhas: Record<string, unknown>[]): ItemDeCompra[] {
  const mapa = new Map<string, ItemDeCompra & { atividades: Set<number> }>()

  for (const l of linhas) {
    const nome = typeof l.nome === 'string' ? l.nome.trim() : ''
    if (!nome) continue

    const unidade = typeof l.unidade === 'string' ? l.unidade.trim() || null : null
    /* Minúscula só na CHAVE. "Iogurte" e "iogurte" são o mesmo item no
       supermercado, mas o que aparece na tela é o primeiro nome que ela
       escreveu -- e não uma versão em caixa baixa do que ela digitou. */
    const chave = nome.toLowerCase() + '|' + (unidade ?? '').toLowerCase()

    const qtd = Number(l.quantidade)
    const atv = Number(l.atividade_id)

    const atual = mapa.get(chave)
    if (!atual) {
      mapa.set(chave, {
        nome,
        quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : null,
        unidade,
        sessoes: 0,
        atividades: new Set(Number.isFinite(atv) ? [atv] : []),
      })
      continue
    }

    /* Uma quantidade ilegível contamina a soma inteira: `null` diz "não sei
       quanto", e é mais honesto do que somar o que deu e mostrar um total que
       falta pedaço. */
    if (atual.quantidade !== null) {
      atual.quantidade = Number.isFinite(qtd) && qtd > 0 ? atual.quantidade + qtd : null
    }
    if (Number.isFinite(atv)) atual.atividades.add(atv)
  }

  return [...mapa.values()]
    .map(({ atividades, ...i }) => ({ ...i, sessoes: atividades.size }))
    /* Alfabética, e não por quantidade: no supermercado ela procura pelo nome,
       e uma lista ordenada por "quantos" não ajuda a achar nada. */
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** "3 un", "1,5 kg", "2" -- ou vazio quando não se sabe quanto. */
export function quantidadePorExtenso(i: ItemDeCompra): string {
  if (i.quantidade === null) return ''
  /* Sem casa decimal quando é redondo: "3,000 potes" numa lista de compras é
     ruído, e a coluna do banco é `numeric(10,3)`. */
  const n = Number.isInteger(i.quantidade)
    ? String(i.quantidade)
    : String(Number(i.quantidade.toFixed(3))).replace('.', ',')
  return i.unidade ? `${n} ${i.unidade}` : n
}
