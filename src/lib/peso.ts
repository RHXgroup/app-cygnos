import { dataISO } from './formatar'
import { supabase } from './supabase'
import { falha } from './erros'

/* Peso: um registro por dia, e o PRIMEIRO deles é a régua.
 *
 * Toda a tela inicial responde a uma pergunta só — desde que comecei, subiu ou
 * desceu? — e a resposta é sempre contra o registro mais antigo, nunca contra o
 * de ontem. Comparar com ontem mediria a oscilação do sal e da água do jantar;
 * comparar com o começo mede o que a pessoa veio medir.
 *
 * Ver a migração 20260801000002. Nada aqui conversa com antropometria_*, que é
 * a avaliação da nutricionista. */

export type RegistroPeso = {
  id: string
  kg: number
  /* 'YYYY-MM-DD', o dia do calendário de quem pesou. */
  data: string
}

export type Peso = {
  /* Do mais recente para o mais antigo: é a ordem da lista na tela. */
  registros: RegistroPeso[]
}

export type ResultadoPeso = { tipo: 'ok'; peso: Peso } | { tipo: 'erro'; mensagem: string }

/* Os limites são os do constraint do banco, repetidos para a tela poder recusar
   antes de enviar — o erro do Postgres diria "violates check constraint". */
export const KG_MIN = 20
export const KG_MAX = 400

/* Quantos dias a curva da tela inicial mostra. Trinta porque é o que cabe num
   traço de 150 pontos sem virar um borrão, e porque é a janela em que uma
   mudança de peso real fica visível. */
export const DIAS_DA_CURVA = 30

export async function carregarPeso(contaId: string): Promise<ResultadoPeso> {
  const { data, error } = await supabase
    .from('app_peso_registros')
    .select('id, kg, data')
    .eq('conta_id', contaId)
    .order('data', { ascending: false })

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui carregar o seu peso. Verifique a conexão.', error),
    }

  return {
    tipo: 'ok',
    peso: {
      /* numeric volta como string do PostgREST quando não cabe em float sem
         perda; o Number resolve os dois casos. */
      registros: (data ?? []).map(r => ({ id: r.id as string, kg: Number(r.kg), data: r.data as string })),
    },
  }
}

export type ResultadoRegistroPeso =
  | { tipo: 'ok'; registro: RegistroPeso }
  | { tipo: 'erro'; mensagem: string }

/* Grava o peso do dia. Upsert e não insert: pesar de novo hoje CORRIGE hoje.
 *
 * Sem isto, quem sobe na balança duas vezes na mesma manhã esbarraria num erro
 * de chave duplicada — e a mensagem certa para essa pessoa não é "já existe",
 * é o número novo no lugar do velho. */
export async function registrarPeso(
  contaId: string,
  kg: number,
  quando = new Date(),
): Promise<ResultadoRegistroPeso> {
  const { data, error } = await supabase
    .from('app_peso_registros')
    .upsert(
      {
        conta_id: contaId,
        /* Duas casas, como a balança mostra. */
        kg: Math.round(kg * 100) / 100,
        data: dataISO(quando),
      },
      { onConflict: 'conta_id,data' },
    )
    .select('id, kg, data')
    .single()

  if (error)
    return {
      tipo: 'erro',
      mensagem: falha('Não consegui registrar o seu peso agora. Verifique a conexão.', error),
    }
  return {
    tipo: 'ok',
    registro: { id: data.id as string, kg: Number(data.kg), data: data.data as string },
  }
}

export async function apagarRegistroPeso(id: string): Promise<{ erro: string } | null> {
  const { error } = await supabase.from('app_peso_registros').delete().eq('id', id)
  if (!error) return null
  return {
    erro: falha('Não consegui remover este registro agora. Verifique a conexão.', error),
  }
}

/* ── Evolução ──────────────────────────────────────────────────────────────*/

export type Evolucao = {
  /* O mais recente. */
  atual: number
  /* O mais antigo — a régua. */
  inicial: number
  dataInicial: string
  /* atual − inicial. Negativo é perda, positivo é ganho. */
  variacao: number
  /* Ganhou, perdeu ou está no mesmo lugar.
   *
   * "manteve" existe como caso próprio porque 100 gramas em três meses não é
   * uma evolução — é a balança. Sem essa faixa, a tela ficaria anunciando
   * "ganhou 0,1 kg" para quem não mudou nada. */
  sentido: 'ganho' | 'perda' | 'manteve'
  /* Quantos registros existem. A tela usa para diferenciar "só pesei uma vez"
     de "já tenho histórico". */
  quantos: number
}

/* Abaixo disso, é a balança falando, não o corpo. */
export const MARGEM_KG = 0.2

/* A evolução, ou null quando ainda não há de onde tirá-la.
 *
 * Um único registro devolve evolução mesmo assim, com variação zero: quem acabou
 * de se pesar pela primeira vez tem um peso atual de verdade para ver, e é a
 * tela que decide se fala em variação ou não. */
export function evolucaoDe(registros: RegistroPeso[]): Evolucao | null {
  if (registros.length === 0) return null

  /* A lista chega do mais recente para o mais antigo — a mesma ordem da tela.
     Confiar nessa ordem aqui dentro tornaria esta função dependente de quem a
     chamou, então ela mesma escolhe as pontas. */
  const atual = registros.reduce((a, b) => (a.data >= b.data ? a : b))
  const primeiro = registros.reduce((a, b) => (a.data <= b.data ? a : b))

  const variacao = atual.kg - primeiro.kg

  return {
    atual: atual.kg,
    inicial: primeiro.kg,
    dataInicial: primeiro.data,
    variacao,
    sentido: Math.abs(variacao) < MARGEM_KG ? 'manteve' : variacao > 0 ? 'ganho' : 'perda',
    quantos: registros.length,
  }
}

/* Os pesos em ordem de calendário, para o traço do gráfico. Do mais antigo para
   o mais novo — ao contrário da lista —, porque um gráfico que anda para trás
   no tempo mostraria a evolução ao contrário. */
export function serieDe(registros: RegistroPeso[], quantos = DIAS_DA_CURVA): number[] {
  return [...registros]
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-quantos)
    .map(r => r.kg)
}

/* "72,4" — uma casa na tela, mesmo com duas guardadas. A segunda casa importa
   para a conta da variação não acumular erro; para ler, 72,45 é ruído. */
export const kg = (n: number) => n.toFixed(1).replace('.', ',')

/* "2,3" — o tamanho da variação, sem sinal. Quem diz se subiu ou desceu é a
   palavra ao lado, não o menos: "−2,3 kg" e "perdeu" juntos dizem a mesma coisa
   duas vezes, e o menos é o mais fácil de ler errado. */
export const variacaoEmKg = (n: number) => Math.abs(n).toFixed(1).replace('.', ',')
