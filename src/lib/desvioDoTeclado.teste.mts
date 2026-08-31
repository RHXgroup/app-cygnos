import { desvioDoTeclado } from './desvioDoTeclado.ts'

/* O ramo que nunca rodou.
 *
 * No Expo Go a janela não encolhe, e este app só rodou no Expo Go. Todo o
 * tratamento de encolhimento foi escrito para o primeiro build e ia estrear em
 * produção — na mão de quem baixou da Play.
 *
 * Aqui ele roda antes, com os números que foram MEDIDOS no aparelho, numa foto
 * da tela: teclado 306, área segura 48, e faltavam exatamente 48. */

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

/* Os números do aparelho onde isto foi medido. */
const TECLADO = 306
const SEGURA = 48
const TELA = 2154

console.log('\ndesvioDoTeclado\n')

/* ── Teclado fechado ───────────────────────────────────────────────────────*/
{
  const r = desvioDoTeclado({ areaSegura: SEGURA, alturaTeclado: 0, alturaSemTeclado: TELA, alturaAgora: TELA })
  ok('sem teclado, sobra respeitar a barra de baixo', r === SEGURA, String(r))

  const semBarra = desvioDoTeclado({ areaSegura: 0, alturaTeclado: 0, alturaSemTeclado: TELA, alturaAgora: TELA })
  ok('sem teclado e sem barra, zero', semBarra === 0, String(semBarra))
}

/* ── Expo Go: a janela NÃO encolhe ─────────────────────────────────────────
 *
 * É onde o app roda hoje. A altura de agora é igual à de antes, então não há
 * prova de encolhimento e a conta é a soma. */
{
  const r = desvioDoTeclado({
    areaSegura: SEGURA,
    alturaTeclado: TECLADO,
    alturaSemTeclado: TELA,
    alturaAgora: TELA,
  })
  ok('janela inteira: teclado + área segura', r === TECLADO + SEGURA, String(r))
  ok('e isso é 354, o número que a foto mostrou faltando', r === 354, String(r))
}

/* ── Build: a janela encolhe ───────────────────────────────────────────────
 *
 * `adjustResize` tira o teclado da frente sozinho. Somar de novo empurraria o
 * campo para o meio da tela — o defeito da primeira das seis tentativas. */
{
  const r = desvioDoTeclado({
    areaSegura: SEGURA,
    alturaTeclado: TECLADO,
    alturaSemTeclado: TELA,
    alturaAgora: TELA - TECLADO,
  })
  ok('janela encolhida: não soma nada', r === 0, String(r))

  /* Encolhida do teclado MAIS a barra — o outro jeito de o Android fazer. */
  const comBarra = desvioDoTeclado({
    areaSegura: SEGURA,
    alturaTeclado: TECLADO,
    alturaSemTeclado: TELA,
    alturaAgora: TELA - TECLADO - SEGURA,
  })
  ok('encolhida do teclado mais a barra: também não soma', comBarra === 0, String(comBarra))
}

/* ── A folga, e por que ela existe ─────────────────────────────────────────
 *
 * Uma variação de poucos pixels não é encolhimento. Se fosse lida como tal, o
 * desvio seria desligado e o campo sumiria atrás do teclado — o defeito que
 * este arquivo existe para evitar, e o pior dos dois. */
{
  const arredondou = desvioDoTeclado({
    areaSegura: SEGURA,
    alturaTeclado: TECLADO,
    alturaSemTeclado: TELA,
    alturaAgora: TELA - 3,
  })
  ok('três pixels não são encolhimento', arredondou === TECLADO + SEGURA, String(arredondou))

  /* Uma barra que apareceu muda a altura em ~48, e continua não sendo. */
  const barraApareceu = desvioDoTeclado({
    areaSegura: SEGURA,
    alturaTeclado: TECLADO,
    alturaSemTeclado: TELA,
    alturaAgora: TELA - SEGURA,
  })
  ok('uma barra que apareceu não é encolhimento', barraApareceu === TECLADO + SEGURA, String(barraApareceu))

  /* Na borda: a folga é 40, então 306 - 40 = 266 é o limite. */
  const quase = desvioDoTeclado({
    areaSegura: SEGURA, alturaTeclado: TECLADO, alturaSemTeclado: TELA, alturaAgora: TELA - 266,
  })
  ok('exatamente no limite ainda soma', quase === TECLADO + SEGURA, String(quase))

  const passouDoLimite = desvioDoTeclado({
    areaSegura: SEGURA, alturaTeclado: TECLADO, alturaSemTeclado: TELA, alturaAgora: TELA - 267,
  })
  ok('um pixel além do limite já é encolhimento', passouDoLimite === 0, String(passouDoLimite))
}

/* ── Conservador quando não sabe ───────────────────────────────────────────
 *
 * Sem medida, ou antes da primeira, a resposta tem que ser a de sempre — que é
 * a que está em uso e testada no aparelho hoje. Uma tela que não mede não pode
 * mudar de comportamento por causa deste arquivo. */
{
  const semMedir = desvioDoTeclado({ areaSegura: SEGURA, alturaTeclado: TECLADO, alturaSemTeclado: 0 })
  ok('tela que não mede: comportamento de hoje', semMedir === TECLADO + SEGURA, String(semMedir))

  const antesDaPrimeira = desvioDoTeclado({
    areaSegura: SEGURA, alturaTeclado: TECLADO, alturaSemTeclado: 0, alturaAgora: TELA - TECLADO,
  })
  ok('antes da primeira medida, não conclui nada', antesDaPrimeira === TECLADO + SEGURA, String(antesDaPrimeira))

  const soReferencia = desvioDoTeclado({ areaSegura: SEGURA, alturaTeclado: TECLADO, alturaSemTeclado: TELA })
  ok('com referência mas sem altura de agora, idem', soReferencia === TECLADO + SEGURA, String(soReferencia))
}

/* ── A janela CRESCEU ──────────────────────────────────────────────────────
 *
 * Girar a tela, ou uma barra que sumiu. Diferença negativa nunca pode ser lida
 * como encolhimento. */
{
  const cresceu = desvioDoTeclado({
    areaSegura: SEGURA, alturaTeclado: TECLADO, alturaSemTeclado: TELA, alturaAgora: TELA + 200,
  })
  ok('janela que cresceu não é encolhimento', cresceu === TECLADO + SEGURA, String(cresceu))
}

/* ── Nada devolve número impossível ────────────────────────────────────────
 *
 * Um desvio negativo puxaria o painel para fora da tela por baixo, e um NaN
 * viraria um estilo inválido. */
{
  const casos = [
    { areaSegura: SEGURA, alturaTeclado: -10, alturaSemTeclado: TELA, alturaAgora: TELA },
    { areaSegura: 0, alturaTeclado: TECLADO, alturaSemTeclado: 0, alturaAgora: 0 },
    { areaSegura: SEGURA, alturaTeclado: 1, alturaSemTeclado: TELA, alturaAgora: TELA - 1 },
    { areaSegura: SEGURA, alturaTeclado: TECLADO, alturaSemTeclado: TELA, alturaAgora: 0 },
  ]
  const saidas = casos.map(desvioDoTeclado)
  ok('nunca negativo', saidas.every(v => v >= 0), saidas.join(', '))
  ok('nunca NaN', saidas.every(Number.isFinite), saidas.join(', '))
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
