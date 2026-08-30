import { moverDia, renumerar, rotinaDaIA, tirarDaRotina } from './rotinaDaIA.ts'

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

// ── 5. O descanso é NÚMERO, e não uma frase dentro da observação ─────────────
{
  console.log('\n5. o descanso')
  /* Ele virava a frase "Descanso 90s" em `observacao`. Número que vira prosa não
     volta a ser número: o modo treino não tinha como saber quanto descansar
     naquele exercício, e descansava sempre o mesmo tempo escolhido na mão — em
     toda série de todo treino. */
  const r = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', descanso_seg: 90 }] } } })
  ok('90s vira campo', r.exercicios[0].descansoSeg === 90, String(r.exercicios[0].descansoSeg))
  ok('e não polui a observação', r.exercicios[0].observacao === null)

  const texto = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', descanso_seg: '90' }] } } })
  ok('texto "90" também vira número', texto.exercicios[0].descansoSeg === 90)

  const absurdo = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', descanso_seg: 9999 }] } } })
  ok('descanso absurdo não entra', absurdo.exercicios[0].descansoSeg === null)

  const curto = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca', descanso_seg: 1 }] } } })
  ok('descanso curto demais não entra', curto.exercicios[0].descansoSeg === null)

  const sem = rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca' }] } } })
  ok('sem descanso não inventa', sem.exercicios[0].descansoSeg === null)
  ok('e a observação continua livre', sem.exercicios[0].observacao === null)
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

// ── 12. A ficha de academia que caiu toda na segunda ─────────────────────────
{
  console.log('\n12. a ficha real que quebrou')

  /* Isto é o que a leitura de uma ficha "Treino A / Treino B" devolve: a IA
     converte o primeiro bloco em segunda e o segundo em terça, porque ficha de
     academia NÃO diz dia da semana e ela precisa escolher algum.
     Não é bug da conversão — é o limite dela. O bug era a tela não deixar
     corrigir. */
  const daFicha = rotinaDaIA({
    divisao: 'ABC',
    dias: {
      seg: { foco: 'Treino A', exercicios: [
        { nome: 'Supino reto', series: 4, reps: '8-12' },
        { nome: 'Crucifixo', series: 3, reps: '12' },
      ] },
      ter: { foco: 'Treino B', exercicios: [{ nome: 'Agachamento', series: 4, reps: '10' }] },
    },
  })
  ok('dois dias', new Set(daFicha.exercicios.map(e => e.dia)).size === 2)

  /* A correção que a pessoa faz: "o Treino A é quarta". */
  const movido = moverDia(daFicha.exercicios, 1, 3)
  ok('o bloco inteiro anda', movido.filter(e => e.dia === 3).length === 2,
    JSON.stringify(movido.map(e => e.dia)))
  ok('nada sobra na segunda', movido.every(e => e.dia !== 1))
  ok('o outro dia não se mexe', movido.filter(e => e.dia === 2).length === 1)
  ok('a ordem dentro do bloco é preservada',
    movido.filter(e => e.dia === 3).map(e => e.nome).join() === 'Supino reto,Crucifixo')

  /* Mover para um dia que JÁ TEM exercício junta os dois, e quem chega fica
     depois de quem já estava. */
  const juntos = moverDia(daFicha.exercicios, 1, 2)
  const naTerca = juntos.filter(e => e.dia === 2).sort((a, b) => a.ordem - b.ordem)
  ok('junta no mesmo dia', naTerca.length === 3, String(naTerca.length))
  ok('quem já estava vem primeiro', naTerca[0].nome === 'Agachamento', naTerca[0].nome)
  ok('sem ordem repetida', new Set(naTerca.map(e => e.ordem)).size === 3,
    JSON.stringify(naTerca.map(e => e.ordem)))

  ok('mover para o mesmo dia não muda nada', moverDia(daFicha.exercicios, 1, 1) === daFicha.exercicios)
}

// ── 13. Tirar e renumerar ────────────────────────────────────────────────────
{
  console.log('\n13. o buraco na ordem')

  const lista = rotinaDaIA({
    dias: { seg: { exercicios: [
      { nome: 'Um' }, { nome: 'Dois' }, { nome: 'Tres' },
    ] } },
  }).exercicios

  const semOMeio = tirarDaRotina(lista, 1)
  ok('tirou um', semOMeio.length === 2)
  ok('e deixou buraco na ordem', semOMeio.map(e => e.ordem).join() === '0,2',
    JSON.stringify(semOMeio.map(e => e.ordem)))

  /* O buraco não quebra nada hoje, mas a próxima leitura ordena por ele e vira
     pergunta sem resposta: sumiu um exercício, ou a numeração é que está torta? */
  const arrumado = renumerar(semOMeio)
  ok('renumerar fecha o buraco', arrumado.map(e => e.ordem).join() === '0,1')
  ok('e não troca a ordem relativa', arrumado.map(e => e.nome).join() === 'Um,Tres')

  /* Cada dia conta do zero. Um contador só para a semana inteira faria a quarta
     começar em 5, e a tela ordena por dia. */
  const doisDias = renumerar([
    ...rotinaDaIA({ dias: { seg: { exercicios: [{ nome: 'Rosca' }, { nome: 'Tríceps' }] } } }).exercicios,
    ...rotinaDaIA({ dias: { qua: { exercicios: [{ nome: 'Leg press' }] } } }).exercicios,
  ])
  ok('cada dia conta do zero',
    doisDias.filter(e => e.dia === 3)[0].ordem === 0,
    String(doisDias.filter(e => e.dia === 3)[0].ordem))

  ok('lista vazia não quebra', renumerar([]).length === 0 && tirarDaRotina([], 0).length === 0)
}

// ── 14. O alerta da ficha, que avisa e não muda nada ─────────────────────────
{
  console.log('\n14. o alerta da limitacao')

  /* A ficha da academia foi montada por um professor, e a pessoa decidiu usá-la.
     O app APONTA o que carrega a região limitada dela — e não troca, não tira,
     não mexe em série. Reescrever a prescrição de outro em silêncio seria o app
     se achar dono de um treino que não é dele. */
  const r = rotinaDaIA({
    dias: {
      seg: {
        exercicios: [
          { nome: 'Desenvolvimento militar', series: 4, reps: '10',
            alerta: 'Leva o braço acima da linha do ombro.' },
          { nome: 'Rosca direta', series: 3, reps: '12' },
        ],
      },
    },
  })

  ok('os dois entram', r.exercicios.length === 2, String(r.exercicios.length))
  ok('o alertado traz o aviso', r.exercicios[0].alerta?.startsWith('Leva o braço') === true,
    String(r.exercicios[0].alerta))
  ok('o outro fica sem aviso', r.exercicios[1].alerta === null, String(r.exercicios[1].alerta))

  /* O que NÃO pode acontecer: o alerta virar parte do exercício. Ele é uma
     leitura SOBRE o exercício, e a ficha continua igual ao papel. */
  ok('o nome não muda', r.exercicios[0].nome === 'Desenvolvimento militar')
  ok('a série não muda', r.exercicios[0].series === 4)
  ok('a repetição não muda', r.exercicios[0].repeticoes === '10')
  ok('o alerta não vaza para a observação',
    (r.exercicios[0].observacao ?? '').indexOf('ombro') === -1,
    String(r.exercicios[0].observacao))

  /* Alerta gigante é cortado, como todo texto que vem de fora. */
  const grande = rotinaDaIA({
    dias: { seg: { exercicios: [{ nome: 'Supino reto', alerta: 'x'.repeat(900) }] } },
  })
  ok('alerta cortado em 200', grande.exercicios[0].alerta?.length === 200,
    String(grande.exercicios[0].alerta?.length))

  /* Alerta que não é texto some, em vez de virar "[object Object]" na tela. */
  for (const lixo of [42, true, {}, [], null]) {
    const l = rotinaDaIA({
      dias: { seg: { exercicios: [{ nome: 'Supino reto', alerta: lixo as never }] } },
    })
    ok(`alerta ${JSON.stringify(lixo)} vira null`, l.exercicios[0].alerta === null,
      String(l.exercicios[0].alerta))
  }
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
