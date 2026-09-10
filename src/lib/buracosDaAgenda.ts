/* Os buracos da agenda: onde ainda cabe alguém.
 *
 * ──────────────────── A pergunta que a tela não respondia ────────────────────
 * "Quando eu tenho vaga?" é a pergunta que ela faz com a paciente na frente
 * pedindo retorno. Até agora a agenda respondia por eliminação: ela lia as seis
 * consultas do dia e calculava o vazio de cabeça, com alguém esperando.
 *
 * ──────────────────── Por que isto é lib, e não um `filter` dentro da tela ────────────────────
 * Porque é aritmética de relógio, e é onde este projeto mais errou -- o cartão
 * da próxima refeição, o descanso do treino, a janela da água. Fora do
 * componente dá para põr o relógio onde se quiser e conferir a virada de hora
 * sem esperar ela chegar.
 *
 * ──────────────────── O que NÃO é buraco ────────────────────
 *   - o que já passou. Às 15h, "livre das 09:00 às 10:00" é uma resposta
 *     falsa para a pergunta que ela está fazendo. Um buraco que começou antes
 *     de agora é CORTADO em agora, e some quando não sobra nada dele.
 *   - o que é curto demais para caber uma consulta. Doze minutos entre duas
 *     não é vaga; é o intervalo de respirar. Mostrar viraria uma lista de
 *     frestas, e uma lista assim é ignorada inteira -- inclusive os buracos de
 *     verdade no meio dela.
 *   - dia fora do expediente. Domingo não é "livre o dia inteiro".
 *
 * ──────────────────── E o ENCAIXE não fecha buraco ────────────────────
 * Consulta marcada como encaixe existe justamente para caber onde não cabia --
 * ela se sobrepõe de propósito. Se ela fechasse o buraco, marcar um encaixe
 * apagaria da tela a vaga que continua vaga. É a mesma regra da conferência de
 * choque no banco, e ela precisa concordar dos dois lados. */

import type { ConsultaDoDia } from './diaDaNutri'

/** O expediente dela, como está em `configuracoes`. */
export type Expediente = {
  /** '08:00' */
  inicio: string
  /** '18:00' */
  fim: string
  /** ISO: 1=segunda … 7=domingo. */
  diasDaSemana: number[]
}

export const EXPEDIENTE_PADRAO: Expediente = {
  inicio: '08:00',
  fim: '18:00',
  diasDaSemana: [1, 2, 3, 4, 5],
}

/* ──────────────────── OS DOIS NUMEROS QUE PRECISAM CONCORDAR ────────────────────
 *
 * Um buraco so vale a pena quando cabe uma consulta inteira, e "uma consulta"
 * aqui e a mesma suposicao que o resto da agenda usa: `DURACAO_SUPOSTA_MIN`, em
 * `diaDaNutri`.
 *
 * E ele NAO e importado, e o motivo e a regra do proprio projeto: para este
 * arquivo rodar no Node -- que e o que permite exercitar a virada de hora com o
 * relogio parado --, ele nao pode importar nada de runtime, so `import type`,
 * que some na compilacao. Um `import` de constante quebraria o teste inteiro.
 *
 * Numero repetido e a armadilha 5 esperando acontecer, entao o teste ao lado
 * LE o outro arquivo como texto e reprova se os dois divergirem. E a mesma
 * saida de `fontes.teste.mts`, e pelo mesmo motivo: o sintoma de divergirem
 * seria a tela oferecer uma vaga onde a consulta nao cabe. */
export const MINIMO_DO_BURACO_MIN = 50

/* A duracao suposta de quem nao informou. Mesmo numero, mesma razao. */
const DURACAO_SUPOSTA_MIN = 50

export type Buraco = {
  /** Instante do início, em milissegundos. */
  de: number
  ate: number
  minutos: number
}

/** '08:00' vira 480. Devolve `null` para qualquer coisa que não seja hora. */
export function emMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Os pedaços livres do dia, em ordem.
 *
 * `dia` é qualquer instante DENTRO do dia que interessa -- a função só usa a
 * data dele, no relógio local. `agora` entra separado porque o dia pode ser
 * amanhã: aí nada foi cortado, e o expediente inteiro está disponível.
 */
export function buracosDoDia(
  consultas: ConsultaDoDia[],
  dia: Date,
  agora: Date = new Date(),
  expediente: Expediente = EXPEDIENTE_PADRAO,
): Buraco[] {
  if (Number.isNaN(dia.getTime())) return []

  const abre = emMinutos(expediente.inicio)
  const fecha = emMinutos(expediente.fim)
  /* Fim menor ou igual ao início cai no padrão, como a grade da semana já faz
     -- o comentário da coluna no banco diz isso com todas as letras. Sem esta
     linha o dia teria duração negativa e a tela mostraria um buraco ao
     contrário. */
  const inicioDoDia = abre === null || fecha === null || fecha <= abre ? 8 * 60 : abre
  const fimDoDia = abre === null || fecha === null || fecha <= abre ? 18 * 60 : fecha

  /* `getDay()` é 0=domingo; o banco guarda ISO, 1=segunda … 7=domingo. */
  const diaISO = dia.getDay() === 0 ? 7 : dia.getDay()
  const dias = expediente.diasDaSemana?.length ? expediente.diasDaSemana : EXPEDIENTE_PADRAO.diasDaSemana
  if (!dias.includes(diaISO)) return []

  const meiaNoite = new Date(dia)
  meiaNoite.setHours(0, 0, 0, 0)
  const base = meiaNoite.getTime()

  const abertura = base + inicioDoDia * 60_000
  const fechamento = base + fimDoDia * 60_000

  /* O que OCUPA. Cancelada não ocupa; encaixe não ocupa (ver o cabeçalho);
     data que não parseia é descartada em vez de virar `NaN` -- e `NaN` aqui
     atravessaria a ordenação e produziria um buraco de `NaN` minutos na tela. */
  const ocupados = consultas
    .filter(c => c.status !== 'cancelada' && !c.encaixe)
    .map(c => {
      const de = Date.parse(c.quando)
      if (!Number.isFinite(de)) return null
      const dura = Number(c.duracao)
      const minutos = Number.isFinite(dura) && dura > 0 ? dura : DURACAO_SUPOSTA_MIN
      return { de, ate: de + minutos * 60_000 }
    })
    .filter((x): x is { de: number; ate: number } => x !== null)
    .sort((a, b) => a.de - b.de)

  const buracos: Buraco[] = []
  /* O cursor começa na abertura OU em agora, o que for mais tarde. É isto que
     apaga o passado sem precisar de um segundo filtro depois. */
  let cursor = Math.max(abertura, agora.getTime())

  for (const o of ocupados) {
    if (o.ate <= cursor) continue
    if (o.de > cursor) juntar(buracos, cursor, Math.min(o.de, fechamento))
    cursor = Math.max(cursor, o.ate)
    if (cursor >= fechamento) break
  }
  juntar(buracos, cursor, fechamento)

  return buracos
}

/* Só entra o que cabe. A conta é feita aqui e não em quem chama, para o teto
   valer igual no último buraco do dia e nos do meio. */
function juntar(destino: Buraco[], de: number, ate: number) {
  const minutos = Math.round((ate - de) / 60_000)
  if (minutos >= MINIMO_DO_BURACO_MIN) destino.push({ de, ate, minutos })
}

/** "3h10", "50 min", "2h". Para a etiqueta ao lado do buraco. */
export function duracaoPorExtenso(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return ''
  if (minutos < 60) return minutos + ' min'
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? horas + 'h' : horas + 'h' + String(resto).padStart(2, '0')
}
