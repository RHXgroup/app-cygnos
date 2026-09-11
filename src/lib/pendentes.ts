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

/* ── A fila é do APARELHO, e cada item é de uma CONTA ────────────────────
 *
 * Contar e enviar só o que é de quem está logado. Antes a fila inteira ia para
 * a rede em ordem, parando no primeiro erro -- e o item de OUTRA conta é
 * sempre erro (a RLS recusa gravar no diário de outra pessoa). Bastava sair de
 * uma conta com um item pendurado e entrar noutra: o item alheio ficava na
 * frente, recusado a cada tentativa, e travava para sempre a fila da conta nova,
 * que via "1 esperando para enviar" sem nunca conseguir. Acontece com
 * quem testa, que alterna contas no mesmo celular, e com o celular emprestado.
 *
 * O item alheio fica guardado, e não é jogado fora: é o almoço de alguém, e
 * ele sobe quando essa pessoa entrar de novo. Achado na terceira rodada de
 * testes, perguntando o que sobrevive a trocar de conta. */
export async function quantosPendentes(contaId: string): Promise<number> {
  return (await ler()).filter(p => p.contaId === contaId).length
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
export async function enviarPendentes(contaId: string): Promise<ResultadoEnvio> {
  const minha = (await ler()).filter(p => p.contaId === contaId)
  if (minha.length === 0) return { enviados: 0, restantes: 0 }

  const subiram = new Set<string>()

  for (const p of minha) {
    const r = await registrarConsumo(p.contaId, [p.item], new Date(p.em))
    if (r.tipo === 'erro') break
    subiram.add(chaveDo(p))
  }

  /* Relê antes de gravar, e tira só o que subiu. Gravar a cópia lida no
     começo (era `fila.slice(enviados)`) apagava o item que a tela guardou
     enquanto o envio andava -- justamente o registro feito sem sinal, que é o
     que esta fila existe para não perder. */
  await gravar((await ler()).filter(p => !subiram.has(chaveDo(p))))

  return { enviados: subiram.size, restantes: minha.length - subiram.size }
}

/* Dois registros idênticos no mesmo milissegundo, da mesma conta, são o mesmo
   registro -- não existe outro jeito de a pessoa produzi-los. */
const chaveDo = (p: Pendente): string => p.contaId + '|' + p.em + '|' + JSON.stringify(p.item)

export async function limparPendentes(): Promise<void> {
  await gravar([])
}
