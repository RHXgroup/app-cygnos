import { supabase } from './supabase'
import { falha } from './erros'
import { atividadePor, calcularTMB, formulaPara, type ChaveAtividade, type Sexo } from './energia'

/* Gasto energético NOVO, feito no celular.
 *
 * ──────────────────── O pedido ────────────────────
 * "Se eu quiser editar as informações de gasto energético aqui também não
 * consigo, clica e fica meio bloqueado." A ficha mostrava o cálculo do sistema
 * e nada mais -- e o gasto é o número de que sai o plano inteiro.
 *
 * ──────────────────── Não EDITA: refaz ────────────────────
 * A tabela do sistema não tem "ativo": todo leitor de lá pega o ÚLTIMO por
 * `created_at`, e é assim que a ficha já lia. Então gravar uma linha nova é o
 * que "editar" quer dizer nos dois lados -- e mexer na linha antiga apagaria a
 * conta que sustentou o plano que está valendo, que é justamente o que se quer
 * poder comparar ("o gasto subiu de 1.800 para 2.100").
 *
 * ──────────────────── As fórmulas são as do app, e as chaves são as do site ────
 * `energia.ts` já calcula Mifflin-St Jeor e FAO/OMS com os mesmos fatores de
 * atividade do sistema -- está escrito lá que foram mantidos idênticos de
 * propósito. E as chaves que vão para a coluna `formula` (`mifflin`,
 * `fao_who_crianca`) existem no catálogo do site, então o cálculo feito aqui
 * abre lá com o nome certo em vez de virar um rótulo desconhecido. */

export type PedidoDeCalculo = {
  pacienteId: number
  pesoKg: number
  alturaCm: number
  idade: number
  sexo: Sexo
  atividade: ChaveAtividade
  observacoes?: string | null
}

export type ResultadoDoCalculo =
  | { tipo: 'ok'; tmb: number; get: number }
  | { tipo: 'erro'; mensagem: string }

/* Os limites são os mesmos do cadastro do app -- e existem porque um peso de
   750 kg (o dedo no 7) vira um gasto de cinco mil e um plano inteiro errado. */
const PESO_MIN = 2
const PESO_MAX = 400
const ALTURA_MIN = 40
const ALTURA_MAX = 250
const IDADE_MAX = 120

export function conferirCalculo(p: PedidoDeCalculo): string | null {
  if (!Number.isFinite(p.pesoKg) || p.pesoKg < PESO_MIN || p.pesoKg > PESO_MAX) {
    return 'O peso precisa estar entre 2 e 400 kg.'
  }
  if (!Number.isFinite(p.alturaCm) || p.alturaCm < ALTURA_MIN || p.alturaCm > ALTURA_MAX) {
    return 'A altura precisa estar entre 40 e 250 cm.'
  }
  if (!Number.isFinite(p.idade) || p.idade < 0 || p.idade > IDADE_MAX) {
    return 'Confira a idade.'
  }
  return null
}

/* O par de números, sem tocar no banco. A tela mostra enquanto ela digita, e é
   isso que faz o erro de digitação aparecer ANTES de gravar. */
export function contaDoGasto(p: {
  pesoKg: number
  alturaCm: number
  idade: number
  sexo: Sexo
  atividade: ChaveAtividade
}): { tmb: number; get: number; formula: string; nomeDaFormula: string } | null {
  const sobre = formulaPara(p.idade)
  const tmb = calcularTMB(sobre.chave, p.pesoKg, p.alturaCm, p.idade, p.sexo)
  if (!Number.isFinite(tmb) || tmb <= 0) return null

  const fator = atividadePor(p.atividade).fator
  return {
    tmb: Math.round(tmb),
    get: Math.round(tmb * fator),
    formula: sobre.chave,
    nomeDaFormula: sobre.nome,
  }
}

export async function salvarCalculo(p: PedidoDeCalculo): Promise<ResultadoDoCalculo> {
  const recusa = conferirCalculo(p)
  if (recusa) return { tipo: 'erro', mensagem: recusa }

  const conta = contaDoGasto(p)
  if (!conta) return { tipo: 'erro', mensagem: 'Não consegui calcular com esses números.' }

  /* A carteira sai do próprio paciente, como no import de exame: a política de
     `pacientes` já recorta pela dela, então a leitura é também a conferência de
     que este paciente é dela. */
  const { data: dono, error: erroDono } = await supabase
    .from('pacientes')
    .select('nutricionista_id')
    .eq('id', p.pacienteId)
    .maybeSingle()

  const carteira = (dono as { nutricionista_id?: string } | null)?.nutricionista_id
  if (erroDono || !carteira) {
    return { tipo: 'erro', mensagem: falha('Não consegui confirmar de quem é esse paciente.', erroDono) }
  }

  const { error } = await supabase.from('calculo_energetico').insert({
    nutricionista_id: carteira,
    paciente_id: p.pacienteId,
    peso: p.pesoKg,
    altura: p.alturaCm,
    idade: Math.round(p.idade),
    sexo: p.sexo,
    formula: conta.formula,
    fator_atividade: atividadePor(p.atividade).fator,
    /* Um, e não nulo: a coluna é `not null` com padrão 1, e o sistema multiplica
       por ela. Mandar nulo daqui seria um gasto zerado do outro lado. */
    fator_lesao: 1,
    tmb: conta.tmb,
    get_total: conta.get,
    observacoes: p.observacoes?.trim() || null,
  })

  if (error) {
    return { tipo: 'erro', mensagem: falha('Não consegui salvar o cálculo.', error) }
  }
  return { tipo: 'ok', tmb: conta.tmb, get: conta.get }
}
