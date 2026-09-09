/* Quando o aviso dela deve tocar.
 *
 * ──────────────────── Por que separado do resto ────────────────────
 * É a única parte disto que pode errar. Guardar um texto e agendar uma
 * notificação são duas chamadas de biblioteca; transformar "daqui 2h" num
 * instante é aritmética de relógio, e é onde este projeto já errou em quatro
 * telas. Fora do componente dá para parar o relógio e conferir a virada de
 * hora, de dia e de ano sem esperar nenhuma delas chegar.
 *
 * ──────────────────── As três formas, e por que exatamente estas ────────────────────
 * São as três que alguém usa entre duas consultas:
 *
 *   "2h" ou "30min"   -> daqui a tanto tempo. É a mais pedida ("me lembra
 *                        daqui duas horas") e a que não exige olhar o relógio.
 *   "16:30"           -> hoje nesse horário; se já passou, amanhã.
 *   "amanhã 09:00"    -> o dia seguinte, na hora dita.
 *
 * NÃO tem interpretador de linguagem. "Depois do almoço" e "quando eu chegar"
 * não entram: adivinhar um horário a partir disso é escolher por ela um
 * momento que ela não disse, e um aviso na hora errada é pior do que nenhum --
 * ela para de confiar e desliga tudo.
 *
 * ──────────────────── "Se já passou, amanhã" ────────────────────
 * Ela digita 09:00 às 14h porque quer ser avisada amanhã de manhã -- ninguém
 * cria um aviso para um instante que já foi. Recusar seria tecnicamente certo e
 * praticamente inútil; o que a tela faz é DIZER para qual dia foi, e é por isso
 * que a resposta traz o instante inteiro e não só "ok". */

export type QuandoDoAviso =
  | { tipo: 'ok'; quando: Date }
  | { tipo: 'erro'; mensagem: string }

/* Teto de 30 dias, e nao de um ano.
 *
 * Nao e paranoia: `1000h` e facil de digitar sem querer no lugar de `10:00`, e
 * um teto de um ano deixaria isso passar como "daqui a 41 dias" -- exatamente o
 * tipo de coisa que ninguem descobre, porque o sintoma e ela nunca ser avisada.
 *
 * Trinta dias tambem e o limite do que este campo deve resolver. Aviso para o
 * mes que vem nao e aviso, e compromisso: mora na agenda, que ja existe e ja
 * aparece na tela dela. Este campo e para "me lembra daqui duas horas".
 *
 * (Eu tinha escrito um ano aqui, com o proprio comentario falando de 41 dias
 *  logo abaixo. O teste bateu nos dois e mostrou que nao concordavam.) */
const TETO_DE_MINUTOS = 30 * 24 * 60

/**
 * Interpreta o que ela escreveu no campo de quando.
 *
 * `agora` entra por parâmetro para o teste poder parar o relógio.
 */
