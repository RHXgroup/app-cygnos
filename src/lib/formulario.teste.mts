import { mascaraQuantidade, normalizarUsername, numeroDigitado, validarUsername } from './formulario.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { passou++; console.log('  ok   ' + nome) }
  else { falhou++; console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : '')) }
}

const q = (v: string) => numeroDigitado(mascaraQuantidade(v))

// ── O caso que motivou: teclado com PONTO ────────────────────────────────────
/* decimal-pad em celular configurado em inglês, ou teclado de fábrica, mostra
   ponto. O filtro antigo o jogava fora e "1.5" virava 15 -- dez vezes a porção. */
ok('"1.5" com ponto é 1,5', q('1.5') === 1.5, String(q('1.5')))
ok('"1,5" com vírgula continua 1,5', q('1,5') === 1.5, String(q('1,5')))
ok('e aparece com vírgula no campo', mascaraQuantidade('1.5') === '1,5', mascaraQuantidade('1.5'))

// ── O que já funcionava continua ─────────────────────────────────────────────
ok('inteiro simples', q('150') === 150)
ok('vazio é zero', q('') === 0)
ok('letra some', mascaraQuantidade('1a5') === '15')
ok('uma casa decimal só', mascaraQuantidade('1,55') === '1,5', mascaraQuantidade('1,55'))
ok('dois separadores viram um', mascaraQuantidade('1.5.3') === '1,5', mascaraQuantidade('1.5.3'))
ok('quatro dígitos no inteiro', mascaraQuantidade('12345') === '1234')

// ── O nome de usuário: "Mm" e o acento que sumia ─────────────────────────────
ok('maiúscula vira minúscula, uma vez só', normalizarUsername('Maria') === 'maria', normalizarUsername('Maria'))
ok('acento vira letra, e não some', normalizarUsername('joão') === 'joao', normalizarUsername('joão'))
ok('ç vira c', normalizarUsername('Conceição') === 'conceicao', normalizarUsername('Conceição'))
ok('espaço sai', normalizarUsername('maria silva') === 'mariasilva', normalizarUsername('maria silva'))
ok('ponto e underline ficam', normalizarUsername('Maria.Silva_2') === 'maria.silva_2', normalizarUsername('Maria.Silva_2'))
ok('símbolo sai', normalizarUsername('maria@silva!') === 'mariasilva', normalizarUsername('maria@silva!'))
ok('limite de 20', normalizarUsername('abcdefghijklmnopqrstuvwxyz').length === 20)
ok('vazio não quebra', normalizarUsername('') === '')
ok('o normalizado passa na validação', validarUsername(normalizarUsername('João.Silva')) === null)

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
