/* O que existe no src/lib e ninguém chama.
 *
 * ── Por que isto vale um script ────────────────────────────────────────────
 * "O objeto existe" e "o caminho passa por ele" são duas conferências, e a
 * segunda é a que pega defeito. Já custou duas vezes num dia só neste projeto:
 * um canal de notificação criado e nunca usado no `trigger`, e uma busca por
 * refeição no plano que nunca casava. Nos dois casos o código rodava, nada
 * falhava, e a coisa simplesmente não acontecia.
 *
 * Órfão não é erro por si. Muitos são legítimos:
 *   - função nova esperando a tela que vai usá-la
 *   - export só para o arquivo de teste
 *   - constante de configuração lida por reflexão
 *
 * Por isso a saída é uma LISTA PARA OLHAR, e não uma reprovação. O que ele
 * responde é "isto aqui alguém chama?", que é a pergunta que ninguém faz.
 *
 * ── E ele já nasceu errado uma vez ─────────────────────────────────────────
 * A primeira versão foi escrita por heredoc no shell, que comeu a barra
 * invertida: `'\\b'` virou `'\b'`, um caractere de backspace, e o regex parou de
 * casar com qualquer coisa. Resultado: acusou TODOS os 400 exportados, incluindo
 * `supabase` e `paleta`, que o app inteiro usa.
 *
 * Rodou com sucesso e não conferiu nada — exatamente o defeito que ele existe
 * para caçar. Por isso ele agora confere a si mesmo antes de confiar no que
 * achou: se `supabase` aparecer como órfão, o quebrado é o script. */

import fs from 'node:fs'
import path from 'node:path'

function varrer(dir, saco = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) varrer(p, saco)
    else if (/\.tsx?$/.test(e.name) && !/\.teste\./.test(e.name)) saco.push(p)
  }
  return saco
}

/* A raiz entra junto, e não é detalhe: `App.tsx` mora fora do `src/` e é o
   maior consumidor de lib do projeto — é ele que registra o ouvinte do botão de
   água, o do tema, e monta as quatro abas.
 *
 * A primeira versão varria só `src/` e por isso acusou `ouvirBotaoDeAgua` e
 * `escutarTema` de órfãos. Foi o SEGUNDO defeito seguido nesta ferramenta, os
 * dois no mesmo sentido: conferir de menos e parecer que conferiu. */
const naRaiz = fs
  .readdirSync('.', { withFileTypes: true })
  .filter(e => e.isFile() && /\.tsx?$/.test(e.name) && !/\.teste\./.test(e.name))
  .map(e => e.name)

const arquivos = [...varrer('src'), ...naRaiz]
const fonte = new Map(arquivos.map(f => [f, fs.readFileSync(f, 'utf8')]))

/* Fronteira de identificador de verdade: `$` e `_` contam como letra, senão
   `metas` casaria dentro de `carregarMetas`. */
const usadoEm = (nome, texto) =>
  new RegExp('(^|[^A-Za-z0-9_$])' + nome + '($|[^A-Za-z0-9_$])').test(texto)

function orfaos() {
  const achados = []
  for (const [arq, txt] of fonte) {
    if (!arq.includes(`${path.sep}lib${path.sep}`)) continue

    const nomes = [...txt.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)/gm)].map(
      m => m[1] || m[2],
    )

    for (const nome of nomes) {
      let usos = 0
      for (const [outro, t] of fonte) {
        if (outro === arq) continue
        if (usadoEm(nome, t)) usos++
      }
      if (usos === 0) achados.push({ arq: arq.split(path.sep).join('/'), nome })
    }
  }
  return achados
}

const achados = orfaos()

/* ── A conferência do próprio script ──────────────────────────────────────
 * Três nomes que o app inteiro usa. Se algum deles aparecer na lista, o regex
 * quebrou e a lista não vale nada. */
const IMPOSSIVEIS = ['supabase', 'paleta', 'estilosDe']
const falsos = achados.filter(a => IMPOSSIVEIS.includes(a.nome))

if (falsos.length > 0) {
  console.error('\nO SCRIPT ESTÁ QUEBRADO, e não o código.\n')
  console.error(`  ${falsos.map(f => f.nome).join(', ')} aparece(m) como órfão(s),`)
  console.error('  e o app inteiro usa. A lista abaixo não valeria nada.\n')
  process.exit(1)
}

/* Órfãos já examinados e explicados. Ficam de fora para a lista continuar
   pequena o bastante para alguém ler — uma lista longa não é lida, e aí ela
   deixa de proteger. Ao acrescentar um nome aqui, escreva o PORQUÊ. */
const EXPLICADOS = new Map([
  /* Exportados só para os .teste.mts, que ficam fora desta varredura porque
     testar é justamente onde uma função sem chamador ainda tem razão de ser. */
  [
    'mediaDeSono',
    'Chamada DENTRO de prontidaoDeHoje.ts, para a noite que a pessoa não ' +
      'anotou. Exportada porque o teste exercita a média separado da prontidão ' +
      '— são duas decisões, e uma delas depende da ordem em que a lista chega.',
  ],
])

const pendentes = achados.filter(a => !EXPLICADOS.has(a.nome))

console.log(`\n${arquivos.length} arquivos · ${achados.length} exportado(s) sem chamador\n`)

if (pendentes.length === 0) {
  console.log('  Nada sem chamador fora os já explicados.\n')
} else {
  let ultimo = ''
  for (const a of pendentes) {
    if (a.arq !== ultimo) {
      console.log(`  ${a.arq}`)
      ultimo = a.arq
    }
    console.log(`      ${a.nome}`)
  }
  console.log('\n  Órfão não é erro. É uma pergunta: quem devia chamar isto?\n')
}
