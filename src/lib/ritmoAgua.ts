/* O ritmo da água: quanto já era para ter bebido a esta hora.
 *
 * A meta de água era um número solto do dia. Dois litros dá na mesma bebendo ao
 * longo da tarde ou os oito copos de uma vez às dez da noite — e o app dizia
 * "100%" nos dois casos, com a mesma cara de dever cumprido. Beber dois litros
 * antes de dormir não hidrata ninguém; tira a pessoa da cama duas vezes.
 *
 * ── Por que o dia não vai das 0h às 24h ────────────────────────────────────
 * Porque ninguém bebe água dormindo. Repartir a meta pelas 24 horas cobraria
 * copo às três da manhã e deixaria a tarde folgada demais. O que conta é a
 * janela ACORDADA, e o app já sabe qual é: cada noite registrada guarda a hora
 * de deitar e a de levantar.
 *
 * ── E por que a mediana, e não a última noite ──────────────────────────────
 * Uma noite mal dormida, um plantão, uma festa — qualquer uma delas deslocaria
 * o dia inteiro de quem tem rotina. A mediana das últimas noites é o horário em
 * que a pessoa VIVE, e não o de ontem.
 *
 * ── O que este arquivo não faz ─────────────────────────────────────────────
 * Não fala com a rede e não importa nada de runtime — só tipo, que some na
 * compilação. É o que permite exercitá-lo fora do aparelho, com horários de
 * verdade, em vez de confiar que a conta está certa. Ver o `.teste.mts` ao
 * lado. */

/* Quando não há noite registrada. Sete da manhã às onze da noite é a janela de
   quem trabalha de dia — e é palpite assumido, não medida: a tela diz que está
   supondo, para a pessoa registrar o sono e o app parar de supor. */
export const ACORDA_PADRAO = 7 * 60
export const DORME_PADRAO = 23 * 60

/* Quantas noites entram na mediana. Sete cobre a semana inteira, incluindo o
   fim de semana de quem dorme tarde só no sábado. */
export const NOITES_NA_MEDIANA = 7

/* Quantas noites bastam para chamar de rotina.
 *
 * Três. Duas madrugadas não são uma rotina, e montar o dia de alguém em cima
 * delas é inventar — a regra vinha da outra implementação desta mesma janela e
 * é a mais conservadora das duas, por isso ficou.
 *
 * Abaixo disso a janela é a PADRÃO e vem marcada como suposta, em vez de nula:
 * a tela precisa da diferença entre "é o horário dela" e "é um horário
 * genérico", e um nulo obrigaria cada chamador a inventar o padrão de novo. */
const NOITES_PARA_ROTINA = 3

/* O mínimo que uma janela precisa ter para ser acreditada.
 *
 * Seis horas. Uma janela de três horas não quer dizer que a pessoa fica
 * acordada três horas — quer dizer que os horários estão trocados, ou que só
 * uma ponta foi anotada. Cobrar dois litros de água em três horas é o tipo de
 * conta que o app faz e ninguém consegue seguir. */
const JANELA_MINIMA = 6 * 60

export type NoiteComHorarios = {
  data: string
  /* 'HH:MM'. */
  deitou: string
  levantou: string
}

export type Janela = {
  /* Minutos desde a meia-noite. */
  acordaEm: number
  dormeEm: number
  /* Verdadeiro quando não havia noite registrada e os dois vieram do padrão. A
     tela precisa dizer isso: um número calculado sobre palpite não pode ser
     apresentado com a mesma segurança de um calculado sobre dado. */
  suposta: boolean
}

const minutosDe = (hora: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora?.trim() ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/* A mediana de uma lista de minutos. `percentile_disc`, e não média: um plantão
   às 4h desloca a média e não desloca a mediana. */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.floor((ordenados.length - 1) / 2)]
}

/* De que horas a que horas esta pessoa fica acordada.
 *
 * A hora de DEITAR é a única que precisa de cuidado: ela cruza a meia-noite na
 * maioria das rotinas. "23:30" e "00:30" viram 1410 e 30, e a mediana crua dos
 * dois dá 30 — meio-dia e meio de diferença do certo. Somar 24 h nos valores da
 * madrugada põe os dois na mesma reta antes de comparar. */
const SUPOSTA: Janela = { acordaEm: ACORDA_PADRAO, dormeEm: DORME_PADRAO, suposta: true }

