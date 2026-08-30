import { rotinaDaIA } from './rotinaDaIA.ts'

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

/* A resposta que a IA dá quando tudo dá certo, no formato exato do prompt. */
const BOA = {
  divisao: 'Full Body',
  nivel: 'iniciante',
  dias: {
    seg: {
      foco: 'Corpo inteiro',
      duracao_min: 60,
      exercicios: [
        { nome: 'Agachamento livre', series: 3, reps: '8-12', descanso_seg: 90 },
        { nome: 'Supino reto com barra', series: 3, reps: '10', descanso_seg: 60 },
      ],
    },
    qui: {
      foco: 'Corpo inteiro',
      duracao_min: 60,
      exercicios: [{ nome: 'Remada curvada', series: 4, reps: 'até a falha', descanso_seg: 120 }],
    },
  },
  observacao: 'Comece leve e aumente o peso quando as repetições ficarem fáceis.',
}

// ── 1. O caminho feliz ───────────────────────────────────────────────────────
{
  console.log('\n1. a resposta no formato certo')
  const r = rotinaDaIA(BOA)
  ok('traz os três exercícios', r.exercicios.length === 3, String(r.exercicios.length))
  ok('sem problema nenhum', r.problemas.length === 0, JSON.stringify(r.problemas))
  ok('segunda vira dia 1', r.exercicios[0].dia === 1, String(r.exercicios[0].dia))
  ok('quinta vira dia 4', r.exercicios[2].dia === 4, String(r.exercicios[2].dia))
  ok('guarda a divisão', r.divisao === 'Full Body', String(r.divisao))
  ok('guarda a observação', (r.observacao ?? '').startsWith('Comece leve'))
}

// ── 2. A ordem vem da lista, não de um campo ─────────────────────────────────
{
  console.log('\n2. a ordem dentro do dia')
  const r = rotinaDaIA(BOA)
  const seg = r.exercicios.filter(e => e.dia === 1)
  ok('primeiro exercício é ordem 0', seg[0].ordem === 0, String(seg[0].ordem))
  ok('segundo é ordem 1', seg[1].ordem === 1, String(seg[1].ordem))
  ok('cada dia recomeça do zero', r.exercicios.filter(e => e.dia === 4)[0].ordem === 0)
}

// ── 3. Repetição é texto, e continua texto ───────────────────────────────────
{
  console.log('\n3. a repetição')
  const r = rotinaDaIA(BOA)
  ok('"8-12" sobrevive', r.exercicios[0].repeticoes === '8-12', String(r.exercicios[0].repeticoes))
  ok('"até a falha" sobrevive', r.exercicios[2].repeticoes === 'até a falha')

  const numero = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', reps: 10 }] } } })
  ok('número vira texto', numero.exercicios[0].repeticoes === '10', String(numero.exercicios[0].repeticoes))

  const vazio = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca' }] } } })
  ok('ausente vira null', vazio.exercicios[0].repeticoes === null)
}

// ── 4. Série: número de verdade, ou nada ─────────────────────────────────────
{
  console.log('\n4. a série')
  const casos: [unknown, number | null][] = [
    [3, 3],
    ['4', 4],
    ['3 a 4', null],     // intervalo NÃO vira o primeiro número
    ['muitas', null],
    [0, null],           // zero série não é série
    [99, null],          // acima do limite não é plausível
    [null, null],
    ['', null],
  ]
  for (const [entrada, esperado] of casos) {
    const r = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', series: entrada }] } } })
    ok(
      `series ${JSON.stringify(entrada)} vira ${esperado}`,
      r.exercicios[0]?.series === esperado,
      String(r.exercicios[0]?.series),
    )
  }
}

// ── 5. O descanso vira observação, e só quando faz sentido ───────────────────
{
  console.log('\n5. o descanso')
  const r = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', descanso_seg: 90 }] } } })
  ok('90s vira observação', r.exercicios[0].observacao === 'Descanso 90s', String(r.exercicios[0].observacao))

  const absurdo = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', descanso_seg: 9999 }] } } })
  ok('descanso absurdo não entra', absurdo.exercicios[0].observacao === null)

  const sem = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca' }] } } })
  ok('sem descanso não inventa', sem.exercicios[0].observacao === null)
}

