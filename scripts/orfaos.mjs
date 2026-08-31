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

/* ── O que a varredura enxerga, e por que é o projeto INTEIRO ─────────────
 *
 * Esta ferramenta já errou três vezes, sempre no mesmo sentido: conferir de
 * menos e parecer que conferiu. A segunda vez foi porque ela varria só `src/` e
 * o `App.tsx` mora na RAIZ — e é ele que registra o ouvinte do botão de água e
 * o do tema, então os dois saíram como órfãos.
 *
 * O remendo de então foi somar a raiz à mão. Isso conserta o caso e deixa a
 * FORMA de pé: no dia em que alguém criar uma pasta de código nova, ela nasce
 * invisível aqui, e o efeito é o mesmo — órfão falso, ou pior, um de verdade
 * escondido.
 *
 * Por isso a lista sai do projeto todo, e o que fica de fora é enumerado. Pasta
 * nova entra sozinha; pasta que não é código sai por nome, e o nome está aqui à
 * vista para quem precisar acrescentar. */
const FORA = new Set(['node_modules', '.git', '.expo', 'dist', 'build', 'android', 'ios', 'assets'])

function varrer(dir, saco = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (FORA.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) varrer(p, saco)
    else if (/\.tsx?$/.test(e.name) && !/\.teste\./.test(e.name)) saco.push(p)
  }
  return saco
}

const arquivos = varrer('.').map(f => f.replace(/^\.[\\/]/, ''))
const fonte = new Map(arquivos.map(f => [f, fs.readFileSync(f, 'utf8')]))

/* ── O CAMINHO do import não é uso ────────────────────────────────────────
 *
 * `PlanosScreen` é uma tela inteira que ninguém monta, e ela não aparecia aqui.
 * O motivo: `NovoPlanoScreen` faz
 *
 *     import type { Plano } from './PlanosScreen'
 *
 * e o nome do ARQUIVO casava com a fronteira de identificador — barra de um
 * lado, aspas do outro. Importar um tipo de dentro de um arquivo fazia o
 * componente daquele arquivo parecer montado.
 *
 * O terceiro defeito desta ferramenta no mesmo sentido dos dois primeiros:
 * conferir de menos e parecer que conferiu.
 *
 * Some só o CAMINHO, e não a linha inteira: `export { comFator } from './x'` é
 * um reexporte, e ali `comFator` É uso de verdade. Apagar a linha toda
 * transformaria todo reexporte do projeto em órfão falso. */