export function janelaAcordada(noites: NoiteComHorarios[]): Janela {
  if (!Array.isArray(noites)) return SUPOSTA

  const recentes = [...noites]
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, NOITES_NA_MEDIANA)

  const levantares: number[] = []
  const deitares: number[] = []

  for (const n of recentes) {
    const levantou = minutosDe(n.levantou)
    const deitou = minutosDe(n.deitou)
    if (levantou !== null) levantares.push(levantou)
    /* Antes das 12h é madrugada do dia seguinte, e não manhã: quem deitou à
       00:30 deitou DEPOIS de quem deitou às 23:00. */
    if (deitou !== null) deitares.push(deitou < 12 * 60 ? deitou + 24 * 60 : deitou)
  }

  /* As duas pontas precisam ter rotina. Com cinco levantares e um deitar, a
     hora de dormir é a de uma noite só — e é ela que decide onde o dia acaba. */
  if (levantares.length < NOITES_PARA_ROTINA || deitares.length < NOITES_PARA_ROTINA)
    return SUPOSTA

  const acorda = mediana(levantares)
  const dorme = mediana(deitares)
  if (acorda === null || dorme === null) return SUPOSTA

  /* Janela curta demais não é rotina, é dado torto — ver JANELA_MINIMA. */
  if (dorme - acorda < JANELA_MINIMA) return SUPOSTA

  /* Volta para dentro do relógio. O consumidor compara com a hora de agora, que
     também está em 0..1439, e `ritmoDaAgua` estica de novo quando a janela
     cruza a meia-noite. */
  return { acordaEm: acorda, dormeEm: dorme % (24 * 60), suposta: false }
}

/* ── Os horários do dia, para o lembrete ───────────────────────────────────
 *
 * Moravam em `ritmoDeAgua.ts`, junto com uma SEGUNDA implementação da janela
 * acima. As duas discordavam em quatro de sete casos medidos — mediana par,
 * mínimo de noites, hora impossível e janela curta —, e o efeito era a mesma
 * pessoa recebendo o cartão da tela inicial por uma janela e o lembrete por
 * outra. Item 5 do AGENTS.md, e um dos poucos casos em que ele produziu
 * discordância visível em vez de só risco.
 *
 * Ficaram aqui, e não lá, porque aqui não há import de runtime: é o que permite
 * exercitá-los fora do aparelho. Lá ficou só a ida à rede. */

/* Nem no primeiro minuto acordado, nem colado na hora de dormir.
 *
 * A folga do fim não é estética: água na última hora antes de deitar acorda a
 * pessoa de madrugada, e o app que mede o sono dela não pode ser o mesmo que
 * atrapalha o sono dela. */
const APOS_ACORDAR = 30
const ANTES_DE_DORMIR = 90

/* Menos que três avisos não é ritmo, é lembrete solto. Mais que seis a pessoa
   desliga a notificação — e junto vai a da refeição, que é a que importa. */
const MINIMO_DE_AVISOS = 3
const MAXIMO_DE_AVISOS = 6

/* Quantos: o que a meta pede em copos, limitado entre três e seis. Meta de
   quatro litros com copo de duzentos não vira vinte avisos — vira seis goles
   maiores, porque o que falha não é a conta, é a paciência de quem recebe. */
export function horariosDeAgua(metaMl: number, copoMl: number, janela: Janela): number[] {
  if (!(metaMl > 0) || !(copoMl > 0)) return []

  /* A janela que cruza a meia-noite é esticada, como em `ritmoDaAgua`: quem
     acorda às 22h e dorme às 6h tem oito horas, e não menos vinte e quatro. */
  const fimCru = janela.dormeEm > janela.acordaEm ? janela.dormeEm : janela.dormeEm + 24 * 60

  const inicio = janela.acordaEm + APOS_ACORDAR
  const fim = fimCru - ANTES_DE_DORMIR
  if (fim <= inicio) return []

  const copos = Math.ceil(metaMl / copoMl)
  const quantos = Math.min(Math.max(copos, MINIMO_DE_AVISOS), MAXIMO_DE_AVISOS)

  const passo = (fim - inicio) / (quantos - 1)
  /* De volta para dentro do relógio: quem agenda compara com a hora do
     aparelho, e 25:30 não existe lá. */
  return Array.from({ length: quantos }, (_, i) =>
    Math.round(inicio + passo * i) % (24 * 60),
  )
}

/* Quanto beber em cada um desses horários, para a soma fechar a meta. */
export const mlPorGole = (metaMl: number, quantos: number) =>
  quantos <= 0 || !(metaMl > 0) ? 0 : Math.round(metaMl / quantos / 10) * 10

