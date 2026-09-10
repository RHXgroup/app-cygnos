import { supabase } from './supabase'
import { falha } from './erros'

/* Trocar um item do plano pelo celular.
 *
 * ──────────────────── O pedido, nas palavras dele ────────────────────
 * "Não quero que essa paciente coma isso, quero que ela coma aquilo lá. Agora
 * pediu pra trocar, então que ela consiga vir aqui trocar."
 *
 * É UMA decisão -- este item vira aquele --, e por isso cabe num telefone. O
 * que não cabe é montar plano do zero, mexer em gramagem e ver macro
 * recalcular: entrada de muitos números numa tela estreita, onde errar um
 * dígito muda a conduta. Isso continua no computador, e a tela do plano diz.
 *
 * ──────────────────── A QUANTIDADE NÃO MUDA, e isso é a decisão ────────────────────
 * Trocar arroz por quinoa mantém "4 colheres". Recalcular a gramagem para
 * bater caloria seria o app decidindo conduta -- e a caloria de 100 g de
 * quinoa não é a de 100 g de arroz, então "manter a caloria" mudaria o volume
 * no prato, que é o que a paciente enxerga.
 *
 * A tela DIZ que a quantidade ficou igual. Quem quiser ajustar ajusta no
 * sistema, com o macro do dia inteiro na frente.
 *
 * ──────────────────── Sem função nova no banco ────────────────────
 * A política de `plano_refeicao_itens` já é o recorte:
 *
 *     plano_id in (select id from planos_alimentares
 *                   where nutricionista_id = get_nutricionista_id())
 *     and func_pode('{pacientes,planejamento}')
 *
 * O banco só deixa mexer em item de plano DELA, e só se a permissão de
 * planejamento estiver ligada. Uma função a mais só acrescentaria um lugar
 * para divergir -- mesma razão da agenda ler `consultas` direto.
 *
 * E `alimentos` tem duas políticas de leitura que somam exatamente o que ela
 * precisa: os alimentos dela, e o acervo público (`nutricionista_id is null`).
 * A busca daqui não filtra nada disso à mão; quem recorta é o servidor.
 */

export type AlimentoDaBusca = {
  id: number
  nome: string
  /** kcal por 100 g. Nulo quando o cadastro não tem -- e a tela diz "—". */
  kcal100: number | null
}

export type ResultadoDaBusca =
  | { tipo: 'ok'; alimentos: AlimentoDaBusca[] }
  | { tipo: 'erro'; mensagem: string }

/* Teto baixo de propósito: ela escolhe UM, e trinta linhas num telefone é
   rolagem que ninguém faz. Escrever mais duas letras filtra melhor que rolar. */
const TETO = 12

export async function procurarAlimento(termo: string): Promise<ResultadoDaBusca> {
  const limpo = termo.trim()
  /* Menos de três letras casa com meio acervo e devolve doze linhas que não
     têm relação com o que ela quer. Vazio é melhor que ruído. */
  if (limpo.length < 3) return { tipo: 'ok', alimentos: [] }

  const { data, error } = await supabase
    .from('alimentos')
    /* `marca` NÃO existe nesta tabela, e eu quase a pedi de cabeça -- pela
       segunda vez hoje, depois de `rotulo` e `calorias` em
       `plano_refeicao_itens`. Uma coluna inventada não degrada: o select
       inteiro falha, e a busca nunca acha nada. `energia_kcal` existe, e está
       conferida contra a função do banco que o paciente usa. */
    .select('id, nome, energia_kcal')
    .eq('ativo', true)
    .ilike('nome', '%' + limpo + '%')
    .order('nome')
    .limit(TETO)

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui procurar o alimento agora.', error) }
  }

  return {
    tipo: 'ok',
    alimentos: ((data ?? []) as Record<string, unknown>[]).map(a => {
      const kcal = Number(a.energia_kcal)
      return {
        id: Number(a.id),
        nome: (typeof a.nome === 'string' && a.nome.trim()) || 'Sem nome',
        /* `null` e não zero: alimento sem caloria cadastrada existe, e "0 kcal"
           somaria como verdade num total que ela confere de cabeça. Item 6. */
        kcal100: Number.isFinite(kcal) && kcal > 0 ? kcal : null,
      }
    }),
  }
}

export type ResultadoDaTroca = { ok: boolean; mensagem: string }

/**
 * Troca o alimento de um item, mantendo a quantidade.
 *
 * `descricao` é zerada junto, e isso não é detalhe: ela existe para o item que
 * NÃO é alimento cadastrado ("café sem açúcar"), e a leitura do plano mostra o
 * nome do alimento primeiro e a descrição depois. Deixar a descrição velha num
 * item que agora tem alimento faria o texto antigo continuar aparecendo se o
 * vínculo se perdesse -- um fantasma difícil de explicar.
 */
export async function trocarItem(
  itemId: number,
  alimentoId: number,
  nomeNovo: string,
): Promise<ResultadoDaTroca> {
  if (!Number.isFinite(itemId) || !Number.isFinite(alimentoId)) {
    return { ok: false, mensagem: 'Não consegui identificar o item. Nada foi trocado.' }
  }

  const { data, error } = await supabase
    .from('plano_refeicao_itens')
    .update({ alimento_id: alimentoId, descricao: null })
    .eq('id', itemId)
    /* `select` depois do update para saber se ALGUMA linha mudou. Sem ele, um
       item que a política recusou volta como sucesso silencioso: a tela diz
       "trocado", ela relê e o alimento velho continua lá. */
    .select('id')

  if (error) {
    return { ok: false, mensagem: falha('Não consegui trocar agora. Nada foi alterado.', error) }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      mensagem:
        'Não consegui trocar esse item. Ele pode ser de um plano que não é seu, ' +
        'ou a sua conta pode não ter permissão de planejamento.',
    }
  }

  return { ok: true, mensagem: 'Trocado por ' + nomeNovo + ', na mesma quantidade.' }
}