const semCaminhos = new Map(
  [...fonte].map(([f, t]) => [f, t.replace(/(\bfrom\s*|\bimport\s*)(['"])[^'"]*\2/g, '$1$2$2')]),
)

/* Fronteira de identificador de verdade: `$` e `_` contam como letra, senão
   `metas` casaria dentro de `carregarMetas`. */
const usadoEm = (nome, texto) =>
  new RegExp('(^|[^A-Za-z0-9_$])' + nome + '($|[^A-Za-z0-9_$])').test(texto)

/* Devolve os órfãos E os nomes que chegou a examinar.
 *
 * Os dois, porque as duas listas erram de jeitos diferentes: a de órfãos erra
 * inventando, e a de examinados erra ESVAZIANDO. Um regex rígido demais não
 * produz acusação falsa — ele produz uma lista curta e tranquilizadora, que é
 * pior, porque ninguém desconfia de uma lista curta. */
function orfaos(dentroDe, padrao) {
  const achados = []
  const examinados = new Set()
  for (const [arq, txt] of fonte) {
    if (!dentroDe(arq)) continue

    const nomes = [...txt.matchAll(padrao)].map(m => m[1] || m[2])

    for (const nome of nomes) {
      examinados.add(nome)
      let usos = 0
      for (const [outro, t] of semCaminhos) {
        if (outro === arq) continue
        if (usadoEm(nome, t)) usos++
      }
      if (usos === 0) achados.push({ arq: arq.split(path.sep).join('/'), nome })
    }
  }
  return { achados, examinados }
}

const { achados, examinados: examinadosLib } = orfaos(
  a => a.includes(`${path.sep}lib${path.sep}`),
  /^export (?:async )?function (\w+)|^export const (\w+)/gm,
)

/* A mesma pergunta um nível acima: componente construído e nunca montado.
 *
 * Vale separado porque a resposta é diferente. Função de lib sem chamador
 * costuma ser sobra de refatoração — apagar é o certo. Componente sem chamador
 * costuma ser peça PRONTA que ninguém ligou, e aí a decisão é de produto: quem
 * desenhou pode estar esperando a tela que vai usá-la.
 *
 * Só nomes com maiúscula, que é o que o JSX consegue montar. */
const { achados: componentes, examinados: examinadosTela } = orfaos(
  a => /components|screens/.test(a),
  /^export (?:default )?function ([A-Z]\w+)|^export const ([A-Z]\w+)/gm,
)

/* E a guarda do outro lado, que faltava.
 *
 * A de cima pega o regex FROUXO — o dia em que a barra invertida some e tudo
 * vira órfão. Esta pega o contrário, que é o defeito mais perigoso dos dois:
 * uma varredura que examina de MENOS produz uma lista curta e tranquilizadora,
 * e ninguém desconfia de lista curta.
 *
 * Duas perguntas, porque um controle só não bastava. A primeira versão desta
 * guarda olhava apenas a lista de órfãos, e por isso não pegava nenhuma das
 * duas mutações que testei — com o regex apertado, a lista simplesmente
 * ESVAZIA, e um filtro sobre lista vazia não acusa nada.
 *
 *   1. o nome foi EXAMINADO? se não, o regex parou de reconhecê-lo;
 *   2. e ficou de fora dos órfãos? se não, a detecção de uso quebrou.
 *
 * Os nomes são de coisas que o app usa com certeza, e que ele deixaria de usar
 * só numa reforma grande — e uma reforma grande é exatamente quando alguém
 * precisa saber que a ferramenta parou de valer. */
const CONHECIDOS = {
  lib: { examinados: examinadosLib, orfaos: achados, nomes: ['supabase', 'paleta', 'estilosDe'] },
  tela: {
    examinados: examinadosTela,
    orfaos: componentes,
    nomes: ['HomeScreen', 'MaisScreen', 'MensagensScreen'],
  },
}

/* E o controle NEGATIVO, que as duas guardas acima não davam.
 *
 * As duas de cima pegam a ferramenta acusando demais. Nenhuma pega a ferramenta
 * achando NADA — e testei: com a detecção de uso sempre verdadeira, ou com a
 * fronteira de identificador afrouxada, a lista sai vazia e as duas passam
 * satisfeitas. Ferramenta de conferência que não acha nada é a que ninguém
 * questiona, e é o pior desfecho possível para uma delas.
 *
 * O jeito de provar que ela ainda acha é exigir que ela ache algo que
 * sabidamente existe. Estes dois são órfãos de verdade, conferidos à mão.
 *
 * Se um deles sumir daqui, são só duas explicações, e as duas pedem ação:
 * alguém montou/chamou (então tire o nome desta lista, na mesma alteração), ou
 * a ferramenta parou de enxergar. */
const DEVEM_APARECER = {
  lib: { orfaos: achados, nomes: ['hexDe'] },
  /* `PlanosScreen` está aqui por um motivo a mais: ele só aparece porque o
     caminho do import deixou de contar como uso. Sem ele nesta lista, alguém
     desfazendo aquela limpeza esconderia uma tela inteira de novo, e a
     ferramenta continuaria dizendo "Success". */
  tela: { orfaos: componentes, nomes: ['ArcoMeta', 'PlanosScreen'] },
}

const quebras = []
for (const [onde, c] of Object.entries(CONHECIDOS)) {
  for (const nome of c.nomes) {
    if (!c.examinados.has(nome)) quebras.push(`${nome} (${onde}) nem foi examinado`)
    else if (c.orfaos.some(o => o.nome === nome)) quebras.push(`${nome} (${onde}) saiu como órfão`)
  }
}
for (const [onde, c] of Object.entries(DEVEM_APARECER)) {
  for (const nome of c.nomes) {
    if (!c.orfaos.some(o => o.nome === nome))
      quebras.push(
        `${nome} (${onde}) devia sair como órfão e não saiu ` +
          '— ou alguém o ligou (tire daqui), ou a varredura parou de achar',
      )
  }
}

if (quebras.length > 0) {
  console.error('\nO SCRIPT ESTÁ QUEBRADO, e não o código.\n')
  for (const q of quebras) console.error(`  ${q}`)
  console.error('\n  O app usa todos eles. A lista abaixo não valeria nada.\n')
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

if (componentes.length > 0) {
  console.log(`  ── componentes que ninguém monta ──\n`)
  for (const c of componentes) console.log(`  ${c.arq}      ${c.nome}`)
  console.log('\n  Aqui a pergunta é de produto: era para aparecer em que tela?\n')
}
