/* Sonda das peças novas: semana, resumo de treino, calendário, fertilidade e
 * questionário.
 *
 * Não repete o que os testes de cada uma já fazem. Aqui entra o que NENHUM
 * deles tenta: chave de protótipo, NaN e Infinity, lista fora de ordem, duplicata,
 * texto absurdo, emoji, e volume — as classes que já produziram defeito neste
 * projeto, aplicadas ao código escrito hoje. */

import { semanaDaPessoa } from './semanaDaPessoa.ts'
import { caloriasDoTreino, resumoDoTreino, volumeLegivel } from './resumoDoTreino.ts'
import { diasMenstruada, diasPrevistos, formaNaFaixa, mesDe, mesVizinho } from './calendarioDoCiclo.ts'
import { dataProvavelDoParto, diasFerteis, janelaFertil } from './fertilidade.ts'
import { modeloDoBanco, quantasRespondidas, respondido, vazioDoModelo } from './questionarioDaNutri.ts'
import { segundaDa } from './semanaVista.ts'
import { avisoDaSemana, padraoAntesDaMenstruacao } from './padraoDoCiclo.ts'
import type { SerieFeita } from './treino.ts'

/* O teto dos testes de tempo, e por que ele e folgado.
 *
 * Estes limites existem para pegar EXPLOSAO DE ORDEM DE GRANDEZA -- um teto
 * removido que faz o laco percorrer 365 dias por ciclo em vez de 31 --, e nao
 * para medir desempenho. Quem mede desempenho e outro tipo de teste, com a
 * maquina parada.
 *
 * O numero era 100 ms, e falhava sozinho: o MESMO codigo, cinco vezes seguidas
 * aqui, deu 30, 70, 94, 98 e 244 ms. Um limite dentro do ruido nao reprova
 * codigo lento, reprova a sorte -- e ensina quem le a ignorar o vermelho, que e
 * o unico jeito de perder a falha de verdade no dia em que ela vier.
 *
 * Dois segundos continuam pegando o que interessa: sem o teto, os casos daqui
 * pulam de milhares para milhoes de iteracoes. */
const LIMITE_MS = 2000

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { passou++; console.log('  ok    ' + nome) }
  else { falhou++; console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : '')) }
}
/* Nada aqui pode DERRUBAR. Uma exceção numa dessas funções é tela branca. */
function naoQuebra(nome: string, f: () => unknown) {
  try { f(); passou++; console.log('  ok    ' + nome) }
  catch (e) { falhou++; console.log('  FALHA ' + nome + '  -> ' + (e as Error).message.slice(0, 70)) }
}

const HOJE = '2026-08-30'
const base = {
  hoje: HOJE,
  sessoes: [] as { data: string; duracaoMin: number | null }[],
  pesos: [] as { data: string; kg: number }[],
  consumo: [] as { data: string; calorias: number | null }[],
  agua: [] as { data: string; ml: number }[],
  metaDeAguaMl: 2000 as number | null,
  metaDeCalorias: 2000 as number | null,
}
const s = (nome: string, data: string, serie: number, c: number | null, r: number | null,
  id: string | null = nome): SerieFeita =>
  ({ exercicioId: id, nome, data, serie, cargaKg: c, repeticoes: r })

console.log('\n1. NaN e Infinity — os que somam calado')

{
  const r = semanaDaPessoa({ ...base, pesos: [
    { data: '2026-08-25', kg: Number.NaN }, { data: '2026-08-30', kg: 80 },
  ] })
  const l = r.linhas.find(x => x.chave === 'peso')
  ok('peso NaN não vira linha com "NaN kg"', l === undefined || !l.texto.includes('NaN'), l?.texto)
}

{
  const r = semanaDaPessoa({ ...base, pesos: [
    { data: '2026-08-25', kg: 80 }, { data: '2026-08-30', kg: Number.POSITIVE_INFINITY },
  ] })
  const l = r.linhas.find(x => x.chave === 'peso')
  ok('peso Infinity não vira linha', l === undefined || !l.texto.includes('Infinity'), l?.texto)
}

