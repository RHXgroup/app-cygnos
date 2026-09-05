/* Normaliza o RAIO dos botões do app inteiro.
 *
 * ── O que ele conserta ────────────────────────────────────────────────────
 * Medido antes de escrever: os estilos com nome começando em `botao` usavam
 * NOVE raios diferentes — 8, 9, 10, 11, 12, 13, 14, 16 e 20 — e vários deles
 * dentro do MESMO arquivo. `ContadorCaloriasScreen` tinha 12, 13 e 16;
 * `EditarPlanoScreen` tinha 8, 9 e 14.
 *
 * Ninguém olha um botão e pensa "esse raio é 13". Mas a tela inteira parece
 * montada por pessoas diferentes, e foi assim que ela foi descrita por quem
 * usa: "tudo fora de padrão, um grande outro pequeno".
 *
 * ── A escala, e por que só três ───────────────────────────────────────────
 * Raio acompanha TAMANHO: um botão alto com raio pequeno parece cortado, e um
 * botão baixo com raio grande vira pílula. Três degraus cobrem tudo que existe
 * aqui e são poucos o bastante para ninguém precisar escolher:
 *
 *    10  chip, pílula, seletor — coisas de uma linha de texto
 *    14  botão comum de ação
 *    18  botão principal, alto, o que fecha uma tela
 *
 * O 20 fica reservado ao CARTÃO, que já é o raio dos cartões da tela inicial.
 * Botão com raio de cartão se confunde com cartão.
 *
 * ── O que ele NÃO toca ────────────────────────────────────────────────────
 * Só estilos cujo nome começa com `botao`. Raio de cartão, de campo, de aviso
 * e de imagem fica como está — mexer neles é outra decisão, e uma que precisa
 * de olho e não de script.
 *
 * E não toca em botão CIRCULAR: quando o raio é metade da largura declarada no
 * mesmo bloco, ele é o que faz o círculo, e arredondar para a escala viraria
 * um quadrado de canto mole.
 *
 * Rode com: node scripts/raios.mjs        (mostra o que faria)
 *           node scripts/raios.mjs --agora (aplica)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APLICAR = process.argv.includes('--agora')

/* Os valores DOMINANTES ficam intocados: 14 e 16 sao os dois raios que a
   maioria dos botoes ja usa, e mexer neles seria mudanca visual em massa num
   app que ninguem consegue ver enquanto edita. A primeira versao deste script
   fazia isso -- transformava 31 botoes de 16 em 14 -- e teria sido churn com
   cara de padronizacao.

   O que ele conserta sao os ORFAOS: valores que aparecem uma ou duas vezes e
   nao combinam com nada. Sao eles que fazem dois botoes lado a lado terem
   cantos visivelmente diferentes.

   Acima de 20 nao mexe: ali e circulo ou pilula, e o numero E o desenho. */
const MANTER = new Set([14, 16, 18, 20])
const maisProximo = n => {
  if (n > 20 || MANTER.has(n)) return n
  return n <= 11 ? 10 : 14
}

const arquivos = []
for (const p of ['src/screens', 'src/components']) {
  for (const f of readdirSync(p)) if (f.endsWith('.tsx')) arquivos.push(join(p, f))
}

let mexidos = 0
const antes = new Map()
const depois = new Map()
const conta = (m, n) => m.set(n, (m.get(n) ?? 0) + 1)

for (const caminho of arquivos) {
  const original = readFileSync(caminho, 'utf8')
  const linhas = original.split(/\r?\n/)
  const fimDeLinha = original.includes('\r\n') ? '\r\n' : '\n'

  let dentroDeBotao = false
  let larguraDoBloco = null
  let alterou = false

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]

    /* Abre um bloco de estilo. `botao...: {` no começo da linha, com dois
       espaços de recuo — que é como todos os estilos deste projeto nascem. */
    const abre = l.match(/^\s{2}(botao[A-Za-z]*)\s*:\s*\{/)
    if (abre) {
      dentroDeBotao = true
      larguraDoBloco = null
      /* Bloco de uma linha só: a largura, se houver, está nela mesma. */
      const naMesma = l.match(/width:\s*(\d+)/)
      if (naMesma) larguraDoBloco = Number(naMesma[1])
    }

    if (dentroDeBotao) {
      const w = l.match(/^\s+width:\s*(\d+)/)
      if (w) larguraDoBloco = Number(w[1])

      const r = l.match(/^(\s+borderRadius:\s*)(\d+(?:\.\d+)?)(,?)\s*$/)
      if (r) {
        const valor = Number(r[2])
        conta(antes, valor)

        /* Círculo: o raio é metade da largura. Deixa como está. */
        const ehCirculo = larguraDoBloco !== null && Math.abs(valor * 2 - larguraDoBloco) < 1.5
        const novo = ehCirculo ? valor : maisProximo(valor)
        conta(depois, novo)

        if (novo !== valor) {
          linhas[i] = `${r[1]}${novo}${r[3]}`
          alterou = true
        }
      }

      if (/^\s{2}\},?\s*$/.test(l) || /\},\s*$/.test(l)) {
        if (/^\s{2}\},?\s*$/.test(l)) dentroDeBotao = false
      }
    }
  }

  if (alterou) {
    mexidos++
    if (APLICAR) writeFileSync(caminho, linhas.join(fimDeLinha), 'utf8')
  }
}

const emOrdem = m => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([r, n]) => `${r}(${n})`)

console.log('')
console.log('  raios ANTES :', emOrdem(antes).join('  '))
console.log('  raios DEPOIS:', emOrdem(depois).join('  '))
console.log('')
console.log(`  ${mexidos} arquivo(s) ${APLICAR ? 'alterados' : 'seriam alterados'}.`)
if (!APLICAR) console.log('  Rode com --agora para aplicar.')
console.log('')
