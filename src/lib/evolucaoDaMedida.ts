/* O que uma circunferência conta ao longo do tempo.
 *
 * ── Por que isto é separado de `medidas.ts` ───────────────────────────────
 * Lá fica o que fala com a rede; aqui o que decide. Item 16 do AGENTS.md, e o
 * corte vale porque é o que decide que erra — e porque uma medida de corpo é
 * exatamente o tipo de número que chega torto: fita métrica lida ao contrário,
 * vírgula onde devia ser ponto, o valor do mês passado digitado por engano.
 *
 * Só `import type`. Roda fora do aparelho. */

import type { Medida, Parte } from './medidas'

/* O valor daquela parte, ou nulo. Uma função em vez de índice cru porque as
   três colunas têm nomes diferentes do nome da parte, e espalhar esse
   mapeamento pelas telas é como uma delas passa a ler a coluna errada. */
export const valorDa = (m: Medida, parte: Parte): number | null =>
  parte === 'cintura' ? m.cinturaCm : parte === 'quadril' ? m.quadrilCm : m.bracoCm

export type EvolucaoDaMedida = {
  /* A medição mais recente que TEM esta parte. */
  atual: number
  dataAtual: string
  /* A primeira que tem, para a comparação valer sobre o período inteiro. */
  primeira: number
  dataPrimeira: string
  /* Positivo é aumento. Sem julgamento: aumentar braço é objetivo de gente, e
     diminuir cintura é objetivo de outra gente — quem diz se é bom é a pessoa,
     ou a nutricionista dela. */
  variacaoCm: number
  /* Quantas medições daquela parte entraram. A tela mostra: uma comparação
     entre dois pontos é diferente de uma entre doze, e a pessoa precisa saber
     de qual se trata. */
  quantas: number
}

/* Nulo com menos de DUAS medições daquela parte.
 *
 * Com uma só não há evolução — há um número. E mostrar "0,0 cm" como se fosse
 * estabilidade seria afirmar sobre um período que não foi observado. */
export function evolucaoDaMedida(
  medidas: Medida[],
  parte: Parte,
): EvolucaoDaMedida | null {
  if (!Array.isArray(medidas)) return null

  /* Da mais antiga para a mais recente, e só as que têm ESTA parte: quem mediu
     a cintura em três dias e o braço em um tem evolução de cintura e não de
     braço, e misturá-las compararia a cintura de março com o braço de agosto. */
  const uteis = medidas
    .filter(m => !!m && typeof m.data === 'string' && valorDa(m, parte) !== null)
    .sort((a, b) => a.data.localeCompare(b.data))

  if (uteis.length < 2) return null

  const primeira = valorDa(uteis[0], parte) as number
  const atual = valorDa(uteis[uteis.length - 1], parte) as number
  const variacao = atual - primeira

  /* O resultado, e não só a entrada: duas medidas dentro da faixa ainda podem
     produzir uma variação absurda se uma delas tiver sido digitada errada, e um
     número não finito atravessaria a tela. */
  if (!Number.isFinite(variacao)) return null

  return {
    atual,
    dataAtual: uteis[uteis.length - 1].data,
    primeira,
    dataPrimeira: uteis[0].data,
    variacaoCm: Math.round(variacao * 10) / 10,
    quantas: uteis.length,
  }
}

/* A série para o gráfico, da mais antiga para a mais recente.
 *
 * Sem preencher buraco: medição é quinzenal, e inventar os treze dias entre
 * duas desenharia uma reta que ninguém mediu. O peso preenche porque é diário e
 * a linha de tendência precisa; aqui a verdade é o ponto. */
export const serieDaMedida = (medidas: Medida[], parte: Parte): number[] =>
  (Array.isArray(medidas) ? medidas : [])
    .filter(m => !!m && typeof m.data === 'string' && valorDa(m, parte) !== null)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(m => valorDa(m, parte) as number)

/* "2,5 cm a menos" / "1,0 cm a mais" / "sem mudança".
 *
 * Sem cor e sem elogio. Aumentar braço é o objetivo de quem treina, e diminuir
 * cintura é o de outra pessoa — o app mede, e quem interpreta é ela com a
 * profissional. Pintar de verde ou vermelho aqui transformaria a meta de
 * metade das pessoas em alarme. */
export function fraseDaVariacao(e: EvolucaoDaMedida | null): string | null {
  if (e === null) return null
  const v = Math.abs(e.variacaoCm)
  /* Meio centímetro é a precisão de quem mede com fita em casa: abaixo disso, a
     diferença é a mão e não o corpo. */
  if (v < 0.5) return 'Sem mudança no período'
  const quanto = v.toFixed(1).replace('.', ',')
  return e.variacaoCm < 0 ? `${quanto} cm a menos` : `${quanto} cm a mais`
}