export type Ritmo = {
  /* Quanto já era para ter bebido a esta hora, arredondado ao copo mais
     próximo — cobrar 1.237 ml seria uma precisão que ninguém consegue seguir. */
  esperadoMl: number
  /* Positivo = está adiantado; negativo = atrasado. */
  diferencaMl: number
  /* Como se lê a diferença, em uma frase. */
  situacao: 'em_dia' | 'atrasado' | 'adiantado' | 'fora_da_janela' | 'concluido'
  /* Minutos até o próximo copo, no ritmo desta janela. Null quando não há
     próximo — meta batida, ou já passou da hora de dormir. */
  emMinutos: number | null
}

/* Quanto já era para ter bebido agora.
 *
 * ── Antes de acordar e depois de dormir ────────────────────────────────────
 * Fora da janela o app não cobra nada. De madrugada, `esperado` é zero: quem
 * acordou às 3h para beber água não está atrasado em nada. Depois da hora de
 * dormir, o esperado é a meta inteira — mas a situação vira `fora_da_janela`,
 * porque a essa altura o recado não é "beba mais", é "amanhã comece antes".
 *
 * ── A tolerância ───────────────────────────────────────────────────────────
 * Meio copo para cada lado. Sem ela, a tela ficaria alternando entre "atrasado"
 * e "em dia" a cada poucos minutos, e um aviso que pisca é um aviso que se
 * aprende a ignorar. */
export function ritmoDaAgua({
  metaMl,
  copoMl,
  bebidoMl,
  janela,
  agoraEmMinutos,
}: {
  metaMl: number
  copoMl: number
  bebidoMl: number
  janela: Janela
  /* Minutos desde a meia-noite de hoje. */
  agoraEmMinutos: number
}): Ritmo {
  const tolerancia = copoMl / 2

  if (bebidoMl >= metaMl) {
    return { esperadoMl: metaMl, diferencaMl: bebidoMl - metaMl, situacao: 'concluido', emMinutos: null }
  }

  /* A janela pode cruzar a meia-noite (acorda 22h, dorme 6h — quem trabalha à
     noite). Esticar o fim para além das 24 h e, quando a hora de agora é de
     madrugada, esticá-la junto: os dois passam a viver na mesma reta. */
  const fim = janela.dormeEm > janela.acordaEm ? janela.dormeEm : janela.dormeEm + 24 * 60
  const agora =
    janela.dormeEm > janela.acordaEm || agoraEmMinutos >= janela.acordaEm
      ? agoraEmMinutos
      : agoraEmMinutos + 24 * 60

  if (agora < janela.acordaEm) {
    /* Ainda não acordou (madrugada de um dia comum). Não se cobra nada. */
    return { esperadoMl: 0, diferencaMl: bebidoMl, situacao: 'em_dia', emMinutos: null }
  }

  if (agora >= fim) {
    return {
      esperadoMl: metaMl,
      diferencaMl: bebidoMl - metaMl,
      situacao: 'fora_da_janela',
      emMinutos: null,
    }
  }

  const duracao = fim - janela.acordaEm
  const fracao = (agora - janela.acordaEm) / duracao
  const cru = metaMl * fracao

  /* Ao copo mais próximo, e nunca acima da meta: o esperado é uma orientação
     para servir, e serve-se em copos. */
  const esperadoMl = Math.min(metaMl, Math.round(cru / copoMl) * copoMl)
  const diferencaMl = bebidoMl - esperadoMl

  /* Quando cai o próximo copo. O ritmo é um copo a cada `duracao / copos`, e o
     próximo é o primeiro múltiplo que ainda não foi bebido. */
  const copos = Math.max(1, Math.ceil(metaMl / copoMl))
  const passo = duracao / copos
  const jaBebidos = Math.floor(bebidoMl / copoMl)
  const instanteDoProximo = janela.acordaEm + passo * (jaBebidos + 1)
  const emMinutos =
    instanteDoProximo >= fim ? null : Math.max(0, Math.round(instanteDoProximo - agora))

  const situacao =
    diferencaMl < -tolerancia ? 'atrasado' : diferencaMl > tolerancia ? 'adiantado' : 'em_dia'

  return { esperadoMl, diferencaMl, situacao, emMinutos }
}

/* "em 40 min", "em 1h20". Minuto cru passando de uma hora vira número que
   ninguém converte de cabeça. */
export function daquiA(minutos: number): string {
  if (minutos < 60) return `em ${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `em ${h}h` : `em ${h}h${String(m).padStart(2, '0')}`
}

/* 'HH:MM' a partir de minutos desde a meia-noite. */
export function relogio(minutos: number): string {
  const dentro = ((minutos % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(dentro / 60)
  const m = dentro % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
