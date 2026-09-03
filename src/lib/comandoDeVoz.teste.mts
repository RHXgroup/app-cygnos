import {
  comandoDoTexto,
  naoEntendi,
  RESPOSTA,
  semChamado,
  temChamado,
  type Comando,
} from './comandoDeVoz.ts'

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

// ── 6. A PALAVRA-CHAVE ──────────────────────────────────────────────────────
//
// Ela nao economiza chamada -- para saber que foi dita e preciso transcrever
// antes. O que ela evita e AGIR por engano: num modo maos-livres dentro de uma
// academia o microfone ouve a conversa alheia inteira, e "terminei" dito por
// outra pessoa contaria uma serie que nao aconteceu.
{
  console.log('\n6. chamado')
  const ditos = [
    'Cygnos, terminei',
    'cygnos terminei',
    // o Whisper vai errar o nome, e errar assim:
    'signos terminei',
    'Cisnes, terminei',
    'cignus, terminei',
    'sygnos terminei',
  ]
  for (const d of ditos) {
    ok(`"${d}" tem chamado`, temChamado(d), 'nao reconheceu')
    ok(`"${d}" -> fiz`, comandoDoTexto(semChamado(d)) === 'fiz', String(comandoDoTexto(semChamado(d))))
  }

  // conversa alheia nao tem chamado, e por isso nao age
  for (const d of ['terminei', 'ja acabei essa serie', 'pausa ai mano']) {
    ok(`"${d}" sem chamado`, !temChamado(d))
  }

  // o chamado sozinho nao e comando
  ok('so o nome nao faz nada', comandoDoTexto(semChamado('cygnos')) === null)
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
