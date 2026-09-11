import { direcaoDoObjetivo, metaAdaptativa } from './metaAdaptativa.ts'
import type { GastoReal } from './gastoReal.ts'

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

const gasto = (kcal: number, extra: Partial<GastoReal> = {}): GastoReal => ({
  kcal,
  diasRegistrados: 21,
  diasDoPeriodo: 28,
  variacaoKg: -0.8,
  mediaConsumida: kcal - 300,
  ...extra,
})

// ── 1. Sem medida, sem proposta ──────────────────────────────────────────────
{
  const r = metaAdaptativa({ gasto: null, metaAtual: 1800, objetivo: 'perder', prescritaPelaNutri: false })
  ok('sem gasto medido não propõe nada', r.tipo === 'nada')
}

// ── 2. A meta da nutricionista não se mexe ───────────────────────────────────
{
  /* O caso que define o produto: a aritmética discorda da prescrição, e quem
     manda continua sendo quem prescreveu. */
  const r = metaAdaptativa({
    gasto: gasto(2600), metaAtual: 1500, objetivo: 'perder', prescritaPelaNutri: true,
  })
  ok('prescrita pela nutri nunca vira sugestão', r.tipo === 'contar_para_ela')
  ok('e a frase admite que pode ser de propósito',
     r.tipo === 'contar_para_ela' && /de propósito/.test(r.frase))

  /* Diferença pequena não vira nem recado: não se manda a paciente falar com a
     nutricionista por causa de 60 kcal. */
  const q = metaAdaptativa({
    gasto: gasto(2000), metaAtual: 1760, objetivo: 'perder', prescritaPelaNutri: true,
  })
  ok('e diferença pequena não vira nem conversa', q.tipo === 'nada')
}

// ── 3. Meta própria: propõe, com passo limitado ──────────────────────────────
{
  /* Gasto 2.600, objetivo perder -> alvo 2.210. Meta atual 1.500: a diferença
     é 710, e o passo máximo é 400. */
  const r = metaAdaptativa({
    gasto: gasto(2600), metaAtual: 1500, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('propõe número novo', r.tipo === 'sugerir')
  ok('e anda no máximo 400 de uma vez', r.tipo === 'sugerir' && r.kcal === 1900, String(r.tipo === 'sugerir' && r.kcal))
  ok('a frase explica pelo registro, e não por fórmula',
     r.tipo === 'sugerir' && /registrou uma média/.test(r.frase))
}

// ── 4. Objetivo muda o alvo ──────────────────────────────────────────────────
{
  const manter = metaAdaptativa({
    gasto: gasto(2000), metaAtual: null, objetivo: 'manter', prescritaPelaNutri: false,
  })
  ok('manter usa o gasto cheio', manter.tipo === 'sugerir' && manter.kcal === 2000,
     String(manter.tipo === 'sugerir' && manter.kcal))

  const perder = metaAdaptativa({
    gasto: gasto(2000), metaAtual: null, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('perder corta 15%', perder.tipo === 'sugerir' && perder.kcal === 1700,
     String(perder.tipo === 'sugerir' && perder.kcal))

  const ganhar = metaAdaptativa({
    gasto: gasto(2000), metaAtual: null, objetivo: 'ganhar', prescritaPelaNutri: false,
  })
  ok('ganhar põe 10%', ganhar.tipo === 'sugerir' && ganhar.kcal === 2200,
     String(ganhar.tipo === 'sugerir' && ganhar.kcal))
}

// ── 5. O piso, que não tem exceção ───────────────────────────────────────────
{
  /* Gasto medido baixo + corte de 15% daria 1.105. O piso segura em 1.200. */
  const r = metaAdaptativa({
    gasto: gasto(1300), metaAtual: null, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('nunca abaixo de 1.200', r.tipo === 'sugerir' && r.kcal === 1200,
     String(r.tipo === 'sugerir' && r.kcal))

  /* E o piso vem ANTES do passo: sem isso, uma meta de 1.300 com alvo 900
     desceria para 1.200 pelo passo e furaria o piso por outro caminho. */
  const q = metaAdaptativa({
    gasto: gasto(1100), metaAtual: 1600, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('e o piso vale também com meta anterior', q.tipo === 'sugerir' && q.kcal >= 1200,
     String(q.tipo === 'sugerir' && q.kcal))
}

// ── 6. O silêncio, que é a resposta mais comum ───────────────────────────────
{
  /* Meta 1.700, alvo 1.700: nada a dizer. Uma meta que muda toda semana ensina
     a não confiar nela. */
  const r = metaAdaptativa({
    gasto: gasto(2000), metaAtual: 1700, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('meta já certa não vira aviso', r.tipo === 'nada')

  /* 80 kcal de diferença: passa dos 5%, não passa dos 100. */
  const q = metaAdaptativa({
    gasto: gasto(1900), metaAtual: 1700, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('diferença de 80 kcal é ruído', q.tipo === 'nada', String(q.tipo))

  /* 150 kcal numa meta de 3.200: passa dos 100 e não passa dos 5%. */
  const g = metaAdaptativa({
    gasto: gasto(3350), metaAtual: 3000, objetivo: 'manter', prescritaPelaNutri: false,
  })
  ok('e 350 em 3.000 passa nos dois', g.tipo === 'sugerir')
  /* 140 em 3.000: passa dos 100 e NÃO passa dos 5% (que são exatamente 150).
     O caso existe para provar que as duas travas valem juntas -- e o primeiro
     número que escrevi aqui foi 150, que é a borda e PASSA. Borda escrita como
     se fosse fora dela é como um teste vira falso: ele reprova código certo. */
  const p = metaAdaptativa({
    gasto: gasto(3140), metaAtual: 3000, objetivo: 'manter', prescritaPelaNutri: false,
  })
  ok('mas 140 em 3.000 não passa na fração', p.tipo === 'nada', String(p.tipo))
}

// ── 7. A frase conta o que aconteceu com o peso ──────────────────────────────
{
  const caiu = metaAdaptativa({
    gasto: gasto(2600, { variacaoKg: -1.4 }), metaAtual: 1500, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('peso que caiu aparece na frase', caiu.tipo === 'sugerir' && /caiu 1,4 kg/.test(caiu.frase))

  const parado = metaAdaptativa({
    gasto: gasto(2600, { variacaoKg: 0 }), metaAtual: 1500, objetivo: 'perder', prescritaPelaNutri: false,
  })
  ok('peso parado também', parado.tipo === 'sugerir' && /ficou onde estava/.test(parado.frase))
}

// ── 8. Objetivo clínico não vira direção de caloria ──────────────────────────
{
  ok('emagrecimento é perder', direcaoDoObjetivo('emagrecimento') === 'perder')
  ok('hipertrofia é ganhar', direcaoDoObjetivo('hipertrofia') === 'ganhar')
  ok('manutenção é manter', direcaoDoObjetivo('manutencao') === 'manter')

  /* Os que NÃO dizem nada sobre caloria. Chutar manutenção aqui seria o app
     dando conduta com cara de conveniência. */
  for (const clinico of ['controle_glicemico', 'menopausa', 'cardiovascular', 'saude_intestinal', 'recomposicao']) {
    ok(clinico + ' não propõe direção', direcaoDoObjetivo(clinico) === null)
  }

  ok('objetivo desconhecido não vira manter', direcaoDoObjetivo('coisa_nova_no_banco') === null)
  ok('nulo continua nulo', direcaoDoObjetivo(null) === null)
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
process.exit(falhou > 0 ? 1 : 0)
