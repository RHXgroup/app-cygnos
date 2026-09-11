import { falha } from './erros'
import { supabase } from './supabase'

/* Os dias em que um paciente DELA registrou alguma coisa no app.
 *
 * O irmão de `sequencia.ts`, que lê os dias da própria conta. Aqui quem pergunta
 * é a nutricionista, sobre alguém da carteira dela -- e a regra que decide o
 * que os dias significam continua sendo a mesma, em `sequenciaDaPessoa`, lida
 * por `adesaoDoPaciente`.
 *
 * ── Quem garante que é paciente dela é o BANCO ────────────────────────────
 * O id do paciente vai no corpo, e isso seria um furo se a função confiasse
 * nele: a lista de dias em que alguém registrou peso ou sono é informação de
 * saúde. `nutri_dias_com_registro` confere dentro dela que o paciente pertence
 * a quem chamou (`pacientes.nutricionista_id = get_nutricionista_id()`), e para
 * paciente de outra carteira responde como "não tem app" -- sem dizer que o
 * paciente existe.
 *
 * ── Três respostas, e não duas ────────────────────────────────────────────
 *   null           não deu para ler (rede, função fora do ar)
 *   { temApp: false }            não tem conta no app vinculada
 *   { temApp: true, dias: [...] } tem, e estes são os dias
 *
 * Falha e "sem app" separados pelo mesmo motivo de `sequencia.ts`: uma queda de
 * rede não pode aparecer na ficha como "não usa o aplicativo". Item 11: não
 * rejeita. */
export type DiasDoPaciente = { temApp: false } | { temApp: true; dias: string[] }

export async function carregarDiasDoPaciente(pacienteId: number): Promise<DiasDoPaciente | null> {
  const { data, error } = await supabase.rpc('nutri_dias_com_registro', {
    p_paciente_id: pacienteId,
  })

  if (error) {
    falha('Não consegui ler os registros do paciente no app.', error)
    return null
  }

  const r = data as { tem_app?: unknown; dias?: unknown } | null
  if (!r || typeof r !== 'object') return null
  if (r.tem_app !== true) return { temApp: false }

  /* Formato inesperado é falha nossa, e não "nunca registrou". */
  if (!Array.isArray(r.dias)) return null
  return {
    temApp: true,
    dias: r.dias.filter((d): d is string => typeof d === 'string' && d.length === 10),
  }
}
