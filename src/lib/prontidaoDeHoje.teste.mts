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

/* ────────────────────────────────────────────────────────────────────────────
   A noite que ela NAO anotou
   ──────────────────────────────────────────────────────────────────────────

   O bloco inteiro sumia da tela. Quem registra sono tres vezes por semana nao
   recebia nada nos outros quatro dias -- justamente os dias em que ela ja esta
   com menos disposicao para anotar. */
console.log('\nSem a noite de hoje, mas com historico')

{
  const semHoje: NoiteCurta[] = [
    { data: '2026-08-30', minutos: 7 * 60, qualidade: null },
    { data: '2026-08-29', minutos: 7 * 60, qualidade: null },
    { data: '2026-08-28', minutos: 7 * 60, qualidade: null },
  ]
  const p = prontidaoDeHoje(semHoje, HOJE)
  ok('agora diz alguma coisa', p.frase !== null)
  ok('e o nivel diz que hoje falta', p.nivel === 'sem_hoje')
  ok('a media aparece na frase', (p.frase ?? '').includes('7h'))
  /* `minutos` e a noite de HOJE. Por a media ali faria a tela mostrar um numero
     de ontem com a cara de hoje. */
  ok('e nao finge que a noite de hoje existe', p.minutos === null)
}

{
  /* FATO, e nenhuma instrucao. Inventar conselho sobre uma noite que nao foi
     medida e o contrario do que este arquivo existe para fazer. */
  const semHoje: NoiteCurta[] = [
    { data: '2026-08-30', minutos: 4 * 60, qualidade: null },
    { data: '2026-08-29', minutos: 4 * 60, qualidade: null },
    { data: '2026-08-28', minutos: 4 * 60, qualidade: null },
  ]
  const f = prontidaoDeHoje(semHoje, HOJE).frase ?? ''
  ok('nao manda diminuir carga', !f.includes('carga'))
  ok('nao manda aquecer', !f.toLowerCase().includes('aquecimento'))
  ok('e nao cobra o registro', !f.toLowerCase().includes('anote'))
}

{
  /* Com menos de tres noites, "media" e palavra grande demais para o que se
     sabe -- e o app volta a ficar calado, que e o certo. */
  const duas: NoiteCurta[] = [
    { data: '2026-08-30', minutos: 7 * 60, qualidade: null },
    { data: '2026-08-29', minutos: 7 * 60, qualidade: null },
  ]
  ok('duas noites ainda deixam o app calado', prontidaoDeHoje(duas, HOJE).frase === null)
}

{
  /* A noite de HOJE continua vencendo a media: quem anotou tem a medida, e
     medida nao perde para media. */
  const comHoje: NoiteCurta[] = [
    { data: HOJE, minutos: 4 * 60, qualidade: null },
    { data: '2026-08-30', minutos: 8 * 60, qualidade: null },
    { data: '2026-08-30', minutos: 8 * 60, qualidade: null },
    { data: '2026-08-29', minutos: 8 * 60, qualidade: null },
  ]
  const p = prontidaoDeHoje(comHoje, HOJE)
  ok('a noite de hoje vence a media', p.nivel === 'baixa')
  ok('e o numero e o de hoje', p.minutos === 4 * 60)
}

console.log('\nA media nao depende da ordem em que a lista chega')

{
  /* `carregarNoites` devolve da mais recente para a mais antiga, e o `slice`
     dependia disso SEM DIZER. Na ordem contraria, "as ultimas sete" viravam as
     sete PRIMEIRAS -- e o numero sairia plausivel. */
  const oito: NoiteCurta[] = Array.from({ length: 8 }, (_, i) => ({
    data: `2026-08-${String(24 + i).padStart(2, '0')}`,
    /* As antigas com 4h, as recentes com 8h. */
    minutos: i < 4 ? 4 * 60 : 8 * 60,
    qualidade: null,
  }))
  const antigaPrimeiro = [...oito]
  const recentePrimeiro = [...oito].reverse()
  ok(
    'a ordem nao muda a media',
    mediaDeSono(antigaPrimeiro) === mediaDeSono(recentePrimeiro),
    `${mediaDeSono(antigaPrimeiro)} vs ${mediaDeSono(recentePrimeiro)}`,
  )
  ok(
    'e a media e das SETE mais recentes',
    mediaDeSono(antigaPrimeiro) === Math.round((4 * 60 * 3 + 8 * 60 * 4) / 7),
    String(mediaDeSono(antigaPrimeiro)),
  )
}

{
  const comDataTorta: NoiteCurta[] = [
    { data: 'ontem', minutos: 8 * 60, qualidade: null },
    { data: '2026-02-31', minutos: 8 * 60, qualidade: null },
    { data: '2026-08-31', minutos: 7 * 60, qualidade: null },
    { data: '2026-08-30', minutos: 7 * 60, qualidade: null },
    { data: '2026-08-29', minutos: 7 * 60, qualidade: null },
  ]
  ok('data torta nao entra na media', mediaDeSono(comDataTorta) === 7 * 60)
  ok('e nao estoura', mediaDeSono(null as unknown as NoiteCurta[]) === null)
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
