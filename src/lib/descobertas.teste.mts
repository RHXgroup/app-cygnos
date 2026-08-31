/* As descobertas: o que os dados dela dizem, e o que eles NAO sustentam.
 *
 * A maior parte destes casos verifica o SILENCIO -- quando o app nao pode
 * falar. Uma descoberta errada custa mais do que dez descobertas ausentes,
 * porque ela e lida como fato sobre o corpo da pessoa.
 *
 * Rode com: node --experimental-strip-types src/lib/descobertas.teste.mts */

import { descobertas } from './descobertas.ts'

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
const VAZIO = { noites: [], dias: [], pesos: [], comecosDeCiclo: [] }

console.log('\n1. sono curto x comida do dia')

{
  /* 5 noites curtas com 2500 kcal, 5 normais com 2000. Diferenca de 500. */
  const noites = [
    ...[1, 2, 3, 4, 5].map(n => ({ data: dia(n), minutos: 5 * 60 })),
    ...[6, 7, 8, 9, 10].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [
    ...[1, 2, 3, 4, 5].map(n => ({ data: dia(n), calorias: 2500 })),
    ...[6, 7, 8, 9, 10].map(n => ({ data: dia(n), calorias: 2000 })),
  ]
  const d = descobertas({ ...VAZIO, noites, dias })
  ok('achou a descoberta', d.length === 1, JSON.stringify(d))
  ok('e e a do sono', d[0]?.chave === 'sono_calorias')
  ok('com a diferenca certa', d[0]?.texto.includes('500 kcal'), d[0]?.texto)
  ok('e diz quantos dias sustentam', d[0]?.base === 10, String(d[0]?.base))
  ok('e diz o tamanho de cada grupo', d[0]?.texto.includes('5 dias'), d[0]?.texto)
}

{
  /* Menos de 4 num dos lados: cala. Um aniversario nao pode virar conclusao. */
  const noites = [
    ...[1, 2, 3].map(n => ({ data: dia(n), minutos: 5 * 60 })),
    ...[6, 7, 8, 9, 10].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [
    ...[1, 2, 3].map(n => ({ data: dia(n), calorias: 3000 })),
    ...[6, 7, 8, 9, 10].map(n => ({ data: dia(n), calorias: 2000 })),
  ]
  ok('tres noites curtas nao bastam', descobertas({ ...VAZIO, noites, dias }).length === 0)
}

{
  /* Diferenca de 100 kcal: existe na planilha, nao existe na vida. */
  const noites = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), minutos: 5 * 60 })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), calorias: 2100 })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), calorias: 2000 })),
  ]
  ok('diferenca de 100 kcal e ruido, e o app cala',
    descobertas({ ...VAZIO, noites, dias }).length === 0)
}

{
  /* A diferenca ao contrario tambem e dita -- o app nao so confirma o esperado.
     Se ela come MENOS quando dorme mal, e isso que aparece. */
  const noites = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), minutos: 5 * 60 })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), calorias: 1500 })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), calorias: 2200 })),
  ]
  const d = descobertas({ ...VAZIO, noites, dias })
  ok('a diferenca ao contrario tambem sai', d.length === 1)
  ok('e diz "a menos"', d[0]?.texto.includes('a menos'), d[0]?.texto)
  ok('sem numero negativo na frase', !d[0]?.texto.includes('-'), d[0]?.texto)
}

{
  /* Dia sem registro chega como 0. Zero NAO e "nao comeu": e "nao anotou".
     Entrando na media, puxaria o grupo para baixo e inverteria a conclusao. */
  const noites = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), minutos: 5 * 60 })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), calorias: 2400 })),
    ...[6, 7].map(n => ({ data: dia(n), calorias: 2000 })),
    ...[8, 9].map(n => ({ data: dia(n), calorias: 0 })),
  ]
  /* So 2 dias validos no grupo normal -> cala, em vez de comparar com zeros. */
  ok('zero nao entra na media (cala em vez de mentir)',
    descobertas({ ...VAZIO, noites, dias }).length === 0)
}

{
  const noites = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), minutos: null })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [1, 2, 3, 4, 6, 7, 8, 9].map(n => ({ data: dia(n), calorias: 2000 }))
  ok('noite sem minutos e ignorada', descobertas({ ...VAZIO, noites, dias }).length === 0)
}

console.log('\n2. o peso dentro do ciclo')

