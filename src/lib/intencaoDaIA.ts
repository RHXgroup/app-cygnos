/* O núcleo puro da intenção: JSON da IA vira compromisso com data.
 *
 * ── O que é uma intenção, e por que ela é diferente do ditado ──────────────
 * O ditado registra o que JÁ aconteceu: "comi arroz e feijão". A intenção diz o
 * que VAI acontecer: "amanhã eu almoço fora", "hoje à noite eu treino", "semana
 * que vem eu viajo".
 *
 * Todo app do mercado usa voz para o primeiro. Nenhum usa para o segundo — e o
 * segundo é o que muda o comportamento do app: ele passa a saber o que esperar
 * do seu dia antes do dia acontecer.
 *
 * ── O valor não é guardar a frase, é PARAR DE COBRAR ───────────────────────
 * Quem avisa "amanhã eu almoço fora" e mesmo assim recebe "você não anotou o
 * almoço" aprende que falar com o app não serve para nada. A intenção existe
 * para o `proximoPasso` calar sobre o que já foi avisado.
 *
 * ── Só tipo, nenhum import de execução ─────────────────────────────────────
 * Regra do projeto, e é o que permite exercitar isto fora do aparelho. A parte
 * que fala com a rede fica em `intencao.ts`; o que decide o que vira
 * compromisso fica aqui, e é o que erra. */

export type TipoIntencao =
  /* "Amanhã eu almoço fora", "hoje eu janto na casa da minha mãe". A refeição
     acontece, mas fora do plano — e o app não deve cobrar o registro dela. */
  | 'refeicao_fora'
  /* "Vou pular o café", "hoje eu faço jejum até o almoço". A refeição NÃO
     acontece, o que é diferente de acontecer fora. */
  | 'refeicao_pulada'
  | 'treino'
  | 'viagem'
  /* "Aniversário no sábado", "festa da firma". Dia em que o plano não vale, e
     cobrar seria briga perdida. */
  | 'evento'
  /* "Quero comer menos à noite", "vou beber mais água". Não tem data, dura, e é
     a única que a pessoa avalia depois. */
  | 'proposito'

export type IntencaoDaIA = {
  tipo?: string | null
  quando?: string | null
  ate?: string | null
  refeicao?: string | null
  texto?: string | null
}

export type RespostaDaIA = {
  intencoes?: IntencaoDaIA[] | null
  observacao?: string | null
}

export type Intencao = {
  tipo: TipoIntencao
  /* Dia em que ela vale, em ISO. Nula só no propósito, que não tem data. */
  quando: string | null
  /* Fim do intervalo, para viagem. Nulo quando é um dia só. */
  ate: string | null
  /* "Almoço", "Jantar" — o rótulo da refeição, quando o tipo fala de uma. */
  refeicao: string | null
  /* O que a pessoa disse, limpo. É isto que a tela mostra de volta: ela precisa
     reconhecer a própria frase para confiar no que o app entendeu. */
  texto: string
}

export type Problema = { onde: string; motivo: string }

export type Convertida = {
  intencoes: Intencao[]
  observacao: string | null
  problemas: Problema[]
}

/* `Object.create(null)` e não `{}`, e isto veio de bug achado sondando entrada
   hostil: um objeto literal HERDA `constructor`, `valueOf`, `toString` e mais
   meia dúzia. Se a chave vem de fora — do JSON de uma IA, do que a pessoa
   digitou —, `MAPA['constructor']` devolve a função construtora, e o teste
   `=== undefined` não pega, porque função não é undefined.

   O efeito medido: um dia de treino virava uma FUNÇÃO, e ia assim para o
   banco. Sem protótipo, a busca só encontra o que foi escrito aqui. */
const TIPOS: Record<string, TipoIntencao> = Object.assign(Object.create(null), {
  refeicao_fora: 'refeicao_fora',
  refeicao_pulada: 'refeicao_pulada',
  treino: 'treino',
  viagem: 'viagem',
  evento: 'evento',
  proposito: 'proposito',
})

