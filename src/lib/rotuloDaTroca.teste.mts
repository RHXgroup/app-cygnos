/* A quantidade de uma troca, como ela aparece para quem vai servir o prato.
 *
 * Rode com: node --experimental-strip-types src/lib/rotuloDaTroca.teste.mts */

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

import { rotuloDaTroca } from './rotuloDaTroca.ts'

/* A medida caseira ganha: é o que a pessoa consegue servir sem balança -- a
   mesma ordem da página do link. */
ok('medida caseira manda', rotuloDaTroca({ quantidadeG: 269, medidaCaseira: '2 fatias' }) === '2 fatias')
ok('medida caseira com espaço sobrando', rotuloDaTroca({ quantidadeG: null, medidaCaseira: '  1 concha ' }) === '1 concha')
ok('sem caseira, vão as gramas', rotuloDaTroca({ quantidadeG: 269, medidaCaseira: null }) === '269 g')
ok('arredonda acima de 10', rotuloDaTroca({ quantidadeG: 268.5, medidaCaseira: '' }) === '269 g')
ok('uma casa abaixo de 10', rotuloDaTroca({ quantidadeG: 7.48, medidaCaseira: null }) === '7,5 g')
/* O banco devolve `numeric` como TEXTO no PostgREST. */
ok('texto do banco vira número', rotuloDaTroca({ quantidadeG: '150.00', medidaCaseira: null }) === '150 g')
ok('vírgula também', rotuloDaTroca({ quantidadeG: '7,5', medidaCaseira: null }) === '7,5 g')
/* Zero não é quantidade: escrever "0 g" no papel da paciente é pior do que não
   escrever nada. */
ok('zero não vira rótulo', rotuloDaTroca({ quantidadeG: 0, medidaCaseira: null }) === null)
ok('negativo não vira rótulo', rotuloDaTroca({ quantidadeG: -5, medidaCaseira: null }) === null)
ok('nada é nulo', rotuloDaTroca({ quantidadeG: null, medidaCaseira: null }) === null)
ok('lixo é nulo', rotuloDaTroca({ quantidadeG: 'abc', medidaCaseira: undefined }) === null)
ok('indefinido é nulo', rotuloDaTroca({ quantidadeG: undefined, medidaCaseira: null }) === null)

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
