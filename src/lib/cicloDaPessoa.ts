/* O ciclo menstrual dela, calculado do que ELA registrou.
 *
 * ── O que a evidência diz, e o que ela não diz ─────────────────────────────
 * Pesquisei antes de escrever. "Comer por fase do ciclo" tem evidência FRACA:
 * o metabolismo de repouso não muda de forma relevante entre as fases, e não há
 * base para conselho geral por fase. Os aplicativos que vendem isso estão
 * vendendo tendência.
 *
 * O contrário tem evidência boa: 23 de 28 estudos mostram efeito da DIETA sobre
 * os sintomas menstruais.
 *
 * Por isso este arquivo não dá conselho nenhum. Ele calcula em que dia do ciclo
 * ela está, e o resto do app cruza isso com o diário dela — "nos seus últimos
 * três ciclos, você comeu em média 300 kcal a mais nos quatro dias antes".
 * Isso é o dado dela, e é o que a nutricionista precisa ver.
 *
 * ── A escada: PERGUNTAR, depois MEDIR ─────────────────────────────────────
 * Este arquivo dizia "sem dois registros eu NÃO SEI", e não previa nada. Quem
 * marcava o primeiro dia abria o calendário e via um quadradinho solto: sem
 * faixa, sem janela fértil, sem próxima data. O app pedia dois meses de fé
 * antes de devolver qualquer coisa, e ninguém dá dois meses de fé para um
 * aplicativo grátis.
 *
 * A saída não é chutar 28 e chamar de previsão. É PERGUNTAR. A mulher sabe
 * quanto dura o ciclo dela — é a primeira coisa que qualquer médico pergunta —,
 * e o app pergunta uma vez, no começo, e usa o número DELA desde o dia um.
 *
 * Daí em diante ele fica mais certo sozinho, e a fonte muda de degrau:
 *
 *   'padrao'     28 dias. Só enquanto ela não respondeu e não registrou nada.
 *                Não é previsão, é ponto de partida, e a tela diz isso.
 *   'informada'  o que ela mesma respondeu. Vale mais que qualquer média de
 *                população, e vale desde o primeiro dia.
 *   'medida'     o intervalo entre os começos que ELA registrou. Substitui a
 *                resposta dela assim que existe, porque medir vence lembrar —
 *                a estimativa de cabeça costuma ser o número redondo que a
 *                pessoa ouviu falar, e o registrado é o que aconteceu.
 *
 * `origemDaDuracao` sai daqui para a tela escrever a frase certa em cada
 * degrau. Uma previsão sem a procedência dela vira afirmação, e é aí que o app
 * passa a mentir sem querer.
 *
 * O que a regra antiga protegia continua protegido: `duracaoTipica` só existe
 * quando foi MEDIDA, e `atrasoEmDias` só sai contra previsão medida. Dizer
 * "sua menstruação está atrasada" apoiado em 28 dias de população é criar susto
 * sem base — quem tem ciclo de 31 leria isso todo santo mês.
 *
 * ── Só tipo, nenhum import de execução ─────────────────────────────────────
 * Regra do projeto. Datas entram e saem como texto ISO, que é como o banco
 * guarda e como a comparação funciona igual em qualquer fuso. */

export type Fase = 'menstrual' | 'folicular' | 'ovulatoria' | 'lutea'

/* De onde saiu a duração usada na previsão. Três degraus, do pior para o
   melhor: a média de população, o que ela informou, e o que foi medido no que
   ela registrou. */
export type OrigemDaDuracao = 'padrao' | 'informada' | 'medida'

/* O que ela respondeu quando o app perguntou.
 *
 * Existe para o app não precisar de dois meses antes de servir para alguma
 * coisa. Os dois campos são independentes: dá para saber a duração do ciclo e
 * não lembrar quantos dias de fluxo, e o contrário também. */
export type CicloInformado = {
  /* Duração média do ciclo, em dias, como ela mesma diz. */
  duracao: number | null
  /* Quantos dias costuma durar o fluxo. */
  diasDeFluxo: number | null
}

export type Ciclo = {
  /* Primeiro dia da menstruação, em ISO. É o único marco que a pessoa observa
     sem depender de exame — por isso é ele que ancora tudo. */
  comecou: string
  /* Último dia do fluxo, quando ela registrou. Nulo enquanto está acontecendo,
     ou quando ela não marcou o fim. */
  terminou: string | null
}

