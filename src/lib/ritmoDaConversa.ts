/* Quanto ela costuma demorar para responder, calculado da própria conversa.
 *
 * ── Por que isto existe ────────────────────────────────────────────────────
 * Sem push, quem manda uma mensagem fica esperando sem referência. Duas horas
 * de silêncio podem ser normais ou podem ser esquecimento, e a pessoa não tem
 * como saber a diferença — então ela reabre o app, remanda, ou desiste.
 *
 * A conversa já responde isso: basta olhar quanto tempo passou entre o que ele
 * escreveu e a resposta dela, nas vezes anteriores. Nenhum dado novo, nenhuma
 * coluna, nenhuma chamada a mais.
 *
 * ── Mediana, não média ─────────────────────────────────────────────────────
 * Uma resposta que demorou três dias porque ela estava de férias jogaria a média
 * para cima e a frase mentiria para baixo o resto do tempo. A mediana ignora o
 * caso isolado, que é o que "costuma" quer dizer.
 *
 * Sem I/O e sem `Date.now()`: entra a lista, sai o número. */

export type MensagemDoRitmo = {
  de: string
  criadaEm: string
}

/* Quantas respostas bastam para dizer "costuma".
 *
 * Com uma só não há costume nenhum — é um caso. Com duas, uma delas fora do
 * normal domina. Três é o mínimo em que a mediana significa alguma coisa, e é
 * o mesmo critério que `janelaDe` usa para o sono. */
const MINIMO_DE_RESPOSTAS = 3

/* Acima disto a frase não ajuda mais: "costuma responder em 5 dias" não muda o
   que a pessoa faz, e ainda soa como acusação a quem talvez tenha respondido
   rápido nas últimas. */
const LIMITE_DE_MINUTOS = 3 * 24 * 60

function mediana(ns: number[]): number {
  const ordenados = [...ns].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2)
}

/* Os intervalos entre o que ELE escreveu e a PRIMEIRA resposta dela.
 *
 * Conta a partir da PRIMEIRA mensagem de uma sequência dele: quem manda três
 * seguidas está esperando desde a primeira, e medir da última faria a espera
 * parecer menor do que foi. */
export function esperasEmMinutos(mensagens: MensagemDoRitmo[]): number[] {
  const esperas: number[] = []
  let desde: number | null = null

  for (const m of mensagens) {
    const quando = new Date(m.criadaEm).getTime()
    if (!Number.isFinite(quando)) continue

    if (m.de === 'paciente') {
      if (desde === null) desde = quando
      continue
    }

    if (m.de === 'nutricionista' && desde !== null) {
      const minutos = (quando - desde) / 60000
      /* Negativo é relógio torto ou ordem quebrada — descarta em vez de somar
         uma espera impossível. */
      if (minutos >= 0) esperas.push(minutos)
      desde = null
    }
  }

  return esperas
}

/* "alguns minutos", "cerca de 2 horas", "cerca de 1 dia" — ou null quando não
 * há o que dizer.
 *
 * Sempre aproximado, e de propósito: "costuma responder em 1h47" promete uma
 * precisão que não existe, e faz a pessoa cobrar o minuto. */
export function comoElaResponde(mensagens: MensagemDoRitmo[]): string | null {
  const esperas = esperasEmMinutos(mensagens)
  if (esperas.length < MINIMO_DE_RESPOSTAS) return null

  const m = mediana(esperas)
  if (m > LIMITE_DE_MINUTOS) return null

  if (m < 15) return 'alguns minutos'
  if (m < 90) return `cerca de ${Math.round(m / 15) * 15} minutos`

  const horas = m / 60
  if (horas < 24) {
    const h = Math.round(horas)
    return `cerca de ${h} ${h === 1 ? 'hora' : 'horas'}`
  }

  const dias = Math.round(horas / 24)
  return `cerca de ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}
