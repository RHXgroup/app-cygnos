import { retornoDoRegistro } from './retornoDoRegistro.ts'

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

const r = (
  adicionadas: number | null,
  totalDoDia: number | null,
  meta: number | null,
  quantos = 1,
) => retornoDoRegistro({ adicionadas, totalDoDia, meta, quantos })

// ── 1. O caso comum ──────────────────────────────────────────────────────────
{
  console.log('\n1. registrou e ainda falta')

  const x = r(320, 1360, 2000)
  ok('mostra o que entrou', x.texto.includes('+320 kcal'), x.texto)
  ok('mostra o que falta', x.texto.includes('faltam 640 kcal'), x.texto)
  ok('não marca como fechado', x.fechou === false)
}

// ── 2. Fechou a meta ─────────────────────────────────────────────────────────
{
  console.log('\n2. bateu a meta')

  const exato = r(200, 2000, 2000)
  ok('meta cravada é completa', exato.texto.includes('meta do dia completa'), exato.texto)
  ok('e marca fechado', exato.fechou === true)

  /* Meio por cento de folga: faltando 8 de 2.000, ninguém quer ler
     "faltam 8 kcal". */
  const quase = r(200, 1992, 2000)
  ok('quase cravada também é completa', quase.texto.includes('completa'), quase.texto)

  const naFronteira = r(200, 1980, 2000)
  ok('20 kcal ainda é "faltam"', naFronteira.texto.includes('faltam 20'), naFronteira.texto)
}

// ── 3. Passou da meta: informa, não repreende ────────────────────────────────
{
  console.log('\n3. passou da meta')

  const x = r(500, 2400, 2000)
  ok('diz o total contra a meta', x.texto.includes('2.400 de 2.000 kcal'), x.texto)
  ok('marca fechado', x.fechou === true)
  ok('NÃO usa palavra de bronca', !/excede|passou|acima|ultrapass/i.test(x.texto), x.texto)
  ok('não mostra falta negativa', !x.texto.includes('-'), x.texto)
}

// ── 4. Sem meta definida ─────────────────────────────────────────────────────
{
  console.log('\n4. quem não definiu meta')

  const x = r(320, 1360, null)
  ok('mostra o que entrou', x.texto.includes('+320 kcal'), x.texto)
  ok('mostra o total do dia', x.texto.includes('1.360 kcal hoje'), x.texto)
  ok('não inventa "faltam"', !x.texto.includes('faltam'), x.texto)

  const zerada = r(320, 1360, 0)
  ok('meta zero também não vira falta', !zerada.texto.includes('faltam'), zerada.texto)
}

// ── 5. Alimento sem caloria conhecida ────────────────────────────────────────
{
  console.log('\n5. o que não soma')

  const um = r(null, 1360, 2000)
  ok('não escreve "+0 kcal"', !um.texto.includes('+0'), um.texto)
  ok('diz que registrou', um.texto.includes('Item registrado'), um.texto)
  ok('e ainda diz o que falta', um.texto.includes('faltam 640'), um.texto)

  const varios = r(null, 1360, 2000, 3)
  ok('no plural conta quantos', varios.texto.includes('3 itens registrados'), varios.texto)

  const zero = r(0, 1360, 2000)
  ok('zero cru também não vira "+0"', !zero.texto.includes('+0'), zero.texto)
}

// ── 6. O primeiro item do dia ────────────────────────────────────────────────
{
  console.log('\n6. primeiro registro do dia')

  const x = r(450, 450, 2000)
  ok('conta o que falta desde o começo', x.texto.includes('faltam 1.550'), x.texto)

  const semNada = r(null, null, null)
  ok('sem nada, ainda assim confirma', semNada.texto === 'Item registrado', semNada.texto)
}

// ── 7. Separador de milhar em português ──────────────────────────────────────
{
  console.log('\n7. como o número é escrito')

  const x = r(1200, 1200, 3000)
  ok('usa ponto e não vírgula', x.texto.includes('1.200'), x.texto)
  ok('e no que falta também', x.texto.includes('1.800'), x.texto)
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
