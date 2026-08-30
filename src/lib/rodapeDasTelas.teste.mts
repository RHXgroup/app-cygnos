import { readFileSync, readdirSync } from 'node:fs'

/* Toda tela em SOBREPOSIÇÃO tem que cuidar do próprio rodapé.
 *
 * ── Por que este teste existe ──────────────────────────────────────────────
 * A conversa nasceu como aba. Ali quem cuidava do rodapé era a barra de abas,
 * logo abaixo dela. Quando ela virou sobreposição de tela cheia, passou a
 * cobrir a barra de abas — e ninguém assumiu o rodapé. O campo de escrever foi
 * parar por baixo da barra de gestos do Android, onde o toque não chega, e a
 * pessoa não conseguiu responder a primeira mensagem que recebeu.
 *
 * Já tinha acontecido antes, em oito telas de uma vez. Foi corrigido à mão, uma
 * por uma, e voltou assim que UMA tela mudou de moldura. Conserto que depende
 * de alguém lembrar volta.
 *
 * ── Por que é um teste de TEXTO, e não de renderização ─────────────────────
 * O defeito é de área segura, e área segura vale zero em qualquer lugar que não
 * seja um aparelho de verdade: no navegador, num renderizador de teste, num
 * emulador sem barra de gestos. Um teste que MONTA a tela passaria com o defeito
 * no lugar — seria pior do que nenhum, porque daria confiança falsa.
 *
 * O que dá para afirmar sem aparelho é que a tela PEDIU a medida e USOU. É
 * pouco, e é exatamente o que faltava nas nove vezes em que isto quebrou. */

const APP = readFileSync('App.tsx', 'utf8')

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

console.log('\nrodapé das telas em sobreposição\n')

/* Quem é sobreposição: o que aparece dentro de <Sobreposta> no App. A lista sai
   do código, e não daqui — tela nova entra no teste sozinha, que é o ponto. */
const sobrepostas = [
  ...new Set(
    [...APP.matchAll(/<Sobreposta>([\s\S]*?)<\/Sobreposta>/g)].flatMap(m =>
      [...m[1].matchAll(/<([A-Z][A-Za-z]*Screen)\b/g)].map(t => t[1]),
    ),
  ),
].sort()

ok('achei as telas em sobreposição no App.tsx', sobrepostas.length > 0, String(sobrepostas.length))

const arquivos = new Set(readdirSync('src/screens'))

for (const tela of sobrepostas) {
  const arquivo = `${tela}.tsx`
  if (!arquivos.has(arquivo)) {
    ok(`${tela}: arquivo encontrado`, false, `src/screens/${arquivo} não existe`)
    continue
  }

  const fonte = readFileSync(`src/screens/${arquivo}`, 'utf8')

  /* Duas coisas, e as duas precisam estar: pedir a medida e gastá-la. Só pedir
     é o que o editor não reclama e o aparelho reclama. */
  const pediu = /useSafeAreaInsets\(\)/.test(fonte) && /\bbottom\b/.test(fonte)
  const usou =
    /paddingBottom:\s*[^,\n}]*\bbottom\b/.test(fonte) ||
    /paddingBottom:\s*[^,\n}]*\brespiro\b/.test(fonte) ||
    /marginBottom:\s*[^,\n}]*\bbottom\b/.test(fonte) ||
    /\bbottom\b\s*[+)]/.test(fonte)

  ok(`${tela} pede a área segura de baixo`, pediu, 'falta `const { bottom } = useSafeAreaInsets()`')
  ok(
    `${tela} usa a área segura de baixo`,
    !pediu || usou,
    'pede `bottom` e não gasta em paddingBottom — o editor não reclama, o aparelho reclama',
  )
}

/* A medida do teclado mora num lugar só.
 *
 * Ela já foi copiada uma vez e a cópia é o começo da divergência: no dia em que
 * uma das duas for corrigida, a outra continua errada e ninguém sabe por qual a
 * tela passa. Ver a armadilha 5 do AGENTS.md. */
{
  const donos = readdirSync('src/screens')
    .filter(a => a.endsWith('.tsx'))
    .filter(a => /function useAlturaTeclado/.test(readFileSync(`src/screens/${a}`, 'utf8')))

  ok(
    'a medida do teclado não foi copiada para dentro de uma tela',
    donos.length === 0,
    donos.join(', ') + ' — a versão boa mora em lib/teclado.ts',
  )
}

console.log(`\n${passou} ok, ${falhou} falha(s)\n`)
if (falhou > 0) process.exit(1)