export type Situacao = {
  /* Em que dia do ciclo ela está. 1 é o primeiro dia da menstruação. Nulo
     quando não há registro nenhum. */
  diaDoCiclo: number | null
  fase: Fase | null
  /* A duração MEDIDA dos ciclos dela, em dias. Nula enquanto não há dois
     começos registrados: sem dois não há intervalo nenhum para medir, e a tela
     não pode escrever "seus ciclos duram X". */
  duracaoTipica: number | null
  /* A duração que a previsão de fato usou. Nunca nula: é a medida, ou a que ela
     informou, ou 28 — nesta ordem. */
  duracaoUsada: number
  /* De onde `duracaoUsada` veio. A tela escreve uma frase diferente para cada
     degrau, e é essa frase que separa prever de afirmar. */
  origemDaDuracao: OrigemDaDuracao
  /* Quantos dias de fluxo a previsão assume — o que ela marcou, o que informou,
     ou cinco. */
  diasDeFluxo: number
  /* Quando a próxima deve começar. Nula quando não dá para prever: sem
     histórico, ou com ciclos irregulares demais. */
  proximaPrevista: string | null
  /* Verdadeiro quando os ciclos dela variam demais para previsão valer.
     Existe para a tela DIZER isso, em vez de mostrar uma data que vai errar. */
  irregular: boolean
  /* Quantos dias passaram da data prevista. Nulo quando não há previsão, quando
     a data ainda não chegou, e TAMBÉM quando a previsão é estimada: alarmar com
     atraso apoiado em 28 dias de população é susto sem base. */
  atrasoEmDias: number | null
}

const DIA = 86400000

const emDias = (de: string, ate: string): number =>
  Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / DIA)

const somandoDias = (iso: string, dias: number): string =>
  new Date(Date.parse(iso + 'T00:00:00Z') + dias * DIA).toISOString().slice(0, 10)

const ISO = /^\d{4}-\d{2}-\d{2}$/

/* Ciclo humano possível. Fora disso é erro de digitação — dedo no mês errado,
   ano trocado — e entrar na média estragaria a previsão de todos os meses
   seguintes. A literatura clínica trata 21 a 35 como a faixa comum e 45 como o
   limite do que ainda é ciclo; acima disso é ausência de menstruação, que é
   outro assunto e não se resolve prevendo. */
const MINIMO = 15
const MAXIMO = 45

/* A duração usada enquanto os ciclos dela não dizem outra coisa.
 *
 * 28 é média de população, e continua não sendo a dela — a diferença é que
 * agora o app usa e AVISA, em vez de não mostrar nada. Um mês de uso já
 * substitui isto pela mediana dos ciclos dela. */
export const DURACAO_PADRAO = 28

/* Quantos dias de fluxo assumir quando ela não marcou o fim. Cinco é o mais
   comum, e o erro de um dia só muda o tamanho da faixa no calendário. */
export const DIAS_DE_FLUXO_PADRAO = 5

/* Quanto os ciclos podem variar antes de a previsão deixar de valer.
 *
 * Nove dias entre o mais curto e o mais longo. Acima disso a data prevista erra
 * mais do que acerta, e mostrar "sua menstruação está atrasada" para quem tem
 * ciclo irregular é criar susto com um número que nunca teve base. A ausência
 * da previsão é a informação honesta. */
const VARIACAO_MAXIMA = 9

const mediana = (ns: number[]): number => {
  const ordenados = [...ns].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 0
    ? Math.round((ordenados[meio - 1] + ordenados[meio]) / 2)
    : ordenados[meio]
}

/* As durações entre um começo e o seguinte, descartando o impossível.
 *
 * MEDIANA e não média: um ciclo digitado errado, ou um mês em que ela esqueceu
 * de registrar e o intervalo saiu dobrado, puxa a média e não move a mediana. */
export function duracoes(ciclos: Ciclo[]): number[] {
  const comecos = ciclos
    .map(c => c.comecou)
    .filter(d => ISO.test(d))
    .sort()

  const fora: number[] = []
  for (let i = 1; i < comecos.length; i++) {
    const d = emDias(comecos[i - 1], comecos[i])
    if (d >= MINIMO && d <= MAXIMO) fora.push(d)
  }
  return fora
}

