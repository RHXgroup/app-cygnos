import {
  caloriasDoTreino,
  resumoDoTreino,
  volumeLegivel,
} from './resumoDoTreino.ts'
import type { SerieFeita } from './treino.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { passou++; console.log('  ok    ' + nome) }
  else { falhou++; console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : '')) }
}

const s = (
  nome: string,
  data: string,
  serie: number,
  cargaKg: number | null,
  repeticoes: number | null,
  exercicioId: string | null = nome,
): SerieFeita => ({ exercicioId, nome, data, serie, cargaKg, repeticoes })

console.log('\n1. as calorias, e quando NÃO estimar')

{
  /* MET 5,0 × 70 kg × 1 h = 350. */
  ok('60 min a 70 kg dão 350', caloriasDoTreino(60, 70) === 350, String(caloriasDoTreino(60, 70)))
  ok('30 min dão metade', caloriasDoTreino(30, 70) === 175)
  ok('quem pesa menos gasta menos', (caloriasDoTreino(60, 55) ?? 0) < 350)

  /* Sem o peso não há conta. Chutar 70 kg daria a quem pesa 55 um número 27%
     maior, e ela não teria como saber. */
  ok('sem peso não inventa', caloriasDoTreino(60, null) === null)
  ok('peso absurdo não vale', caloriasDoTreino(60, 700) === null)
  ok('peso de criança pequena não vale', caloriasDoTreino(60, 5) === null)
  ok('NaN não vale', caloriasDoTreino(60, Number.NaN) === null)

  /* Tela esquecida aberta a noite inteira: sem o teto, sairia "3.400 kcal
     queimadas", e um número absurdo com cara de confiança destrói a confiança
     em todos os outros. */
  ok('8 horas de treino não vira número', caloriasDoTreino(480, 70) === null)
  ok('zero minuto não vira número', caloriasDoTreino(0, 70) === null)
  ok('minuto negativo não vira número', caloriasDoTreino(-10, 70) === null)
  ok('5 horas ainda passa', caloriasDoTreino(300, 70) !== null)
  ok('5 horas e um minuto não', caloriasDoTreino(301, 70) === null)
}

console.log('\n2. o volume')

{
  const hoje = [s('Agachamento', '2026-08-30', 1, 50, 10), s('Agachamento', '2026-08-30', 2, 50, 10)]
  ok('50 × 10 × 2 = 1000', resumoDoTreino(hoje, [], 40, 70).volumeKg === 1000,
    String(resumoDoTreino(hoje, [], 40, 70).volumeKg))
}

{
  /* Série sem carga NÃO vale zero: vale desconhecido. Somar zero faria o total
     mentir para baixo sem nada na tela dizendo por quê. */
  const hoje = [s('Barra fixa', '2026-08-30', 1, null, 8), s('Rosca', '2026-08-30', 1, 20, 10)]
  ok('série sem carga fica fora do volume', resumoDoTreino(hoje, [], 40, 70).volumeKg === 200)
  ok('mas conta como série', resumoDoTreino(hoje, [], 40, 70).series === 2)
}

{
  const hoje = [s('Flexão', '2026-08-30', 1, 0, 20)]
  ok('carga zero soma zero, e não quebra', resumoDoTreino(hoje, [], 20, 70).volumeKg === 0)
}

console.log('\n3. a comparação com a última vez')

{
  const hoje = [s('Agachamento', '2026-08-30', 1, 55, 10)]
  const antes = [
    s('Agachamento', '2026-07-19', 1, 40, 10),
    s('Agachamento', '2026-08-23', 1, 50, 10),
  ]
  const r = resumoDoTreino(hoje, antes, 45, 70)
  ok('compara com a ÚLTIMA vez, não com a primeira', r.comparacoes[0].antesKg === 50,
    String(r.comparacoes[0].antesKg))
  ok('e diz quando foi', r.comparacoes[0].antesEm === '2026-08-23', String(r.comparacoes[0].antesEm))
  ok('a variação sai em porcento', r.comparacoes[0].variacao === 10, String(r.comparacoes[0].variacao))
  ok('e conta como recorde', r.recordes === 1, String(r.recordes))
}

{
  /* Bater a semana passada não é bater o recorde: quem fez 60 em julho e 55
     hoje melhorou desde a última vez, e não bateu nada. */
  const hoje = [s('Supino', '2026-08-30', 1, 55, 8)]
  const antes = [s('Supino', '2026-06-01', 1, 60, 8), s('Supino', '2026-08-23', 1, 50, 8)]
  const r = resumoDoTreino(hoje, antes, 40, 70)
  ok('melhorou desde a última vez', r.comparacoes[0].variacao === 10)
  ok('mas NÃO é recorde', r.recordes === 0, String(r.recordes))
}

{
  const hoje = [s('Supino', '2026-08-30', 1, 45, 8)]
  const antes = [s('Supino', '2026-08-23', 1, 50, 8)]
  const r = resumoDoTreino(hoje, antes, 40, 70)
  ok('caiu, e a variação é negativa', r.comparacoes[0].variacao === -10, String(r.comparacoes[0].variacao))
  ok('e não conta recorde', r.recordes === 0)
}

{
  /* Sem passado não há comparação — e a lista fica vazia em vez de inventar
     "+100%". */
  const r = resumoDoTreino([s('Novo', '2026-08-30', 1, 30, 10)], [], 30, 70)
  ok('exercício novo não entra na comparação', r.comparacoes.length === 0)
  ok('nem conta como recorde', r.recordes === 0, String(r.recordes))
}

