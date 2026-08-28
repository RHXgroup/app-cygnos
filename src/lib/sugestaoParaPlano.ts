import type { Alimento } from './alimentos'

/* O núcleo puro da sugestão da IA: JSON que veio da rede vira plano do app.
 *
 * Vive separado de `planoIA.ts` por uma razão só, e ela é prática: aqui não há
 * import de runtime nenhum — só de tipo, que some na compilação. Isso torna
 * este arquivo executável fora do aparelho, e é o que permite exercitar a
 * conversão com JSON de verdade em vez de confiar que ela está certa.
 *
 * A parte que fala com a rede fica lá; o que decide o que virar linha do plano
 * fica aqui, e é esta que erra.
 *
 * As chaves de linha NÃO são atribuídas aqui, e é de propósito: `novaChave`
 * mora em plano.ts, que puxa o Supabase junto. Quem chama carimba as chaves. */

export type ItemDaIA = {
  tipo?: string
  busca?: string
  descricao?: string
  quantidade_g?: number | string | null
  medida_caseira?: string | null
  estimativa_100g?: {
    kcal?: number | string | null
    proteina_g?: number | string | null
    carboidrato_g?: number | string | null
    gordura_g?: number | string | null
    fibra_g?: number | string | null
  } | null
}

export type RefeicaoDaIA = {
  nome?: string
  horario?: string
  itens?: ItemDaIA[]
}

export type PlanoDaIA = {
  kcal_alvo?: number | string | null
  observacao?: string | null
  alerta?: string | null
  refeicoes?: RefeicaoDaIA[]
}

/* Um item pronto, menos a chave de tela. */
export type ItemSemChave = {
  alimentoId: number | null
  nome: string
  marca: string | null
  descricao: string
  gramasTotais: number | null
  caloriasPor100g: number | null
  proteinasPor100g: number | null
  carboidratosPor100g: number | null
  gordurasPor100g: number | null
  fibrasPor100g: number | null
  /* Verdadeiro quando os nutrientes vieram da IA, e não da base. A tela mostra
     isso — número estimado e número conferido não merecem a mesma confiança, e
     esconder a diferença seria omitir justamente onde ela importa. */
  estimado: boolean
}

export type RefeicaoSemChave = {
  rotulo: string
  hora: string
  itens: ItemSemChave[]
}

export type Convertido = {
  kcalAlvo: number | null
  observacao: string
  alerta: string | null
  refeicoes: RefeicaoSemChave[]
  /* Quantos itens não foram achados na base. A tela avisa uma vez, no topo, em
     vez de repetir a marca em cada linha e virar ruído. */
  estimados: number
}

export const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : null
}

/* "07:30" e nada mais. A hora entra num campo com máscara do outro lado, e um
   "7h", "manhã" ou "07:30 às 08:00" vindo da IA quebraria a leitura sem
   ninguém perceber. */
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/* Horários de reserva, quando a IA devolve algo que não é hora. Espalhados pelo
   dia na ordem em que as refeições vieram: uma lista inteira às 12:00 seria
   pior do que um palpite razoável. */
const HORARIOS = ['07:30', '10:00', '12:30', '15:30', '19:00', '21:00', '22:00', '23:00']

export const horaValida = (v: unknown, reserva: string) =>
  typeof v === 'string' && HORA.test(v.trim()) ? v.trim() : reserva

/* Converte a sugestão em refeições do app.
 *
 * `achados[iRefeicao][iItem]` é o que a busca da nossa base devolveu para
 * aquele item, ou null quando não achou. Vem de fora porque a busca é ida à
 * rede, e é justamente o que este arquivo não faz.
 *
 * Devolve null quando não sobrou refeição nenhuma com item — o que acontece se
 * a IA devolver só linhas de texto, ou um objeto com o formato errado. */
