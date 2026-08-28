import { montar, termosParaBuscar } from './sugestaoParaPlano.ts'

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok   ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const alimento = (id: number, nome: string, kcal: number | null = 100) => ({
  id,
  nome,
  marca: null,
  calorias: kcal,
  proteinas: 10,
  carboidratos: 20,
  gorduras: 5,
  fibras: 2,
}) as any

// ── 1. Caso feliz: dois itens, um achado na base e um não ────────────────────
{
  const bruto = {
    kcal_alvo: 2200,
    observacao: '  Plano simples, com comida de casa.  ',
    alerta: null,
    refeicoes: [
      {
        nome: 'Café da manhã',
        horario: '07:30',
        itens: [
          {
            tipo: 'alimento', busca: 'Ovo cozido', quantidade_g: 100, medida_caseira: '2 unidades',
            estimativa_100g: { kcal: 155, proteina_g: 13, carboidrato_g: 1.1, gordura_g: 11, fibra_g: 0 },
          },
          { tipo: 'texto', descricao: 'Café sem açúcar' },
          {
            tipo: 'alimento', busca: 'Pão australiano', quantidade_g: 50,
            estimativa_100g: { kcal: 280, proteina_g: 9, carboidrato_g: 52, gordura_g: 4, fibra_g: 3 },
          },
        ],
      },
    ],
  }

  const termos = termosParaBuscar(bruto)
  console.log('\n1. caso feliz')
  ok('termos alinham com a posicao dos itens', JSON.stringify(termos) === JSON.stringify([['Ovo cozido', null, 'Pão australiano']]), JSON.stringify(termos))

  const r = montar(bruto, [[alimento(7, 'Ovo, de galinha, inteiro, cozido', 146), null, null]])!
  ok('devolveu plano', !!r)
  ok('uma refeicao', r.refeicoes.length === 1)
  ok('texto NAO virou item', r.refeicoes[0].itens.length === 2, String(r.refeicoes[0].itens.length))
  ok('item achado usa o nome DA BASE', r.refeicoes[0].itens[0].nome.startsWith('Ovo, de galinha'), r.refeicoes[0].itens[0].nome)
  ok('item achado usa kcal DA BASE, nao a da IA', r.refeicoes[0].itens[0].caloriasPor100g === 146)
  ok('item achado nao e estimado', r.refeicoes[0].itens[0].estimado === false)
  ok('descricao junta medida e peso', r.refeicoes[0].itens[0].descricao === '2 unidades (100 g)', r.refeicoes[0].itens[0].descricao)
  ok('item nao achado usa a estimativa da IA', r.refeicoes[0].itens[1].caloriasPor100g === 280)
  ok('item nao achado fica sem id', r.refeicoes[0].itens[1].alimentoId === null)
  ok('item nao achado e marcado estimado', r.refeicoes[0].itens[1].estimado === true)
  ok('descricao so com peso quando nao ha medida', r.refeicoes[0].itens[1].descricao === '50 g', r.refeicoes[0].itens[1].descricao)
  ok('contou 1 estimado', r.estimados === 1, String(r.estimados))
  ok('observacao vem sem espaco sobrando', r.observacao === 'Plano simples, com comida de casa.')
  ok('kcal_alvo virou numero', r.kcalAlvo === 2200)
}

// ── 2. Horário que não é horário ─────────────────────────────────────────────
{
  console.log('\n2. horario invalido cai na reserva')
  const item = { tipo: 'alimento', busca: 'Arroz', quantidade_g: 100, estimativa_100g: { kcal: 128 } }
  const casos: [unknown, string][] = [
    ['07:30', '07:30'],
    ['7h', '07:30'],
    ['manhã', '07:30'],
    ['25:00', '07:30'],
    ['07:60', '07:30'],
    ['07:30 às 08:00', '07:30'],
    [null, '07:30'],
    [undefined, '07:30'],
    ['23:59', '23:59'],
    ['00:00', '00:00'],
  ]
  for (const [entrada, esperado] of casos) {
    const r = montar({ refeicoes: [{ nome: 'R', horario: entrada as string, itens: [item] }] }, [[null]])!
    ok(JSON.stringify(entrada) + ' -> ' + esperado, r.refeicoes[0].hora === esperado, r.refeicoes[0].hora)
  }
}

// ── 3. Reserva de horário espalha pelo dia ───────────────────────────────────
{
  console.log('\n3. horarios de reserva espalham pelo dia')
  const item = { tipo: 'alimento', busca: 'Arroz', quantidade_g: 100, estimativa_100g: { kcal: 128 } }
  const bruto = { refeicoes: [0, 1, 2, 3, 4].map(() => ({ nome: 'R', horario: 'qualquer', itens: [item] })) }
  const r = montar(bruto, [[null], [null], [null], [null], [null]])!
  const horas = r.refeicoes.map(x => x.hora).join(',')
  ok('cinco horarios diferentes', horas === '07:30,10:00,12:30,15:30,19:00', horas)
}

