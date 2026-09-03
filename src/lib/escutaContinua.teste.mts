import {
  ESTADO_INICIAL,
  MAXIMO_DO_TRECHO_MS,
  MINIMO_DE_FALA_MS,
  SILENCIO_QUE_FECHA_MS,
  limiarDe,
  ouvir,
  type Decisao,
  type Estado,
} from './escutaContinua.ts'

let passou = 0
let falhou = 0
function ok(nome: string, cond: boolean, extra = '') {
  if (cond) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (extra ? '  ' + extra : ''))
  }
}

/* Roda uma sequência de leituras e devolve as decisões que saíram.
   Cada leitura é [nível em dB, quanto tempo passou desde a anterior]. */
function correr(leituras: [number | null, number][], inicial: Estado = ESTADO_INICIAL) {
  let e = inicial
  let t = 0
  const decisoes: Decisao[] = []
  for (const [nivel, dt] of leituras) {
    t += dt
    const r = ouvir(e, nivel, t)
    e = r.estado
    if (r.decisao !== 'nada') decisoes.push(r.decisao)
  }
  return { decisoes, estado: e }
}

// ── 1. Uma frase inteira ────────────────────────────────────────────────────
{
  console.log('\n1. uma frase')
  const { decisoes } = correr([
    // silêncio de academia
    [-50, 100], [-49, 100], [-51, 100],
    // fala
    [-20, 100], [-18, 100], [-22, 100], [-19, 100], [-21, 100],
    // silêncio depois
    [-50, 100], [-50, 200], [-50, 300], [-50, 300],
  ])
  ok('abre e fecha uma vez', decisoes.join(',') === 'comecou,terminou', decisoes.join(','))
}

// ── 2. Ruído curto NÃO vira chamada ─────────────────────────────────────────
//
// Peso batendo no chão, tosse, porta. Passa do limiar e some. Mandar isso para
// transcrever gasta chamada e devolve uma frase inventada que o app tentaria
// obedecer — que é o pior desfecho possível num modo mãos-livres.
{
  console.log('\n2. ruído curto')
  const { decisoes } = correr([
    [-50, 100], [-50, 100],
    [-15, 100], // uma leitura só de som: ~100 ms
    [-50, 100], [-50, 300], [-50, 400],
  ])
  ok(
    'ruído de 100 ms não fecha trecho',
    decisoes.filter(d => d === 'terminou').length === 0,
    decisoes.join(','),
  )
}

// ── 3. Pausa entre palavras não corta a frase ───────────────────────────────
{
  console.log('\n3. pausa curta')
  const { decisoes } = correr([
    [-50, 100],
    [-20, 100], [-20, 100], [-20, 100], [-20, 100],
    [-50, 200], // meio segundo de pausa: menos que SILENCIO_QUE_FECHA_MS
    [-20, 100], [-20, 100], [-20, 100],
    [-50, 300], [-50, 300], [-50, 300], [-50, 300],
  ])
  ok('não corta no meio', decisoes.join(',') === 'comecou,terminou', decisoes.join(','))
}

// ── 4. O TETO corta quem não para de falar ──────────────────────────────────
{
  console.log('\n4. teto')
  const leituras: [number, number][] = [[-50, 100]]
  for (let i = 0; i < 200; i++) leituras.push([-20, 100])
  const { decisoes } = correr(leituras)
  ok('corta no teto', decisoes.includes('cortar_no_teto'), decisoes.slice(0, 4).join(','))
  ok(
    'o teto é de 12 segundos',
    MAXIMO_DO_TRECHO_MS === 12_000 && SILENCIO_QUE_FECHA_MS === 700 && MINIMO_DE_FALA_MS === 350,
  )
}

// ── 5. O limiar SE ADAPTA ao lugar ──────────────────────────────────────────
//
// É o que faz o mesmo app funcionar na academia com música e no quarto em
// silêncio, sem ninguém configurar nada. Um número fixo funcionaria num dos
// dois e falharia no outro.
{
  console.log('\n5. ambiente')
  /* Um minuto de barulho constante: 600 leituras a cada 100 ms. Sobe devagar
     DE PROPÓSITO — a conta está no comentário da lib. */
  const barulho: [number, number][] = []
  for (let i = 0; i < 600; i++) barulho.push([-30, 100])
  const { estado } = correr(barulho)
  ok('aprendeu que o lugar é barulhento', estado.ambiente > -40, String(estado.ambiente))

  /* A PROPRIEDADE que importa não é "o ambiente não se move" — ele se move um
     pouco, de propósito, senão nunca aprende lugar barulhento. É que falar não
     pode CEGAR o detector: depois de uma frase inteira, o limiar ainda tem de
     estar abaixo do nível de fala, senão a frase seguinte não é ouvida.

     Escrevi o caso errado da primeira vez — assertei "menos de 1 dB", que é um
     número que eu inventei e não descreve nada. Vinte leituras a -15 movem 3,3
     dB, e isso está certo. O que estaria errado é o limiar passar de -15. */
  const NIVEL_DE_FALA = -15
  let e = ESTADO_INICIAL
  for (let i = 0; i < 20; i++) e = ouvir(e, NIVEL_DE_FALA, i * 100).estado
  ok(
    'falar não cega o detector',
    limiarDe(e.ambiente) < NIVEL_DE_FALA,
    `limiar ${limiarDe(e.ambiente).toFixed(1)} contra fala ${NIVEL_DE_FALA}`,
  )

  /* E nem uma frase LONGA cega — doze segundos, o teto de um trecho. */
  let e2 = ESTADO_INICIAL
  for (let i = 0; i < 120; i++) e2 = ouvir(e2, NIVEL_DE_FALA, i * 100).estado
  ok(
    'nem doze segundos falando',
    limiarDe(e2.ambiente) < NIVEL_DE_FALA,
    `limiar ${limiarDe(e2.ambiente).toFixed(1)}`,
  )
}

// ── 6. Leitura sem número não decide nada ───────────────────────────────────
//
// Nem todo aparelho entrega medição em toda leitura. Sem número, a leitura não
// pode abrir nem fechar — tratá-la como silêncio cortaria frases pela metade em
// quem tem o aparelho que mede devagar.
{
  console.log('\n6. leitura vazia')
  for (const v of [null, undefined, NaN]) {
    const r = ouvir({ ...ESTADO_INICIAL, falando: true, comecouEm: 0, silencioDesde: 0 }, v, 5000)
    ok(`${String(v)} não decide`, r.decisao === 'nada' && r.estado.falando === true)
  }
}

// ── 7. Nada quebra com entrada absurda ──────────────────────────────────────
{
  console.log('\n7. entrada torta')
  let morreu = false
  try {
    correr([[-Infinity, 100], [0, 100], [-160, 100], [999, 100], [null, 100]])
  } catch {
    morreu = true
  }
  ok('não derruba', !morreu)
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
