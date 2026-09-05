/* Carimba o pacote com o commit e a hora, para o aparelho DIZER o que está rodando.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * Rodadas inteiras foram gastas na mesma dúvida: "não mudou nada" quer dizer
 * que o conserto não funcionou, ou que o aparelho está rodando o pacote velho?
 * As duas produzem exatamente a mesma frase e exatamente a mesma foto de tela.
 *
 * E não é hipótese: o Expo Go, quando não alcança o servidor, NÃO avisa que
 * desistiu — ele abre o pacote guardado. O sintoma é um app que funciona
 * normalmente e ignora tudo o que foi consertado.
 *
 * Perguntar não resolve, porque a pergunta é sobre uma coisa que não aparece
 * na tela. Então ela passa a aparecer. É a armadilha 2 do AGENTS.md outra vez:
 * quando a segunda tentativa falhar, pare de trocar de mecanismo e imprima o
 * número na tela.
 *
 * ── Só em desenvolvimento ─────────────────────────────────────────────────
 * Quem desenha o carimbo está dentro de `__DEV__`, então ele não existe no
 * .aab. O arquivo gerado fica no git de propósito: sem ele o `tsc` não passa,
 * e um arquivo gerado que quebra a compilação de quem clona é pior do que um
 * arquivo com um valor velho.
 *
 * Rode com: node scripts/marca.mjs        (ou npm run marca) */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const git = c => {
  try {
    return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return '?'
  }
}

const commit = git('git rev-parse --short HEAD')
const sujo = git('git status --porcelain') ? '+' : ''

/* Hora local, e não ISO: quem lê é uma pessoa olhando o relógio do celular ao
   lado, comparando com o que acabou de ser dito no chat. */
const agora = new Date()
const dois = n => String(n).padStart(2, '0')
const hora = `${dois(agora.getHours())}:${dois(agora.getMinutes())}`

const conteudo = `/* GERADO por scripts/marca.mjs. Não edite à mão — a próxima marca sobrescreve.
 *
 * O carimbo que o app desenha em cima de tudo enquanto está em desenvolvimento,
 * para uma foto de tela dizer QUAL pacote está rodando. Ver o cabeçalho do
 * script para o motivo.
 *
 * ── O \`__DEV__\` aqui, e não só lá no App ──────────────────────────────────
 * Quem desenha o carimbo já está dentro de \`__DEV__\`, então ele NUNCA aparece
 * em produção. Só que isso tira o DESENHO, e não a constante: conferido num
 * pacote de produção de verdade (\`expo export\`), o texto do carimbo continuava
 * dentro do arquivo — morto e invisível, mas presente.
 *
 * Com o ternário, o minificador resolve \`__DEV__ ? 'abc' : ''\` para \`''\` e o
 * texto some do pacote. É pouca coisa em bytes; o que vale é a promessa ficar
 * verdadeira. Um "não vai para produção" que é quase verdade é o tipo de frase
 * que ninguém confere de novo. */
export const MARCA_DO_PACOTE = __DEV__ ? '${commit}${sujo} ${hora}' : ''
`

writeFileSync('src/lib/marcaDoPacote.ts', conteudo, 'utf8')
console.log(`\n  carimbo: ${commit}${sujo} ${hora}\n`)