/* A fase, calculada DE TRÁS PARA A FRENTE a partir da próxima menstruação.
 *
 * É o que a fisiologia manda: a fase lútea — da ovulação até a menstruação —
 * dura perto de 14 dias em quase todo mundo, e o que varia entre ciclos longos
 * e curtos é a folicular, no começo. Calcular para a frente ("ovulação no dia
 * 14") só acerta em ciclo de 28; num de 35, erra a ovulação por uma semana.
 *
 * Sem duração conhecida, a única fase que dá para afirmar é a menstrual, que a
 * pessoa está OBSERVANDO. As outras ficam nulas — dizer "folicular" sem saber a
 * duração do ciclo dela seria chute com cara de medida. */
export function faseDoDia(
  diaDoCiclo: number,
  duracaoTipica: number | null,
  diasDeFluxo: number,
): Fase | null {
  if (diaDoCiclo <= Math.max(1, diasDeFluxo)) return 'menstrual'
  if (duracaoTipica === null) return null

  const faltamParaAProxima = duracaoTipica - diaDoCiclo
  /* A janela de ovulação, contada de trás: perto de 14 dias antes da próxima
     menstruação, com dois dias de folga para cada lado. */
  if (faltamParaAProxima >= 12 && faltamParaAProxima <= 16) return 'ovulatoria'
  if (faltamParaAProxima < 12) return 'lutea'
  return 'folicular'
}

export function situacaoDoCiclo(
  ciclos: Ciclo[],
  hoje: string,
  informado: CicloInformado | null = null,
): Situacao {
  /* O que ela informou, se estiver dentro do que é ciclo humano. Um 3 ou um 300
     digitado errado não pode virar previsão: entraria em tudo — faixa, janela
     fértil, aviso — e ninguém ligaria o absurdo da tela ao número digitado
     meses atrás. */
  const duracaoInformada =
    informado?.duracao != null && informado.duracao >= MINIMO && informado.duracao <= MAXIMO
      ? Math.round(informado.duracao)
      : null
  const fluxoInformado =
    informado?.diasDeFluxo != null && informado.diasDeFluxo >= 1 && informado.diasDeFluxo <= 15
      ? Math.round(informado.diasDeFluxo)
      : null

  const validos = ciclos.filter(c => ISO.test(c.comecou) && c.comecou <= hoje)
  if (validos.length === 0) {
    return {
      diaDoCiclo: null,
      fase: null,
      duracaoTipica: null,
      duracaoUsada: duracaoInformada ?? DURACAO_PADRAO,
      origemDaDuracao: duracaoInformada !== null ? 'informada' : 'padrao',
      diasDeFluxo: fluxoInformado ?? DIAS_DE_FLUXO_PADRAO,
      proximaPrevista: null,
      irregular: false,
      atrasoEmDias: null,
    }
  }

  const ultimo = validos.reduce((a, b) => (a.comecou >= b.comecou ? a : b))
  /* Dia 1 é o primeiro dia da menstruação, e não zero: é assim que a pessoa
     conta, é assim que a nutricionista pergunta, e é assim que todo aplicativo
     de ciclo mostra. */
  const diaDoCiclo = emDias(ultimo.comecou, hoje) + 1

  const ds = duracoes(validos)
  /* Um intervalo já é medida DELA, e vale mais do que a lembrança dela ou do que
     a média de população. A mediana entra a partir de dois, e é ela que aguenta
     um mês esquecido sem estragar a conta. */
  const duracaoTipica = ds.length >= 2 ? mediana(ds) : (ds[0] ?? null)
  /* Irregular precisa de dois intervalos: com um só não há variação para medir,
     e chamar de irregular quem tem um registro seria inventar. */
  const irregular = ds.length >= 2 && Math.max(...ds) - Math.min(...ds) > VARIACAO_MAXIMA

  /* Quantos dias de fluxo, quando ela registrou o fim. Cinco por omissão, que é
     a duração mais comum — e aqui a média serve, porque erra por um dia e o
     efeito é só o rótulo "menstrual" durar um dia a mais ou a menos. */
  /* A escada do fluxo, na mesma ordem: o que ela marcou neste ciclo, o que
     informou, e cinco. */
  const fluxo =
    ultimo.terminou !== null && ISO.test(ultimo.terminou)
      ? Math.max(1, emDias(ultimo.comecou, ultimo.terminou) + 1)
      : (fluxoInformado ?? DIAS_DE_FLUXO_PADRAO)

  /* A escada da duração. Medir vence lembrar, e lembrar vence a média de
     população — nesta ordem, sempre. */
  const duracaoUsada = duracaoTipica ?? duracaoInformada ?? DURACAO_PADRAO
  const origemDaDuracao: OrigemDaDuracao =
    duracaoTipica !== null ? 'medida' : duracaoInformada !== null ? 'informada' : 'padrao'

  /* Irregular continua sem previsão, e é a única ausência que sobrou: uma pessoa
     com ciclos de 22 e de 40 não ganha data nenhuma, porque ali nem a mediana
     vale, e uma data qualquer seria pior do que nenhuma. */
  const proximaPrevista = irregular ? null : somandoDias(ultimo.comecou, duracaoUsada)

  /* Atraso só contra previsão MEDIDA. Contra o que ela chutou de cabeça, ou
     contra os 28 de população, "você está atrasada 3 dias" é uma frase que
     assusta e não sabe de nada. */
  const atraso =
    origemDaDuracao === 'medida' && proximaPrevista !== null && hoje > proximaPrevista
      ? emDias(proximaPrevista, hoje)
      : null

  return {
    diaDoCiclo,
    /* A fase passa a sair desde o primeiro ciclo, pela duração usada. Sem isso a
       tela dizia só "dia 14" e ficava muda sobre o que aquilo significa. */
    fase: faseDoDia(diaDoCiclo, duracaoUsada, fluxo),
    duracaoTipica,
    duracaoUsada,
    origemDaDuracao,
    diasDeFluxo: fluxo,
    proximaPrevista,
    irregular,
    atrasoEmDias: atraso,
  }
}

