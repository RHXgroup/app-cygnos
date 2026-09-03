import { lerRefeicao, lerItem, tirarFala, descricaoDe } from './interpretador.ts'

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

/* Os casos desta primeira seção são TRANSCRIÇÕES REAIS de um ditado que falhou:
   "na janta eu comi bastante carne de churrasco, arroz e mandioca, tomei
   cerveja". Cada um virava um item com o nome errado, e a busca não achava
   nada. */
{
  console.log('\n1. o que a pessoa fala, e não escreve')
  const casos: [string, string][] = [
    ['na janta comi carne', 'carne'],
    ['no almoço comi arroz', 'arroz'],
    ['eu comi bastante carne de churrasco', 'carne de churrasco'],
    ['tomei cerveja', 'cerveja'],
    ['bebi suco de laranja', 'suco de laranja'],
    ['então eu comi bastante arroz', 'arroz'],
    ['de manhã tomei café', 'café'],
    ['acho que comi um pouco de feijão', 'feijão'],
    ['hoje eu jantei mandioca', 'mandioca'],
    ["aí comi mais ou menos mamão", "mamão"],
  ]
  for (const [fala, esperado] of casos) {
    const r = tirarFala(fala)
    ok(`"${fala}" → "${esperado}"`, r === esperado, r)
  }
}

// ── 2. Não pode comer parte do alimento ──────────────────────────────────────
{
  console.log('\n2. o que NÃO pode ser descascado')
  const intactos = [
    'carne de sol',
    'bolo de pote',
    'doce de leite',
    'leite de coco',
    'pão de queijo',
    'arroz com feijão',
    'meia lua de queijo',
    'bombom de nozes',
  ]
  for (const nome of intactos) {
    ok(`"${nome}" fica inteiro`, tirarFala(nome) === nome, tirarFala(nome))
  }
}

// ── 3. Nunca devolve vazio ───────────────────────────────────────────────────
{
  console.log('\n3. descascar até o fim')
  /* "comi" sozinho não é comida, mas apagar o pedaço faria o item sumir sem
     aviso — e um item que some de um diário alimentar é pior que um item com
     nome torto, porque ninguém percebe a falta. */
  for (const so of ['comi', 'eu', 'bastante', 'de', 'na janta', 'tomei']) {
    ok(`"${so}" não vira vazio`, tirarFala(so).length > 0, JSON.stringify(tirarFala(so)))
  }
}

// ── 4. A frase inteira do ditado que falhou ──────────────────────────────────
{
  console.log('\n4. a frase que motivou tudo isto')
  const itens = lerRefeicao(
    'na janta eu comi bastante carne de churrasco, arroz, mandioca, tomei cerveja',
  )
  const nomes = itens.map(i => i.nome)
  ok('quatro itens', itens.length === 4, JSON.stringify(nomes))
  ok('carne de churrasco', nomes.includes('carne de churrasco'), JSON.stringify(nomes))
  ok('arroz', nomes.includes('arroz'), JSON.stringify(nomes))
  ok('mandioca', nomes.includes('mandioca'), JSON.stringify(nomes))
  ok('cerveja', nomes.includes('cerveja'), JSON.stringify(nomes))
  ok('nenhum item chamado "janta"', !nomes.some(n => /janta|almo|comi|tomei/.test(n)),
    JSON.stringify(nomes))
}

// ── 5. A quantidade continua funcionando ─────────────────────────────────────
{
  console.log('\n5. a gramática de sempre, intacta')
  const casos: [string, number, string, string][] = [
    ['200g de arroz', 200, 'g', 'arroz'],
    ['2 fatias de pão integral', 2, 'fatia', 'pão integral'],
    ['1 xícara de café', 1, 'xícara', 'café'],
    ['300 ml de leite', 300, 'ml', 'leite'],
    ['comi 200g de arroz', 200, 'g', 'arroz'],
    ['na janta comi 2 fatias de pão', 2, 'fatia', 'pão'],
  ]
  for (const [texto, q, m, n] of casos) {
    const i = lerItem(texto)
    ok(
      `"${texto}" → ${q} ${m} de ${n}`,
      i !== null && i.quantidade === q && i.medida === m && i.nome === n,
      JSON.stringify(i),
    )
  }
}

// ── 6. O ditado pontua, e a pontuação não pode entrar no nome ────────────────
{
  console.log('\n6. a pontuação do transcritor')
  for (const [texto, esperado] of [
    ['comi arroz.', 'arroz'],
    ['tomei um copo de iogurte.', 'iogurte'],
    ['na janta, comi feijão!', 'feijão'],
  ] as [string, string][]) {
    const i = lerItem(texto)
    ok(`"${texto}" → "${esperado}"`, i?.nome === esperado, JSON.stringify(i?.nome))
  }
}

// ── 7. Nada quebra com entrada estranha ──────────────────────────────────────
{
  console.log('\n7. entrada torta')
  for (const t of ['', '   ', '...', ',,,', '123', 'eu eu eu']) {
    let morreu = false
    try {
      lerRefeicao(t)
    } catch {
      morreu = true
    }
    ok(`${JSON.stringify(t)} não derruba`, !morreu)
  }
}

// ── 8. INTENÇÃO, e não só passado ────────────────────────────────────────────
//
// Metade do uso é ANTES de comer: quem planeja o jantar escreve "vou comer".
// A lista de fala só tinha passado, e o efeito era enganoso porque só METADE
// da frase falhava — "e tomar uma xícara de café" achava o café, enquanto
// "vou comer duas fatias de pão com manteiga" ia inteira para a busca.
{
  console.log('\n8. intenção')
  const casos: [string, string[]][] = [
    [
      'Vou comer duas fatias de pão com manteiga na chapa e tomar uma xícara de café',
      ['pão com manteiga na chapa', 'café'],
    ],
    ['vou tomar um copo de leite', ['leite']],
    ['quero comer 100g de arroz', ['arroz']],
    ['queria uma banana', ['banana']],
    ['pretendo comer frango grelhado', ['frango grelhado']],
    // O passado continua funcionando: a lista cresceu, não trocou.
    ['comi arroz e feijão', ['arroz', 'feijão']],
    // "vou" no MEIO do nome não pode ser tirado — só do começo.
    ['ovo mexido', ['ovo mexido']],
  ]
  for (const [texto, esperados] of casos) {
    const nomes = lerRefeicao(texto).map(i => i.nome)
    ok(
      `"${texto.slice(0, 40)}…" → ${esperados.length} item(ns)`,
      nomes.length === esperados.length && esperados.every((e, i) => nomes[i] === e),
      JSON.stringify(nomes),
    )
  }
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
