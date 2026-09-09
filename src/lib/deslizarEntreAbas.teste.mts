/* O deslize entre abas, sem aparelho.
 *
 * Rode com: node --experimental-strip-types src/lib/deslizarEntreAbas.teste.mts */

import {
  abaDoDeslize,
  ABAS_EM_ORDEM,
  DISTANCIA_MINIMA,
  RAZAO_HORIZONTAL,
} from './deslizarEntreAbas.ts'
import { readFileSync } from 'node:fs'

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

/* Um deslize limpo: bem acima do minimo e quase sem desvio vertical. */
const D = DISTANCIA_MINIMA + 40

// ──── A direcao ────
/* Dedo para a ESQUERDA (dx negativo) avanca; para a DIREITA volta. O conteudo
   acompanha o dedo, como em qualquer carrossel. */
ok('esquerda avanca de hoje para agenda', abaDoDeslize('hoje', -D, 0) === 'agenda')
ok('esquerda avanca de agenda para pacientes', abaDoDeslize('agenda', -D, 0) === 'pacientes')
ok('esquerda avanca de pacientes para mais', abaDoDeslize('pacientes', -D, 0) === 'mais')
ok('direita volta de mais para pacientes', abaDoDeslize('mais', D, 0) === 'pacientes')
ok('direita volta de agenda para hoje', abaDoDeslize('agenda', D, 0) === 'hoje')

// ──── As pontas nao dao a volta ────
ok('na primeira, para a direita nao vai a lugar nenhum', abaDoDeslize('hoje', D, 0) === null)
ok('na ultima, para a esquerda nao vai a lugar nenhum', abaDoDeslize('mais', -D, 0) === null)

// ──── O limiar de distancia ────
ok('abaixo do minimo nao troca', abaDoDeslize('hoje', -(DISTANCIA_MINIMA - 1), 0) === null)
ok('no minimo exato troca', abaDoDeslize('hoje', -DISTANCIA_MINIMA, 0) === 'agenda')
ok('um toque parado nao troca', abaDoDeslize('hoje', 0, 0) === null)
ok('um tremor de 5px nao troca', abaDoDeslize('hoje', -5, 2) === null)

// ──── O limiar de direcao ────
/* O dedo humano nao anda reto: uma rolagem para baixo carrega desvio lateral.
   Sem a razao, esse desvio trocaria de aba no meio de uma leitura. */
ok('rolagem vertical com desvio lateral NAO troca', abaDoDeslize('hoje', -30, 200) === null)
ok('diagonal na razao exata troca', abaDoDeslize('hoje', -100, 50) === 'agenda')
ok('diagonal abaixo da razao nao troca', abaDoDeslize('hoje', -100, 51) === null)
ok('vertical puro nao troca', abaDoDeslize('hoje', 0, 300) === null)
{
  /* dy negativo (dedo subindo) tem de contar igual: e `Math.abs` nos dois
     lados, e esquecer um deles faz o gesto funcionar so para um sentido. */
  ok('desvio para CIMA conta igual', abaDoDeslize('hoje', -30, -200) === null)
  ok('diagonal para cima na razao troca', abaDoDeslize('hoje', -100, -40) === 'agenda')
}

// ──── A Aurora nao e aba ────
/* Ela e o botao redondo levantado, e abre por cima de tudo. Se entrasse na
   lista, deslizar da agenda abriria uma conversa em cima do dedo dela. */
ok('a Aurora nao esta na fila', !(ABAS_EM_ORDEM as string[]).includes('aurora'))
ok('sao exatamente quatro abas', ABAS_EM_ORDEM.length === 4)
ok('e a primeira e hoje', ABAS_EM_ORDEM[0] === 'hoje')

// ──── Entrada torta ────
/* `NaN` passaria por `Math.abs(dx) < MINIMO` como FALSO e seguiria adiante --
   a conta do indice sairia NaN, que indexa undefined e apaga a tela. */
ok('dx NaN nao troca', abaDoDeslize('hoje', Number.NaN, 0) === null)
ok('dy NaN nao troca', abaDoDeslize('hoje', -D, Number.NaN) === null)
ok('dx infinito nao troca', abaDoDeslize('hoje', Number.NEGATIVE_INFINITY, 0) === null)
ok('aba desconhecida nao vira "hoje"',
  abaDoDeslize('financeiro' as never, -D, 0) === null)

/* Nenhuma saida pode ser algo que nao esteja na fila. */
for (const atual of ABAS_EM_ORDEM) {
  for (const dx of [-500, -D, -10, 0, 10, D, 500]) {
    for (const dy of [-300, -20, 0, 20, 300]) {
      const r = abaDoDeslize(atual, dx, dy)
      ok('saida valida', r === null || ABAS_EM_ORDEM.includes(r))
      ok('nunca fica na mesma aba', r !== atual)
    }
  }
}

/* A razao esta declarada e usada: se alguem mudar a constante e esquecer a
   conta, este caso quebra. */
ok('a razao usada e a exportada',
  abaDoDeslize('hoje', -100, 100 / RAZAO_HORIZONTAL) === 'agenda' &&
  abaDoDeslize('hoje', -100, 100 / RAZAO_HORIZONTAL + 1) === null)

/* ──── A ORDEM AQUI E A ORDEM DA BARRA ────
 *
 * Existem duas listas de abas em ordem: `ABAS` em `BarraDaNutri`, que decide o
 * desenho, e `ABAS_EM_ORDEM` aqui, que decide para onde o dedo leva. Elas
 * PRECISAM concordar -- e nada no compilador as obriga, porque as duas tem o
 * mesmo tipo.
 *
 * O sintoma de divergirem nao e um erro: e o dedo indo para o lado errado.
 * Alguem reordena a barra, o gesto continua com a ordem velha, e o app fica
 * "estranho" sem ninguem conseguir dizer por que.
 *
 * Le o componente como texto porque importa-lo arrastaria o React Native
 * inteiro para dentro do Node. */
{
  const barra = readFileSync(new URL('../components/BarraDaNutri.tsx', import.meta.url), 'utf8')
  const i = barra.indexOf('const ABAS:')
  const fim = barra.indexOf(String.fromCharCode(10) + ']', i)
  const bloco = i < 0 ? '' : barra.slice(i, fim < 0 ? barra.length : fim)
  const naBarra = [...bloco.matchAll(/chave:\s*'([a-z]+)'/g)].map(m => m[1])

  ok('achei a lista da barra (o teste conferindo a si mesmo)', naBarra.length >= 4)
  ok('a ordem do gesto e a mesma da barra',
    naBarra.join(',') === ABAS_EM_ORDEM.join(','))
}

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
