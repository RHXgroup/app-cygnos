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
  /* O código de barras já existe na base do APP, sem dono -- ou seja, o produto
     já está disponível para ela procurar pelo nome. Não é erro, e não é
     "repetido na sua base": é uma terceira resposta, e faltava. */
  | { tipo: 'jaNaBase'; nome: string | null }
  | { tipo: 'erro'; mensagem: string }

/* Chave repetida. É o código do Postgres, e ele é estável -- ao contrário da
   frase, que muda de versão e de idioma. */
const CHAVE_REPETIDA = '23505'

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

  /* ── JÁ ESTÁ LÁ? E "LÁ" NÃO É SÓ A BASE DELA ──────────────────────────
   * O código de barras identifica o produto sem ambiguidade, então ele é a
   * pergunta certa — nome bate mal ("Biscoito recheado" existe aos montes).
   *
   * A pergunta era feita SÓ entre os alimentos dela (`nutricionista_id = id`),
   * e o índice do banco é GLOBAL:
   *
   *     create unique index app_alimentos_codigo_barras_unico
   *       on app_alimentos (codigo_barras) where codigo_barras is not null
   *
   * Ou seja, um produto que já está na base pública do app — que tem milhares
   * de itens importados do Open Food Facts, todos com código de barras — passa
   * por esta conferência como se fosse novo e bate no índice na hora de gravar.
   * O que ela lia era "Não consegui salvar o produto na sua base agora", que
   * soa como problema de rede: ela tenta de novo, no supermercado, e falha de
   * novo. Aconteceu com um pão e com uma batata palha.
   *
   * E a resposta certa não é nem "salvei" nem "deu erro": é que o produto JÁ
   * ESTÁ disponível para ela, e é só procurar pelo nome. Por isso a busca
   * perdeu o filtro de dono e passou a trazer também de quem é a linha. */
  const { data: existe, error: erroBusca } = await supabase
    .from('app_alimentos')
    .select('id, nome, nutricionista_id')
    .eq('codigo_barras', produto.codigo)
    .maybeSingle()

  /* Falha na CONFERÊNCIA não impede de salvar: o pior caso vira uma linha
     repetida, e recusar a gravação por causa dela seria perder o produto que a
     pessoa tem na mão agora. */
  if (erroBusca) falha('Não consegui conferir se o produto já estava na sua base.', erroBusca)

  const achado = existe as { id: number; nome: string | null; nutricionista_id: string | null } | null
  if (achado) {
    return achado.nutricionista_id === id
      ? { tipo: 'repetido' }
      : { tipo: 'jaNaBase', nome: achado.nome?.trim() || null }
  }

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
    /* O índice global outra vez, agora por corrida: entre a conferência acima e
       esta gravação, alguém pode ter cadastrado o mesmo código -- a importação
       do Open Food Facts, por exemplo, que roda sozinha. O desfecho é o MESMO
       da conferência, e não um erro: o produto está lá.

       Sem este ramo, o caminho de corrida devolveria de novo a frase que soa
       como falha de rede, e ela ficaria tentando no supermercado. */
    if ((error as { code?: string }).code === CHAVE_REPETIDA) {
      falha('Código de barras já cadastrado; virou "já está na base".', error)
      return { tipo: 'jaNaBase', nome: null }
    }

    return {
      tipo: 'erro',
      mensagem: falha('Não consegui salvar o produto na sua base agora.', error),
    }
  }

  return { tipo: 'ok' }
}
