import { buscarAlimentos, type Alimento } from './alimentos'

/* Ler o código de barras de um produto embalado.
 *
 * É o recurso que sustenta o MyFitnessPal e o que qualquer pessoa espera de um
 * app de dieta ao pegar um pacote na mão. Digitar "biscoito recheado chocolate"
 * e escolher entre doze resultados parecidos é justamente o oposto do gesto:
 * o pacote já diz exatamente qual produto é.
 *
 * ── De onde vêm os dados ───────────────────────────────────────────────────
 * Primeiro da nossa própria base, pelo nome — se o produto já estiver lá, é ele
 * que vale, porque foi conferido por alguém.
 *
 * Faltando, o Open Food Facts. É um banco colaborativo, aberto e gratuito, com
 * cobertura boa de produtos brasileiros. Não exige chave nem cadastro, e a
 * licença permite uso comercial (ODbL) desde que a origem seja creditada — a
 * tela mostra "Open Food Facts" no item que vem de lá.
 *
 * ── O que ele NÃO faz ──────────────────────────────────────────────────────
 * Gravar na nossa base. Dado colaborativo tem erro, e um produto errado que
 * entra em app_alimentos vira erro de todos os pacientes. O que a leitura
 * devolve entra no registro daquela pessoa, com a marca de onde veio. */

export type ProdutoLido = {
  codigo: string
  nome: string
  marca: string | null
  /* Por 100 g, como o resto do app. */
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  sodio: number | null
  /* O peso da embalagem, quando o produto informa: "395 g". Vira a sugestão de
     quantidade, porque quem escaneia costuma comer o pacote ou uma fração dele. */
  porcaoEmbalagem: number | null
  /* De onde veio, para a tela dizer. Um número da nossa base e um do Open Food
     Facts não merecem a mesma confiança, e esconder isso seria omitir. */
  origem: 'base' | 'openfoodfacts'
}

export type ResultadoCodigo =
  | { tipo: 'ok'; produto: ProdutoLido }
  | { tipo: 'nao_encontrado' }
  | { tipo: 'erro'; mensagem: string }

const OFF = 'https://world.openfoodfacts.org/api/v2/product'

/* Só os campos que usamos. A resposta completa do Open Food Facts passa de
   100 KB por produto, e quem escaneia no supermercado costuma estar no 4G. */
const CAMPOS = [
  'product_name',
  'product_name_pt',
  'brands',
  'quantity',
  'nutriments',
].join(',')

/* Oito segundos. Acima disso, esperar é pior do que digitar o nome — e o
   objetivo do código de barras era justamente não digitar. */
const LIMITE_MS = 8000

const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : null
  return n !== null && Number.isFinite(n) ? n : null
}

/* "395 g", "1,5 L", "2x100g". Só o primeiro número com unidade de peso
   interessa; o resto é variação de embalagem que não muda a conta. */
function pesoDaEmbalagem(quantidade: unknown): number | null {
  if (typeof quantidade !== 'string') return null
  const m = quantidade.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i)
  if (!m) return null

  const valor = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(valor)) return null

  const unidade = m[2].toLowerCase()
  if (unidade === 'kg' || unidade === 'l') return valor * 1000
  return valor
}

export async function consultarCodigo(codigo: string): Promise<ResultadoCodigo> {
  /* 1. A nossa base primeiro. Ela não guarda código de barras, então a busca é
        pelo próprio número: produtos importados de fontes que o trazem no nome
        aparecem, e o custo de tentar é uma consulta que já é rápida. */
  const naBase = await buscarAlimentos(codigo)
  if (naBase.tipo === 'ok' && naBase.alimentos.length > 0) {
    return { tipo: 'ok', produto: daBase(naBase.alimentos[0], codigo) }
  }

  /* 2. O Open Food Facts. */
  try {
    const controle = new AbortController()
    const tempo = setTimeout(() => controle.abort(), LIMITE_MS)

    const resposta = await fetch(`${OFF}/${encodeURIComponent(codigo)}.json?fields=${CAMPOS}`, {
      signal: controle.signal,
      headers: {
        /* O Open Food Facts pede identificação de quem consome a API, para
           poder falar com o app se algo sair do lugar. */
        'User-Agent': 'Cygnos/1.0 (app de nutricao)',
      },
    })
    clearTimeout(tempo)

    if (resposta.status === 404) return { tipo: 'nao_encontrado' }
    if (!resposta.ok) return { tipo: 'erro', mensagem: `O serviço respondeu ${resposta.status}.` }

    const json = (await resposta.json()) as {
      status?: number
      product?: Record<string, unknown>
    }

    if (json.status !== 1 || !json.product) return { tipo: 'nao_encontrado' }

    const p = json.product
    const n = (p.nutriments ?? {}) as Record<string, unknown>

    const nome =
      (typeof p.product_name_pt === 'string' && p.product_name_pt.trim()) ||
      (typeof p.product_name === 'string' && p.product_name.trim()) ||
      ''

    /* Produto sem nome não serve para nada: entraria no diário como uma linha
       em branco. Melhor tratar como não encontrado e deixar a pessoa buscar. */
    if (!nome) return { tipo: 'nao_encontrado' }

    return {
      tipo: 'ok',
      produto: {
        codigo,
        nome,
        marca: typeof p.brands === 'string' && p.brands.trim() ? p.brands.split(',')[0].trim() : null,
        calorias: numero(n['energy-kcal_100g']),
        proteinas: numero(n.proteins_100g),
        carboidratos: numero(n.carbohydrates_100g),
        gorduras: numero(n.fat_100g),
        fibras: numero(n.fiber_100g),
        /* O Open Food Facts guarda sódio em GRAMAS por 100 g; o app fala em
           miligramas, como o rótulo brasileiro. */
        sodio: (() => {
          const g = numero(n.sodium_100g)
          return g === null ? null : Math.round(g * 1000)
        })(),
        porcaoEmbalagem: pesoDaEmbalagem(p.quantity),
        origem: 'openfoodfacts',
      },
    }
  } catch (e) {
    const erro = e as Error
    if (erro.name === 'AbortError') {
      return { tipo: 'erro', mensagem: 'A consulta demorou demais. Verifique a conexão.' }
    }
    return { tipo: 'erro', mensagem: 'Não consegui consultar o produto agora.' }
  }
}

const daBase = (a: Alimento, codigo: string): ProdutoLido => ({
  codigo,
  nome: a.nome,
  marca: a.marca,
  calorias: a.calorias,
  proteinas: a.proteinas,
  carboidratos: a.carboidratos,
  gorduras: a.gorduras,
  fibras: a.fibras,
  sodio: a.sodio,
  porcaoEmbalagem: null,
  origem: 'base',
})
