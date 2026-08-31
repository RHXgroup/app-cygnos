/* O gasto energético dela, medido — e não calculado por fórmula.
 *
 * ── O que a fórmula não sabe ──────────────────────────────────────────────
 * `metasSugeridas` usa Mifflin-St Jeor com fator de atividade. É o que todo
 * aplicativo faz, e é o que o melhor da categoria abandonou: a análise pública
 * do MacroFactor mostra que fórmula estática erra de 15 a 25% por pessoa —
 * adaptação metabólica, atividade não declarada, genética.
 *
 * Errar 20% em 2.000 kcal são 400 kcal por dia. Quem come 400 a mais do que
 * pensa não emagrece, conclui que "dieta não funciona comigo", e larga.
 *
 * ── A conta que substitui a fórmula ───────────────────────────────────────
 * Não é fisiologia, é aritmética, e é o que torna isto confiável:
 *
 *     gasto = média do que ela comeu  +  (peso perdido × kcal por kg) / dias
 *
 * Se ela comeu 2.000 kcal por dia durante quatro semanas e o peso não mudou,
 * o gasto dela é 2.000 — não importa o que a fórmula diz. Se perdeu 2 kg no
 * mesmo período comendo 2.000, o gasto é 2.000 mais o que os 2 kg valem.
 *
 * ── E por que ela precisa de tanta trava ──────────────────────────────────
 * Porque os dois lados da conta são frágeis:
 *
 *   O DIÁRIO SUBESTIMA. Todo mundo esquece o azeite, a bolacha do café. A
 *   literatura mede subnotificação de 20 a 30% em registro alimentar. Se ela
 *   registra 1.600 e come 2.000, esta conta devolve um gasto 400 kcal menor do
 *   que o real — e uma meta feita em cima disso deixa a pessoa com fome.
 *
 *   O PESO OSCILA. Dois quilos de diferença entre duas pesagens podem ser
 *   água. Por isso a conta usa a LINHA DE TENDÊNCIA, e não a balança.
 *
 * A resposta a isso não é abandonar a conta: é dizer que ela é sobre o que foi
 * REGISTRADO, e só aparecer quando há registro suficiente para a média valer.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { ehDataReal, emDias } from './datas.ts'

export type DiaDeConsumo = { data: string; calorias: number | null }
export type PontoDePeso = { data: string; tendencia: number }

export type GastoReal = {
  /* Quilocalorias por dia. É este o número que substitui a fórmula. */
  kcal: number
  /* Quantos dias com caloria registrada entraram na conta. A tela mostra —
     é o que separa medida de chute. */
  diasRegistrados: number
  /* O período coberto, em dias. Diferente do acima: ela pode ter 18 dias
     registrados dentro de 28. */
  diasDoPeriodo: number
  /* Quanto a linha de tendência andou, em kg. Negativo é perda. */
  variacaoKg: number
  /* A média do que ela REGISTROU comer. A tela mostra junto do gasto, porque a
     diferença entre os dois é a explicação de tudo. */
  mediaConsumida: number
}

/* Quanto vale um quilo de peso corporal, em quilocalorias.
 *
 * 7.700. O número clássico é 7.716 (um quilo de gordura pura), e usar 7.700 é a
 * convenção de quem sabe que peso perdido não é gordura pura — tem água e algum
 * músculo junto. A diferença entre os dois é menor que o erro do diário, então
 * precisão maior aqui seria falsa. */
const KCAL_POR_KG = 7700

/* O mínimo de dias com caloria registrada.
 *
 * 14. Abaixo disso a média de consumo é dominada por um fim de semana, e a conta
 * inteira depende dela. O MacroFactor pede de duas a quatro semanas antes de
 * ajustar, e a razão é a mesma. */
const MINIMO_DE_DIAS_REGISTRADOS = 14

/* E quanto do período precisa estar registrado.
 *
 * 60%. Quem registra 14 dias dentro de 60 não tem uma média — tem os dias em
 * que lembrou de registrar, que são sistematicamente os dias em que comeu bem.
 * Essa é a diferença entre média e amostra enviesada. */
const COBERTURA_MINIMA = 0.6

/* Faixa do que é gasto humano. Fora dela a conta produziu absurdo — diário
   quase vazio, peso corrompido — e um absurdo aqui vira meta de caloria. */
const KCAL_MIN = 1000
const KCAL_MAX = 6000

const numero = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/* O gasto medido, ou NULL.
 *
 * Null é o caso comum no começo, e é a resposta honesta: sem registro
 * suficiente, a fórmula continua sendo o melhor palpite que existe. */