{
  const r = semanaDaPessoa({ ...base, consumo: [
    { data: '2026-08-28', calorias: Number.NaN },
    { data: '2026-08-29', calorias: 2000 },
    { data: '2026-08-30', calorias: 2000 },
  ] })
  const l = r.linhas.find(x => x.chave === 'calorias')
  ok('caloria NaN não contamina a média', l === undefined || !l.texto.includes('NaN'), l?.texto)
}

{
  const r = semanaDaPessoa({ ...base, agua: [{ data: '2026-08-30', ml: Number.NaN }] })
  naoQuebra('água NaN não derruba', () => r.linhas.length)
}

{
  const r = resumoDoTreino([s('X', HOJE, 1, Number.NaN, 10)], [], 40, 70)
  ok('carga NaN não vira volume NaN', Number.isFinite(r.volumeKg), String(r.volumeKg))
}

{
  const r = resumoDoTreino([s('X', HOJE, 1, 50, Number.POSITIVE_INFINITY)], [], 40, 70)
  ok('reps Infinity não vira volume infinito', Number.isFinite(r.volumeKg), String(r.volumeKg))
}

console.log('\n2. chave de protótipo')

{
  /* O nome do exercício vira CHAVE de agrupamento. "constructor" indexando um
     objeto literal devolve a função construtora — foi assim que um dia de treino
     virou FUNÇÃO neste projeto. */
  naoQuebra('exercício chamado "constructor"', () =>
    resumoDoTreino([s('constructor', HOJE, 1, 50, 10, null)], [], 40, 70))
  naoQuebra('exercício chamado "__proto__"', () =>
    resumoDoTreino([s('__proto__', HOJE, 1, 50, 10, null)], [], 40, 70))
  const r = resumoDoTreino(
    [s('constructor', HOJE, 1, 55, 10, null)],
    [s('constructor', '2026-08-23', 1, 50, 10, null)],
    40, 70,
  )
  ok('e ainda compara certo', r.comparacoes[0]?.variacao === 10, JSON.stringify(r.comparacoes))
}

{
  const m = modeloDoBanco({ secoes: [{ titulo: 'S', campos: [
    { chave: 'constructor', tipo: 'texto', label: 'x' },
    { chave: 'toString', tipo: 'checkbox_multi', label: 'y' },
    { chave: 'hasOwnProperty', tipo: 'booleano', label: 'z' },
  ] }] })
  const v = vazioDoModelo(m)
  ok('vazio de "constructor" é string, não função', v['constructor'] === '', typeof v['constructor'])
  ok('vazio de "toString" é lista', Array.isArray(v['toString']), typeof v['toString'])
  ok('vazio de "hasOwnProperty" é null', v['hasOwnProperty'] === null, typeof v['hasOwnProperty'])
  ok('e nada disso conta como respondido', quantasRespondidas(m.secoes, v) === 0)
  ok('respondido() não confunde função', respondido((({}) as never)['constructor']) === false ||
    respondido(Object.prototype.constructor) === true)
}

console.log('\n3. lista fora de ordem, duplicada, e repetida')

{
  /* As séries chegam na ordem em que foram gravadas; nada garante ordenação. */
  const hoje = [s('A', HOJE, 3, 60, 8), s('A', HOJE, 1, 40, 10), s('A', HOJE, 2, 50, 9)]
  const r = resumoDoTreino(hoje, [s('A', '2026-08-23', 1, 50, 10)], 40, 70)
  ok('a maior carga é achada fora de ordem', r.comparacoes[0].hojeKg === 60, String(r.comparacoes[0].hojeKg))
  ok('e as três séries contam', r.series === 3)
}

{
  /* A MESMA série duas vezes na lista — o modo treino grava por upsert, mas a
     lista local podia ter duplicata se o filtro falhasse. */
  const hoje = [s('A', HOJE, 1, 50, 10), s('A', HOJE, 1, 50, 10)]
  const r = resumoDoTreino(hoje, [], 40, 70)
  ok('duplicata infla o volume (documentado)', r.volumeKg === 1000, String(r.volumeKg))
  ok('mas continua sendo um exercício', r.exercicios === 1)
}

