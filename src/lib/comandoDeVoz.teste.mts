import { comandoDoTexto, naoEntendi, RESPOSTA, type Comando } from './comandoDeVoz.ts'

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

// ── 1. O que a pessoa diz de verdade, no meio do treino ─────────────────────
//
// As frases vieram de como se fala com o telefone na academia: curtas, sem
// pontuação, e quase sempre com uma palavra a mais na frente.
{
  console.log('\n1. as frases')
  const casos: [string, Comando | null][] = [
    ['terminei', 'fiz'],
    ['Terminei!', 'fiz'],
    ['ok terminei essa aí', 'fiz'],
    ['acabei', 'fiz'],
    ['pronto', 'fiz'],
    ['fiz', 'fiz'],
    ['pausa', 'pausar'],
    ['pausa aí', 'pausar'],
    ['espera aí', 'pausar'],
    ['continua', 'continuar'],
    ['bora', 'continuar'],
    ['mais tempo', 'mais_descanso'],
    ['me dá mais um pouco', 'mais_descanso'],
    ['menos tempo', 'menos_descanso'],
    ['pula o descanso', 'pular_descanso'],
    ['já tô pronto', 'pular_descanso'],
    ['pode encerrar', 'terminar'],
    ['chega por hoje', 'terminar'],
  ]
  for (const [frase, esperado] of casos) {
    const r = comandoDoTexto(frase)
    ok(`"${frase}" → ${esperado}`, r === esperado, `veio ${r}`)
  }
}

// ── 2. A NEGAÇÃO cancela ────────────────────────────────────────────────────
//
// Este é o caso que custa caro: "ainda não terminei" carrega a palavra do
// comando e quer o contrário. Contar uma série que não aconteceu entra no
// histórico do treino, e ninguém confere depois.
{
  console.log('\n2. negação')
  for (const frase of [
    'ainda não terminei',
    'não terminei',
    'não pausa',
    'nem terminei',
    'não, deixa pra lá',
    'esquece',
  ]) {
    ok(`"${frase}" não faz nada`, comandoDoTexto(frase) === null, String(comandoDoTexto(frase)))
  }
}

// ── 3. Acento, caixa e pontuação não podem decidir ──────────────────────────
{
  console.log('\n3. escrita')
  for (const frase of ['JÁ TÔ PRONTO', 'ja to pronto', 'Já tô pronto!!!', '  já tô pronto  ']) {
    ok(`"${frase}" → pular_descanso`, comandoDoTexto(frase) === 'pular_descanso')
  }
}

// ── 4. Silêncio e ruído não viram comando ───────────────────────────────────
{
  console.log('\n4. nada')
  for (const frase of ['', '   ', '...', 'hmmm', 'aham', 'quanto é meia entrada']) {
    ok(`"${frase}" → nada`, comandoDoTexto(frase) === null, String(comandoDoTexto(frase)))
  }
}

// ── 5. Toda ação tem resposta escrita ───────────────────────────────────────
//
// Ação de voz sem confirmação na tela deixa a pessoa sem saber se a série foi
// contada. Se um comando novo entrar sem resposta, este caso quebra.
{
  console.log('\n5. resposta')
  const comandos: Comando[] = [
    'fiz',
    'pausar',
    'continuar',
    'mais_descanso',
    'menos_descanso',
    'pular_descanso',
    'terminar',
  ]
  for (const c of comandos) {
    ok(`${c} tem resposta`, typeof RESPOSTA[c] === 'string' && RESPOSTA[c].length > 0)
  }
  ok('não entendi repete o que ouviu', naoEntendi('banana').includes('banana'))
  ok('sem áudio tem frase própria', naoEntendi('  ') === 'Não ouvi nada.')
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
