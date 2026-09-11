/* O prontuário lido para a tela do celular.
 *
 * As formas de entrada são as que o SISTEMA grava -- copiadas do código dele,
 * e não inventadas: `_secoes` de `anamnese.tsx`, `marcadores` de
 * `analisar-exame`, a resposta de `aurora_estado` e da `aurora-monitor`.
 *
 * Rode com: node --experimental-strip-types src/lib/leituraDoProntuario.teste.mts */

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

import {
  anamneseLida,
  dataDaAnamnese,
  estadoDoResumo,
  exameLido,
  linhasDoValor,
  pedidoDoResumo,
  resumoDaAurora,
  rotuloDaFormula,
  rotuloDoMarcador,
  statusDoMarcador,
} from './leituraDoProntuario.ts'

// ──── A DATA DA ANAMNESE ────
/* O defeito que motivou a função: '' não é nulo, e o `??` não caía. */
ok('vazia cai para a gravação', dataDaAnamnese('', '2026-08-14T13:22:00+00:00') === '2026-08-14')
ok('dd/mm/aaaa vira ISO', dataDaAnamnese('04/08/2026', '2026-09-01T00:00:00Z') === '2026-08-04')
ok('sem zero à esquerda', dataDaAnamnese('4/8/2026', null) === '2026-08-04')
ok('com espaço', dataDaAnamnese('  25/07/2026 ', null) === '2026-07-25')
ok('31 de fevereiro não passa', dataDaAnamnese('31/02/2026', '2026-03-01T10:00:00Z') === '2026-03-01')
ok('ISO também serve', dataDaAnamnese('2026-07-25', null) === '2026-07-25')
ok('lixo cai para a gravação', dataDaAnamnese('ontem', '2026-05-05T00:00:00Z') === '2026-05-05')
ok('nada é nulo', dataDaAnamnese(null, null) === null && dataDaAnamnese('', '') === null)

// ──── AS RESPOSTAS ────
{
  const r = anamneseLida({
    _secoes: [
      {
        titulo: 'Hábitos',
        campos: [
          { label: 'Qualidade do sono', tipo: 'radio', valor: 'Ruim' },
          { label: 'Pratica exercício?', tipo: 'booleano', valor: true },
          { label: 'Fuma?', tipo: 'booleano', valor: false },
          { label: 'Observações', tipo: 'textarea', valor: '' },
          { label: 'Alergias', tipo: 'checkbox_multi', valor: [] },
        ],
      },
      { titulo: 'Vazia', campos: [{ label: 'X', tipo: 'texto', valor: null }] },
    ],
    _template_id: 12,
    '345': 'Ruim',
  })
  ok('duas seções', r.secoes.length === 2)
  ok('só as respondidas aparecem', r.secoes[0].campos.length === 3)
  ok('as vazias são contadas', r.secoes[0].semResposta === 2)
  ok('booleano verdadeiro é Sim', r.secoes[0].campos[1].linhas[0] === 'Sim')
  /* "Não" É resposta. Tratar false como vazio esconderia "Fuma? Não". */
  ok('booleano falso é Não, e aparece', r.secoes[0].campos[2].linhas[0] === 'Não')
  ok('seção sem nada fica, com a conta', r.secoes[1].campos.length === 0 && r.secoes[1].semResposta === 1)
  ok('não é importado', !r.importado)
}
ok('sem _secoes não quebra', anamneseLida({ '12': 'x' }).secoes.length === 0)
ok('nulo não quebra', anamneseLida(null).secoes.length === 0)
ok('string não quebra', anamneseLida('lixo').secoes.length === 0)
{
  const r = anamneseLida({
    _secoes: [{ titulo: 'Anamnese', campos: [{ label: 'ficha.pdf', tipo: 'textarea', valor: 'Paciente relata...\nDorme mal.' }] }],
    _importado_de_arquivo: true,
  })
  ok('importado é marcado', r.importado)
  ok('e o texto vem inteiro, com a quebra', r.secoes[0].campos[0].linhas[0].includes('\n'))
}