{
  /* Um ciclo de 01 a 28, com 5 pesagens variando 1,4 kg. */
  const pesos = [
    { data: dia(2), kg: 70.0 },
    { data: dia(8), kg: 70.5 },
    { data: dia(14), kg: 71.4 },
    { data: dia(20), kg: 70.8 },
    { data: dia(26), kg: 70.2 },
  ]
  const d = descobertas({ ...VAZIO, pesos, comecosDeCiclo: [dia(1), dia(28)] })
  ok('achou a oscilacao', d.length === 1, JSON.stringify(d))
  ok('e a do peso no ciclo', d[0]?.chave === 'peso_no_ciclo')
  ok('com o numero em virgula, como se escreve aqui', d[0]?.texto.includes('1,4 kg'), d[0]?.texto)
  ok('diz quantas pesagens', d[0]?.texto.includes('5 pesagens'), d[0]?.texto)
  /* A metade que serve para alguma coisa: dizer que NAO e gordura. */
  ok('e diz que boa parte e agua, nao gordura',
    d[0]?.texto.includes('água') && d[0]?.texto.includes('não gordura'), d[0]?.texto)
}

{
  /* Oscilacao de 300 g e a balanca, nao o ciclo. */
  const pesos = [
    { data: dia(2), kg: 70.0 },
    { data: dia(8), kg: 70.1 },
    { data: dia(14), kg: 70.3 },
    { data: dia(20), kg: 70.2 },
  ]
  ok('300 g e a balanca, e o app cala',
    descobertas({ ...VAZIO, pesos, comecosDeCiclo: [dia(1), dia(28)] }).length === 0)
}

{
  /* Um comeco so nao delimita ciclo nenhum. */
  const pesos = [2, 8, 14, 20].map(n => ({ data: dia(n), kg: 70 + n / 10 }))
  ok('um comeco so nao basta',
    descobertas({ ...VAZIO, pesos, comecosDeCiclo: [dia(1)] }).length === 0)
  ok('nenhum comeco tambem nao',
    descobertas({ ...VAZIO, pesos, comecosDeCiclo: [] }).length === 0)
}

{
  /* Pesagens FORA do ciclo nao entram: o intervalo e o que delimita.
     Aqui a variacao grande esta toda depois do dia 28. */
  const pesos = [
    { data: dia(2), kg: 70.0 },
    { data: dia(4), kg: 70.1 },
    { data: dia(6), kg: 70.0 },
    { data: dia(8), kg: 70.1 },
    { data: dia(29), kg: 75.0 },
    { data: dia(30), kg: 68.0 },
  ]
  ok('pesagem fora do ciclo nao conta',
    descobertas({ ...VAZIO, pesos, comecosDeCiclo: [dia(1), dia(28)] }).length === 0)
}

console.log('\n3. o silencio e o caso comum')

{
  ok('tudo vazio nao inventa nada', descobertas(VAZIO).length === 0)
  ok('campos ausentes nao estouram',
    descobertas({} as Parameters<typeof descobertas>[0]).length === 0)
}

{
  /* Numeros que nao sao numeros. NaN atravessa media e Math.max em silencio. */
  const noites = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), minutos: NaN })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [1, 2, 3, 4, 6, 7, 8, 9].map(n => ({ data: dia(n), calorias: 2000 }))
  const pesos = [2, 4, 6, 8].map(n => ({ data: dia(n), kg: Infinity }))
  const d = descobertas({ noites, dias, pesos, comecosDeCiclo: [dia(1), dia(28)] })
  ok('NaN e Infinity nao viram descoberta', d.length === 0, JSON.stringify(d))
}

console.log('\n4. o que NENHUMA frase pode dizer')

