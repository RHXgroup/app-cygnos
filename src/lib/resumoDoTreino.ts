/* O que aquele treino valeu — a conta que o app devia fazer e não fazia.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 * O app pedia e guardava, e no fim a pessoa não levava nada. Um app que só
 * cobra não é aberto na terceira semana. A devolução precisa estar COLADA no
 * esforço: é ao terminar, suada, que "você fez 55 kg — há seis semanas eram 40"
 * significa alguma coisa. A mesma frase numa aba, dois dias depois, é número.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho, e é exercitado com séries de verdade. */

import type { SerieFeita } from './treino'

export type ComparacaoDeExercicio = {
  nome: string
  /* A maior carga de hoje e a da última vez que ela fez este exercício. */
  hojeKg: number | null
  antesKg: number | null
  antesEm: string | null
  /* Quantos por cento subiu. Nulo quando não dá para comparar. */
  variacao: number | null
}

export type ResumoDoTreino = {
  exercicios: number
  series: number
  /* Peso × repetições, somado. É a medida que o treino de força usa para
     "quanto trabalho foi feito" — e é a única que compara um dia de agachamento
     pesado com um dia de muitas repetições leves. */
  volumeKg: number
  /* Nulo quando não dá para estimar. Ver `caloriasDoTreino`. */
  calorias: number | null
  /* Só os exercícios em que houve o que comparar, do maior ganho para o menor:
     a tela mostra os primeiros, e o que interessa é o que melhorou. */
  comparacoes: ComparacaoDeExercicio[]
  /* Quantos bateram o próprio recorde de carga. */
  recordes: number
}

const maiorCarga = (series: SerieFeita[]): number | null => {
  const cargas = series.map(s => s.cargaKg).filter((c): c is number => c !== null)
  return cargas.length ? Math.max(...cargas) : null
}

/* Quantas calorias aquele treino gastou, mais ou menos.
 *
 * MET × peso × horas. 5,0 é o valor de tabela para musculação de esforço
 * moderado — o mesmo que a literatura de atividade física usa, e a mesma ordem
 * de grandeza que qualquer relógio mostraria.
 *
 * É ESTIMATIVA, e a tela diz isso. Sem o peso da pessoa não há conta possível, e
 * devolver null é melhor do que chutar 70 kg: quem pesa 55 receberia um número
 * 27% maior e não teria como saber.
 *
 * Duração implausível também não vira número. Uma tela esquecida aberta a noite
 * inteira geraria "3.400 kcal queimadas", e um número absurdo apresentado com
 * confiança destrói a confiança em todos os outros. */
export function caloriasDoTreino(minutos: number, pesoKg: number | null): number | null {
  if (pesoKg === null || !Number.isFinite(pesoKg) || pesoKg < 20 || pesoKg > 400) return null
  if (!Number.isFinite(minutos) || minutos < 1 || minutos > 300) return null
  const MET = 5.0
  return Math.round(MET * pesoKg * (minutos / 60))
}

/* O resumo, a partir do que foi feito HOJE e do que já havia antes.
 *
 * `historico` é tudo o que existe daqueles exercícios em dias anteriores — quem
 * busca é a tela, e aqui só se decide. */
export function resumoDoTreino(
  hoje: SerieFeita[],
  historico: SerieFeita[],
  minutos: number,
  pesoKg: number | null,
): ResumoDoTreino {
  /* Agrupa pelo id do exercício, e cai no nome quando ele não existe mais —
     exercício apagado da rotina guarda o histórico com `exercicio_id` nulo. */
  const chave = (s: SerieFeita) => s.exercicioId ?? `nome:${s.nome.trim().toLowerCase()}`

  const porExercicio = new Map<string, SerieFeita[]>()
  for (const s of hoje) {
    const k = chave(s)
    porExercicio.set(k, [...(porExercicio.get(k) ?? []), s])
  }

  let volumeKg = 0
  for (const s of hoje) {
    /* Só entra no volume o que tem os DOIS números. Série sem carga registrada
       não vale zero: vale desconhecido, e somar zero faria o total mentir para
       baixo sem nada na tela dizendo por quê. */
    if (s.cargaKg !== null && s.repeticoes !== null) volumeKg += s.cargaKg * s.repeticoes
  }

  const comparacoes: ComparacaoDeExercicio[] = []
  let recordes = 0

  for (const [k, doDia] of porExercicio) {
    const anteriores = historico.filter(s => chave(s) === k)
    const hojeKg = maiorCarga(doDia)

    /* O dia anterior mais recente, e não o histórico inteiro: comparar com a
       média de meses diluiria justamente o que a pessoa quer ver. */
    const dias = [...new Set(anteriores.map(s => s.data))].sort()
    const ultimoDia = dias[dias.length - 1] ?? null
    const antesKg = ultimoDia ? maiorCarga(anteriores.filter(s => s.data === ultimoDia)) : null

    /* Recorde é contra TUDO o que já foi feito, e não contra a última vez: bater
       a semana passada é bom, bater o próprio máximo é outra coisa. */
    const maximoDeSempre = maiorCarga(anteriores)
    if (hojeKg !== null && maximoDeSempre !== null && hojeKg > maximoDeSempre) recordes++

    if (hojeKg === null || antesKg === null || ultimoDia === null) continue

    comparacoes.push({
      nome: doDia[0].nome,
      hojeKg,
      antesKg,
      antesEm: ultimoDia,
      /* Divisão por zero: quem levantava 0 kg (peso do corpo) e passou a
         levantar 20 não tem variação percentual — tem uma mudança de tipo de
         exercício. Nulo, e a tela mostra os dois números. */
      variacao: antesKg > 0 ? Math.round(((hojeKg - antesKg) / antesKg) * 100) : null,
    })
  }

  /* Do maior ganho para o menor. Quem melhorou vem primeiro porque é isso que a
     tela mostra nas primeiras linhas — e é isso que faz alguém voltar. */
  comparacoes.sort((a, b) => (b.variacao ?? -999) - (a.variacao ?? -999))

  return {
    exercicios: porExercicio.size,
    series: hoje.length,
    volumeKg: Math.round(volumeKg),
    calorias: caloriasDoTreino(minutos, pesoKg),
    comparacoes,
    recordes,
  }
}

/* "2,4 t" para volume grande, "840 kg" para o resto.
 *
 * Tonelada porque o número fica grande rápido — quatro séries de dez com 50 kg
 * já são duas toneladas —, e "2.000 kg" lido de relance parece erro de digitação
 * enquanto "2 t" parece uma conquista. É a mesma informação, e uma delas a
 * pessoa entende. */
export function volumeLegivel(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return ''
  if (kg < 1000) return `${Math.round(kg)} kg`
  return `${(kg / 1000).toFixed(1).replace('.', ',')} t`
}