// ── 6. A carga nunca vem da IA ───────────────────────────────────────────────
{
  console.log('\n6. a carga')
  const r = rotinaDaIA({
    dias: { seg: { exercicios: [{ nome: 'Supino', series: 3 }] } },
  })
  ok('carga fica em branco', r.exercicios[0].cargaKg === null)
}

// ── 7. Dia que a IA escreveu de outro jeito ──────────────────────────────────
{
  console.log('\n7. os nomes de dia')
  const casos: [string, number | null][] = [
    ['seg', 1], ['SEG', 1], ['sáb', 6], ['sab', 6],
    ['segunda', 1], ['domingo', 0], ['terça', 2],
    ['lunes', null], ['dia1', null],
  ]
  for (const [chave, esperado] of casos) {
    const r = rotinaDaIA({ dias: { [chave]: { exercicios: [{ nome: 'Rosca' }] } } })
    const achado = r.exercicios[0]?.dia ?? null
    ok(`"${chave}" vira ${esperado}`, achado === esperado, String(achado))
  }
}

// ── 8. O que está quebrado é contado, não engolido ───────────────────────────
{
  console.log('\n8. o que se perde, e o aviso')

  const semNome = rotinaDaIA({
    dias: { seg: { exercicios: [{ nome: '' }, { nome: 'Rosca direta' }] } },
  })
  ok('exercício sem nome sai', semNome.exercicios.length === 1, String(semNome.exercicios.length))
  ok('e é anotado', semNome.problemas.length === 1, JSON.stringify(semNome.problemas))

  const diaVazio = rotinaDaIA({ dias: { seg: { exercicios: [] }, ter: { exercicios: [{ nome: 'Rosca' }] } } })
  ok('dia sem exercício é anotado', diaVazio.problemas.some(p => p.onde === 'seg'))
  ok('e o outro dia continua', diaVazio.exercicios.length === 1)

  const diaErrado = rotinaDaIA({ dias: { lunes: { exercicios: [{ nome: 'Rosca' }] } } })
  ok('dia desconhecido é anotado', diaErrado.problemas.some(p => p.onde === 'lunes'))
}

// ── 9. Resposta que não é resposta ───────────────────────────────────────────
{
  console.log('\n9. o JSON que veio torto')
  for (const bruto of [null, undefined, {}, { dias: null }, { dias: [] }, { dias: 'seg' }, 42, 'texto']) {
    const r = rotinaDaIA(bruto)
    ok(
      `${JSON.stringify(bruto)} não derruba`,
      Array.isArray(r.exercicios) && r.exercicios.length === 0 && r.problemas.length > 0,
      JSON.stringify(r),
    )
  }
}

// ── 10. Teto de exercícios por dia ───────────────────────────────────────────
{
  console.log('\n10. o dia que veio grande demais')
  const muitos = Array.from({ length: 40 }, (_, i) => ({ nome: 'Exercício ' + i }))
  const r = rotinaDaIA({ dias: { seg: { exercicios: muitos } } })
  ok('para no teto', r.exercicios.length === 15, String(r.exercicios.length))
  ok('e diz que cortou', r.problemas.length > 0)
}

// ── 11. Nada de texto gigante ────────────────────────────────────────────────
{
  console.log('\n11. os limites de tamanho')
  const r = rotinaDaIA({
    divisao: 'x'.repeat(500),
    observacao: 'y'.repeat(5000),
    dias: { seg: { exercicios: [{ nome: 'z'.repeat(500), reps: 'w'.repeat(200) }] } },
  })
  ok('nome cortado em 60', r.exercicios[0].nome.length === 60, String(r.exercicios[0].nome.length))
  ok('repetição cortada em 20', (r.exercicios[0].repeticoes ?? '').length === 20)
  ok('divisão cortada em 60', (r.divisao ?? '').length === 60)
  ok('observação cortada em 400', (r.observacao ?? '').length === 400)
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
