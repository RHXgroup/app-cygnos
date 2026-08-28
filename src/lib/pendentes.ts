import AsyncStorage from '@react-native-async-storage/async-storage'
import { registrarConsumo, type ItemParaGravar } from './consumo'

/* O que não conseguiu ser gravado, guardado para tentar de novo.
 *
 * Registrar comida acontece no restaurante, na rua, no elevador — e uma
 * gravação que falha por falta de sinal hoje mostra um erro vermelho e joga
 * fora o que a pessoa acabou de descrever. Ela olha para a tela, não vê o item,
 * e descreve tudo de novo. Ou desiste.
 *
 * ── Por que isto, e não um modo offline ────────────────────────────────────
 * Um modo offline de verdade é fila, sincronização e resolução de conflito para
 * o app inteiro — semanas de trabalho, para um app que se usa quase sempre com
 * sinal. O que dói de verdade é bem mais estreito: perder o registro no momento
 * em que ele falha. É isso que esta fila cobre, por uma fração do custo.
 *
 * ── O que NÃO entra aqui ───────────────────────────────────────────────────
 * Apagar e editar. Reenviar um "apague o item X" depois de horas pode apagar
 * outra coisa se o diário mudou no meio, e uma correção que reaparece sozinha
 * assusta mais do que a falha original. Só a criação é reenviada: no pior caso
 * ela duplica, e duplicata a pessoa vê e remove. */

const CHAVE = 'consumo.pendentes'

/* Um item que espera. A data é a de quando a pessoa registrou, e não a de
   quando o envio deu certo: comer às 12h e a rede voltar às 15h não muda a hora
   do almoço. */
type Pendente = {
  contaId: string
  item: ItemParaGravar
  /* ISO. Vira o `quando` do reenvio. */
  em: string
}

/* Teto da fila. Acima disso, algo está errado de um jeito que reenviar não
   resolve — e uma fila que cresce sem limite acaba estourando o storage do
   aparelho. */
const TETO = 200

async function ler(): Promise<Pendente[]> {
  try {
    const cru = await AsyncStorage.getItem(CHAVE)
    if (!cru) return []
    const lista = JSON.parse(cru) as Pendente[]
    return Array.isArray(lista) ? lista : []
  } catch {
    /* JSON corrompido não pode derrubar o app nem impedir novos registros: a
       fila é um cache, não a verdade. */
    return []
  }
}

async function gravar(lista: Pendente[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(lista.slice(-TETO)))
  } catch {
    /* Sem storage não há o que fazer — e falhar aqui não pode falhar o registro
       que já deu certo. */
  }
}

export async function guardarPendentes(
  contaId: string,
  itens: ItemParaGravar[],
  em = new Date(),
): Promise<void> {
  if (itens.length === 0) return
  const fila = await ler()
  await gravar([...fila, ...itens.map(item => ({ contaId, item, em: em.toISOString() }))])
}

export async function quantosPendentes(): Promise<number> {
  return (await ler()).length
}

export type ResultadoEnvio = {
  enviados: number
  restantes: number
}

/* Tenta enviar o que está esperando.
 *
 * Um por vez, e parando no primeiro erro: se a rede caiu, ela caiu para todos,
 * e insistir nos duzentos só gasta bateria. O que já subiu sai da fila na hora,
 * então uma falha no meio não faz os anteriores voltarem. */
export async function enviarPendentes(): Promise<ResultadoEnvio> {
  const fila = await ler()
  if (fila.length === 0) return { enviados: 0, restantes: 0 }

  let enviados = 0

  for (const p of fila) {
    const r = await registrarConsumo(p.contaId, [p.item], new Date(p.em))
    if (r.tipo === 'erro') break
    enviados++
  }

  const restantes = fila.slice(enviados)
  await gravar(restantes)

  return { enviados, restantes: restantes.length }
}

export async function limparPendentes(): Promise<void> {
  await gravar([])
}
