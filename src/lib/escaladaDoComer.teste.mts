/* A Escalada do Comer no app -- e a régua que tem de bater com a do sistema.
 *
 * Duas coisas que este arquivo segura:
 *   1. o "plano underline" nunca volta: nenhum rótulo devolve código cru;
 *   2. os números da régua são os mesmos de `PlanejamentoTerapeutico.tsx` --
 *      3 exposições para tendência, 2 passos para mudar, 2 de 3 para alerta e
 *      para "come sozinho". Se lá mudar, estes casos precisam mudar junto.
 *
 * Rode com: node --experimental-strip-types src/lib/escaladaDoComer.teste.mts */

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

import {
  BANDAS,
  alertaDeReacao,
  bandaDoPasso,
  comeSozinho,
  descricaoDoPasso,
  humanizar,
  melhorPasso,
  nivelDe,
  nomeDoPlano,
  rotuloDaArea,
  rotuloDoAmbiente,
  rotuloDoPeriodo,
  rotuloDoStatusTerapeutico,
  statusAtual,
  tendenciaDe,
  type Exposicao,
} from './escaladaDoComer.ts'

const ex = (data: string, over: Partial<Exposicao> = {}): Exposicao =>
  ({ data, aceitacao: null, passos: null, reacao: null, ...over })

// ──── O "PLANO UNDERLINE" ────
/* O relato: "o terapêutico aparece com plano underline". Era o banco cru. */
ok('a área traduz', rotuloDaArea('introducao_alimentar') === 'Introdução alimentar')
ok('o status traduz', rotuloDoStatusTerapeutico('em_andamento') === 'Em andamento')
ok('não atingido com acento', rotuloDoStatusTerapeutico('nao_atingido') === 'Não atingido')
/* Os legados, de antes da renomeação no sistema. */
ok('legado ativo', rotuloDoStatusTerapeutico('ativo') === 'Em andamento')
ok('legado concluido', rotuloDoStatusTerapeutico('concluido') === 'Atingido')
ok('legado pausado', rotuloDoStatusTerapeutico('pausado') === 'Parcial')
/* E o que ninguém previu: feio no máximo, nunca com sublinhado. */
ok('status novo não mostra sublinhado', !rotuloDoStatusTerapeutico('em_revisao_clinica').includes('_'))
ok('e fica legível', rotuloDoStatusTerapeutico('em_revisao_clinica') === 'Em revisao clinica')
ok('área nova também', !rotuloDaArea('nova_area_qualquer').includes('_'))
{
  const todos = ['em_andamento', 'atingido', 'parcial', 'nao_atingido', 'ativo', 'concluido', 'pausado', 'x_y_z']
  ok('nenhum rótulo de status tem sublinhado', todos.every(s => !rotuloDoStatusTerapeutico(s).includes('_')))
}
{
  const areas = ['seletividade_alimentar', 'introducao_alimentar', 'aversao_sensorial', 'autonomia',
    'rotina_alimentar', 'aceitacao_textura', 'repertorio_alimentar', 'outro']
  ok('nenhuma área conhecida tem sublinhado', areas.every(a => !rotuloDaArea(a).includes('_')))
}
ok('nulo vira vazio, não "null"', rotuloDoStatusTerapeutico(null) === '' && rotuloDaArea(undefined) === '')
ok('período', rotuloDoPeriodo('quinzenal') === 'Quinzenal')
ok('ambiente', rotuloDoAmbiente('consultorio') === 'No consultório')
ok('humanizar hífen também', humanizar('meio-termo') === 'Meio termo')

// ──── nomeDoPlano ────
ok('título manda quando existe', nomeDoPlano('Teste valor', 'introducao_alimentar') === 'Teste valor')
/* Sem título, a área -- traduzida. É a mesma escolha do sistema. */
ok('sem título vira a área traduzida', nomeDoPlano('', 'introducao_alimentar') === 'Introdução alimentar')
ok('título só de espaço conta como vazio', nomeDoPlano('   ', 'autonomia') === 'Autonomia')
ok('sem nada', nomeDoPlano(null, null) === 'Plano terapêutico')

// ──── statusAtual ────
ok('ativo legado é em andamento', statusAtual('ativo') === 'em_andamento')
ok('em andamento', statusAtual('em_andamento') === 'em_andamento')
ok('desconhecido é outro', statusAtual('qualquer') === 'outro')

// ──── as bandas ────
ok('sete bandas, na ordem', BANDAS.map(b => b.banda).join(',') ===
  'recusou,tolerar,interagir,cheirar,tocar,provar,comer')
ok('32 passos cobertos sem buraco', (() => {
  for (let n = 1; n <= 32; n++) {
    const b = bandaDoPasso(n)
    if (n < b.primeiro || n > b.ultimo) return false
  }
  return true
})())
ok('todo passo tem descrição', Array.from({ length: 32 }, (_, i) => i + 1).every(n => descricaoDoPasso(n).length > 0))
ok('passo 16 é tocar', bandaDoPasso(16).rotulo === 'Tocar')
ok('passo 32 é comer', bandaDoPasso(32).rotulo === 'Comer')
ok('passo 0 é recusou', bandaDoPasso(0).rotulo === 'Recusou')
ok('passo inválido não quebra', bandaDoPasso(Number.NaN).rotulo === 'Recusou')

