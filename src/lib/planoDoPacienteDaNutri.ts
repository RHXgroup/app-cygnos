import { supabase } from './supabase'
import { falha } from './erros'

/* O plano alimentar de UMA paciente, lido pela nutricionista.
 *
 * ──────────────────── Por que não é uma função nova no banco ────────────────────
 * A que o PACIENTE usa (`app_plano_do_paciente`) é `security definer` e resolve
 * o paciente por `app_paciente_da_conta()` -- ou seja, pelo `auth.uid()` de quem
 * chamou. Acrescentar ali um parâmetro "de qual paciente" seria abrir, numa
 * função que roda com os privilégios do dono, uma porta para qualquer conta
 * pedir o plano de qualquer pessoa. Plano alimentar é dado de saúde; o id do
 * paciente não entra como argumento numa função assim, nunca.
 *
 * E não precisa. A política de `planos_alimentares` já é exatamente o que esta
 * tela quer:
 *
 *     nutricionista_id = get_nutricionista_id() AND func_pode('{pacientes,planejamento}')
 *
 * O banco só devolve os planos DELA, e só se a permissão de planejamento
 * estiver ligada na conta. A regra não mora nesta tela -- mora no servidor, e
 * continua valendo mesmo que alguém escreva a consulta errada aqui. É a mesma
 * razão pela qual `agendaDaNutri` lê `consultas` direto.
 *
 * ──────────────────── Três leituras, e não um join ────────────────────
 * Plano, refeições e itens vêm em três idas. Dava para pedir aninhado numa só,
 * e isso depende de o PostgREST enxergar as três relações -- quando ele não
 * enxerga, o erro não é "faltou a refeição": é a consulta inteira falhando, e a
 * tela em branco. Três leituras sempre funcionam, e cada uma só pede o que a
 * anterior encontrou.
 *
 * ──────────────────── O que esta tela NÃO faz ────────────────────
 * Editar. Trocar um item, mudar gramagem e recalcular macro são entrada de
 * muitos números numa tela estreita, e errar um dígito ali muda a conduta. Ela
 * LÊ o plano com a paciente na frente; alterar continua no computador.
 */

export type ItemDoPlano = {
  id: number
  rotulo: string
  quantidade: string | null
  kcal: number | null
}

export type RefeicaoDoPlano = {
  id: number
  nome: string
  horario: string | null
  itens: ItemDoPlano[]
}

export type PlanoDaPaciente = {
  id: number
  titulo: string
  descricao: string | null
  /* Nulo quando ela montou e ainda não mandou para o aplicativo. A tela diz
     isso: um plano pronto e não enviado é a coisa mais fácil de esquecer, e o
     paciente do outro lado não vê nada sem saber por quê. */
  enviadoEm: string | null
  refeicoes: RefeicaoDoPlano[]
}

export type ResultadoDoPlano =
  | { tipo: 'ok'; plano: PlanoDaPaciente | null }
  | { tipo: 'erro'; mensagem: string }