export function quandoDoAviso(texto: string, agora: Date = new Date()): QuandoDoAviso {
  const limpo = String(texto ?? '').trim().toLowerCase()
  if (!limpo) {
    return { tipo: 'erro', mensagem: 'Diga quando: "2h", "30min" ou "16:30".' }
  }

  /* ──── 1. DAQUI A TANTO ────
     `2h`, `2 h`, `2h30`, `30min`, `90 min`, `1h05`. */
  const relativo = /^(?:daqui\s*(?:a\s*)?)?(\d{1,4})\s*(h|hs|hora|horas|m|min|mins|minuto|minutos)?\s*(\d{1,2})?$/
    .exec(limpo)
  if (relativo) {
    const n = Number(relativo[1])
    const unidade = relativo[2] ?? ''
    const resto = relativo[3] ? Number(relativo[3]) : 0

    /* Sem unidade e sem resto, um número solto é ambíguo: "2" pode ser duas
       horas ou 02:00. Perguntar é melhor que escolher -- e as duas leituras
       distam doze horas uma da outra. */
    if (!unidade && !relativo[3]) {
      return {
        tipo: 'erro',
        mensagem: 'Só o número não diz se é hora ou minuto. Escreva "2h" ou "20min".',
      }
    }

    const ehHora = unidade === '' || unidade.startsWith('h')
    if (!ehHora && resto > 0) {
      return { tipo: 'erro', mensagem: 'Para minutos, escreva só o número: "90min".' }
    }
    if (ehHora && resto > 59) {
      return { tipo: 'erro', mensagem: 'Os minutos vão de 00 a 59.' }
    }

    const minutos = ehHora ? n * 60 + resto : n
    if (minutos <= 0) {
      return { tipo: 'erro', mensagem: 'Precisa ser daqui a algum tempo, nem que seja 1 minuto.' }
    }
    if (minutos > TETO_DE_MINUTOS) {
      return { tipo: 'erro', mensagem: 'Isso é muito longe. Aviso vale por até 30 dias; para depois, marque na agenda.' }
    }
    return { tipo: 'ok', quando: new Date(agora.getTime() + minutos * 60_000) }
  }

  /* ──── 2. AMANHÃ àS TAL HORA ──── */
  const amanha = /^amanh(?:a|ã)\s*(?:as|às)?\s*(\d{1,2})(?::(\d{2}))?h?$/.exec(limpo)
  if (amanha) {
    const h = Number(amanha[1])
    const m = amanha[2] ? Number(amanha[2]) : 0
    if (h > 23 || m > 59) return { tipo: 'erro', mensagem: 'Hora fora do relógio.' }
    const dia = new Date(agora)
    dia.setDate(dia.getDate() + 1)
    dia.setHours(h, m, 0, 0)
    return { tipo: 'ok', quando: dia }
  }

  /* ──── 3. HOJE àS TAL HORA (e amanhã, se já passou) ──── */
  const relogio = /^(?:as|às)?\s*(\d{1,2}):(\d{2})h?$/.exec(limpo)
  if (relogio) {
    const h = Number(relogio[1])
    const m = Number(relogio[2])
    if (h > 23 || m > 59) return { tipo: 'erro', mensagem: 'Hora fora do relógio.' }
    const dia = new Date(agora)
    dia.setHours(h, m, 0, 0)
    /* `<=` e não `<`: criar um aviso para o minuto exato em que se está é
       criar um aviso que já nasceu vencido, e o sistema simplesmente não o
       dispara -- ela ficaria esperando um alerta que nunca vem. */
    if (dia.getTime() <= agora.getTime()) dia.setDate(dia.getDate() + 1)
    return { tipo: 'ok', quando: dia }
  }

  return {
    tipo: 'erro',
    mensagem: 'Não entendi o quando. Escreva "2h", "30min", "16:30" ou "amanhã 09:00".',
  }
}

/** "hoje às 16:30", "amanhã às 09:00", "terça, 15/09 às 14:00". */
export function quandoPorExtenso(quando: Date, agora: Date = new Date()): string {
  if (Number.isNaN(quando.getTime())) return ''

  const hhmm =
    String(quando.getHours()).padStart(2, '0') + ':' + String(quando.getMinutes()).padStart(2, '0')

  const soODia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((soODia(quando) - soODia(agora)) / 86_400_000)

  if (dias === 0) return 'hoje às ' + hhmm
  if (dias === 1) return 'amanhã às ' + hhmm

  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  const data =
    String(quando.getDate()).padStart(2, '0') + '/' + String(quando.getMonth() + 1).padStart(2, '0')
  /* O dia da semana entra até uma semana à frente, e depois disso só a data:
     "quinta, 12/03" para daqui a três meses não ajuda ninguém a se situar. */
  return dias > 1 && dias <= 7 ? `${DIAS[quando.getDay()]}, ${data} às ${hhmm}` : `${data} às ${hhmm}`
}