{
  /* Monta os dois casos que produzem frase e passa as duas por um crivo. */
  const noites = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), minutos: 5 * 60 })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), minutos: 8 * 60 })),
  ]
  const dias = [
    ...[1, 2, 3, 4].map(n => ({ data: dia(n), calorias: 2600 })),
    ...[6, 7, 8, 9].map(n => ({ data: dia(n), calorias: 2000 })),
  ]
  const pesos = [
    { data: dia(2), kg: 70.0 },
    { data: dia(8), kg: 70.5 },
    { data: dia(14), kg: 71.4 },
    { data: dia(20), kg: 70.8 },
  ]
  const d = descobertas({ noites, dias, pesos, comecosDeCiclo: [dia(1), dia(28)] })
  ok('as duas descobertas saem juntas', d.length === 2, JSON.stringify(d.map(x => x.chave)))
  /* Mais base primeiro. */
  ok('a de mais base vem antes', d[0].base >= d[1].base, `${d[0].base} vs ${d[1].base}`)

  /* CAUSA: o app leu dois numeros do mesmo dia e nao sabe qual empurrou qual. */
  const causa = ['porque', 'por causa', 'faz voce', 'faz você', 'provoca', 'causa ']
  /* DIAGNOSTICO: quem diz isso e a nutricionista, com a ficha na frente. */
  const laudo = ['voce tem', 'você tem', 'sindrome', 'síndrome', 'disturbio',
    'distúrbio', 'deficiencia', 'deficiência', 'compulsao', 'compulsão']
  /* CULPA: a frase existe para explicar, nao para cobrar. */
  const culpa = ['voce deveria', 'você deveria', 'precisa parar', 'errado',
    'ruim', 'culpa', 'exagerou']

  for (const x of d) {
    const t = x.texto.toLowerCase()
    for (const [rotulo, lista] of [['causa', causa], ['laudo', laudo], ['culpa', culpa]] as const) {
      const achou = lista.find(p => t.includes(p))
      if (achou) {
        falharam++
        console.log(`  FALHA ${x.chave} tem ${rotulo} ("${achou}"): ${x.texto}`)
      }
    }
  }
  ok('nenhuma frase afirma causa, laudo ou culpa', true)

  /* E toda frase diz o tamanho da base em algum lugar do texto -- e isso que
     separa medida de horoscopo. */
  ok('as duas dizem em quantos dados se apoiam',
    d.every(x => /\d/.test(x.texto) && x.base >= 4), JSON.stringify(d.map(x => x.base)))
}

console.log('\n5. emagrecendo com proteina baixa')

{
  /* Perdeu 3 kg, comendo 70 g de proteina para 67 kg -> 1,04 g/kg. Abaixo de
     1,2. */
  const pesos = [
    { data: dia(1), kg: 70 },
    { data: dia(10), kg: 69 },
    { data: dia(20), kg: 68 },
    { data: dia(28), kg: 67 },
  ]
  const dias = Array.from({ length: 10 }, (_, i) => ({
    data: dia(i + 1), calorias: 1600, proteinas: 70,
  }))
  const d = descobertas({ ...VAZIO, pesos, dias })
  ok('achou', d.length === 1, JSON.stringify(d.map(x => x.chave)))
  ok('e a da proteina', d[0]?.chave === 'proteina_no_deficit')
  ok('diz quanto perdeu', d[0]?.texto.includes('3,0 kg'), d[0]?.texto)
  ok('e quanto come por quilo', d[0]?.texto.includes('1,0 g por quilo'), d[0]?.texto)
  ok('diz em quantos dias', d[0]?.texto.includes('10 dias'), d[0]?.texto)
  /* Aponta para a nutricionista: e o unico lugar do app em que uma descoberta
     manda falar com alguem, e e porque aqui ha o que fazer a respeito. */
  ok('aponta para a nutricionista', d[0]?.texto.includes('nutricionista'), d[0]?.texto)
}

{
  /* Proteina em ordem: 1,5 g/kg para 67 kg = 100 g. O app cala. */
  const pesos = [
    { data: dia(1), kg: 70 }, { data: dia(10), kg: 69 },
    { data: dia(20), kg: 68 }, { data: dia(28), kg: 67 },
  ]
  const dias = Array.from({ length: 10 }, (_, i) => ({
    data: dia(i + 1), calorias: 1600, proteinas: 100,
  }))
  ok('proteina em ordem, o app cala', descobertas({ ...VAZIO, pesos, dias }).length === 0)
}

{
  /* NAO esta emagrecendo: mantem o peso. Quem mantem nao esta no risco que a
     frase descreve, e receber o aviso mesmo assim faria desconfiar das outras. */
  const pesos = [
    { data: dia(1), kg: 70 }, { data: dia(10), kg: 70.2 },
    { data: dia(20), kg: 69.9 }, { data: dia(28), kg: 70.1 },
  ]
  const dias = Array.from({ length: 10 }, (_, i) => ({
    data: dia(i + 1), calorias: 1600, proteinas: 50,
  }))
  ok('sem perda de peso, nao avisa', descobertas({ ...VAZIO, pesos, dias }).length === 0)
}