{
  /* Divisão por zero: quem levantava 0 kg (peso do corpo) e passou a levantar
     20 não tem variação percentual — tem outro exercício. */
  const hoje = [s('Agachamento', '2026-08-30', 1, 20, 10)]
  const antes = [s('Agachamento', '2026-08-23', 1, 0, 10)]
  const r = resumoDoTreino(hoje, antes, 30, 70)
  ok('sai nulo em vez de Infinity', r.comparacoes[0].variacao === null, String(r.comparacoes[0].variacao))
  ok('mas os dois números aparecem', r.comparacoes[0].hojeKg === 20 && r.comparacoes[0].antesKg === 0)
  ok('e É recorde', r.recordes === 1)
}

console.log('\n4. a ordem, e o agrupamento')

{
  const hoje = [
    s('Agachamento', '2026-08-30', 1, 55, 10),
    s('Supino', '2026-08-30', 1, 42, 10),
    s('Remada', '2026-08-30', 1, 30, 10),
  ]
  const antes = [
    s('Agachamento', '2026-08-23', 1, 50, 10), // +10%
    s('Supino', '2026-08-23', 1, 40, 10), //  +5%
    s('Remada', '2026-08-23', 1, 30, 10), //   0%
  ]
  const r = resumoDoTreino(hoje, antes, 50, 70)
  ok('três exercícios', r.exercicios === 3)
  ok('o que mais subiu vem primeiro', r.comparacoes[0].nome === 'Agachamento', r.comparacoes[0].nome)
  ok('e o que não mudou vem por último', r.comparacoes[2].nome === 'Remada', r.comparacoes[2].nome)
}

{
  /* Quatro séries do MESMO exercício são um exercício, e a carga que vale é a
     MAIOR — é a que a pessoa lembra e a que ela quer bater. */
  const hoje = [
    s('Agachamento', '2026-08-30', 1, 40, 10),
    s('Agachamento', '2026-08-30', 2, 50, 8),
    s('Agachamento', '2026-08-30', 3, 45, 8),
  ]
  const r = resumoDoTreino(hoje, [s('Agachamento', '2026-08-23', 1, 40, 10)], 40, 70)
  ok('um exercício, três séries', r.exercicios === 1 && r.series === 3)
  ok('a carga de hoje é a maior', r.comparacoes[0].hojeKg === 50, String(r.comparacoes[0].hojeKg))
}

{
  /* Exercício APAGADO da rotina: `exercicioId` fica nulo, e o agrupamento cai no
     nome. Sem isso, o histórico de quem reorganizou a rotina viraria um
     exercício diferente por dia. */
  const hoje = [s('Agachamento', '2026-08-30', 1, 55, 10, null)]
  const antes = [s('Agachamento', '2026-08-23', 1, 50, 10, null)]
  const r = resumoDoTreino(hoje, antes, 40, 70)
  ok('sem id, agrupa pelo nome', r.comparacoes.length === 1 && r.comparacoes[0].variacao === 10)
}

{
  /* E o nome com caixa e espaço diferentes é o mesmo exercício. */
  const hoje = [s('  AGACHAMENTO ', '2026-08-30', 1, 55, 10, null)]
  const antes = [s('agachamento', '2026-08-23', 1, 50, 10, null)]
  ok('caixa e espaço não separam', resumoDoTreino(hoje, antes, 40, 70).comparacoes.length === 1)
}

{
  /* Mas o id MANDA: exercício adaptado troca de nome e mantém o id, e é a mesma
     história. */
  const hoje = [s('Leg press', '2026-08-30', 1, 120, 10, 'ex-1')]
  const antes = [s('Agachamento livre', '2026-08-23', 1, 100, 10, 'ex-1')]
  const r = resumoDoTreino(hoje, antes, 40, 70)
  ok('o id vence o nome', r.comparacoes.length === 1 && r.comparacoes[0].variacao === 20,
    JSON.stringify(r.comparacoes))
}

console.log('\n5. treino vazio, e o que não pode quebrar')

{
  const r = resumoDoTreino([], [], 0, 70)
  ok('nada feito não quebra', r.exercicios === 0 && r.series === 0 && r.volumeKg === 0)
  ok('sem calorias', r.calorias === null)
  ok('sem comparações', r.comparacoes.length === 0)
  ok('sem recordes', r.recordes === 0)
}

{
  const r = resumoDoTreino([s('X', '2026-08-30', 1, null, null)], [], 30, null)
  ok('série sem número nenhum não derruba', r.series === 1 && r.volumeKg === 0)
  ok('e não vira comparação', r.comparacoes.length === 0)
}

console.log('\n6. o volume por extenso')

{
  ok('840 kg', volumeLegivel(840) === '840 kg', volumeLegivel(840))
  ok('999 kg continua kg', volumeLegivel(999) === '999 kg')
  ok('1000 vira 1,0 t', volumeLegivel(1000) === '1,0 t', volumeLegivel(1000))
  ok('2400 vira 2,4 t', volumeLegivel(2400) === '2,4 t', volumeLegivel(2400))
  ok('zero vira vazio', volumeLegivel(0) === '')
  ok('negativo vira vazio', volumeLegivel(-5) === '')
  ok('NaN vira vazio', volumeLegivel(Number.NaN) === '')
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