export function montar(bruto: PlanoDaIA, achados: (Alimento | null)[][]): Convertido | null {
  const refeicoesDaIA = Array.isArray(bruto?.refeicoes) ? bruto.refeicoes : []
  if (refeicoesDaIA.length === 0) return null

  let estimados = 0

  const refeicoes: RefeicaoSemChave[] = refeicoesDaIA.map((r, iR) => {
    const itens: ItemSemChave[] = []
    const daRefeicao = Array.isArray(r?.itens) ? r.itens : []

    daRefeicao.forEach((i, iI) => {
      /* Item de texto — "café sem açúcar" — não vira linha do plano: o plano do
         app é uma lista de alimentos com peso, e uma linha sem nutriente nenhum
         entraria como um alimento que existe e não soma nada. */
      if (i?.tipo !== 'alimento') return

      const nome = typeof i.busca === 'string' ? i.busca.trim() : ''
      if (!nome) return

      const gramas = numero(i.quantidade_g)
      const medida = typeof i.medida_caseira === 'string' ? i.medida_caseira.trim() : ''
      const achado = achados[iR]?.[iI] ?? null

      /* A descrição é o que a pessoa lê: "2 unidades (100 g)" diz mais do que
         qualquer um dos dois sozinho. Sem medida caseira, só o peso. */
      const descricao =
        medida && gramas ? `${medida} (${gramas} g)` : medida || (gramas ? `${gramas} g` : '')

      if (achado) {
        itens.push({
          alimentoId: achado.id,
          nome: achado.nome,
          marca: achado.marca,
          descricao,
          gramasTotais: gramas,
          caloriasPor100g: achado.calorias,
          proteinasPor100g: achado.proteinas,
          carboidratosPor100g: achado.carboidratos,
          gordurasPor100g: achado.gorduras,
          fibrasPor100g: achado.fibras,
          estimado: false,
        })
        return
      }

      estimados++
      const e = i.estimativa_100g
      itens.push({
        /* Sem id: não está no catálogo. O item continua inteiro porque os
           nutrientes ficam copiados aqui — que é exatamente o que o plano já
           faz com alimento que saiu da base depois de escolhido. */
        alimentoId: null,
        nome,
        marca: null,
        descricao,
        gramasTotais: gramas,
        caloriasPor100g: numero(e?.kcal),
        proteinasPor100g: numero(e?.proteina_g),
        carboidratosPor100g: numero(e?.carboidrato_g),
        gordurasPor100g: numero(e?.gordura_g),
        fibrasPor100g: numero(e?.fibra_g),
        estimado: true,
      })
    })

    return {
      rotulo:
        typeof r?.nome === 'string' && r.nome.trim() ? r.nome.trim() : `Refeição ${iR + 1}`,
      hora: horaValida(r?.horario, HORARIOS[iR] ?? '12:00'),
      itens,
    }
  })

  /* Refeição que ficou sem item nenhum sai fora: ela viraria um rótulo com nada
     embaixo, e a pessoa ficaria procurando o que deveria estar ali. */
  const comItens = refeicoes.filter(r => r.itens.length > 0)
  if (comItens.length === 0) return null

  return {
    kcalAlvo: numero(bruto.kcal_alvo),
    observacao: typeof bruto.observacao === 'string' ? bruto.observacao.trim() : '',
    alerta: typeof bruto.alerta === 'string' && bruto.alerta.trim() ? bruto.alerta.trim() : null,
    refeicoes: comItens,
    estimados,
  }
}

/* Quais alimentos precisam ser procurados na base, na mesma forma de matriz que
   `montar` espera de volta. Aqui para as duas leituras do JSON — a que decide o
   que buscar e a que monta — não divergirem. */
export function termosParaBuscar(bruto: PlanoDaIA): (string | null)[][] {
  const refeicoesDaIA = Array.isArray(bruto?.refeicoes) ? bruto.refeicoes : []
  return refeicoesDaIA.map(r =>
    (Array.isArray(r?.itens) ? r.itens : []).map(i => {
      if (i?.tipo !== 'alimento') return null
      const termo = typeof i.busca === 'string' ? i.busca.trim() : ''
      return termo || null
    }),
  )
}