{
  /* Perdeu 600 g. E balanca, nao emagrecimento. */
  const pesos = [
    { data: dia(1), kg: 70 }, { data: dia(10), kg: 69.8 },
    { data: dia(20), kg: 69.6 }, { data: dia(28), kg: 69.4 },
  ]
  const dias = Array.from({ length: 10 }, (_, i) => ({
    data: dia(i + 1), calorias: 1600, proteinas: 50,
  }))
  ok('perda de 600 g e ruido de balanca', descobertas({ ...VAZIO, pesos, dias }).length === 0)
}

{
  /* GANHOU peso. Nao pode virar "voce perdeu -2 kg". */
  const pesos = [
    { data: dia(1), kg: 67 }, { data: dia(10), kg: 68 },
    { data: dia(20), kg: 69 }, { data: dia(28), kg: 70 },
  ]
  const dias = Array.from({ length: 10 }, (_, i) => ({
    data: dia(i + 1), calorias: 2600, proteinas: 50,
  }))
  ok('ganho de peso nao vira perda negativa',
    descobertas({ ...VAZIO, pesos, dias }).length === 0)
}

{
  /* Poucos dias de proteina registrada: 4 nao bastam (o piso e 8). */
  const pesos = [
    { data: dia(1), kg: 70 }, { data: dia(10), kg: 69 },
    { data: dia(20), kg: 68 }, { data: dia(28), kg: 67 },
  ]
  const dias = Array.from({ length: 4 }, (_, i) => ({
    data: dia(i + 1), calorias: 1600, proteinas: 50,
  }))
  ok('4 dias de proteina nao bastam', descobertas({ ...VAZIO, pesos, dias }).length === 0)
}

{
  /* Dia sem proteina anotada e ignorado, e nao conta como zero -- zero puxaria
     a media para baixo e faria o aviso disparar em quem come bem. */
  const pesos = [
    { data: dia(1), kg: 70 }, { data: dia(10), kg: 69 },
    { data: dia(20), kg: 68 }, { data: dia(28), kg: 67 },
  ]
  const dias = [
    ...Array.from({ length: 8 }, (_, i) => ({
      data: dia(i + 1), calorias: 1600, proteinas: 110,
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      data: dia(i + 10), calorias: 1600, proteinas: null,
    })),
  ]
  ok('dia sem proteina anotada nao conta como zero',
    descobertas({ ...VAZIO, pesos, dias }).length === 0)
}

{
  /* NaN e Infinity nao viram media. */
  const pesos = [
    { data: dia(1), kg: 70 }, { data: dia(10), kg: 69 },
    { data: dia(20), kg: 68 }, { data: dia(28), kg: 67 },
  ]
  const dias = Array.from({ length: 10 }, (_, i) => ({
    data: dia(i + 1), calorias: 1600, proteinas: i === 0 ? NaN : Infinity,
  }))
  const d = descobertas({ ...VAZIO, pesos, dias })
  ok('NaN e Infinity na proteina nao viram descoberta', d.length === 0, JSON.stringify(d))
}

console.log('\n6. a frase da proteina nao diagnostica')

{
  const pesos = [
    { data: dia(1), kg: 70 }, { data: dia(10), kg: 69 },
    { data: dia(20), kg: 68 }, { data: dia(28), kg: 67 },
  ]
  const dias = Array.from({ length: 10 }, (_, i) => ({
    data: dia(i + 1), calorias: 1600, proteinas: 70,
  }))
  const t = descobertas({ ...VAZIO, pesos, dias })[0].texto.toLowerCase()

  /* Esta descoberta soma um FATO GERAL de nutricao aos numeros dela, e por isso
     tem um crivo proprio. O app nao mediu massa magra e NAO PODE dizer que ela
     perdeu musculo -- so que quem emagrece assim COSTUMA perder. */
  const afirmacoes = [
    'voce perdeu musculo', 'você perdeu músculo',
    'voce esta perdendo musculo', 'você está perdendo músculo',
    'sua massa magra', 'voce tem', 'você tem',
  ]
  const achou = afirmacoes.find(a => t.includes(a))
  ok('nao afirma que ELA perdeu musculo', achou === undefined, achou ?? '')
  /* O fato geral aparece como geral. */
  ok('o fato geral aparece como geral', t.includes('costuma'), t)
  /* E nao manda ela consertar sozinha: manda mostrar para quem pode olhar. */
  ok('encaminha em vez de prescrever',
    t.includes('nutricionista') && !t.includes('coma mais') && !t.includes('aumente'), t)
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