// ──── CADA TIPO ────
ok('número com vírgula', linhasDoValor('numero', 7.5)[0] === '7,5')
ok('data do input vira dd/mm', linhasDoValor('data', '2026-03-09')[0] === '09/03/2026')
ok('lista junta', linhasDoValor('checkbox_multi', ['Lactose', 'Glúten'])[0] === 'Lactose, Glúten')
ok('grupo repetível vira linhas numeradas', (() => {
  const l = linhasDoValor('grupo_repetivel', [
    { Refeição: 'Café', Horário: '7h' },
    { Refeição: 'Almoço', Horário: '' },
  ])
  return l.length === 2 && l[0] === '1. Refeição: Café · Horário: 7h' && l[1] === '2. Refeição: Almoço'
})())
ok('grupo com uma entrada não numera', linhasDoValor('grupo_repetivel', [{ Nome: 'Dipirona' }])[0] === 'Nome: Dipirona')
ok('grupo vazio é sem resposta', linhasDoValor('grupo_repetivel', []).length === 0)
ok('sinais clínicos por categoria', (() => {
  const l = linhasDoValor('escala_sinais_clinicos', { Cabelo: ['Queda', 'Opaco'], Unhas: [] })
  return l.length === 1 && l[0] === 'Cabelo: Queda, Opaco'
})())
ok('bristol', linhasDoValor('escala_bristol', { tipo: '4', cor: 'Marrom' }).join('|') === 'Tipo 4|Cor: Marrom')
ok('bristol vazio', linhasDoValor('escala_bristol', {}).length === 0)
/* O formato da escala de urina não aparece em lugar nenhum do sistema. O que
   importa é nunca sair "[object Object]". */
ok('objeto desconhecido não vira [object Object]', (() => {
  const l = linhasDoValor('escala_urina', { cor: 'Amarelo claro', nivel: 2 })
  return l.join('|') === 'cor: Amarelo claro|nivel: 2' && !l.join('').includes('object')
})())
ok('espaço só é vazio', linhasDoValor('texto', '   ').length === 0)

// ──── EXAMES ────
{
  const e = exameLido({
    resumo: 'Ferritina baixa.',
    contagem: { normais: 2, alterados: 1, criticos: 0 },
    marcadores: [
      { nome: 'Hemoglobina', categoria: 'Hemograma', valor: '13,2', unidade: 'g/dL', referencia: '12 a 16', status: 'normal', interpretacao: null },
      { nome: 'Ferritina', categoria: 'Ferro', valor: '8', unidade: 'ng/mL', referencia: '15 a 150', status: 'baixo', interpretacao: 'Reserva baixa' },
      { nome: 'Glicose', categoria: null, valor: '< 70', unidade: 'mg/dL', referencia: null, status: 'critico', interpretacao: null },
      { nome: '', valor: '1' },
      { nome: 'TSH', valor: 2.1, status: 'estranho' },
    ],
  })
  ok('lê', e !== null)
  ok('marcador sem nome sai', e!.marcadores.length === 4)
  ok('o crítico vem primeiro', e!.marcadores[0].nome === 'Glicose')
  ok('depois o alterado', e!.marcadores[1].nome === 'Ferritina')
  ok('o normal por último', e!.marcadores[3].nome === 'Hemoglobina')
  /* "< 70" continua "< 70": virar número perderia o sinal. */
  ok('o valor é texto, com o sinal', e!.marcadores[0].valor === '< 70')
  ok('número vira texto com vírgula', e!.marcadores.find(m => m.nome === 'TSH')!.valor === '2,1')
  ok('status desconhecido é indeterminado, e não normal', e!.marcadores.find(m => m.nome === 'TSH')!.status === 'indeterminado')
  ok('conta recontada', e!.alterados === 1 && e!.criticos === 1)
  ok('resumo', e!.resumo === 'Ferritina baixa.')
}
ok('o resumo da IA manda quando existe', exameLido({ resumo: 'a', resumo_ia: 'b', marcadores: [] })!.resumo === 'b')
ok('sem análise é nulo', exameLido(null) === null)
ok('crítico com acento', statusDoMarcador('Crítico') === 'critico')
ok('rótulo', rotuloDoMarcador('indeterminado') === 'Sem referência')