/* ── O cruzamento com o diário ─────────────────────────────────────────────*/

export type DiaDoDiario = { data: string; calorias: number }

export type Comparacao = {
  /* Média de calorias nos dias ANTES da menstruação, nos ciclos que deram para
     comparar. Nula quando não há dado suficiente. */
  mediaNosDiasAntes: number | null
  /* Média no resto do ciclo, para servir de referência. */
  mediaNoResto: number | null
  /* Quantos ciclos entraram na conta. A tela mostra isso: "nos seus últimos
     três ciclos" vale mais que um número sem procedência. */
  ciclosComparados: number
  /* Quantos dias antes foram considerados. */
  diasAntes: number
}

/* Quanto ela comeu nos dias antes da menstruação, contra o resto do ciclo.
 *
 * Este é o recurso. Não é conselho de fase — é o dado DELA, cruzado com o
 * diário que ela mesma preencheu. Nenhum concorrente faz isso, porque nenhum
 * tem as duas coisas no mesmo lugar.
 *
 * Exige pelo menos dois ciclos completos e um mínimo de dias registrados em
 * cada janela: comparar a média de dois dias anotados contra a de trinta seria
 * apresentar ruído como achado. */
export function compararAntesDaMenstruacao(
  ciclos: Ciclo[],
  diario: DiaDoDiario[],
  diasAntes = 4,
  minimoDeDiasPorJanela = 3,
): Comparacao {
  const comecos = ciclos
    .map(c => c.comecou)
    .filter(d => ISO.test(d))
    .sort()

  const antes: number[] = []
  const resto: number[] = []
  let ciclosComparados = 0

  for (let i = 1; i < comecos.length; i++) {
    const inicio = comecos[i - 1]
    const fim = comecos[i]
    const d = emDias(inicio, fim)
    if (d < MINIMO || d > MAXIMO) continue

    const limiteDoAntes = somandoDias(fim, -diasAntes)
    const doCiclo = diario.filter(x => x.data >= inicio && x.data < fim)
    /* Um ciclo sem quase nada anotado não entra: ele diluiria a média dos
       outros e a conclusão sairia do vazio. */
    if (doCiclo.length < minimoDeDiasPorJanela * 2) continue

    ciclosComparados++
    for (const x of doCiclo) {
      if (x.data >= limiteDoAntes) antes.push(x.calorias)
      else resto.push(x.calorias)
    }
  }

  const media = (ns: number[]) =>
    ns.length >= minimoDeDiasPorJanela
      ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length)
      : null

  return {
    mediaNosDiasAntes: media(antes),
    mediaNoResto: media(resto),
    ciclosComparados,
    diasAntes,
  }
}
