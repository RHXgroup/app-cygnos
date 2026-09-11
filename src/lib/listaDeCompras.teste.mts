import { listaDeCompras, quantoComprar, secaoDoGrupo, SEM_SECAO } from './listaDeCompras.ts'
import type { PlanoCompleto } from './plano.ts'

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

const item = (
  nome: string,
  gramas: number | null,
  extra: { marca?: string | null; descricao?: string; alimentoId?: number | null; variacoes?: unknown[] } = {},
) => ({
  id: nome,
  alimentoId: extra.alimentoId ?? null,
  nome,
  marca: extra.marca ?? null,
  descricao: extra.descricao ?? (gramas !== null ? gramas + ' g' : '1 unidade'),
  gramasTotais: gramas,
  caloriasPor100g: 100,
  proteinasPor100g: null,
  carboidratosPor100g: null,
  gordurasPor100g: null,
  fibrasPor100g: null,
  variacoes: (extra.variacoes ?? []) as never[],
})

const plano = (refeicoes: { rotulo: string; itens: ReturnType<typeof item>[] }[], dias = 7): PlanoCompleto =>
  ({
    id: 'p1',
    nome: 'Plano',
    observacao: null,
    criadoEm: '2026-09-01',
    ativo: true,
    diasSemana: Array.from({ length: dias }, (_, i) => i) as never,
    refeicoes: refeicoes.map((r, i) => ({ id: 'r' + i, rotulo: r.rotulo, hora: '08:00', itens: r.itens })),
  }) as unknown as PlanoCompleto

const acha = (l: ReturnType<typeof listaDeCompras>, nome: string) =>
  l.find(i => i.nome.toLowerCase() === nome.toLowerCase())!

// ── 1. A conta é da SEMANA ───────────────────────────────────────────────────
{
  /* O ganho que faltava: a lista dizia 40 g de aveia, e ela precisa de 200. */
  const l = listaDeCompras(plano([{ rotulo: 'Café', itens: [item('Aveia em flocos', 40)] }], 5))
  ok('multiplica pelos dias do plano', l[0].gramasNaSemana === 200, String(l[0].gramasNaSemana))
  ok('e conta em quantas refeições aparece', l[0].refeicoes === 1)
}

// ── 2. Alternativa ENTRA, marcada ────────────────────────────────────────────
{
  /* Decisão que veio da outra implementação, e é a certa: sumir com o macarrão
     do "arroz ou macarrão" decide pela pessoa o que ela vai comer. */
  const arroz = item('Arroz', 100, { variacoes: [item('Macarrão', 100)] })
  const l = listaDeCompras(plano([{ rotulo: 'Almoço', itens: [arroz] }], 7))
  ok('a alternativa está na lista', l.length === 2, String(l.length))
  ok('marcada como opcional', acha(l, 'Macarrão').soAlternativa === true)
  ok('e o principal não', acha(l, 'Arroz').soAlternativa === false)
  ok('opcional vai para o fim', l[l.length - 1].nome === 'Macarrão')
}

// ── 3. Uma vez principal, nunca mais opcional ────────────────────────────────
{
  /* Se o arroz é fixo no almoço, comprá-lo não é opcional -- mesmo sendo
     alternativa no jantar. */
  const l = listaDeCompras(plano([
    { rotulo: 'Almoço', itens: [item('Arroz', 100)] },
    { rotulo: 'Jantar', itens: [item('Batata', 150, { variacoes: [item('Arroz', 80)] })] },
  ], 7))
  ok('arroz deixa de ser opcional', acha(l, 'Arroz').soAlternativa === false)
}

// ── 4. O mesmo alimento em duas refeições vira uma linha ─────────────────────
{
  const l = listaDeCompras(plano([
    { rotulo: 'Café', itens: [item('Ovo', 100)] },
    { rotulo: 'Jantar', itens: [item('ovo', 50)] },
  ], 7))
  ok('junta maiúscula com minúscula', l.length === 1, String(l.length))
  ok('somando a semana dos dois', l[0].gramasNaSemana === 1050, String(l[0].gramasNaSemana))
  ok('e sabe que são duas refeições', l[0].refeicoes === 2)
}

