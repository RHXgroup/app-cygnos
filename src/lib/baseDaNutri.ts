import { supabase } from './supabase'
import { falha } from './erros'
import type { ProdutoLido } from './codigoBarras'

/* Mandar um produto lido para a base de alimentos DELA.
 *
 * ── O pedido ──────────────────────────────────────────────────────────────
 * "quando ela lê um código de barra de um produto, eu quero que pergunte pra
 * ela depois que ela ler — uma opção ali embaixo — pra adicionar isso na base
 * de alimento dela, caso ela queira colocar no plano alimentar dela".
 *
 * ── Por que isso NÃO contradiz a regra do leitor ──────────────────────────
 * `codigoBarras.ts` diz, e continua valendo: o que vem do Open Food Facts
 * **não entra na nossa base**, porque dado colaborativo tem erro e um produto
 * errado ali vira erro de TODOS os pacientes.
 *
 * O que muda aqui é de quem é a base. `app_alimentos.nutricionista_id` já
 * existe e já é usado — 81 alimentos hoje têm dono. Com o dono preenchido, o
 * produto entra na base DELA e em mais lugar nenhum: se estiver errado, o erro
 * é dela e ela conserta. A base genérica, com `nutricionista_id` nulo, segue
 * intocada.
 *
 * ── Quem garante isso é o banco, e não esta função ────────────────────────
 * A política `func_app_alimentos_all` exige
 * `nutricionista_id = get_nutricionista_id()` no USING e no WITH CHECK. Ou
 * seja: mesmo que alguém escrevesse aqui o id de outra pessoa, ou nulo, o
 * banco recusaria. Esta função não é a defesa — ela é a conveniência.
 *
 * Por isso o `nutricionista_id` vai preenchido explicitamente: não para
 * proteger, mas porque sem ele a linha nasceria na base genérica e o banco
 * recusaria a escrita inteira, e um erro de permissão é bem mais difícil de
 * entender do que uma coluna esquecida. */

export type ResultadoDaBase =
  | { tipo: 'ok' }
  | { tipo: 'repetido' }
  | { tipo: 'erro'; mensagem: string }

export async function mandarParaMinhaBase(
  produto: ProdutoLido,
  /* O que ela corrigiu do rótulo antes de mandar. O número do rótulo vence o da
     base colaborativa — quem tem o pacote na mão está lendo a fonte primária. */
  correcoes: {
    calorias: number | null
    proteinas: number | null
    carboidratos: number | null
    gorduras: number | null
  },
): Promise<ResultadoDaBase> {
  const { data: sessao } = await supabase.auth.getSession()
  const id = sessao.session?.user.id
  if (!id) return { tipo: 'erro', mensagem: 'Entre de novo para salvar na sua base.' }

  /* ── JÁ ESTÁ LÁ? ───────────────────────────────────────────────────────
   * O código de barras identifica o produto sem ambiguidade, então ele é a
   * pergunta certa — nome bate mal ("Biscoito recheado" existe aos montes).
   *
   * Sem isto, escanear o mesmo pacote duas vezes criaria duas linhas iguais na
   * base dela, e no dia de montar o plano ela escolheria entre duas opções
   * idênticas sem saber qual. */
  const { data: existe, error: erroBusca } = await supabase
    .from('app_alimentos')
    .select('id')
    .eq('nutricionista_id', id)
    .eq('codigo_barras', produto.codigo)
    .maybeSingle()

  /* Falha na CONFERÊNCIA não impede de salvar: o pior caso vira uma linha
     repetida, e recusar a gravação por causa dela seria perder o produto que a
     pessoa tem na mão agora. */
  if (erroBusca) falha('Não consegui conferir se o produto já estava na sua base.', erroBusca)
  if (existe) return { tipo: 'repetido' }

  const { error } = await supabase.from('app_alimentos').insert({
    nutricionista_id: id,
    /* 'proprio' e não 'openfoodfacts': depois de ela conferir e mandar, o dono
       do dado é ela. A origem crua continua registrada no código de barras, que
       é o que permite reencontrar o produto. */
    fonte: 'proprio',
    nome: produto.nome,
    marca: produto.marca,
    codigo_barras: produto.codigo,
    calorias: correcoes.calorias,
    proteinas: correcoes.proteinas,
    carboidratos: correcoes.carboidratos,
    gorduras: correcoes.gorduras,
    /* Fibra e sódio vêm do rótulo sem passar por correção — a tela não os
       edita. Nulo quando o produto não informa, e nunca zero: zero somaria como
       verdade num plano alimentar. Item 6 do AGENTS.md. */
    fibras: produto.fibras,
    sodio_mg: produto.sodio,
    nova: produto.nova,
    /* A porção da embalagem vira a medida caseira quando existe: é o que ela
       vai querer usar no plano ("1 pacote"), e sem isso ela redigita. */
    porcao_g: produto.porcaoEmbalagem,
    medida_caseira: produto.porcaoEmbalagem ? 'embalagem' : null,
  })

  if (error) {
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar o produto na sua base agora.', error),
    }
  }

  return { tipo: 'ok' }
}