const TEXTO_MAX = 160
const REFEICAO_MAX = 30
/* Noventa dias. Intenção mais distante que isso não muda nada no app hoje, e
   uma data de 2031 vinda de um modelo confuso encheria o calendário de coisa
   que ninguém pediu. */
const DIAS_ADIANTE = 90

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/* A data, se for uma data de verdade e couber na janela.
 *
 * Valida o dia REAL, e não só o formato: "2026-02-31" casa com o padrão e não
 * existe. O `Date` do JavaScript aceita e desliza para 3 de março, o que
 * marcaria a intenção no dia errado sem erro nenhum. */
function data(v: unknown, hoje: string): string | null {
  const s = texto(v)
  const m = ISO.exec(s)
  if (!m) return null

  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null
  }

  /* Passado não entra. A intenção é sobre o que vem — uma data de ontem só
     pode ser o modelo tendo se confundido, e guardá-la criaria um compromisso
     que já nasceu vencido. Hoje vale: "hoje eu janto fora" é o caso mais
     comum de todos. */
  if (s < hoje) return null

  const limite = new Date(Date.UTC(ano, mes - 1, dia))
  const inicio = new Date(hoje + 'T00:00:00Z')
  const distancia = (limite.getTime() - inicio.getTime()) / 86400000
  if (distancia > DIAS_ADIANTE) return null

  return s
}

export function intencaoDaIA(bruto: unknown, hoje: string): Convertida {
  const problemas: Problema[] = []
  const intencoes: Intencao[] = []

  const r = (bruto ?? {}) as RespostaDaIA
  const lista = r.intencoes

  if (!Array.isArray(lista) || lista.length === 0) {
    return {
      intencoes: [],
      observacao: null,
      problemas: [{ onde: 'resposta', motivo: 'Não entendi nenhum plano nessa frase.' }],
    }
  }

  for (const bruta of lista) {
    const tipo = TIPOS[texto(bruta?.tipo).toLowerCase()]
    if (!tipo) {
      problemas.push({
        onde: texto(bruta?.texto) || texto(bruta?.tipo) || 'item',
        motivo: 'Não reconheci esse tipo de plano.',
      })
      continue
    }

    const frase = texto(bruta?.texto).slice(0, TEXTO_MAX)
    if (frase.length < 3) {
      problemas.push({ onde: tipo, motivo: 'Veio sem o que você disse.' })
      continue
    }

    const quando = data(bruta?.quando, hoje)
    /* O propósito é o ÚNICO que vive sem data: "quero comer menos à noite" não
       acontece num dia, acontece daqui em diante. Todos os outros marcam um dia
       do calendário, e sem ele não há o que o app faça — guardar viraria uma
       nota solta que ninguém lê. */
    if (tipo !== 'proposito' && quando === null) {
      problemas.push({ onde: frase, motivo: 'Não entendi para quando é.' })
      continue
    }

    /* O fim do intervalo só existe depois do começo. Uma viagem que termina
       antes de começar é resposta confusa, e o começo sozinho já serve. */
    const ate = data(bruta?.ate, hoje)

    intencoes.push({
      tipo,
      quando,
      ate: ate !== null && quando !== null && ate > quando ? ate : null,
      refeicao: texto(bruta?.refeicao).slice(0, REFEICAO_MAX) || null,
      texto: frase,
    })
  }

  return {
    intencoes,
    observacao: texto(r.observacao).slice(0, 300) || null,
    problemas,
  }
}

/* As intenções que valem para um dia.
 *
 * É o que o `proximoPasso` consulta antes de cobrar qualquer coisa. Viagem
 * ocupa um intervalo; o resto ocupa um dia; o propósito não ocupa nenhum — ele
 * não silencia cobrança, porque "quero comer menos à noite" não é aviso de que
 * hoje não vai dar. */
export function valemPara(intencoes: Intencao[], dia: string): Intencao[] {
  return intencoes.filter(i => {
    if (i.tipo === 'proposito' || i.quando === null) return false
    if (i.ate !== null) return dia >= i.quando && dia <= i.ate
    return dia === i.quando
  })
}