export async function planoDaPaciente(pacienteId: number): Promise<ResultadoDoPlano> {
  const { data: planos, error } = await supabase
    .from('planos_alimentares')
    .select('id, titulo, descricao, enviado_em, ativo, created_at')
    .eq('paciente_id', pacienteId)
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui abrir o plano agora.', error) }
  }

  const p = (planos ?? [])[0] as
    | { id: number; titulo: string | null; descricao: string | null; enviado_em: string | null }
    | undefined
  /* Sem plano ativo não é erro: é uma paciente que ainda não tem plano, e a
     tela sabe dizer isso. Erro é quando a leitura falhou -- e as duas coisas
     precisam chegar separadas, senão "não consegui ler" e "não existe" viram a
     mesma frase. */
  if (!p) return { tipo: 'ok', plano: null }

  const { data: refeicoes, error: erroR } = await supabase
    .from('plano_refeicoes')
    .select('id, nome, horario, ordem')
    .eq('plano_id', p.id)
    .order('ordem')

  if (erroR) {
    return { tipo: 'erro', mensagem: falha('Não consegui ler as refeições do plano.', erroR) }
  }

  const linhasR = (refeicoes ?? []) as { id: number; nome: string | null; horario: string | null }[]
  const ids = linhasR.map(r => r.id)

  /* Sem refeição não há item a pedir, e uma consulta com `in.()` vazio é uma
     ida à rede para receber nada. */
  const itens = ids.length
    ? await supabase
        .from('plano_refeicao_itens')
        /* `rotulo` e `calorias` NÃO existem nesta tabela, e eu escrevi as duas
           de cabeça na primeira versão -- o select inteiro teria falhado e o
           plano nunca abriria. O item guarda o VÍNCULO (`alimento_id`) e a
           quantidade; o nome e a caloria moram em `alimentos`. É por isso que a
           função do banco que o paciente usa tem uma fileira de joins laterais.
           `descricao` é o texto livre, para o item que não é alimento
           cadastrado ("café sem açúcar"). */
        .select(
          'id, refeicao_id, tipo, quantidade_g, medida_caseira, descricao, ordem, ' +
          'alimentos(nome, energia_kcal)',
        )
        .in('refeicao_id', ids)
        .order('ordem')
    : { data: [], error: null }

  if (itens.error) {
    return { tipo: 'erro', mensagem: falha('Não consegui ler os itens do plano.', itens.error) }
  }

  const porRefeicao = new Map<number, ItemDoPlano[]>()
  for (const bruto of (itens.data ?? []) as Record<string, unknown>[]) {
    const ref = Number(bruto.refeicao_id)
    if (!Number.isFinite(ref)) continue

    /* A medida caseira ganha do peso quando existe: "1 concha média" é o que
       ela combinou com a paciente, e "180 g" é a tradução disso. Quem lê o
       plano com a pessoa na frente lê a combinação. */
    const caseira = typeof bruto.medida_caseira === 'string' ? bruto.medida_caseira.trim() : ''
    const gramas = Number(bruto.quantidade_g)
    const quantidade = caseira
      ? caseira
      : Number.isFinite(gramas) && gramas > 0
        ? formatarGramas(gramas)
        : null

    /* O PostgREST devolve o aninhado como objeto ou como lista de um, conforme
       enxerga a relação. Tratar os dois evita um "Sem nome" que só aparece em
       produção. */
    const al = bruto.alimentos as { nome?: string; energia_kcal?: number } | { nome?: string; energia_kcal?: number }[] | null
    const alimento = Array.isArray(al) ? al[0] : al

    /* O nome do alimento primeiro, a descrição livre depois. `descricao` existe
       para o item que não é alimento cadastrado -- "café sem açúcar" --, e é o
       nome certo justamente nesse caso. */
    const rotulo =
      alimento?.nome?.trim() ||
      (typeof bruto.descricao === 'string' ? bruto.descricao.trim() : '') ||
      'Sem nome'

    /* `energia_kcal` é POR 100 g, e a conta é a regra de três. Multiplicar sem
       dividir daria uma refeição de vinte mil calorias, que é o tipo de número
       que ela vê e desconfia do app inteiro.

       `null` e não zero quando falta qualquer um dos dois: item sem caloria
       cadastrada existe, e "0 kcal" somaria como verdade num total que ela
       confere de cabeça -- item 6 do AGENTS.md. */
    const por100 = Number(alimento?.energia_kcal)
    const kcal =
      Number.isFinite(por100) && por100 > 0 && Number.isFinite(gramas) && gramas > 0
        ? Math.round((por100 * gramas) / 100)
        : null

    const lista = porRefeicao.get(ref) ?? []
    lista.push({ id: Number(bruto.id), rotulo, quantidade, kcal })
    porRefeicao.set(ref, lista)
  }

  return {
    tipo: 'ok',
    plano: {
      id: p.id,
      titulo: p.titulo?.trim() || 'Plano alimentar',
      descricao: p.descricao?.trim() || null,
      enviadoEm: p.enviado_em,
      refeicoes: linhasR.map(r => ({
        id: r.id,
        nome: r.nome?.trim() || 'Refeição',
        /* '12:30:00' vira '12:30'. Os segundos vêm da coluna `time` e não
           dizem nada a ninguém. */
        horario: r.horario ? r.horario.slice(0, 5) : null,
        itens: porRefeicao.get(r.id) ?? [],
      })),
    },
  }
}

/* "180 g", "1,5 kg". Sem casa decimal quando é redondo: "180,00 g" num plano
   impresso na frente da paciente é ruído. */
function formatarGramas(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000
    return (Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace('.', ',')) + ' kg'
  }
  return (Number.isInteger(g) ? String(g) : g.toFixed(1).replace('.', ',')) + ' g'
}

/** O total de calorias de uma refeição, ou nulo quando NENHUM item tem valor. */
export function kcalDaRefeicao(r: RefeicaoDoPlano): number | null {
  const comValor = r.itens.filter(i => i.kcal !== null)
  /* Nulo, e não zero, quando ninguém tem valor: é a diferença entre "esta
     refeição não tem caloria" e "eu não sei a caloria desta refeição". */
  if (comValor.length === 0) return null
  return Math.round(comValor.reduce((s, i) => s + (i.kcal ?? 0), 0))
}

/** Quantos itens da refeição não têm caloria cadastrada. */
export function semCaloriaEm(r: RefeicaoDoPlano): number {
  return r.itens.filter(i => i.kcal === null).length
}
