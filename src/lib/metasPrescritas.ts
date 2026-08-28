import { supabase } from './supabase'
import type { CampoMeta, Metas } from './metas'

/* As metas que a nutricionista prescreveu.
 *
 * O app tem duas frentes, e esta é a segunda. Quem usa sozinho define as
 * próprias metas em `app_metas` e pronto. Quem tem nutricionista vinculada
 * recebe as dela — e até agora não recebia: ela prescrevia 1.800 kcal no
 * sistema e o app seguia mostrando as 2.200 que a pessoa chutou no cadastro,
 * sem que nenhum dos dois lados percebesse.
 *
 * ── Por dentro é RPC, e tinha de ser ───────────────────────────────────────
 * O sistema já tem policies de "paciente lê planos atribuídos". Elas não
 * servem: identificam o paciente por `pacientes.user_id = auth.uid()`, que é o
 * login do PORTAL WEB. A conta do app é `app_contas.id = auth.uid()`, ligada
 * por `app_vinculos` — para o app aquelas policies não devolvem nada.
 * `app_metas_do_paciente()` resolve o vínculo pelo caminho certo.
 *
 * ── O que ela NÃO manda ────────────────────────────────────────────────────
 * Gordura e treino não existem do lado dela. Não é omissão desta camada: as
 * colunas não existem em `metas_otimizadas`. Os dois seguem sendo do paciente,
 * e é por isso que a mistura é campo a campo e não bloco contra bloco. */

export type MetasPrescritas = {
  planoId: number
  nome: string
  objetivo: string | null
  /* 'otimizado' tem números; 'detalhado' é uma lista de tarefas por dia, que
     não vira meta numérica nenhuma. */
  tipo: 'otimizado' | 'detalhado'
  /* 'dia' | 'semana' | 'mensal'. Só o primeiro é aplicável aqui — ver
     `aplicarPrescricao`. */
  periodo: string | null
  desde: string | null
  calorias: number | null
  proteinas: number | null
  carboidratos: number | null
  fibras: number | null
  /* Já convertida de litros para mililitros pela RPC. */
  aguaMl: number | null
  passos: number | null
  sonoHoras: number | null
}

type Linha = {
  plano_id: number
  nome: string
  objetivo: string | null
  tipo: string
  periodo: string | null
  desde: string | null
  calorias: number | string | null
  proteinas: number | string | null
  carboidratos: number | string | null
  fibras: number | string | null
  agua_ml: number | string | null
  passos: number | string | null
  sono_horas: number | string | null
}

/* `numeric` volta como string do PostgREST quando não cabe em float sem perda.
   Mesmo tratamento do `sono_horas` em metas.ts. */
const numero = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/* Devolve `null` quando não há prescrição — e também quando a rede falha.
 *
 * Engolir a falha aqui é deliberado, e segue a mesma regra da foto da
 * nutricionista: função que existe para alimentar tela não rejeita. Sem sinal,
 * o app cai nas metas pessoais e continua funcionando; se isto propagasse o
 * erro, uma consulta a mais derrubaria a tela inicial inteira de quem já tinha
 * as metas dele guardadas. */
export async function carregarMetasPrescritas(): Promise<MetasPrescritas | null> {
  try {
    const { data, error } = await supabase.rpc('app_metas_do_paciente')
    if (error || !data || (data as Linha[]).length === 0) return null

    const l = (data as Linha[])[0]
    return {
      planoId: l.plano_id,
      nome: l.nome,
      objetivo: l.objetivo,
      tipo: l.tipo === 'detalhado' ? 'detalhado' : 'otimizado',
      periodo: l.periodo,
      desde: l.desde,
      calorias: numero(l.calorias),
      proteinas: numero(l.proteinas),
      carboidratos: numero(l.carboidratos),
      fibras: numero(l.fibras),
      aguaMl: numero(l.agua_ml),
      passos: numero(l.passos),
      sonoHoras: numero(l.sono_horas),
    }
  } catch {
    return null
  }
}

/* Quais campos ela definiu de fato. A tela precisa saber para poder DIZER: um
   número prescrito e um número escolhido pela própria pessoa valem coisas
   diferentes, e misturar os dois sem marcar qual é qual tira da pessoa a única
   informação que ela não tem como recuperar sozinha. */
export type CamposPrescritos = ReadonlySet<CampoMeta>

const NENHUM: CamposPrescritos = new Set<CampoMeta>()

/* Mistura campo a campo: o que ela prescreveu vence, o resto continua sendo o
 * que a pessoa escolheu.
 *
 * Bloco contra bloco seria mais simples e estaria errado. Ela costuma
 * preencher dois ou três campos — nos planos de hoje, calorias e proteína, às
 * vezes água — e trocar o conjunto inteiro apagaria a meta de gordura, de sono
 * e de treino que a pessoa definiu, sem que ninguém tivesse pedido isso. E
 * gordura e treino ela nem tem como definir: não existem do lado dela.
 *
 * ── O período ──────────────────────────────────────────────────────────────
 * Fora de 'dia', nada é aplicado. Se ela montou o plano por semana, 12.600 kcal
 * é o total de sete dias, e usar isso como meta diária mostraria à pessoa uma
 * permissão de comer seis vezes o que foi prescrito. Dividir por sete aqui
 * também não serve: seria o app decidindo uma distribuição que ela não
 * escreveu. Devolve as pessoais e deixa a tela explicar. */
/* Quais campos ela definiu, sem precisar das metas pessoais para saber.
 *
 * A tela de metas usa isto para marcar campo por campo. Marcar importa: sem a
 * marca, a pessoa edita um número, salva, e vê a tela inicial continuar
 * mostrando outro — porque aquele campo está sendo prescrito e o dela ficou
 * por baixo. Sem explicação, isso se lê como app quebrado. */
export function camposPrescritos(p: MetasPrescritas | null): CamposPrescritos {
  if (!p || p.tipo !== 'otimizado' || (p.periodo !== null && p.periodo !== 'dia')) return NENHUM

  const campos = new Set<CampoMeta>()
  if (p.calorias !== null) campos.add('calorias')
  if (p.proteinas !== null) campos.add('proteinas')
  if (p.carboidratos !== null) campos.add('carboidratos')
  if (p.fibras !== null) campos.add('fibras')
  if (p.aguaMl !== null) campos.add('aguaMl')
  if (p.passos !== null) campos.add('passos')
  if (p.sonoHoras !== null) campos.add('sonoHoras')
  return campos
}

export function aplicarPrescricao(
  pessoais: Metas,
  p: MetasPrescritas | null,
): { metas: Metas; prescritos: CamposPrescritos } {
  const prescritos = camposPrescritos(p)
  if (!p || prescritos.size === 0) return { metas: pessoais, prescritos: NENHUM }

  const metas = { ...pessoais }
  const por = <C extends CampoMeta>(campo: C, valor: number | null) => {
    if (prescritos.has(campo) && valor !== null) metas[campo] = valor as Metas[C]
  }

  por('calorias', p.calorias)
  por('proteinas', p.proteinas)
  por('carboidratos', p.carboidratos)
  por('fibras', p.fibras)
  por('aguaMl', p.aguaMl)
  por('passos', p.passos)
  por('sonoHoras', p.sonoHoras)

  return { metas, prescritos }
}
