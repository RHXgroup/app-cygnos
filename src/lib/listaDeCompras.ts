/* O plano vira lista de compras.
 *
 * ── Duas implementações viraram uma ───────────────────────────────────────
 * Isto nasceu duas vezes no mesmo dia, em sessões diferentes: uma dentro de
 * `plano.ts` (com a tela já ligada) e outra aqui. É a armadilha 5 do AGENTS
 * acontecendo ao vivo, e a culpa é de quem não procurou antes de escrever --
 * eu.
 *
 * O que ficou é a soma das duas, e cada metade trouxe o que a outra não tinha:
 *
 *   de lá   as ALTERNATIVAS entrando na lista marcadas como opcionais, e não
 *           excluídas. Comprar o macarrão do "arroz ou macarrão" é escolha
 *           dela; sumir com ele decide por ela.
 *   daqui   a quantidade da SEMANA, as seções do mercado, e a contagem de
 *           medida caseira.
 *
 * E o lugar é este arquivo, e não `plano.ts`, por um motivo prático: aquele
 * importa o Supabase, e nada que importe o Supabase roda no Node. Aqui é
 * decisão pura, exercitada em `listaDeCompras.teste.mts`.
 *
 * ── As decisões que definem a lista ───────────────────────────────────────
 *
 * 1. A QUANTIDADE É DA SEMANA. O plano vale para os dias marcados, então 40 g
 *    de aveia num plano de cinco dias são 200 g no mercado. Esse é o número que
 *    ela precisa, e é justamente o que se erra fazendo de cabeça no corredor.
 *
 * 2. ALTERNATIVA ENTRA, EM TOM MAIS FRACO. E basta aparecer uma vez como item
 *    principal para deixar de ser alternativa: se o arroz é fixo no almoço,
 *    comprá-lo não é opcional, mesmo que ele também seja alternativa no jantar.
 *
 * 3. MEDIDA CASEIRA CONTINUA MEDIDA CASEIRA. "2 unidades" não vira grama:
 *    aparece com a contagem da semana e a palavra que ela usou. Inventar 50 g
 *    por unidade poria na lista um número que ninguém disse -- armadilha 6.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import type { PlanoCompleto, VariacaoSalva } from './plano.ts'

export type MedidaContada = { descricao: string; vezes: number }

export type ItemDeCompra = {
  chave: string
  nome: string
  marca: string | null
  /* Soma da SEMANA, em gramas, do que informou peso. Null quando nenhuma
     aparição informou -- "2 unidades" não vira grama sem tabela. */
  gramasNaSemana: number | null
  /* Em quantas refeições o alimento aparece. É o que explica a quantidade sem
     obrigar ninguém a somar de cabeça. */
  refeicoes: number
  /* O que não tem peso, contado na semana: "1 fatia" em três dias vira
     `{ descricao: '1 fatia', vezes: 3 }`. */
  medidas: MedidaContada[]
  /* Verdadeiro quando o alimento só aparece como alternativa de outro. A tela
     mostra em tom mais fraco: comprar é opcional, depende da escolha do dia. */
  soAlternativa: boolean
  /* A seção do mercado, quando dá para saber pelo grupo do catálogo. */
  secao: string
}

/* A seção de quem não tem grupo conhecido. Fica por último, e não some: item
   sem grupo continua sendo item que ela precisa comprar. */
export const SEM_SECAO = 'Outros'

/* A ordem do MERCADO, e não a alfabética.
 *
 * A implementação anterior ordenava por nome com um comentário dizendo "na loja
 * se anda por corredor" -- e alfabético é exatamente o que faz atravessar a loja
 * seis vezes. Esta é a ordem do trajeto de quase todo supermercado brasileiro:
 * hortifrúti na entrada, congelados e frios no fim. */
const ORDEM_DAS_SECOES = [
  'Hortifrúti',
  'Padaria',
  'Cereais e grãos',
  'Carnes e ovos',
  'Laticínios e frios',
  'Mercearia',
  'Bebidas',
  'Congelados',
  SEM_SECAO,
]

/* De grupo do catálogo para seção do mercado.
 *
 * Os grupos são vocabulário de tabela nutricional ("Leguminosas e derivados"),
 * e ninguém procura leguminosa no mercado: procura feijão perto do arroz.
 *
 * Grupo desconhecido cai em "Outros" de propósito -- armadilha 10: valor vindo
 * do banco não indexa um `Record` cru, e chutar a seção manda a pessoa ao
 * corredor errado, que é pior do que não dizer corredor nenhum. */
const SECAO_DO_GRUPO: Record<string, string> = {
  'Verduras, hortaliças e derivados': 'Hortifrúti',
  'Frutas e derivados': 'Hortifrúti',
  'Cereais e derivados': 'Cereais e grãos',
  'Leguminosas e derivados': 'Cereais e grãos',
  'Nozes e sementes': 'Cereais e grãos',
  'Carnes e derivados': 'Carnes e ovos',
  Pescados: 'Carnes e ovos',
  'Ovos e derivados': 'Carnes e ovos',
  'Leite e derivados': 'Laticínios e frios',
  'Óleos e gorduras': 'Mercearia',
  'Açúcares e produtos de confeitaria': 'Mercearia',
  'Produtos açucarados': 'Mercearia',
  Miscelâneas: 'Mercearia',
  'Alimentos preparados': 'Congelados',
  'Bebidas (alcoólicas e não alcoólicas)': 'Bebidas',
}

