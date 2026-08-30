/* Roda todos os `src/lib/*.teste.mts` e falha se algum falhar.
 *
 * Existe porque a alternativa é uma linha na documentação listando quais testes
 * existem — e essa linha envelhece. Aqui quem responde é o disco.
 *
 * `--experimental-strip-types` porque os arquivos são TypeScript e o Node os
 * executa sem compilar. Eles ficam FORA do `tsc` de propósito (ver `exclude` no
 * tsconfig): o Node exige a extensão `.ts` no import e o `tsc` a recusa sem
 * `allowImportingTsExtensions`. Quem confere esses arquivos é esta execução. */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PASTA = 'src/lib'
const arquivos = readdirSync(PASTA)
  .filter(a => a.endsWith('.teste.mts'))
  .sort()

if (arquivos.length === 0) {
  console.error('Nenhum .teste.mts encontrado em ' + PASTA)
  process.exit(1)
}

const falharam = []

for (const arquivo of arquivos) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', `${PASTA}/${arquivo}`],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) falharam.push(arquivo)
}

console.log(`\n${arquivos.length} arquivo(s) de teste, ${falharam.length} com falha`)
if (falharam.length > 0) {
  console.log(falharam.map(a => '  ' + a).join('\n'))
  process.exit(1)
}
