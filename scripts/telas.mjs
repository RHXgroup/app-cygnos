/* Varre TODAS as telas contra as armadilhas do AGENTS.md.
 *
 * Não substitui abrir o app: nada aqui vê pixel, e uma tela pode passar em
 * tudo isto e estar feia ou quebrada. O que ele pega é a classe de defeito que
 * já custou uma rodada de "o usuário testou, quebrou, achamos a causa" — e que
 * é invisível lendo o arquivo de cima a baixo, porque mora na AUSÊNCIA de uma
 * linha.
 *
 * Rode com: node scripts/telas.mjs
 *
 * Cada achado é uma PERGUNTA, não uma reprovação. Há exceções legítimas em
 * quase todos os itens, e é por isso que ele imprime o arquivo e a linha em vez
 * de sair com erro. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PASTAS = ['src/screens', 'src/components']

const arquivos = []
for (const p of PASTAS) {
  for (const f of readdirSync(p)) {
    if (f.endsWith('.tsx')) arquivos.push(join(p, f))
  }
}

const achados = []
const nota = (item, arquivo, linha, texto) => achados.push({ item, arquivo, linha, texto })

for (const caminho of arquivos) {
  const fonte = readFileSync(caminho, 'utf8')
  const linhas = fonte.split(/\r?\n/)
  const nome = caminho.replace(/\\/g, '/').replace('src/', '')

  /* ── 1. Sobreposição sem voltar (armadilha 1) ────────────────────────────
     Uma tela que abre algo POR CIMA de si precisa do próprio BackHandler,
     senão o voltar do Android descasca a camada errada — ou fecha o app. O
     sinal de que há camada é uma sobreposição absoluta ou um Modal. */
  const temCamada =
    /absoluteFill|position: 'absolute'[\s\S]{0,400}(zIndex|Sobreposta)|<Modal/.test(fonte)
  const temVoltar = /BackHandler/.test(fonte)
  if (temCamada && !temVoltar) {
    nota(1, nome, null, 'tem camada por cima e nenhum BackHandler')
  }

  /* ── 2. Teclado (armadilha 2) ────────────────────────────────────────────
     `behavior="height"` no Android depende de a janela encolher, e no Expo Go
     ela não encolhe. Só o desvio medido funciona nos dois. */
  linhas.forEach((l, i) => {
    if (/behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/.test(l)) {
      if (!/useDesvioDoTeclado/.test(fonte)) {
        nota(2, nome, i + 1, 'KeyboardAvoidingView com "height" e sem o desvio medido')
      }
    }
  })

  /* ── 3. Campo numérico e o separador de milhar (armadilha 3) ─────────────
     Teclado com separador num campo que descarta separador: quem digita
     "10.000" grava 10. */
  linhas.forEach((l, i) => {
    if (/keyboardType="(decimal-pad|numeric)"/.test(l)) {
      const volta = linhas.slice(Math.max(0, i - 14), i + 14).join('\n')
      if (/\[\^0-9\]/.test(volta)) {
        nota(3, nome, i + 1, 'teclado com separador num campo que filtra só dígitos')
      }
    }
  })

  /* ── 7. Imagem remota sem onError (armadilha 7) ──────────────────────────
     Sem ele, a imagem que falha não desenha nada e sobra um buraco do tamanho
     dela — que se lê como app quebrado. */
  linhas.forEach((l, i) => {
    if (/source=\{\{\s*uri:/.test(l)) {
      const volta = linhas.slice(Math.max(0, i - 8), i + 10).join('\n')
      if (!/onError/.test(volta)) {
        nota(7, nome, i + 1, 'Image remota sem onError')
      }
    }
  })

  /* ── 8. Dado do sistema sem releitura ao voltar (armadilha 8) ────────────
     Vínculo, consulta e plano mudam do lado da nutricionista e nada avisa o
     aparelho. Sem AppState, só fechando e abrindo o app. */
  const leDoSistema = /app_meu_vinculo|carregarMensagens|app_recado|consultas|solicitacao/i.test(
    fonte,
  )
  if (leDoSistema && !/AppState/.test(fonte)) {
    nota(8, nome, null, 'mostra dado do sistema e não relê ao voltar do segundo plano')
  }

  /* ── 9. Erro que não se limpa no sucesso (armadilha 9) ───────────────────
     Enquanto a tela carregava uma vez só era inofensivo. Relendo sozinha, o
     conteúdo fica escondido atrás de uma mensagem vencida. */
  if (/setErro\(/.test(fonte) && /AppState/.test(fonte)) {
    const limpa = /setErro\(''\)|setErro\(null\)/.test(fonte)
    if (!limpa) nota(9, nome, null, 'relê sozinha e nunca limpa o erro anterior')
  }

  /* ── 10. Valor do banco indexando um Record (armadilha 10) ───────────────
     Devolve undefined para qualquer palavra fora das conhecidas, e a linha
     seguinte lê `.titulo` dele — a tela morre por um valor novo numa coluna. */
  linhas.forEach((l, i) => {
    const m = l.match(/\b([A-Z_]{4,})\[\s*(\w+\.)?(status|tipo|origem|estado)\b/)
    if (m && !/\?\?/.test(l)) {
      nota(10, nome, i + 1, `${m[1]}[...] cru, sem valor de reserva`)
    }
  })
}

/* ── A saída ───────────────────────────────────────────────────────────── */
const TITULOS = {
  1: 'Camada sem o voltar do Android',
  2: 'Teclado que não desvia no Android',
  3: 'Campo numérico com teclado de separador',
  7: 'Imagem remota sem tratamento de falha',
  8: 'Dado do sistema sem releitura',
  9: 'Erro que não se limpa no sucesso',
  10: 'Valor do banco indexando Record cru',
}

console.log(`\n  ${arquivos.length} telas e componentes varridos.\n`)

if (achados.length === 0) {
  console.log('  Nada a perguntar.\n')
} else {
  for (const item of Object.keys(TITULOS).map(Number)) {
    const meus = achados.filter(a => a.item === item)
    if (meus.length === 0) continue
    console.log(`  ── ${item}. ${TITULOS[item]}  (${meus.length})`)
    for (const a of meus) {
      console.log(`     ${a.arquivo}${a.linha ? ':' + a.linha : ''}  ${a.texto}`)
    }
    console.log('')
  }
}

console.log('  Achado aqui é PERGUNTA, não reprovação: quase todos os itens têm')
console.log('  exceção legítima. O que ele encontra é a AUSÊNCIA de uma linha, que')
console.log('  é o tipo de defeito invisível lendo o arquivo de cima a baixo.\n')
