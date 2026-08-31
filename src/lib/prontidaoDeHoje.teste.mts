/* A prontidao do dia, a partir do sono. E o tom, que aqui e metade do trabalho:
 * o app esta opinando sobre o corpo de alguem.
 *
 * Rode com: node --experimental-strip-types src/lib/prontidaoDeHoje.teste.mts */

import { mediaDeSono, prontidaoDeHoje, type NoiteCurta } from './prontidaoDeHoje.ts'

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

const HOJE = '2026-08-31'
const noite = (min: number | null, data = HOJE): NoiteCurta => ({ data, minutos: min, qualidade: null })

console.log('\n1. os cortes')

{
  ok('4h30 e baixa', prontidaoDeHoje([noite(270)], HOJE).nivel === 'baixa')
  ok('5h30 tambem e baixa', prontidaoDeHoje([noite(330)], HOJE).nivel === 'baixa')
  ok('6h30 e media', prontidaoDeHoje([noite(390)], HOJE).nivel === 'media')
  ok('7h30 e boa', prontidaoDeHoje([noite(450)], HOJE).nivel === 'boa')
  /* Exatamente nos limites. */
  ok('6h em ponto ja e media', prontidaoDeHoje([noite(360)], HOJE).nivel === 'media')
  ok('7h em ponto ja e boa', prontidaoDeHoje([noite(420)], HOJE).nivel === 'boa')
  ok('5h em ponto e a faixa de cima da baixa',
    prontidaoDeHoje([noite(300)], HOJE).nivel === 'baixa')
}

console.log('\n2. a frase traz o numero que a gerou')

{
  /* Conselho sem o numero que o gerou e palpite. */
  ok('4h30 aparece na frase', prontidaoDeHoje([noite(270)], HOJE).frase?.includes('4h30'),
    prontidaoDeHoje([noite(270)], HOJE).frase ?? '')
  ok('8h em ponto sai sem os minutos', prontidaoDeHoje([noite(480)], HOJE).frase?.includes('8h.'),
    prontidaoDeHoje([noite(480)], HOJE).frase ?? '')
  ok('e os minutos vem com zero a esquerda',
    prontidaoDeHoje([noite(425)], HOJE).frase?.includes('7h05'),
    prontidaoDeHoje([noite(425)], HOJE).frase ?? '')
}

{
  /* Media nao gera frase: nao ha o que dizer sobre uma noite comum, e falar
     todo dia faria a frase virar paisagem. */
  ok('noite media nao gera frase', prontidaoDeHoje([noite(390)], HOJE).frase === null)
  /* Mas a noite BOA gera. Um app que so fala quando esta ruim e um app que a
     pessoa evita abrir -- mesma razao de toda categoria do ciclo ter a opcao
     positiva. */
  ok('noite boa gera frase', prontidaoDeHoje([noite(480)], HOJE).frase !== null)
}

console.log('\n3. sem noite registrada o app fica calado')

{
  ok('sem noite nenhuma', prontidaoDeHoje([], HOJE).frase === null)
  ok('e nao inventa minutos', prontidaoDeHoje([], HOJE).minutos === null)
  /* Supor que ela dormiu bem seria inventar o dado mais importante da frase. */
  ok('nem inventa disposicao boa', prontidaoDeHoje([], HOJE).nivel === 'media')

  ok('noite de OUTRO dia nao vale para hoje',
    prontidaoDeHoje([noite(270, '2026-08-30')], HOJE).frase === null)
  ok('minutos nulos', prontidaoDeHoje([noite(null)], HOJE).frase === null)
  ok('minutos zero', prontidaoDeHoje([noite(0)], HOJE).frase === null)
  ok('NaN', prontidaoDeHoje([noite(NaN)], HOJE).frase === null)
  ok('Infinity', prontidaoDeHoje([noite(Infinity)], HOJE).frase === null)
  ok('negativo', prontidaoDeHoje([noite(-300)], HOJE).frase === null)
  ok('hoje invalido', prontidaoDeHoje([noite(270)], 'lixo').frase === null)
}

console.log('\n4. o tom: sugestao, nunca ordem')

{
  /* O app esta opinando sobre o corpo de alguem. Tres razoes de nunca mandar:
     ele mede uma noite e nao o corpo; mandar diminuir carga e prescricao; e uma
     ordem ignorada uma vez vira ruido para sempre, e ai perde tambem os dias em
     que estava certo. */
  const ordens = [
    'nao treine', 'não treine', 'evite treinar', 'voce deve', 'você deve',
    'e melhor nao', 'é melhor não', 'descanse hoje', 'pule o treino',
    'diminua a carga', 'reduza a carga', 'nao va', 'não vá',
  ]
  const frases = [270, 330, 390, 450, 480, 540]
    .map(m => prontidaoDeHoje([noite(m)], HOJE).frase)
    .filter((f): f is string => f !== null)

  let limpas = 0
  for (const f of frases) {
    const suja = ordens.find(o => f.toLowerCase().includes(o))
    if (suja) {
      falharam++
      console.log(`  FALHA frase manda em vez de sugerir ("${suja}"): ${f}`)
    } else limpas++
  }
  ok(`as ${frases.length} frases sugerem, nenhuma manda`, limpas === frases.length)

  /* E a de noite muito curta devolve a decisao explicitamente. */
  const curta = prontidaoDeHoje([noite(270)], HOJE).frase ?? ''
  ok('a de noite curta devolve a decisao a ela',
    curta.toLowerCase().includes('você') && curta.toLowerCase().includes('corpo'), curta)

  /* Nenhuma diagnostica nem culpa. */
  const proibidas = ['voce esta doente', 'você está doente', 'overtraining',
    'sobretreino', 'culpa', 'errou', 'preguica', 'preguiça']
  let sem = 0
  for (const f of frases) {
    if (!proibidas.some(x => f.toLowerCase().includes(x))) sem++
  }
  ok('nenhuma diagnostica nem culpa', sem === frases.length)
}

console.log('\n5. a media de sono, para quem registra as vezes')

{
  const sete = [480, 420, 450, 390, 460, 400, 470].map((m, i) =>
    noite(m, `2026-08-${String(31 - i).padStart(2, '0')}`))
  ok('media de 7 noites', mediaDeSono(sete) === 439, String(mediaDeSono(sete)))
  ok('menos de 3 noites nao vira media', mediaDeSono(sete.slice(0, 2)) === null)
  ok('sem noite nenhuma', mediaDeSono([]) === null)
  /* Noite invalida nao entra na conta. */
  const comLixo = [noite(480), noite(NaN), noite(420), noite(null), noite(450)]
  ok('noite invalida nao entra na media', mediaDeSono(comLixo) === 450,
    String(mediaDeSono(comLixo)))
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
