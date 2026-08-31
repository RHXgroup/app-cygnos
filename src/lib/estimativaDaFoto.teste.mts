/* A foto virou uma LISTA de alimentos: o que o servidor manda, o que a pessoa
 * corrige, e o que vai para o diario.
 *
 * O que se exercita aqui e o que chega TORTO: a resposta vem de um modelo, e
 * modelo devolve o que quiser. Nome vazio, numero como texto, negativo, lista
 * que nao e lista, nove itens quando o teto e oito.
 *
 * Rode com: node --experimental-strip-types src/lib/estimativaDaFoto.teste.mts */

import {
  FRACOES_DA_PORCAO,
  MAXIMO_DE_ITENS,
  comFator,
  escolhidos,
  itensDaEstimativa,
  itensDaResposta,
  linhasIniciais,
  paraGravar,
  totaisDaFoto,
  type Estimativa,
  type ItemDaFoto,
  type LinhaEscolhida,
} from './estimativaDaFoto.ts'

let passaram = 0
let falharam = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passaram++
    console.log('  ok    ' + nome)
  } else {
    falharam++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const item = (nome: string, kcal: number | null = 100, porcao = '1 porcao'): ItemDaFoto => ({
  nome,
  porcaoEstimada: porcao,
  calorias: kcal,
  proteinas: 10,
  carboidratos: 20,
  gorduras: 5,
  fibras: 2,
})

const est = (itens: ItemDaFoto[]): Estimativa => ({
  descricao: 'Almoco',
  itens,
  confianca: 'alta',
  usouContexto: false,
})

/* ────────────────────────────────────────────────────────────────────────────
   O que o servidor manda
   ──────────────────────────────────────────────────────────────────────────*/
console.log('\nA resposta do servidor')

{
  const r = itensDaResposta([
    { nome: 'Arroz branco', porcao_estimada: '4 colheres', calorias: 210, proteinas: 4, carboidratos: 45, gorduras: 0.5, fibras: 1 },
    { nome: 'Feijao carioca', porcao_estimada: '1 concha', calorias: 130, proteinas: 8, carboidratos: 22, gorduras: 1, fibras: 6 },
  ])
  ok('separa dois alimentos', r.length === 2)
  ok('le o nome', r[0].nome === 'Arroz branco')
  ok('le a porcao', r[1].porcaoEstimada === '1 concha')
  ok('le decimal', r[0].gorduras === 0.5)
}

{
  /* O motivo de nao existir `as ItemDaFoto[]` cru: o dia em que o contrato
     mudar, a tela desenharia "undefined" no lugar do alimento. */
  ok('lista ausente vira lista vazia', itensDaResposta(undefined).length === 0)
  ok('nulo vira lista vazia', itensDaResposta(null).length === 0)
  ok('objeto no lugar da lista vira vazia', itensDaResposta({ nome: 'Arroz' }).length === 0)
  ok('texto no lugar da lista vira vazia', itensDaResposta('arroz').length === 0)
  ok('lista vazia continua vazia', itensDaResposta([]).length === 0)
}

{
  /* Linha em branco no diario e pior do que um item a menos. */
  const r = itensDaResposta([
    { nome: '', calorias: 100 },
    { nome: '   ', calorias: 100 },
    { calorias: 100 },
    { nome: 'Frango', calorias: 100 },
    null,
    'arroz',
    42,
  ])
  ok('descarta item sem nome', r.length === 1)
  ok('e mantem o que tem nome', r[0].nome === 'Frango')
}

{
  const r = itensDaResposta([{ nome: '  Arroz  ', porcao_estimada: '  4 colheres  ' }])
  ok('apara o nome', r[0].nome === 'Arroz')
  ok('apara a porcao', r[0].porcaoEstimada === '4 colheres')
}

{
  /* Item 6: null e resposta, zero e mentira. */
  const r = itensDaResposta([{ nome: 'Molho', calorias: null, proteinas: undefined }])
  ok('null continua null', r[0].calorias === null)
  ok('ausente vira null, e nao zero', r[0].proteinas === null)
  ok('porcao ausente vira texto vazio', r[0].porcaoEstimada === '')
}

{
  /* numeric do Postgres e alguns modelos devolvem numero como texto. */
  const r = itensDaResposta([{ nome: 'Arroz', calorias: '210', proteinas: '4.5' }])
  ok('numero em texto vira numero', r[0].calorias === 210)
  ok('decimal em texto tambem', r[0].proteinas === 4.5)
  ok('e nao e o texto', typeof r[0].calorias === 'number')
}

{
  /* Somar um negativo derruba o total do prato abaixo do que ele tem -- foi
     exatamente o defeito que a sonda achou em `trocaNoPlano`. */
  const r = itensDaResposta([
    { nome: 'Arroz', calorias: -210, proteinas: -1, carboidratos: NaN, gorduras: Infinity, fibras: 'muita' },
  ])
  ok('negativo vira desconhecido', r[0].calorias === null)
  ok('negativo em proteina tambem', r[0].proteinas === null)
  ok('NaN vira desconhecido', r[0].carboidratos === null)
  ok('Infinity vira desconhecido', r[0].gorduras === null)
  ok('texto que nao e numero vira desconhecido', r[0].fibras === null)
}

{
  ok('zero e um fato, e nao desconhecido', itensDaResposta([{ nome: 'Cha', calorias: 0 }])[0].calorias === 0)
}

{
  /* Instrucao e pedido; validacao e garantia. */
  const muitos = Array.from({ length: 30 }, (_, i) => ({ nome: `Item ${i}`, calorias: 10 }))
  const r = itensDaResposta(muitos)
  ok('corta no teto de itens', r.length === MAXIMO_DE_ITENS)
  ok('e mantem os primeiros', r[0].nome === 'Item 0')
}

{
  /* O teto conta os que FICARAM, e nao as linhas que vieram: se as tres
     primeiras vierem sem nome, ainda cabem oito de verdade. */
  const bruto = [{ nome: '' }, { nome: '' }, { nome: '' }, ...Array.from({ length: 10 }, (_, i) => ({ nome: `Bom ${i}` }))]
  ok('o teto conta item valido', itensDaResposta(bruto).length === MAXIMO_DE_ITENS)
}

{
  const longo = 'a'.repeat(500)
  const r = itensDaResposta([{ nome: longo, porcao_estimada: longo }])
  ok('nome gigante e cortado', r[0].nome.length === 80)
  ok('porcao gigante tambem', r[0].porcaoEstimada.length === 60)
}

/* ────────────────────────────────────────────────────────────────────────────
   Quanto ela comeu
   ──────────────────────────────────────────────────────────────────────────*/
console.log('\nA fracao da porcao')

{
  const meio = comFator(item('Arroz', 210), 0.5)
  ok('metade divide a caloria', meio.calorias === 105)
  ok('metade divide a proteina', meio.proteinas === 5)
  ok('e o texto acompanha o numero', meio.porcaoEstimada === 'metade de 1 porcao')
}

{
  const dobro = comFator(item('Arroz', 210), 2)
  ok('o dobro dobra', dobro.calorias === 420)
  ok('e diz o dobro', dobro.porcaoEstimada === 'o dobro de 1 porcao')
}

{
  const igual = item('Arroz', 210)
  ok('fator 1 devolve o mesmo objeto', comFator(igual, 1) === igual)
  ok('fator zero nao zera o item', comFator(igual, 0) === igual)
  ok('fator negativo nao inverte', comFator(igual, -1) === igual)
  ok('NaN nao apaga o item', comFator(igual, NaN) === igual)
  ok('Infinity nao estoura', comFator(igual, Infinity) === igual)
}

{
  /* Item 6 de novo: multiplicar desconhecido nao produz numero. */
  const semNada = comFator({ ...item('Molho', null), proteinas: null }, 0.5)
  ok('null vezes fator continua null', semNada.calorias === null)
  ok('e a proteina tambem', semNada.proteinas === null)
}

{
  const semTexto = comFator(item('Arroz', 100, ''), 0.5)
  ok('sem porcao escrita, nao inventa texto', semTexto.porcaoEstimada === '')
}

{
  /* Um fator fora da escada nao tem rotulo. O numero muda; o texto fica como
     estava, em vez de virar "undefined de 1 porcao". */
  const estranho = comFator(item('Arroz', 100), 0.7)
  ok('fator fora da escada ainda reescala', estranho.calorias === 70)
  ok('e nao escreve undefined', estranho.porcaoEstimada === '1 porcao')
}

{
  ok('a escada tem quatro degraus', FRACOES_DA_PORCAO.length === 4)
  ok('e um deles e "tudo" valendo 1', FRACOES_DA_PORCAO.some(f => f.fator === 1 && f.rotulo === 'tudo'))
}

/* ────────────────────────────────────────────────────────────────────────────
   O total
   ──────────────────────────────────────────────────────────────────────────*/
console.log('\nO total do prato')

{
  const t = totaisDaFoto([item('Arroz', 210), item('Feijao', 130), item('Frango', 260)])
  ok('soma as calorias', t.calorias === 600)
  ok('soma as proteinas', t.proteinas === 30)
  ok('nenhum sem caloria', t.semCalorias === 0)
}

{
  /* Nulo quando NENHUM informou -- diferente de todos terem informado zero. */
  const t = totaisDaFoto([item('Molho', null), item('Tempero', null)])
  ok('todos desconhecidos somam null', t.calorias === null)
  ok('e a folha sabe quantos foram', t.semCalorias === 2)
}

{
  const t = totaisDaFoto([item('Arroz', 210), item('Molho', null)])
  ok('um desconhecido nao zera a soma', t.calorias === 210)
  ok('e a soma sai por baixo, declarada', t.semCalorias === 1)
}

{
  ok('lista vazia soma null', totaisDaFoto([]).calorias === null)
  ok('e nenhum sem caloria', totaisDaFoto([]).semCalorias === 0)
}

{
  const t = totaisDaFoto([item('Cha', 0), item('Agua', 0)])
  ok('zero medido soma zero, e nao null', t.calorias === 0)
  ok('e zero nao conta como desconhecido', t.semCalorias === 0)
}

{
  /* O total mostrado na folha e um inteiro. Somar decimais e arredondar no fim
     e diferente de arredondar cada um -- e o que a tela mostra e este. */
  const t = totaisDaFoto([item('A', 10.4), item('B', 10.4)])
  ok('o total arredonda uma vez so', t.calorias === 21)
}

/* ────────────────────────────────────────────────────────────────────────────
   O que ela escolheu
   ──────────────────────────────────────────────────────────────────────────*/
console.log('\nA escolha, e o que vai para o diario')

{
  /* `totaisDaFoto` e exportada e recebe `ItemDaFoto[]` -- ela nao pode supor
     que quem chama ja passou pela validacao da resposta. Hoje a tela passa,
     mas uma tela que monte o item a mao (valores digitados, por exemplo) nao
     passaria, e um Infinity aqui chegaria a tela como "Infinity kcal".

     Este caso existe para a guarda do RESULTADO nao virar codigo morto: sem
     ele, ninguem consegue dizer se ela esta viva. */
  const forjado = { ...item('Forjado', Number.MAX_VALUE), proteinas: Number.MAX_VALUE }
  const t = totaisDaFoto([forjado, item('Outro', Number.MAX_VALUE)])
  ok('soma que estoura vira desconhecido, e nao Infinity', t.calorias === null)
  ok('e nao escapa como Infinity', t.calorias !== Infinity)
}

{
  /* A coluna tem `check (fator_correcao between 0.1 and 5)`. Fora da faixa nao
     e dado torto gravado calado: e o INSERT recusado -- e o insert e o da
     refeicao. A pessoa perderia o almoco por causa de um numero que so serve
     para calibrar a proxima foto. */
  const fora: LinhaEscolhida[] = [
    { item: item('A', 100), fator: 9, dentro: true },
    { item: item('B', 100), fator: 0.01, dentro: true },
    { item: item('C', 100), fator: Infinity, dentro: true },
    { item: item('D', 100), fator: NaN, dentro: true },
  ]
  const g = paraGravar(fora)
  ok('fator alto demais nao vira correcao', g[0].fatorCorrecao === null)
  ok('fator baixo demais tambem nao', g[1].fatorCorrecao === null)
  ok('Infinity tambem nao', g[2].fatorCorrecao === null)
  ok('NaN tambem nao', g[3].fatorCorrecao === null)
  ok('e o alimento entra do mesmo jeito', g.length === 4)
}

{
  /* As bordas da faixa ENTRAM: o `check` do banco e inclusivo, e recusar aqui
     o que o banco aceita jogaria fora correcao boa. */
  const borda: LinhaEscolhida[] = [
    { item: item('A', 100), fator: 0.1, dentro: true },
    { item: item('B', 100), fator: 5, dentro: true },
  ]
  const g = paraGravar(borda)
  ok('a borda de baixo entra', g[0].fatorCorrecao === 0.1)
  ok('a borda de cima entra', g[1].fatorCorrecao === 5)
}

{
  /* Um numero grande vezes um fator grande estoura, e as DUAS entradas eram
     validas -- e o motivo de conferir o resultado, e nao so a entrada. */
  const grande = comFator(item('Grande', Number.MAX_VALUE), 2)
  ok('reescalar o que estouraria vira desconhecido', grande.calorias === null)
}

{
  const linhas = linhasIniciais(est([item('Arroz'), item('Feijao')]))
  ok('todos comecam marcados', linhas.every(l => l.dentro))
  ok('e inteiros', linhas.every(l => l.fator === 1))
  ok('uma linha por alimento', linhas.length === 2)
}

{
  ok('foto sem alimento nao gera linha', linhasIniciais(est([])).length === 0)
}

{
  const linhas: LinhaEscolhida[] = [
    { item: item('Arroz', 210), fator: 0.5, dentro: true },
    { item: item('Salada', 40), fator: 1, dentro: false },
    { item: item('Frango', 260), fator: 1, dentro: true },
  ]
  const fica = escolhidos(linhas)
  ok('o que ela tirou nao entra', fica.length === 2)
  ok('e o que ficou vem reescalado', fica[0].calorias === 105)
  ok('a ordem se mantem', fica[1].nome === 'Frango')
  ok('o total e do que ficou', totaisDaFoto(fica).calorias === 365)
}

{
  const linhas: LinhaEscolhida[] = [
    { item: item('Arroz'), fator: 1, dentro: false },
    { item: item('Feijao'), fator: 1, dentro: false },
  ]
  ok('tirar tudo deixa lista vazia', escolhidos(linhas).length === 0)
  ok('e nada para gravar', paraGravar(linhas).length === 0)
}

{
  /* A correcao e o sinal mais valioso que existe, e ia fora. */
  const linhas: LinhaEscolhida[] = [
    { item: item('Arroz', 210), fator: 0.5, dentro: true },
    { item: item('Feijao', 130), fator: 1, dentro: true },
    { item: item('Frango', 260), fator: 2, dentro: true },
  ]
  const g = paraGravar(linhas)
  ok('guarda a correcao de quem corrigiu', g[0].fatorCorrecao === 0.5)
  ok('e o dobro tambem', g[2].fatorCorrecao === 2)
  ok('aceitar como veio e null, e nao 1', g[1].fatorCorrecao === null)
  ok('o item vai reescalado junto', g[0].item.calorias === 105)
  ok('e o texto do item acompanha', g[2].item.porcaoEstimada === 'o dobro de 1 porcao')
}

{
  /* Tirar um item nao e correcao de porcao: e a IA ter visto o alimento errado.
     Guardar isso como fator ensinaria o modelo a estimar porcoes menores DE
     TUDO -- e quem tirasse a salada que nao comeu envenenaria a propria media. */
  const linhas: LinhaEscolhida[] = [
    { item: item('Arroz', 210), fator: 1, dentro: true },
    { item: item('Salada', 40), fator: 0.5, dentro: false },
  ]
  const g = paraGravar(linhas)
  ok('o item tirado nao vira correcao', g.length === 1)
  ok('e o que sobrou nao herda o fator dele', g[0].fatorCorrecao === null)
}

{
  /* O par item/correcao sai do MESMO filtro. Duas listas alinhadas por indice e
     como a correcao de um alimento acaba gravada na linha de outro. */
  const linhas: LinhaEscolhida[] = [
    { item: item('Fora', 100), fator: 2, dentro: false },
    { item: item('Dentro', 100), fator: 0.5, dentro: true },
  ]
  const g = paraGravar(linhas)
  ok('a correcao fica no item certo', g[0].item.nome === 'Dentro' && g[0].fatorCorrecao === 0.5)
}

{
  const linhas = linhasIniciais(est([item('Arroz', 210), item('Feijao', 130)]))
  const g = paraGravar(linhas)
  ok('quem nao mexeu em nada grava sem correcao', g.every(x => x.fatorCorrecao === null))
  ok('e todos os itens entram', g.length === 2)
}

/* ────────────────────────────────────────────────────────────────────────────
   Os dois lados podem subir separados
   ──────────────────────────────────────────────────────────────────────────*/
console.log('\nA funcao antiga, e a nova')

{
  const nova = {
    descricao: 'Almoco',
    itens: [{ nome: 'Arroz', calorias: 210 }, { nome: 'Feijao', calorias: 130 }],
    confianca: 'alta',
  }
  const r = itensDaEstimativa(nova)
  ok('le a lista da funcao nova', r.length === 2)
  ok('e nao cai no formato antigo', r[0].nome === 'Arroz')
}

{
  /* A versao que esta nas lojas fala com esta funcao. Se o app so soubesse ler
     a lista, toda foto voltaria "nao identifiquei" ate a funcao nova subir. */
  const antiga = {
    descricao: 'Prato feito',
    porcao_estimada: '1 prato ~400 g',
    calorias: 620,
    proteinas: 38,
    carboidratos: 70,
    gorduras: 18,
    fibras: 9,
    confianca: 'media',
  }
  const r = itensDaEstimativa(antiga)
  ok('entende a resposta da funcao antiga', r.length === 1)
  ok('a descricao vira o nome do item', r[0].nome === 'Prato feito')
  ok('a porcao vem junto', r[0].porcaoEstimada === '1 prato ~400 g')
  ok('e os numeros tambem', r[0].calorias === 620 && r[0].fibras === 9)
}

{
  /* A funcao ANTIGA devolvia "Alimento" com tudo nulo quando nao achava nada.
     Gravar isso poria uma linha vazia no diario -- pior do que a frase que
     explica o que houve. */
  const semNada = { descricao: 'Alimento', porcao_estimada: '', calorias: null, proteinas: null }
  ok('nome sem nutriente nenhum nao vira item', itensDaEstimativa(semNada).length === 0)
}

{
  const vazia = { descricao: 'Almoco', itens: [], confianca: 'baixa' }
  ok('lista vazia e sem campo antigo nao vira item', itensDaEstimativa(vazia).length === 0)
}

{
  ok('resposta nula nao quebra', itensDaEstimativa(null).length === 0)
  ok('texto no lugar da resposta tambem nao', itensDaEstimativa('erro').length === 0)
  ok('resposta vazia nao quebra', itensDaEstimativa({}).length === 0)
}

{
  /* Zero e um fato: agua tem 0 kcal. A resposta antiga com zero E um item. */
  const zero = { descricao: 'Agua', porcao_estimada: '1 copo', calorias: 0 }
  ok('zero conta como numero, e vira item', itensDaEstimativa(zero).length === 1)
}

{
  /* Se os dois formatos vierem juntos -- que e o que a funcao nova manda, para
     o app das lojas continuar funcionando -- a LISTA ganha. Ler os dois
     duplicaria o prato inteiro. */
  const ambos = {
    descricao: 'Almoco',
    itens: [{ nome: 'Arroz', calorias: 210 }],
    calorias: 210,
    porcao_estimada: 'Arroz',
  }
  const r = itensDaEstimativa(ambos)
  ok('com os dois formatos, a lista ganha', r.length === 1 && r[0].nome === 'Arroz')
  ok('e o total nao dobra', totaisDaFoto(r).calorias === 210)
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
