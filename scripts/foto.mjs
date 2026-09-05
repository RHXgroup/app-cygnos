/* Confere que NENHUM caminho de foto monta a imagem em texto no pior instante.
 *
 * ── O defeito que ele existe para impedir ─────────────────────────────────
 * `manipulateAsync(uriDaCamera, [resize], { base64: true })` mantém três coisas
 * vivas ao mesmo tempo: o BITMAP da foto original (uma câmera de celular dá
 * dezenas de megabytes), o JPEG reduzido, e a string base64, que é 33% maior
 * que o arquivo. E isso acontece no instante em que a câmera do sistema devolve
 * o controle, quando a memória já está no fim.
 *
 * O Android mata o processo, e o sintoma NÃO se parece com a causa: o app
 * "volta do começo", a conversa aparece vazia, o áudio não sobe, a foto não é
 * lida. Foi relatado como quatro defeitos diferentes.
 *
 * ── Por que um script, e não um teste comum ──────────────────────────────
 * Isto não dá para exercitar em Node: a alocação é nativa, e o arquivo que
 * contém o defeito importa o Expo inteiro. Mas é 100% VISÍVEL no texto do
 * código — e essa é exatamente a classe de defeito que uma varredura pega e um
 * teste não.
 *
 * ── E ele existe porque custou uma semana ────────────────────────────────
 * São quatro cópias do mesmo código — prato, ficha de treino, conversa e foto
 * de perfil. Cada relato consertava UMA, porque eu consertava o que tinha sido
 * relatado sem procurar os irmãos. Quatro rodadas, uma semana.
 *
 * As duas regras abaixo teriam pegado as quatro de uma vez.
 *
 * Rode com: node scripts/foto.mjs        (ou npm run foto) */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PASTA = 'src/lib'
const arquivos = readdirSync(PASTA)
  .filter(f => f.endsWith('.ts') && !f.includes('.teste.'))
  .map(f => join(PASTA, f))

const problemas = []

for (const caminho of arquivos) {
  const fonte = readFileSync(caminho, 'utf8')
  if (!fonte.includes('manipulateAsync')) continue

  const nome = caminho.replace(/\\/g, '/').replace('src/lib/', '')
  const linhas = fonte.split(/\r?\n/)

  for (let i = 0; i < linhas.length; i++) {
    if (!/manipulateAsync\(/.test(linhas[i])) continue

    /* A chamada inteira, até o parêntese que fecha. Seis linhas cobrem o
       formato usado no projeto e sobra folga. */
    const chamada = linhas.slice(i, i + 7).join('\n')
    const cortada = chamada.slice(0, chamada.indexOf(')\n') + 1 || chamada.length)

    const pedeTexto = /base64:\s*true/.test(cortada)
    if (!pedeTexto) continue

    /* REGRA 1 — pedir texto e redimensionar na MESMA chamada é o defeito.
       Quem redimensiona está lendo o arquivo grande; quem pede texto o
       transforma em string. Juntos, no mesmo instante, matam o app. */
    if (/resize/.test(cortada)) {
      problemas.push({
        arquivo: nome,
        linha: i + 1,
        regra: 'texto e redimensionamento na MESMA chamada',
      })
      continue
    }

    /* REGRA 2 — o passo do texto tem de ler o arquivo JÁ REDUZIDO.
       Ler `escolha.assets[0].uri` ali recarrega o bitmap original inteiro —
       o segundo passo, que existe para não ter o bitmap vivo, traz ele de
       volta. Este foi o defeito que nenhum relato teria achado: metade dos
       caminhos lia do reduzido e metade não. */
    if (/assets\s*\[\s*0\s*\]\s*\.uri/.test(cortada)) {
      problemas.push({
        arquivo: nome,
        linha: i + 1,
        regra: 'o passo do texto lê a foto ORIGINAL da câmera',
      })
    }
  }

  /* REGRA 3 — ler arquivo com `fetch().blob()` num caminho de FOTO.
     O próprio Expo avisa, na tela, que o Blob do React Native "copia a
     resposta e lê de volta ATRAVÉS DE BASE64". É a mesma alocação gigante com
     outro nome, e foi por aí que o defeito voltou depois de corrigido.
     Áudio é outra coisa: o arquivo é pequeno e não há bitmap de câmera vivo. */
  const ehFoto = /Image(Picker|Manipulator)|manipulateAsync/.test(fonte)
  const ehAudio = /audio|voz|gravador/i.test(nome)
  if (ehFoto && !ehAudio) {
    /* Comentário NÃO conta, e reconhecer isso não é detalhe: este arquivo
       explica o defeito em prosa, citando `.blob()` de propósito para o
       próximo leitor entender por que a porta foi fechada. Um detector que
       acusa a própria explicação ensina a ignorar o detector.

       Fora da string, um `*` no começo da linha ou o texto entre crases só
       existem em comentário — código de verdade escreve `await fetch(`. */
    let dentroDeComentario = false
    linhas.forEach((l, i) => {
      const cru = l.trim()
      if (cru.includes('/*')) dentroDeComentario = true
      const eraComentario = dentroDeComentario || cru.startsWith('*') || cru.startsWith('//')
      if (cru.includes('*/')) dentroDeComentario = false
      if (eraComentario) return

      if (/await\s*\(?\s*await\s+fetch\(|\.blob\(\)/.test(l)) {
        problemas.push({ arquivo: nome, linha: i + 1, regra: 'lê arquivo de foto com fetch/blob' })
      }
    })
  }
}

console.log('')
if (problemas.length === 0) {
  console.log('  Os caminhos de foto estão certos:')
  console.log('    · nenhum monta o texto junto do redimensionamento')
  console.log('    · o passo do texto sempre lê o arquivo já reduzido')
  console.log('    · nenhum lê foto com fetch/blob')
  console.log('')
  process.exit(0)
}

console.log(`  ${problemas.length} problema(s):\n`)
for (const p of problemas) {
  console.log(`  ${p.arquivo}:${p.linha}`)
  console.log(`     ${p.regra}\n`)
}
console.log('  Isto reinicia o app ao voltar da câmera, e o sintoma não se parece')
console.log('  com a causa: a tela volta ao começo e tudo o mais parece quebrado.\n')
process.exit(1)