{
  const ciclos = [
    { comecou: '2026-08-29', terminou: null },
    { comecou: '2026-07-04', terminou: null },
    { comecou: '2026-08-01', terminou: null },
  ]
  /* Três ciclos sem fim marcado, cinco dias cada, sem sobreposição: 15 dias.
     A ordem da lista não muda nada — o Set nasce do conteúdo, e não do
     caminho. */
  ok('menstruada não depende da ordem', diasMenstruada(ciclos).size === 15,
    String(diasMenstruada(ciclos).size))
}

console.log('\n4. texto absurdo, emoji, e coisa que não é texto')

{
  const nome = '💪'.repeat(500)
  naoQuebra('nome de exercício com 500 emojis', () =>
    resumoDoTreino([s(nome, HOJE, 1, 50, 10, null)], [], 40, 70))
  const r = resumoDoTreino([s(nome, HOJE, 1, 55, 10, null)], [s(nome, '2026-08-23', 1, 50, 10, null)], 40, 70)
  ok('e ainda agrupa igual', r.comparacoes.length === 1)
}

{
  const m = modeloDoBanco({ secoes: [{ titulo: '🍎'.repeat(200), campos: [
    { chave: 'a', tipo: 'texto', label: '🥦'.repeat(300) },
  ] }] })
  ok('emoji em título e rótulo passam', m.secoes.length === 1)
  ok('e o rótulo não é cortado no meio de um par substituto',
    [...m.secoes[0].campos[0].label].every(c => c === '🥦'))
}

{
  naoQuebra('modelo com aninhamento profundo', () => {
    let x: unknown = { chave: 'a', tipo: 'texto' }
    for (let i = 0; i < 2000; i++) x = { secoes: [{ campos: [x] }] }
    return modeloDoBanco(x)
  })
}

{
  naoQuebra('semana com data que é objeto', () =>
    semanaDaPessoa({ ...base, sessoes: [{ data: {} as never, duracaoMin: 10 }] }))
  naoQuebra('semana com data null', () =>
    semanaDaPessoa({ ...base, pesos: [{ data: null as never, kg: 80 }] }))
  naoQuebra('resumo com nome não-texto', () =>
    resumoDoTreino([{ ...s('X', HOJE, 1, 50, 10), nome: 42 as never }], [], 40, 70))
}

console.log('\n5. volume — mil séries e mil ciclos')

{
  const mil: SerieFeita[] = Array.from({ length: 1000 }, (_, i) =>
    s(`Ex ${i % 20}`, HOJE, (i % 5) + 1, 50, 10, `id-${i % 20}`))
  const antes: SerieFeita[] = Array.from({ length: 4000 }, (_, i) =>
    s(`Ex ${i % 20}`, `2026-0${(i % 8) + 1}-15`.slice(0, 10), (i % 5) + 1, 40, 10, `id-${i % 20}`))
  const t0 = Date.now()
  const r = resumoDoTreino(mil, antes, 60, 70)
  const ms = Date.now() - t0
  ok('1.000 séries contra 4.000 de histórico', r.exercicios === 20, String(r.exercicios))
  ok(`e sem explodir (${ms} ms)`, ms < LIMITE_MS, `${ms} ms`)
}

{
  const ciclos = Array.from({ length: 500 }, (_, i) => ({
    comecou: `2020-01-01`, terminou: null,
  }))
  const t0 = Date.now()
  diasMenstruada(ciclos)
  ok(`500 ciclos iguais sem explodir (${Date.now() - t0} ms)`, Date.now() - t0 < LIMITE_MS)
}

{
  /* Um "fim" com o ano errado: sem o teto, o laço percorreria 365 dias por
     ciclo, e com 100 ciclos seriam 36.500 iterações e um Set gigante. */
  const ciclos = Array.from({ length: 100 }, () => ({ comecou: '2026-01-01', terminou: '2027-01-01' }))
  const t0 = Date.now()
  const d = diasMenstruada(ciclos)
  ok('fim absurdo é limitado', d.size <= 31, String(d.size))
  ok(`e não trava (${Date.now() - t0} ms)`, Date.now() - t0 < LIMITE_MS)
}

console.log('\n6. datas nas bordas')

