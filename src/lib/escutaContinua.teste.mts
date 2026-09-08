import {
  ESTADO_INICIAL,
  PISO_MINIMO,
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
  /* O teto e CALIBRACAO, e este caso existe para ele nao ser mexido de
     graca -- e nao para provar que 2800 e o numero certo, que nenhum teste
     sabe.

     Ele foi 12, virou 6, virou 4 e agora e 2,8, sempre pelo mesmo motivo: no
     ambiente de quem usa TODO trecho fecha no teto, porque o nivel nunca fica
     abaixo do limiar por 700 ms seguidos. Entao o teto nao e o caso raro que
     ele foi desenhado para ser -- ele e a espera de cada comando.

     A fronteira de baixo e 2,4 s, MEDIDA por bissecao contra os outros casos
     deste arquivo -- 2000 reprova tres, 2200 reprova dois, 2400 passa: "Cygnos, terminei a serie"
     dito devagar da perto de 1,8 s. Abaixo disso o corte cai DENTRO da frase,
     e o sintoma deixa de ser lentidao e passa a ser comando que some.

     A fronteira de cima: quem recebe descarta acima de COMANDO_LONGO_DEMAIS_S
     (7 s, em ModoTreino). Acima disso o teto so produz trecho jogado fora. */
  ok(
    'o teto cabe num comando falado devagar',
    MAXIMO_DO_TRECHO_MS >= 2_400 && MAXIMO_DO_TRECHO_MS <= 5_000,
    String(MAXIMO_DO_TRECHO_MS),
  )
  ok(
    'e o silencio e o minimo de fala continuam onde estavam',
    SILENCIO_QUE_FECHA_MS === 700 && MINIMO_DE_FALA_MS === 350,
    SILENCIO_QUE_FECHA_MS + '/' + MINIMO_DE_FALA_MS,
  )
}

// -- 4b. O PISO AFUNDADO se conserta sozinho ---------------------------------
//
// Fotografado no aparelho, na tela de treino: "-12 dB - limiar -84". Setenta e
// dois decibeis de folga, ou seja TUDO contava como fala. A escuta nunca via
// silencio, nunca fechava trecho, e a unica saida era o teto -- que era
// descartado por duracao. Nada nunca era enviado, e a tela ficava eternamente
// "gravando". Relatado como "so fica assim e nunca inicia".
//
// A adaptacao normal nao resgata isso: ela sobe 0,5% por leitura, e sair de -96
// para perto de -12 levaria centenas de leituras, todas dentro de um trecho que
// nunca fecha.
{
  console.log('\n4b. piso afundado')
  let e = { falando: false, comecouEm: null, silencioDesde: null, ambiente: -96 }
  let tetos = 0
  let viuSilencio = false
  for (let i = 0; i < 400; i++) {
    const r = ouvir(e, -12, i * 100)
    e = r.estado
    if (r.decisao === 'cortar_no_teto') tetos++
    // "Silencio" aqui e o detector parando de achar que ha fala continua.
    if (tetos > 0 && !e.falando && limiarDe(e.ambiente) >= -12) viuSilencio = true
  }
  ok('o piso subiu', e.ambiente > -60, String(e.ambiente.toFixed(1)))
  ok('e o limiar passou do nivel constante', limiarDe(e.ambiente) >= -12, String(limiarDe(e.ambiente).toFixed(1)))
  ok('em poucos tetos, e nao em centenas', tetos <= 5, String(tetos) + ' tetos')
  ok('a escuta voltou a enxergar silencio', viuSilencio)
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

  /* E uma frase de tamanho REAL nao cega: tres segundos, que ja e uma frase
     longa dita de uma vez.

     Antes este caso usava DOZE segundos, e passava. Ele deixou de passar quando
     o teto virou recalibragem -- e a mudanca esta certa: doze segundos de som
     CONSTANTE no mesmo nivel nao sao fala. Fala tem intervalo entre frases; som
     continuo por tanto tempo e televisao, maquina, ou medidor quebrado. Nesse
     caso subir o piso e o comportamento desejado, e e ele que conserta o piso
     afundado do caso 4b.

     O que continua tendo de valer e isto: uma frase de verdade nao pode cegar o
     detector. */
  let e2 = ESTADO_INICIAL
  for (let i = 0; i < 30; i++) e2 = ouvir(e2, NIVEL_DE_FALA, i * 100).estado
  ok(
    'nem tres segundos falando',
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

// -- 9. A SEQUENCIA REAL DO APARELHO ---------------------------------------
//
// Estes numeros sao do log do treino, copiados como sairam. Antes do piso
// minimo, a leitura de -160 derrubava o limiar de -89 para -124 num passo, e a
// escuta nunca mais via silencio -- nada era enviado, e a tela ficava
// eternamente "gravando".
{
  console.log('\n9. a sequencia do aparelho')

  const doLog = [-38.8, -13.6, -26.5, -28.5, -33.2, -160.0, -8.7, -30.4, -13.7]
  let e = ESTADO_INICIAL
  let viuSilencio = false
  doLog.forEach((n, i) => {
    const r = ouvir(e, n, i * 100)
    e = r.estado
    // O -160 e silencio de verdade, e tem de ser lido como tal.
    if (n === -160 && !r.estado.falando) viuSilencio = true
    if (n === -160 && limiarDe(e.ambiente) > n) viuSilencio = true
  })

  ok('o piso nao desce abaixo de -65', e.ambiente >= PISO_MINIMO, String(e.ambiente.toFixed(1)))
  ok(
    'o limiar fica acima do silencio de -160',
    limiarDe(e.ambiente) > -160,
    String(limiarDe(e.ambiente).toFixed(1)),
  )
  ok('e abaixo da fala de -30', limiarDe(e.ambiente) < -30, String(limiarDe(e.ambiente).toFixed(1)))
  ok('o -160 conta como silencio', viuSilencio)
}

/* -- 10. SILENCIO DE VERDADE FECHA O TRECHO ------------------------------- */
{
  console.log('\n10. o silencio fecha')
  // Fala por 1,5 s e depois o medidor devolve o sentinela de silencio. O trecho
  // tem de FECHAR -- e e o fechamento que manda o comando para o servidor.
  const leituras: [number, number][] = []
  for (let i = 0; i < 15; i++) leituras.push([-20, 100])
  for (let i = 0; i < 12; i++) leituras.push([-160, 100])
  const { decisoes } = correr(leituras)
  ok('fecha por silencio, e nao pelo teto', decisoes.includes('terminou'), decisoes.join(','))
  ok('nao chegou a bater no teto', !decisoes.includes('cortar_no_teto'))
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