// ──── FÓRMULA ────
ok('fórmula conhecida', rotuloDaFormula('mifflin') === 'Mifflin-St Jeor 1990')
ok('da criança', rotuloDaFormula('eer_2023_crianca') === 'EER 2023 (criança)')
/* O sistema cai em Harris-Benedict para código desconhecido. Aqui NÃO. */
ok('desconhecida NÃO vira Harris-Benedict', !rotuloDaFormula('henry_2005_nova').includes('Harris'))
ok('desconhecida fica legível', rotuloDaFormula('henry_2005_nova') === 'Henry 2005 nova')
ok('vazia diz que não sabe', rotuloDaFormula('') === 'Fórmula não informada')
/* Sem o filtro de chave própria, isto devolvia a FUNÇÃO Object -- e a tela morria. */
ok('constructor é texto, e não função', rotuloDaFormula('constructor') === 'Constructor')

// ──── O RESUMO DA AURORA ────
{
  const r = resumoDaAurora({
    resumo: 'Paciente em evolução.',
    deficits: [{ titulo: 'Proteína baixa', detalhe: 'd', evidencia: 'e', gravidade: 'moderada' }, { titulo: '' }],
    pontos_fortes: [{ titulo: 'Água em dia', detalhe: '', evidencia: '' }],
    evolucao: [],
    cenarios: [{ se: 'mantiver', entao: 'perde 2 kg', prazo: '30 dias', confianca: 'media' }, { se: 'x' }],
    prevencoes: [{ acao: 'Pedir ferritina', motivo: 'm', prioridade: 'alta' }],
    lacunas: [{ o_que_falta: 'Exame recente', por_que_importa: 'p' }],
  })
  ok('lê o resumo', r?.resumo === 'Paciente em evolução.')
  ok('déficit sem título sai', r?.deficits.length === 1)
  ok('cenário pela metade sai', r?.cenarios.length === 1)
  ok('lacuna com o nome do app', r?.lacunas[0].oQueFalta === 'Exame recente')
  ok('pontos fortes', r?.pontosFortes[0].titulo === 'Água em dia')
}
ok('análise vazia é nula', resumoDaAurora({ resumo: '', deficits: [] }) === null)
ok('nula é nula', resumoDaAurora(null) === null)

{
  const e = estadoDoResumo({
    tem_analise: true,
    analise: { resumo: 'ok' },
    gerado_em: '2026-09-10T12:00:00Z',
    calculando: false,
    velha: true,
    erro: null,
    restam_hoje: 1,
    limite_diario: 2,
    total_analises: 5,
  })
  ok('estado com resumo', e.resumo?.resumo === 'ok' && e.velha && e.restamHoje === 1 && e.total === 5)
}
{
  /* Sem saber quantas restam, NÃO trava: nulo, o botão fica ligado e o banco
     decide. Zero aqui deixaria a nutricionista sem resumo para sempre. */
  const e = estadoDoResumo({})
  ok('sem número, não sabe (e não zero)', e.restamHoje === null)
  ok('sem nada, sem resumo', e.resumo === null && !e.calculando)
}
ok('estado nulo não quebra', estadoDoResumo(null).resumo === null)
ok('zero é zero', estadoDoResumo({ restam_hoje: 0 }).restamHoje === 0)

ok('pedido calculando', pedidoDoResumo({ calculando: true }).tipo === 'calculando')
ok('já andando conta como calculando', pedidoDoResumo({ bloqueado: 'em_andamento' }).tipo === 'calculando')
{
  const p = pedidoDoResumo({ bloqueado: 'limite', limite: 2 })
  ok('cota do dia é recusa com a frase', p.tipo === 'recusado' && p.mensagem.includes('2 leituras'))
}
{
  const p = pedidoDoResumo({ error: 'A Aurora não está incluída no teste grátis. Assine para liberar.' })
  ok('o teste grátis repassa a frase do sistema', p.tipo === 'recusado' && p.mensagem.includes('teste grátis'))
}
ok('resposta pronta', pedidoDoResumo({ ok: true }).tipo === 'pronto')

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