{
  naoQuebra('mês 0', () => mesDe(2026, 0, HOJE))
  naoQuebra('mês 13', () => mesDe(2026, 13, HOJE))
  naoQuebra('ano 0', () => mesDe(0, 1, HOJE))
  naoQuebra('ano negativo', () => mesVizinho(-1, 1, -1))
  ok('mês 13 não gera 31 dias de lixo', mesDe(2026, 13, HOJE).every(d => /^\d{4}-13-\d{2}$/.test(d.data)))
}

{
  ok('parto de 31/02 é nulo', dataProvavelDoParto('2026-02-31') === null)
  ok('parto de 31/04 é nulo', dataProvavelDoParto('2026-04-31') === null)
  ok('parto de 29/02 em ano comum é nulo', dataProvavelDoParto('2027-02-29') === null)
  ok('parto de 29/02 em bissexto vale', dataProvavelDoParto('2028-02-29') !== null)
  ok('janela de 31/02 é nula', janelaFertil('2026-02-31') === null)
  ok('e os dias também', diasFerteis(janelaFertil('2026-02-31')).size === 0)
}

{
  /* Domingo pertence à semana que COMEÇOU na segunda anterior. Sem isso, o
     cartão apareceria duas vezes em toda virada de domingo para segunda. */
  ok('domingo 30/08 volta para 24/08', segundaDa('2026-08-30') === '2026-08-24', segundaDa('2026-08-30'))
  ok('segunda 31/08 é ela mesma', segundaDa('2026-08-31') === '2026-08-31', segundaDa('2026-08-31'))
  ok('sábado 29/08 volta para 24/08', segundaDa('2026-08-29') === '2026-08-24', segundaDa('2026-08-29'))
  ok('atravessa o ano', segundaDa('2027-01-01') === '2026-12-28', segundaDa('2027-01-01'))
  naoQuebra('data inválida', () => segundaDa('nada'))
}

console.log('\n7. o volume legível e as calorias, nos extremos')

{
  ok('999,4 kg arredonda para 999 kg', volumeLegivel(999.4) === '999 kg', volumeLegivel(999.4))
  ok('1.000.000 kg vira 1000,0 t', volumeLegivel(1000000) === '1000,0 t', volumeLegivel(1000000))
  ok('Infinity vira vazio', volumeLegivel(Number.POSITIVE_INFINITY) === '')
  ok('caloria com peso Infinity é nula', caloriasDoTreino(60, Number.POSITIVE_INFINITY) === null)
  ok('caloria com minutos Infinity é nula', caloriasDoTreino(Number.POSITIVE_INFINITY, 70) === null)
}


/* ═══ Segunda leva: o padrão do ciclo e o calendário em faixa ═══════════════
 *
 * Peças de hoje, e as classes que já produziram defeito aqui: chave de
 * protótipo, entrada fora de ordem, volume, e data que o formato aceita e o
 * calendário não. */

console.log('\n8. o padrão do ciclo sob entrada hostil')

{
  const cs = [{ comecou: '2026-06-01', terminou: null }, { comecou: '2026-06-29', terminou: null },
              { comecou: '2026-07-27', terminou: null }]
  const dia = (data: string, sint: string[] = [], hum: string | null = null, des: string[] = []) =>
    ({ data, sintomas: sint, humor: hum, desejoAlimentar: des })

  /* Sintoma chamado "constructor". Ele vira CHAVE de um Map, e Map não tem
     protótipo herdado — mas a mesma string atravessa `emLista` e vai para a
     tela. O que não pode é derrubar nem virar "[object Object]". */
  naoQuebra('sintoma "constructor"', () =>
    padraoAntesDaMenstruacao(cs, [dia('2026-06-27', ['constructor']), dia('2026-07-25', ['constructor'])]))
  naoQuebra('sintoma "__proto__"', () =>
    padraoAntesDaMenstruacao(cs, [dia('2026-06-27', ['__proto__']), dia('2026-07-25', ['__proto__'])]))
  const p = padraoAntesDaMenstruacao(cs,
    [dia('2026-06-27', ['constructor']), dia('2026-07-25', ['constructor'])])
  ok('e o padrão sai com a string certa', p[0]?.o_que === 'constructor', JSON.stringify(p))
}