// ── 4. Números como string, vírgula decimal ──────────────────────────────────
{
  console.log('\n4. numeros vindos como string')
  const bruto = {
    kcal_alvo: '2200',
    refeicoes: [{
      nome: 'R', horario: '08:00',
      itens: [{
        tipo: 'alimento', busca: 'Azeite', quantidade_g: '12,5',
        estimativa_100g: { kcal: '884', proteina_g: '0', carboidrato_g: null, gordura_g: '100', fibra_g: '' },
      }],
    }],
  }
  const r = montar(bruto, [[null]])!
  ok('kcal_alvo string vira numero', r.kcalAlvo === 2200)
  ok('quantidade com virgula vira 12.5', r.refeicoes[0].itens[0].gramasTotais === 12.5, String(r.refeicoes[0].itens[0].gramasTotais))
  ok('kcal string vira numero', r.refeicoes[0].itens[0].caloriasPor100g === 884)
  ok('zero continua zero, e nao null', r.refeicoes[0].itens[0].proteinasPor100g === 0)
  ok('null continua null', r.refeicoes[0].itens[0].carboidratosPor100g === null)
  ok('string vazia vira null, e nao zero', r.refeicoes[0].itens[0].fibrasPor100g === null, String(r.refeicoes[0].itens[0].fibrasPor100g))
}

// ── 5. Lixo e formatos errados não derrubam ──────────────────────────────────
{
  console.log('\n5. entrada torta devolve null em vez de estourar')
  ok('objeto vazio', montar({} as any, []) === null)
  ok('refeicoes ausente', montar({ kcal_alvo: 2000 } as any, []) === null)
  ok('refeicoes nao e array', montar({ refeicoes: 'nada' } as any, []) === null)
  ok('refeicoes vazio', montar({ refeicoes: [] }, []) === null)
  ok('so itens de texto', montar({ refeicoes: [{ nome: 'R', itens: [{ tipo: 'texto', descricao: 'agua' }] }] }, [[null]]) === null)
  ok('item sem busca', montar({ refeicoes: [{ nome: 'R', itens: [{ tipo: 'alimento', quantidade_g: 10 }] }] }, [[null]]) === null)
  ok('item com busca em branco', montar({ refeicoes: [{ nome: 'R', itens: [{ tipo: 'alimento', busca: '   ' }] }] }, [[null]]) === null)
  ok('itens ausente na refeicao', montar({ refeicoes: [{ nome: 'R' }] }, [[]]) === null)
  ok('achados menor que os itens', (() => {
    const r = montar({ refeicoes: [{ nome: 'R', itens: [{ tipo: 'alimento', busca: 'Arroz', quantidade_g: 100 }] }] }, [])
    return r !== null && r.refeicoes[0].itens[0].estimado === true
  })())
}

// ── 6. Refeição sem item some, as com item ficam ─────────────────────────────
{
  console.log('\n6. refeicao vazia sai da lista')
  const comida = { tipo: 'alimento', busca: 'Arroz', quantidade_g: 100, estimativa_100g: { kcal: 128 } }
  const bruto = {
    refeicoes: [
      { nome: 'Café', horario: '07:00', itens: [comida] },
      { nome: 'Lanche', horario: '10:00', itens: [{ tipo: 'texto', descricao: 'Chá' }] },
      { nome: 'Almoço', horario: '12:00', itens: [comida] },
    ],
  }
  const r = montar(bruto, [[null], [null], [null]])!
  ok('duas refeicoes sobraram', r.refeicoes.length === 2, String(r.refeicoes.length))
  ok('a do meio saiu', r.refeicoes.map(x => x.rotulo).join(',') === 'Café,Almoço', r.refeicoes.map(x => x.rotulo).join(','))
}

// ── 7. Nome de refeição ausente ganha rótulo ─────────────────────────────────
{
  console.log('\n7. rotulo ausente')
  const comida = { tipo: 'alimento', busca: 'Arroz', quantidade_g: 100, estimativa_100g: { kcal: 128 } }
  const r = montar({ refeicoes: [{ horario: '08:00', itens: [comida] }, { nome: '   ', horario: '12:00', itens: [comida] }] }, [[null], [null]])!
  ok('primeira vira "Refeição 1"', r.refeicoes[0].rotulo === 'Refeição 1', r.refeicoes[0].rotulo)
  ok('nome so com espaco vira "Refeição 2"', r.refeicoes[1].rotulo === 'Refeição 2', r.refeicoes[1].rotulo)
}

// ── 8. Alerta ────────────────────────────────────────────────────────────────
{
  console.log('\n8. alerta')
  const comida = { tipo: 'alimento', busca: 'Arroz', quantidade_g: 100, estimativa_100g: { kcal: 128 } }
  const base = (alerta: unknown) => montar({ alerta, refeicoes: [{ nome: 'R', horario: '08:00', itens: [comida] }] } as any, [[null]])!
  ok('null continua null', base(null).alerta === null)
  ok('string vazia vira null', base('').alerta === null)
  ok('so espaco vira null', base('   ').alerta === null)
  ok('texto de verdade passa', base('As metas nao fecham.').alerta === 'As metas nao fecham.')
}

// ── 9. Item sem quantidade nenhuma ───────────────────────────────────────────
{
  console.log('\n9. item sem peso')
  const r = montar({ refeicoes: [{ nome: 'R', horario: '08:00', itens: [{ tipo: 'alimento', busca: 'Sal', estimativa_100g: { kcal: 0 } }] }] }, [[null]])!
  ok('gramas fica null, e nao zero', r.refeicoes[0].itens[0].gramasTotais === null)
  ok('descricao fica vazia', r.refeicoes[0].itens[0].descricao === '', JSON.stringify(r.refeicoes[0].itens[0].descricao))
  ok('kcal zero continua zero', r.refeicoes[0].itens[0].caloriasPor100g === 0)
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
