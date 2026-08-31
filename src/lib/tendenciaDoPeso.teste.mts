/* A linha de tendencia do peso.
 *
 * Rode com: node --experimental-strip-types src/lib/tendenciaDoPeso.teste.mts */

import {
  fraseDaDistancia,
  resumoDaTendencia,
  tendenciaDoPeso,
  type Pesagem,
} from './tendenciaDoPeso.ts'

let passaram = 0
let falharam = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passaram++
    console.log('  ok    ' + nome)
  } else {
    falharam++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const dia = (n: number) => `2026-08-${String(n).padStart(2, '0')}`

console.log('\n1. a linha suaviza o que a balanca treme')

{
  /* Peso oscilando 1,5 kg em volta de 70, sem tendencia nenhuma. A linha tem
     de ficar perto de 70 -- e nao acompanhar os picos. */
  const p: Pesagem[] = [
    { data: dia(1), kg: 70.0 },
    { data: dia(2), kg: 71.4 },
    { data: dia(3), kg: 69.6 },
    { data: dia(4), kg: 71.0 },
    { data: dia(5), kg: 69.8 },
    { data: dia(6), kg: 70.6 },
  ]
  const s = tendenciaDoPeso(p)
  const fim = s[s.length - 1].tendencia
  ok('a linha nao segue o pico', Math.abs(fim - 70) < 0.6, String(fim))
  /* E ela varia MUITO menos que a balanca. */
  const oscilaBalanca = 71.4 - 69.6
  const linhas = s.map(x => x.tendencia)
  const oscilaLinha = Math.max(...linhas) - Math.min(...linhas)
  ok('a linha oscila menos que a balanca', oscilaLinha < oscilaBalanca / 2,
    `linha ${oscilaLinha.toFixed(2)} vs balanca ${oscilaBalanca.toFixed(2)}`)
}

{
  /* Emagrecimento de verdade: a linha TEM de acompanhar, senao ela e inutil.
     500 g por semana durante 4 semanas. */
  const p: Pesagem[] = Array.from({ length: 29 }, (_, i) => ({
    data: `2026-08-${String(i + 1).padStart(2, '0')}`,
    kg: 80 - i * (0.5 / 7),
  }))
  const s = tendenciaDoPeso(p)
  const r = resumoDaTendencia(s)!
  ok('a linha acompanha perda real', r.variacao < -1.5, String(r.variacao))
  ok('e o ritmo semanal bate com os 500 g',
    Math.abs(r.porSemana + 0.5) < 0.12, String(r.porSemana))
}

console.log('\n2. o dia que faltou nao vira buraco')

{
  /* Pesou dia 1 e dia 8. A serie tem de ter os 8 dias, e nao 2 pontos. */
  const s = tendenciaDoPeso([
    { data: dia(1), kg: 70 },
    { data: dia(8), kg: 69 },
  ])
  ok('a serie cobre os dias entre as pesagens', s.length === 8, String(s.length))
  ok('e os do meio nao tem medida', s[3].medido === null)
  ok('mas tem linha', typeof s[3].tendencia === 'number')
  /* A linha REPETE nos dias sem pesagem -- nao inventa caminho. */
  ok('a linha nao se move sem medida', s[1].tendencia === s[5].tendencia,
    `${s[1].tendencia} vs ${s[5].tendencia}`)
  ok('e o dia da pesagem tem medida', s[7].medido === 69)
}

{
  /* Buraco de mais de 21 dias: a serie corta e recomeca na pesagem seguinte,
     em vez de desenhar uma reta por dois meses. */
  const s = tendenciaDoPeso([
    { data: '2026-06-01', kg: 80 },
    { data: '2026-06-02', kg: 80 },
    { data: '2026-08-15', kg: 74 },
  ])
  ok('buraco longo nao vira reta de dois meses', s.length < 20, String(s.length))
  /* E a linha renasce NA pesagem nova, e nao arrasta os 80 kg. */
  const fim = s[s.length - 1].tendencia
  ok('a linha recomeca no peso novo', Math.abs(fim - 74) < 0.1, String(fim))
}

console.log('\n3. o que nao pode entrar')

{
  ok('lista vazia', tendenciaDoPeso([]).length === 0)
  ok('data invalida e ignorada', tendenciaDoPeso([{ data: 'lixo', kg: 70 }]).length === 0)
  /* '2026-02-31' passa no formato e nao existe no calendario. */
  ok('data impossivel e ignorada',
    tendenciaDoPeso([{ data: '2026-02-31', kg: 70 }]).length === 0)
  ok('NaN', tendenciaDoPeso([{ data: dia(1), kg: NaN }]).length === 0)
  ok('Infinity', tendenciaDoPeso([{ data: dia(1), kg: Infinity }]).length === 0)
  ok('zero', tendenciaDoPeso([{ data: dia(1), kg: 0 }]).length === 0)
  ok('negativo', tendenciaDoPeso([{ data: dia(1), kg: -70 }]).length === 0)
  /* Libras digitadas como quilo, ou virgula no lugar errado: 700 kg arrastaria
     a linha por semanas, e ninguem ligaria o defeito a causa. */
  ok('700 kg e recusado', tendenciaDoPeso([{ data: dia(1), kg: 700 }]).length === 0)
  ok('7 kg tambem', tendenciaDoPeso([{ data: dia(1), kg: 7 }]).length === 0)
}

{
  /* Um valor absurdo NO MEIO nao contamina a linha: ele e descartado, e os
     outros continuam. */
  const s = tendenciaDoPeso([
    { data: dia(1), kg: 70 },
    { data: dia(2), kg: 700 },
    { data: dia(3), kg: 70.2 },
  ])
  ok('o absurdo do meio e descartado', s.length === 3, String(s.length))
  ok('e a linha continua perto de 70',
    Math.abs(s[s.length - 1].tendencia - 70) < 0.5, String(s[s.length - 1].tendencia))
  ok('e o dia dele nao tem medida', s[1].medido === null)
}

{
  /* Duas pesagens no mesmo dia: fica a ultima. Quem pesa de novo depois do
     banheiro esta corrigindo a primeira, e nao somando outra medida. */
  const s = tendenciaDoPeso([
    { data: dia(1), kg: 70 },
    { data: dia(1), kg: 69.4 },
  ])
  ok('duas no mesmo dia viram uma', s.length === 1)
  ok('e vale a ultima', s[0].medido === 69.4, String(s[0].medido))
}

{
  /* Fora de ordem da o mesmo resultado. */
  const a = tendenciaDoPeso([
    { data: dia(3), kg: 69 }, { data: dia(1), kg: 70 }, { data: dia(2), kg: 69.5 },
  ])
  const b = tendenciaDoPeso([
    { data: dia(1), kg: 70 }, { data: dia(2), kg: 69.5 }, { data: dia(3), kg: 69 },
  ])
  ok('ordem nao importa', JSON.stringify(a) === JSON.stringify(b))
}

console.log('\n4. o resumo nao descreve o proprio algoritmo')

{
  /* Com poucos dias a linha ainda esta se acomodando na primeira pesagem.
     Dizer "voce perdeu 0,4 kg" ali seria descrever o algoritmo, nao o corpo. */
  const s = tendenciaDoPeso([
    { data: dia(1), kg: 72 }, { data: dia(2), kg: 70 }, { data: dia(3), kg: 70 },
  ])
  const r = resumoDaTendencia(s)!
  ok('com 3 dias nao afirma variacao', r.variacao === 0, String(r.variacao))
  ok('nem ritmo semanal', r.porSemana === 0)
  /* Mas o numero ATUAL existe: ele e o que se mostra grande. */
  ok('o atual existe desde o comeco', r.atual > 0)
}

{
  ok('sem serie, sem resumo', resumoDaTendencia([]) === null)
}

console.log('\n5. a distancia entre a balanca e a linha')

{
  /* O numero que explica o susto. */
  const s = tendenciaDoPeso([
    ...Array.from({ length: 10 }, (_, i) => ({ data: dia(i + 1), kg: 70 })),
    { data: dia(11), kg: 71.6 },
  ])
  const r = resumoDaTendencia(s)!
  ok('a distancia e positiva quando a balanca sobe', (r.distanciaDeHoje ?? 0) > 1,
    String(r.distanciaDeHoje))
  const f = fraseDaDistancia(r)!
  ok('a frase existe', typeof f === 'string')
  ok('e explica que oscila por agua e sal',
    f.includes('água') && f.includes('sal'), f)
  ok('e diz que a linha e o que vale', f.includes('tendência'), f)
}

{
  /* Sem pesagem hoje, nao ha distancia nem frase. */
  const s = tendenciaDoPeso([
    { data: dia(1), kg: 70 }, { data: dia(2), kg: 70 }, { data: dia(9), kg: 70 },
  ])
  const ultimoSemMedida = tendenciaDoPeso([
    { data: dia(1), kg: 70 }, { data: dia(9), kg: 70 },
  ])
  ok('quando o ultimo dia tem medida, ha distancia',
    resumoDaTendencia(s)!.distanciaDeHoje !== null)
  ok('a serie termina no dia da ultima pesagem',
    ultimoSemMedida[ultimoSemMedida.length - 1].medido === 70)
}

{
  /* Distancia pequena nao merece paragrafo -- falar toda vez faria a explicacao
     virar paisagem. */
  const s = tendenciaDoPeso([
    ...Array.from({ length: 10 }, (_, i) => ({ data: dia(i + 1), kg: 70 })),
    { data: dia(11), kg: 70.2 },
  ])
  ok('300 g nao geram frase', fraseDaDistancia(resumoDaTendencia(s)) === null)
  ok('sem resumo, sem frase', fraseDaDistancia(null) === null)
}

{
  /* E o tom: nunca culpa, nem quando a balanca sobe. */
  const proibidas = ['voce comeu', 'você comeu', 'exagerou', 'cuidado', 'atencao',
    'atenção', 'errou', 'culpa', 'engordou']
  const s = tendenciaDoPeso([
    ...Array.from({ length: 10 }, (_, i) => ({ data: dia(i + 1), kg: 70 })),
    { data: dia(11), kg: 72 },
  ])
  const f = (fraseDaDistancia(resumoDaTendencia(s)) ?? '').toLowerCase()
  const suja = proibidas.find(x => f.includes(x))
  ok('a frase da balanca alta nao culpa', suja === undefined, suja ?? '')
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