{
  const cs = [{ comecou: '2026-06-29', terminou: null }, { comecou: '2026-06-01', terminou: null },
              { comecou: '2026-07-27', terminou: null }]
  const dia = (data: string, sint: string[]) => ({ data, sintomas: sint, humor: null, desejoAlimentar: [] })
  /* Os ciclos chegam FORA DE ORDEM do banco quando alguém muda o `order by`. A
     função ordena antes; sem isso, a janela de cada ciclo seria medida contra o
     vizinho errado e o padrão sairia de dias aleatórios. */
  const p = padraoAntesDaMenstruacao(cs, [dia('2026-06-27', ['cólica']), dia('2026-07-25', ['cólica'])])
  ok('ordem da lista de ciclos não muda o padrão', p[0]?.em === 2, JSON.stringify(p))
}

{
  naoQuebra('ciclos com data inválida', () =>
    padraoAntesDaMenstruacao([{ comecou: 'ontem', terminou: null }], []))
  naoQuebra('dias com data inválida', () =>
    padraoAntesDaMenstruacao([{ comecou: '2026-06-01', terminou: null }],
      [{ data: '', sintomas: ['x'], humor: null, desejoAlimentar: [] }]))
  naoQuebra('sintomas não-lista', () =>
    padraoAntesDaMenstruacao([{ comecou: '2026-06-01', terminou: null }],
      [{ data: '2026-05-30', sintomas: null as never, humor: null, desejoAlimentar: [] }]))
}

{
  /* Volume: dois anos de ciclos e um sintoma por dia. */
  const cs = Array.from({ length: 26 }, (_, i) => ({
    comecou: new Date(Date.UTC(2025, 0, 1) + i * 28 * 86400000).toISOString().slice(0, 10),
    terminou: null,
  }))
  const dias = Array.from({ length: 730 }, (_, i) => ({
    data: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    sintomas: ['cólica'],
    humor: 'irritada',
    desejoAlimentar: ['doce'],
  }))
  const t0 = Date.now()
  const p = padraoAntesDaMenstruacao(cs, dias)
  const ms = Date.now() - t0
  ok('26 ciclos e 730 dias produzem padrão', p.length > 0, String(p.length))
  ok(`e sem explodir (${ms} ms)`, ms < LIMITE_MS, `${ms} ms`)
}

console.log('\n9. o aviso, nas bordas')

{
  const P = [{ o_que: 'cólica', em: 3, de: 3 }]
  ok('previsão de 31/02 não vira aviso', avisoDaSemana('2026-02-31', false, P, '2026-02-25') === null,
    JSON.stringify(avisoDaSemana('2026-02-31', false, P, '2026-02-25')))
  naoQuebra('padrão com o_que vazio', () => avisoDaSemana('2026-09-01', false,
    [{ o_que: '', em: 3, de: 3 }], '2026-08-28'))
  naoQuebra('padrão com em maior que de', () => avisoDaSemana('2026-09-01', false,
    [{ o_que: 'x', em: 9, de: 3 }], '2026-08-28'))
  naoQuebra('lista de padrões vazia', () => avisoDaSemana('2026-09-01', false, [], '2026-08-28'))
}

console.log('\n10. a faixa do calendário')

{
  /* Mil dias marcados: a forma de cada um olha só os dois vizinhos, então isto
     tem de ser linear e não quadrático. */
  const grande = new Set(
    Array.from({ length: 1000 }, (_, i) =>
      new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10)),
  )
  const t0 = Date.now()
  for (const d of grande) formaNaFaixa(d, grande)
  ok(`1.000 dias sem explodir (${Date.now() - t0} ms)`, Date.now() - t0 < LIMITE_MS)
}

{
  naoQuebra('forma de data inválida', () => formaNaFaixa('nada', new Set(['nada'])))
  naoQuebra('forma com conjunto vazio', () => formaNaFaixa('2026-08-10', new Set()))
  ok('dia não marcado ainda responde', formaNaFaixa('2026-08-10', new Set(['2026-08-11'])) === 'inicio',
    formaNaFaixa('2026-08-10', new Set(['2026-08-11'])))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
