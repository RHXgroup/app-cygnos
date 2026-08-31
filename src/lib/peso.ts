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
        /* Três casas, e não duas.
         *
         * Duas era o palpite de que balança de banheiro mostra "83,68". Balança
         * de bioimpedância mostra 83,685, e cortar a terceira casa é jogar fora
         * medida que a pessoa tem — sem avisar, o que é pior do que recusar. A
         * coluna acompanha, em numeric(6,3). */
        kg: Math.round(kg * 1000) / 1000,
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

/* O período mínimo para falar em ritmo.
 *
 * Duas semanas, e não uma. O peso oscila cerca de um quilo entre a manhã e a
 * noite só por causa de água e comida no corpo — e transformar essa oscilação
 * em "você está perdendo 1 kg por semana" seria vender ruído como tendência.
 * Em catorze dias o ruído ainda existe, mas já não manda na conta. */
export const DIAS_PARA_RITMO = 14

/* Quantos quilos por semana, entre o primeiro e o último registro.
 *
 * É o que faltava para a variação querer dizer alguma coisa: "perdeu 2,3 kg"
 * é uma frase diferente em três semanas e em oito meses, e a tela dizia a mesma
 * para as duas.
 *
 * Sem julgamento junto, de propósito. Se o ritmo é saudável, rápido demais ou
 * lento demais é conversa com a nutricionista — o app mede, e dizer "está
 * rápido demais" seria dar um parecer que ele não tem como sustentar. */
export function ritmoSemanal(registros: RegistroPeso[]): number | null {
  if (registros.length < 2) return null

  const atual = registros.reduce((a, b) => (a.data >= b.data ? a : b))
  const primeiro = registros.reduce((a, b) => (a.data <= b.data ? a : b))

  const dias = Math.round(
    (Date.parse(`${atual.data}T00:00:00`) - Date.parse(`${primeiro.data}T00:00:00`)) / 86400000,
  )
  if (!Number.isFinite(dias) || dias < DIAS_PARA_RITMO) return null

  return ((atual.kg - primeiro.kg) / dias) * 7
}

/* O traço do gráfico saiu daqui e virou `tendenciaDoPeso`.
 *
 * `serieDe` devolvia os quilos como foram registrados, e o gráfico do peso cru
 * é o que faz alguém concluir que engordou por causa de 1 kg de água. Apagada
 * na mesma alteração que a substituiu — item 5 do AGENTS.md: duas
 * implementações do mesmo assunto sempre divergem, e ninguém descobre por qual
 * das duas a tela passa. */

/* "72,4" — uma casa na tela, mesmo com três guardadas. As outras importam para
   a conta da variação não acumular erro; para LER, 72,453 é ruído.

   Só que ler não é o único uso. Ver `kgExato` logo abaixo, e a diferença entre
   as duas é um defeito que já aconteceu. */
export const kg = (n: number) => n.toFixed(1).replace('.', ',')

/* O peso como foi registrado, sem casa inventada nem casa perdida: 83,685 volta
 * "83,685", 83,5 volta "83,5", e 83 volta "83".
 *
 * Existe porque `kg` acima é formatador de TELA, e ele estava sendo usado para
 * preencher o CAMPO. O efeito: a pessoa digitava 83,685, o registro voltava do
 * banco, o campo era reescrito com "83,7" — e o app parecia recusar a casa
 * decimal que ela tinha acabado de digitar. Ela não estava errada: para quem
 * olha, aquilo é o campo dizendo "aqui só entra número redondo".
 *
 * É a mesma armadilha do AGENTS.md item 3, pelo outro lado: lá o valor entrava
 * no campo sem passar pelo filtro; aqui ele passa por um formatador que não
 * tinha nada que estar no caminho da escrita. */
export const kgExato = (n: number) =>
  String(Math.round(n * 1000) / 1000).replace('.', ',')

/* "2,3" — o tamanho da variação, sem sinal. Quem diz se subiu ou desceu é a
   palavra ao lado, não o menos: "−2,3 kg" e "perdeu" juntos dizem a mesma coisa
   duas vezes, e o menos é o mais fácil de ler errado. */
export const variacaoEmKg = (n: number) => Math.abs(n).toFixed(1).replace('.', ',')