export function gastoReal(
  consumo: DiaDeConsumo[],
  tendencia: PontoDePeso[],
): GastoReal | null {
  const dias = consumo
    .filter(d => ehDataReal(d.data))
    .map(d => ({ data: d.data, kcal: numero(d.calorias) }))
    .filter((d): d is { data: string; kcal: number } => d.kcal !== null)
    .sort((a, b) => a.data.localeCompare(b.data))

  if (dias.length < MINIMO_DE_DIAS_REGISTRADOS) return null

  const pesos = tendencia
    .filter(p => ehDataReal(p.data) && numero(p.tendencia) !== null)
    .sort((a, b) => a.data.localeCompare(b.data))
  if (pesos.length < 2) return null

  /* A janela é a INTERSEÇÃO: só vale o pedaço em que existem os dois lados.
     Sem isso, um mês de diário sem pesagem entraria dividindo por dias em que
     ninguém sabe o que o peso fez. */
  const de = dias[0].data > pesos[0].data ? dias[0].data : pesos[0].data
  const ate =
    dias[dias.length - 1].data < pesos[pesos.length - 1].data
      ? dias[dias.length - 1].data
      : pesos[pesos.length - 1].data
  if (de >= ate) return null

  const naJanela = dias.filter(d => d.data >= de && d.data <= ate)
  if (naJanela.length < MINIMO_DE_DIAS_REGISTRADOS) return null

  const diasDoPeriodo = emDias(de, ate) + 1
  if (diasDoPeriodo <= 1) return null
  /* Cobertura: registrar 14 de 60 dias não é média, é amostra dos dias em que
     ela lembrou — e lembrar correlaciona com ter comido bem. */
  if (naJanela.length / diasDoPeriodo < COBERTURA_MINIMA) return null

  const dentroDoPeso = pesos.filter(p => p.data >= de && p.data <= ate)
  if (dentroDoPeso.length < 2) return null

  const variacaoKg = dentroDoPeso[dentroDoPeso.length - 1].tendencia - dentroDoPeso[0].tendencia

  const mediaConsumida =
    naJanela.reduce((s, d) => s + d.kcal, 0) / naJanela.length

  /* O sinal: peso que DESCEU quer dizer que ela gastou MAIS do que comeu, então
     a variação negativa soma ao gasto. Trocar este sinal é o erro que produz um
     gasto menor para quem está emagrecendo — e ninguém confere, porque o número
     continua parecendo plausível. */
  const kcal = Math.round(mediaConsumida - (variacaoKg * KCAL_POR_KG) / diasDoPeriodo)

  if (!Number.isFinite(kcal) || kcal < KCAL_MIN || kcal > KCAL_MAX) return null

  return {
    kcal,
    diasRegistrados: naJanela.length,
    diasDoPeriodo,
    variacaoKg: Math.round(variacaoKg * 10) / 10,
    mediaConsumida: Math.round(mediaConsumida),
  }
}

/* A frase que explica o número.
 *
 * ── Por que ela precisa dizer "registrado" ────────────────────────────────
 * A conta é boa, e a entrada dela é o diário — que subestima de 20 a 30% em
 * qualquer população medida. O número resultante é o gasto CONSISTENTE COM O
 * QUE ELA REGISTROU, e não uma medida de calorimetria.
 *
 * Dizer isso não enfraquece o número: é o que o torna utilizável. Quem registra
 * do mesmo jeito todo dia recebe uma meta que funciona, mesmo que ambos os
 * lados estejam deslocados pela mesma quantidade. E quem não sabe disso conclui
 * que o app está errado no dia em que comparar com outra fonte. */
export function fraseDoGasto(g: GastoReal): string {
  const semanas = Math.round(g.diasDoPeriodo / 7)
  const periodo = semanas <= 1 ? `${g.diasDoPeriodo} dias` : `${semanas} semanas`

  const movimento =
    g.variacaoKg < -0.2
      ? `perdendo ${Math.abs(g.variacaoKg).toFixed(1).replace('.', ',')} kg`
      : g.variacaoKg > 0.2
        ? `ganhando ${g.variacaoKg.toFixed(1).replace('.', ',')} kg`
        : 'com o peso estável'

  return (
    `Nas últimas ${periodo} você registrou ${g.mediaConsumida} kcal por dia em média, ` +
    `${movimento}. Isso põe o seu gasto perto de ${g.kcal} kcal por dia — ` +
    'calculado a partir do que você registrou, e não de uma fórmula.'
  )
}
