/* A folha do plano, que vai para a mão da paciente.
 *
 * Rode com: node --experimental-strip-types src/lib/folhaDoPlano.teste.mts */

import { folhaDoPlano, nomeDoArquivo, seguro } from './folhaDoPlano.ts'
import type { PlanoDaPaciente } from './planoDoPacienteDaNutri.ts'

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

const AGORA = new Date(2026, 8, 10, 8, 30, 0)

const plano = (parcial: Partial<PlanoDaPaciente> = {}): PlanoDaPaciente => ({
  id: 1,
  titulo: 'Plano de emagrecimento',
  descricao: null,
  enviadoEm: null,
  refeicoes: [
    {
      id: 10,
      nome: 'Café da manhã',
      horario: '07:00',
      itens: [
        { id: 100, rotulo: 'Pão integral', quantidade: '2 fatias', kcal: 140 },
        { id: 101, rotulo: 'Ovo mexido', quantidade: '90 g', kcal: 130 },
      ],
    },
  ],
  ...parcial,
})

// ──── O escape, que é o motivo de isto ser testado ────
/* Nome de alimento vem do banco e pode ter `<`. Colado cru, ele engole o resto
   do documento: o PDF sai pela metade, sem erro, e ninguém confere um PDF
   linha por linha antes de mandar para a paciente. */
ok('menor-que é escapado', seguro('a < b') === 'a &lt; b')
ok('e-comercial é escapado', seguro('sal & pimenta') === 'sal &amp; pimenta')
ok('aspas são escapadas', seguro('"queijo"') === '&quot;queijo&quot;')
ok('apóstrofo é escapado', seguro("d'água") === 'd&#39;água')
ok('texto limpo não muda', seguro('Arroz integral') === 'Arroz integral')
ok('vazio não vira undefined', seguro('') === '')

{
  /* O caso completo: um alimento hostil dentro da folha inteira. */
  const p = plano({
    refeicoes: [
      {
        id: 1,
        nome: 'Almoço <b>',
        horario: null,
        itens: [{ id: 1, rotulo: 'Suco 100% & cia <script>', quantidade: null, kcal: null }],
      },
    ],
  })
  const html = folhaDoPlano(p, 'Maria & Ana', AGORA)
  ok('nenhuma tag do dado sobrevive', !html.includes('<script>') && !html.includes('Almoço <b>'))
  ok('o texto continua legível escapado', html.includes('&amp; cia'))
  ok('o nome da paciente também é escapado', html.includes('Maria &amp; Ana'))
}

// ──── O documento se sustenta ────
{
  const html = folhaDoPlano(plano(), 'Maria Alves', AGORA)
  ok('tem doctype', html.trimStart().startsWith('<!DOCTYPE html>'))
  ok('fecha o html', html.trimEnd().endsWith('</html>'))
  ok('declara utf-8', html.includes('charset="utf-8"'))
  ok('traz o título do plano', html.includes('Plano de emagrecimento'))
  ok('traz a paciente', html.includes('Maria Alves'))
  ok('traz a data de geração', html.includes('10/09/2026'))
  ok('traz a refeição', html.includes('Café da manhã'))
  ok('traz o horário', html.includes('07:00'))
  ok('traz os itens', html.includes('Pão integral') && html.includes('Ovo mexido'))
  ok('traz a quantidade', html.includes('2 fatias'))
  /* Margem de página: sem ela o Chrome do Android imprime colado na borda e a
     impressora corta a primeira coluna. */
  ok('tem margem de página', html.includes('@page'))
  ok('nenhuma podridão de JavaScript no documento',
    !/undefined|NaN|\[object|null<\/td>/.test(html))
}

// ──── Os buracos ────
{
  const semDescricao = folhaDoPlano(plano({ descricao: null }), 'Ana', AGORA)
  ok('sem descrição não deixa parágrafo vazio', !semDescricao.includes('class="descricao"'))

  const comDescricao = folhaDoPlano(plano({ descricao: 'Sem lactose' }), 'Ana', AGORA)
  ok('com descrição ela aparece', comDescricao.includes('Sem lactose'))
}
{
  const semItens = folhaDoPlano(
    plano({ refeicoes: [{ id: 1, nome: 'Jantar', horario: null, itens: [] }] }),
    'Ana',
    AGORA,
  )
  /* Refeição vazia sai DIZENDO que está vazia. Sumir com ela faria a folha
     impressa parecer completa faltando uma refeição inteira, e quem lê o papel
     não tem como comparar com a tela. */
  ok('refeição sem item aparece assim mesmo', semItens.includes('Jantar'))
  ok('e diz que está vazia', semItens.includes('Sem itens'))
}
{
  const semRefeicoes = folhaDoPlano(plano({ refeicoes: [] }), 'Ana', AGORA)
  ok('plano sem refeição não sai em branco', semRefeicoes.includes('ainda não tem refeições'))
}
{
  const semHorario = folhaDoPlano(
    plano({ refeicoes: [{ id: 1, nome: 'Ceia', horario: null, itens: [] }] }),
    'Ana',
    AGORA,
  )
  ok('sem horário não deixa span vazio', !semHorario.includes('class="hora"'))
}
{
  const semQuantidade = folhaDoPlano(
    plano({
      refeicoes: [
        { id: 1, nome: 'Ceia', horario: null, itens: [{ id: 1, rotulo: 'Chá', quantidade: null, kcal: null }] },
      ],
    }),
    'Ana',
    AGORA,
  )
  ok('item sem quantidade não imprime "null"', !semQuantidade.includes('null'))
  ok('e o item continua lá', semQuantidade.includes('Chá'))
}
{
  const dataTorta = folhaDoPlano(plano(), 'Ana', new Date('lixo'))
  ok('data inválida não vira "Invalid Date"', !dataTorta.includes('Invalid'))
  ok('e não vira NaN', !dataTorta.includes('NaN'))
}

// ──── O nome do arquivo ────
/* Um `/` no nome é um caminho: o sistema de arquivos recusa ou cria pasta. E o
   nome vem do nome da paciente, que tem acento, espaço e às vezes barra. */
ok('acento sai', nomeDoArquivo('Maria Alves', AGORA) === 'plano-Maria-Alves-20260910.pdf')
ok('cedilha e til saem', nomeDoArquivo('João Conceição', AGORA).startsWith('plano-Joao-Conceicao'))
ok('barra não vira caminho', !nomeDoArquivo('Ana/Paula', AGORA).includes('/'))
ok('ponto extra não quebra a extensão',
  nomeDoArquivo('Dr. Ana', AGORA).endsWith('.pdf') &&
  nomeDoArquivo('Dr. Ana', AGORA).split('.').length === 2)
ok('nome vazio tem reserva', nomeDoArquivo('', AGORA) === 'plano-paciente-20260910.pdf')
ok('só símbolos tem reserva', nomeDoArquivo('!!!', AGORA) === 'plano-paciente-20260910.pdf')
ok('nome gigante é cortado', nomeDoArquivo('A'.repeat(200), AGORA).length < 70)
ok('data torta não vira NaN no nome', !nomeDoArquivo('Ana', new Date('lixo')).includes('NaN'))
ok('sempre termina em .pdf',
  ['Ana', '', '!!!', 'A'.repeat(200)].every(n => nomeDoArquivo(n, AGORA).endsWith('.pdf')))

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