// ──── nivelDe ────
ok('passos registrados mandam', nivelDe(ex('2026-09-01', { passos: [3, 16, 9] })) === 16)
ok('passo fora de 1-32 é ignorado', nivelDe(ex('2026-09-01', { passos: [40, -1, 7] })) === 7)
/* Sem passos: o PRIMEIRO passo da banda. Conservador, como no sistema. */
ok('banda sem passos vira o primeiro passo dela', nivelDe(ex('2026-09-01', { aceitacao: 'tocar' })) === 14)
ok('recusou é zero', nivelDe(ex('2026-09-01', { aceitacao: 'recusou' })) === 0)
/* Os registros de antes da Escalada completa. */
ok('legado aceitou é comer', nivelDe(ex('2026-09-01', { aceitacao: 'aceitou' })) === 32)
ok('legado provou é provar', nivelDe(ex('2026-09-01', { aceitacao: 'provou' })) === 25)
ok('marcação solta engoliu', nivelDe(ex('2026-09-01', { engoliu: true })) === 32)
ok('marcação solta tocou', nivelDe(ex('2026-09-01', { tocou: true })) === 14)
ok('sem nada é nulo, e não zero', nivelDe(ex('2026-09-01')) === null)

// ──── tendência: A MESMA RÉGUA DO SISTEMA ────
/* Menos de 3 exposições: não afirma. */
ok('duas exposições não têm tendência',
  tendenciaDe([ex('2026-09-01', { passos: [2] }), ex('2026-09-08', { passos: [20] })]) === null)
{
  const t = tendenciaDe([
    ex('2026-09-01', { passos: [2] }),
    ex('2026-09-08', { passos: [5] }),
    ex('2026-09-15', { passos: [16] }),
    ex('2026-09-22', { passos: [20] }),
  ])
  ok('subiu', t?.direcao === 'subiu')
  ok('de tolerar', t?.de === 'Tolerar')
  ok('para tocar', t?.para === 'Tocar')
}
{
  /* Diferença de 1 passo não é mudança -- são 2. */
  const t = tendenciaDe([
    ex('2026-09-01', { passos: [14] }),
    ex('2026-09-08', { passos: [15] }),
    ex('2026-09-15', { passos: [15] }),
  ])
  ok('um passo de diferença é estável', t?.direcao === 'estavel')
}
{
  const t = tendenciaDe([
    ex('2026-09-01', { passos: [22] }),
    ex('2026-09-08', { passos: [20] }),
    ex('2026-09-15', { passos: [5] }),
    ex('2026-09-22', { passos: [3] }),
  ])
  ok('desceu', t?.direcao === 'desceu')
}
/* A ordem é pela DATA, e não pela ordem em que chegaram. */
{
  const t = tendenciaDe([
    ex('2026-09-22', { passos: [20] }),
    ex('2026-09-01', { passos: [2] }),
    ex('2026-09-15', { passos: [16] }),
    ex('2026-09-08', { passos: [5] }),
  ])
  ok('ordena pela data antes de comparar', t?.direcao === 'subiu')
}
ok('exposições sem nível não contam para os 3',
  tendenciaDe([ex('2026-09-01'), ex('2026-09-02'), ex('2026-09-03', { passos: [5] })]) === null)

// ──── alerta de reação: 2 de 3 ────
ok('duas agitadas nas três últimas acendem', alertaDeReacao([
  ex('2026-09-01', { reacao: 'positiva' }),
  ex('2026-09-08', { reacao: 'agitada' }),
  ex('2026-09-15', { reacao: 'negativa' }),
  ex('2026-09-22', { reacao: 'neutra' }),
]))
ok('uma só não acende', !alertaDeReacao([
  ex('2026-09-08', { reacao: 'negativa' }),
  ex('2026-09-15', { reacao: 'neutra' }),
  ex('2026-09-22', { reacao: 'positiva' }),
]))
/* As negativas ANTIGAS não contam: é sobre agora. */
ok('negativas antigas não acendem', !alertaDeReacao([
  ex('2026-08-01', { reacao: 'negativa' }),
  ex('2026-08-02', { reacao: 'negativa' }),
  ex('2026-09-08', { reacao: 'positiva' }),
  ex('2026-09-15', { reacao: 'positiva' }),
  ex('2026-09-22', { reacao: 'neutra' }),
]))

// ──── come sozinho: 2 das 3 últimas no 32 ────
/* Uma vez só não é "missão cumprida" -- foi o defeito do pôster no sistema. */
ok('uma vez no 32 não basta', !comeSozinho([
  ex('2026-09-01', { passos: [32] }),
  ex('2026-09-08', { passos: [10] }),
  ex('2026-09-15', { passos: [12] }),
]))
ok('duas das três últimas bastam', comeSozinho([
  ex('2026-09-01', { passos: [10] }),
  ex('2026-09-08', { passos: [32] }),
  ex('2026-09-15', { passos: [32] }),
]))
ok('em março e depois dez recusas não sustenta', !comeSozinho([
  ex('2026-03-01', { passos: [32] }),
  ex('2026-03-02', { passos: [32] }),
  ex('2026-09-01', { aceitacao: 'recusou' }),
  ex('2026-09-08', { aceitacao: 'recusou' }),
  ex('2026-09-15', { aceitacao: 'recusou' }),
]))

// ──── melhorPasso ────
ok('o mais alto já alcançado', melhorPasso([ex('a', { passos: [3] }), ex('b', { passos: [18] }), ex('c', { passos: [9] })]) === 18)
ok('sem exposição é nulo, e não zero', melhorPasso([]) === null)

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
