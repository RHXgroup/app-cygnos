import { supabase } from './supabase'
import { assinados } from './arquivos'
import { falha } from './erros'

/* As receitas que a nutricionista publicou para o paciente.
 *
 * Não confundir com `lib/receitas.ts`, que é outra coisa: aquelas são as
 * receitas que o PACIENTE monta para ele mesmo, em `app_receitas`. Estas são
 * dela, vêm da tabela `receitas` do sistema, e o app só lê.
 *
 * A queixa mais comum de quem recebe plano alimentar é não saber o que
 * cozinhar — e é essa a lacuna que isto fecha. Dietbox, WebDiet e Nutrium
 * mandam receita para o app; era a última das três lacunas competitivas que
 * dependia só de uma função de leitura. */

export type ReceitaDaNutri = {
  id: number
  nome: string
  descricao: string | null
  modoPreparo: string | null
  categoria: string | null
  /* Em minutos. Null quando ela não preencheu. */
  tempoPreparoMin: number | null
  porcoes: number | null
  /* Já assinada quando veio como URL pública de bucket privado — ver
     lib/arquivos.ts, que é o mesmo remendo das fotos do catálogo. */
  fotoUrl: string | null
  /* Null é resposta, zero é mentira: a receita pode não ter sido calculada, e
     um 0 kcal somaria como verdade numa tela que diz o que a pessoa vai comer. */
  kcal: number | null
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  fibras: number | null
  criadoEm: string | null
}

export type ResultadoReceitasDaNutri =
  | { tipo: 'ok'; receitas: ReceitaDaNutri[] }
  | { tipo: 'erro'; mensagem: string }

const numero = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

type Linha = {
  id: number
  nome: string
  descricao: string | null
  modo_preparo: string | null
  categoria: string | null
  tempo_preparo_min: number | null
  porcoes: number | null
  foto_url: string | null
  total_kcal: string | number | null
  total_proteinas: string | number | null
  total_carboidratos: string | number | null
  total_gorduras: string | number | null
  total_fibras: string | number | null
  criado_em: string | null
}

export async function carregarReceitasDaNutri(): Promise<ResultadoReceitasDaNutri> {
  const { data, error } = await supabase.rpc('app_receitas_da_nutricionista')

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar as receitas agora. Verifique a conexão.', error),
    }

  const linhas = (data ?? []) as Linha[]
  if (linhas.length === 0) return { tipo: 'ok', receitas: [] }

  /* Uma ida à rede para assinar todas as fotos, e não uma por receita. */
  const comFoto = linhas.filter(l => l.foto_url)
  const assinadas = await assinados(comFoto.map(l => l.foto_url as string))
  const porOriginal = new Map<string, string>()
  comFoto.forEach((l, i) => porOriginal.set(l.foto_url as string, assinadas[i]))

  return {
    tipo: 'ok',
    receitas: linhas.map(l => ({
      id: l.id,
      nome: l.nome,
      descricao: l.descricao,
      modoPreparo: l.modo_preparo,
      categoria: l.categoria,
      tempoPreparoMin: l.tempo_preparo_min,
      porcoes: l.porcoes,
      fotoUrl: l.foto_url ? (porOriginal.get(l.foto_url) ?? l.foto_url) : null,
      kcal: numero(l.total_kcal),
      proteinas: numero(l.total_proteinas),
      carboidratos: numero(l.total_carboidratos),
      gorduras: numero(l.total_gorduras),
      fibras: numero(l.total_fibras),
      criadoEm: l.criado_em,
    })),
  }
}

/* ── Apresentação ──────────────────────────────────────────────────────────*/

/* "40 min" · "1 h 15" — null vira string vazia, e não "0 min": tempo não
   preenchido não é receita instantânea. */
export function tempoLegivel(min: number | null): string {
  if (min === null || min <= 0) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto === 0 ? `${h} h` : `${h} h ${resto}`
}

/* "4 porções". */
export const porcoesLegivel = (n: number | null): string =>
  n === null || n <= 0 ? '' : `${n} ${n === 1 ? 'porção' : 'porções'}`
