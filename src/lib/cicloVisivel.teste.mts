/* A linha do ciclo menstrual aparece para quem?
 *
 * Rode com: node --experimental-strip-types src/lib/cicloVisivel.teste.mts */

import { mostraOCiclo } from './cicloVisivel.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, extra = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHOU ' + nome + (extra ? '  -> ' + extra : ''))
  }
}

const sem = (genero: string | null | undefined) => mostraOCiclo({ genero, temRegistro: false })
const com = (genero: string | null | undefined) => mostraOCiclo({ genero, temRegistro: true })

/* == O RELATO ========================================================== */
{
  // "eu sou homem no meu app e aparece o ciclo menstrual rs"
  ok('homem sem registro nenhum NAO ve', sem('masculino') === false)
  ok('mulher ve', sem('feminino') === true)
}

/* == NA DUVIDA, MOSTRA ================================================= */
{
  // Esconder por engano tira de alguem uma coisa que ela usa. O custo do
  // contrario e uma linha a mais numa lista.
  ok('outro ve', sem('outro') === true)
  ok('nulo ve', sem(null) === true)
  ok('indefinido ve', sem(undefined) === true)
  ok('vazio ve', sem('') === true)
  ok('so espaco ve', sem('   ') === true)
  // Palavra que o app nao conhece: pode vir do sistema dela amanha.
  ok('palavra desconhecida ve', sem('nao_binario') === true)
}

/* == QUEM JA REGISTROU NUNCA PERDE A PORTA ============================= */
{
  // O app nao esconde o caminho para um dado que a propria pessoa entrou.
  // Vale inclusive para quem se cadastrou como homem -- e e justamente esse
  // caso que a regra existe para proteger.
  ok('homem que ja registrou continua vendo', com('masculino') === true)
  ok('e mulher tambem, obviamente', com('feminino') === true)
  ok('e o gender nulo com registro', com(null) === true)
}

/* == A COMPARACAO NAO PODE SER FRAGIL ================================== */
{
  // O valor vem do banco, e um dia pode chegar com caixa ou espaco diferente.
  ok('MASCULINO em caixa alta tambem esconde', sem('MASCULINO') === false)
  ok('com espaco em volta tambem', sem(' masculino ') === false)
  // Mas nao pode esconder por prefixo: "masculinidade" nao e "masculino".
  ok('palavra que so comeca igual NAO esconde', sem('masculinidade') === true)
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