// ── 5. Medida caseira continua medida caseira ────────────────────────────────
{
  /* Armadilha 6: inventar 50 g por unidade poria na lista um número que
     ninguém disse. */
  const l = listaDeCompras(plano([{ rotulo: 'Lanche', itens: [item('Banana', null, { descricao: '1 unidade' })] }], 3))
  ok('sem peso não vira grama', l[0].gramasNaSemana === null)
  ok('a medida é contada na semana', l[0].medidas[0].vezes === 3)
  ok('e a linha lê "3× 1 unidade"', quantoComprar(l[0]) === '3× 1 unidade', quantoComprar(l[0]))
}

// ── 6. Peso e medida no mesmo alimento ───────────────────────────────────────
{
  const l = listaDeCompras(plano([
    { rotulo: 'Café', itens: [item('Pão', 50)] },
    { rotulo: 'Lanche', itens: [item('Pão', null, { descricao: '1 fatia' })] },
  ], 7))
  ok('soma o que tem peso e conta o resto',
     quantoComprar(l[0]) === '350 g + 7× 1 fatia', quantoComprar(l[0]))
}

// ── 7. Como se compra ────────────────────────────────────────────────────────
{
  const kg = listaDeCompras(plano([{ rotulo: 'Almoço', itens: [item('Arroz', 200)] }], 7))[0]
  ok('1.400 g vira 1,4 kg', quantoComprar(kg) === '1,4 kg', quantoComprar(kg))

  const redondo = listaDeCompras(plano([{ rotulo: 'Almoço', itens: [item('Feijão', 500)] }], 4))[0]
  ok('2.000 g vira 2 kg, sem casa decimal', quantoComprar(redondo) === '2 kg', quantoComprar(redondo))

  const pouco = listaDeCompras(plano([{ rotulo: 'Café', itens: [item('Café em pó', 12)] }], 7))[0]
  ok('84 g arredonda para 80 g', quantoComprar(pouco) === '80 g', quantoComprar(pouco))
}

// ── 8. As seções, e a ordem do corredor ──────────────────────────────────────
{
  ok('fruta é hortifrúti', secaoDoGrupo('Frutas e derivados') === 'Hortifrúti')
  ok('leite é laticínios', secaoDoGrupo('Leite e derivados') === 'Laticínios e frios')
  /* Grupo fora do mapa não pode chutar corredor: mandar a pessoa ao corredor
     errado é pior do que não dizer corredor nenhum. */
  ok('grupo desconhecido cai em Outros', secaoDoGrupo('Grupo que ninguém viu') === SEM_SECAO)
  ok('sem grupo também', secaoDoGrupo(null) === SEM_SECAO)

  const l = listaDeCompras(
    plano([{ rotulo: 'Almoço', itens: [
      item('Arroz', 100, { alimentoId: 1 }),
      item('Alface', 50, { alimentoId: 2 }),
      item('Coisa nova', 10, { alimentoId: 3 }),
    ] }], 7),
    id => (id === 1 ? 'Cereais e derivados' : id === 2 ? 'Verduras, hortaliças e derivados' : null),
  )
  ok('hortifrúti vem antes de cereais', l[0].nome === 'Alface' && l[1].nome === 'Arroz',
     l.map(i => i.nome + '/' + i.secao).join(' > '))
  ok('e o sem seção fica por último', l[2].nome === 'Coisa nova' && l[2].secao === SEM_SECAO)
}

// ── 9. O vazio ───────────────────────────────────────────────────────────────
{
  ok('sem plano, lista vazia', listaDeCompras(null).length === 0)
  ok('plano sem refeição, lista vazia', listaDeCompras(plano([], 7)).length === 0)
  /* Plano sem dia marcado vale para a semana inteira -- a mesma leitura que a
     tela do plano faz. Duas leituras do mesmo campo dariam dois números. */
  const semDias = listaDeCompras(plano([{ rotulo: 'Café', itens: [item('Aveia', 30)] }], 0))
  ok('plano sem dias marcados conta sete', semDias[0].gramasNaSemana === 210,
     String(semDias[0].gramasNaSemana))
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