export const secaoDoGrupo = (grupo: string | null | undefined): string =>
  (grupo && SECAO_DO_GRUPO[grupo]) || SEM_SECAO

/* Nome e marca identificam o produto na prateleira. Sem acento e sem caixa,
   porque "Aveia" e "aveia" são o mesmo pacote. */
const chaveDeCompra = (nome: string, marca: string | null): string => {
  /* O acento sai por CÓDIGO, e não por uma classe de regex com os sinais
     combinantes escritos literalmente: aquele intervalo são dois caracteres
     invisíveis, e um dia alguém "limpa" a linha sem ver o que apagou. */
  const semAcento = [...(nome + '|' + (marca ?? '')).toLowerCase().normalize('NFD')]
    .filter(c => {
      const n = c.codePointAt(0) ?? 0
      return n < 0x300 || n > 0x36f
    })
    .join('')
  return semAcento.trim()
}

export function listaDeCompras(
  plano: PlanoCompleto | null,
  /* De onde sai a seção. A tela busca os grupos dos alimentos que têm id e
     passa esta função -- a regra continua pura, e a ida ao banco fica onde já
     há ida ao banco. */
  grupoDe: (alimentoId: number | null) => string | null = () => null,
): ItemDeCompra[] {
  if (!plano) return []

  /* Quantos dias este plano cobre. Sem dia marcado vale para a semana inteira,
     que é como a tela do plano já lê o campo -- duas leituras diferentes do
     mesmo campo são dois números diferentes na mesma tela. */
  const dias = plano.diasSemana.length > 0 ? plano.diasSemana.length : 7

  const porChave = new Map<string, ItemDeCompra & { vistoEm: Set<string> }>()

  const juntar = (a: VariacaoSalva, refeicaoId: string, alternativa: boolean) => {
    const chave = chaveDeCompra(a.nome, a.marca)
    const atual = porChave.get(chave)

    const temPeso = typeof a.gramasTotais === 'number' && a.gramasTotais > 0
    const naSemana = temPeso ? (a.gramasTotais as number) * dias : null
    const dito = a.descricao.trim()

    if (!atual) {
      porChave.set(chave, {
        chave,
        nome: a.nome,
        marca: a.marca,
        gramasNaSemana: naSemana,
        refeicoes: 1,
        medidas: temPeso || !dito ? [] : [{ descricao: dito, vezes: dias }],
        soAlternativa: alternativa,
        secao: secaoDoGrupo(grupoDe(a.alimentoId)),
        vistoEm: new Set([refeicaoId]),
      })
      return
    }

    /* Soma só entre pesos conhecidos. Um item sem peso não zera o total dos
       outros, mas também não some: a medida dele entra na lista ao lado. */
    if (naSemana !== null) {
      atual.gramasNaSemana = (atual.gramasNaSemana ?? 0) + naSemana
    } else if (dito) {
      const igual = atual.medidas.find(m => m.descricao === dito)
      if (igual) igual.vezes += dias
      else atual.medidas.push({ descricao: dito, vezes: dias })
    }

    /* O nome mais completo vence: "Aveia" e "Aveia em flocos" são a mesma
       compra, e a segunda é a que ajuda no corredor. */
    if (a.nome.length > atual.nome.length) atual.nome = a.nome

    /* A seção pode chegar por qualquer aparição: a primeira pode ser a que não
       tinha id de catálogo. */
    if (atual.secao === SEM_SECAO) atual.secao = secaoDoGrupo(grupoDe(a.alimentoId))

    if (!alternativa) atual.soAlternativa = false
    atual.vistoEm.add(refeicaoId)
    atual.refeicoes = atual.vistoEm.size
  }

  for (const r of plano.refeicoes) {
    for (const item of r.itens) {
      juntar(item, r.id, false)
      for (const v of item.variacoes) juntar(v, r.id, true)
    }
  }

  const ordem = new Map(ORDEM_DAS_SECOES.map((s, i) => [s, i]))

  return [...porChave.values()]
    .map(({ vistoEm: _vistoEm, ...item }) => item)
    .sort((a, b) => {
      /* Alternativas por último, sempre: o que é opcional não pode empurrar o
         que é obrigatório para baixo da dobra. */
      if (a.soAlternativa !== b.soAlternativa) return a.soAlternativa ? 1 : -1
      const sa = ordem.get(a.secao) ?? ordem.size
      const sb = ordem.get(b.secao) ?? ordem.size
      if (sa !== sb) return sa - sb
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
}

/* Quanto comprar, na forma em que se compra.
 *
 * Grama vira quilo acima de 1.000 porque ninguém pede 1.400 g de arroz. Abaixo
 * disso continua em grama, arredondado a 10 -- precisão de 1 g numa lista de
 * mercado é falsa. */
export function quantoComprar(item: ItemDeCompra): string {
  const partes: string[] = []

  if (item.gramasNaSemana !== null) {
    const g = item.gramasNaSemana
    partes.push(
      g >= 1000
        ? (g / 1000).toFixed(g % 1000 === 0 ? 0 : 1).replace('.', ',') + ' kg'
        : String(Math.round(g / 10) * 10) + ' g',
    )
  }

  for (const m of item.medidas) {
    partes.push(m.vezes > 1 ? m.vezes + '× ' + m.descricao : m.descricao)
  }

  return partes.join(' + ')
}
