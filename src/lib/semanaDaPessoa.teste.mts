import { semanaDaPessoa } from './semanaDaPessoa.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { passou++; console.log('  ok    ' + nome) }
  else { falhou++; console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : '')) }
}

const HOJE = '2026-08-30'
const vazio = {
  hoje: HOJE,
  sessoes: [] as { data: string; duracaoMin: number | null }[],
  pesos: [] as { data: string; kg: number }[],
  consumo: [] as { data: string; calorias: number | null }[],
  agua: [] as { data: string; ml: number }[],
  metaDeAguaMl: 2000 as number | null,
  metaDeCalorias: 2000 as number | null,
}
const linha = (r: ReturnType<typeof semanaDaPessoa>, chave: string) =>
  r.linhas.find(l => l.chave === chave)

console.log('\n1. sem nada, o cartão não aparece')

{
  const r = semanaDaPessoa(vazio)
  ok('vazia', r.vazia === true)
  ok('nenhuma linha', r.linhas.length === 0)
  /* Uma linha de "0 treinos" para quem nunca treinou não é devolução: é
     cobrança, e cobrança é o que faz alguém fechar o app. */
  ok('não inventa "0 treinos"', linha(r, 'treino') === undefined)
}

console.log('\n2. a janela é de 7 dias, e a comparação com os 7 anteriores')

{
  const r = semanaDaPessoa({
    ...vazio,
    sessoes: [
      { data: '2026-08-26', duracaoMin: 45 },
      { data: '2026-08-28', duracaoMin: 50 },
      { data: '2026-08-30', duracaoMin: 40 },
      /* Semana anterior: 2 */
      { data: '2026-08-19', duracaoMin: 40 },
      { data: '2026-08-21', duracaoMin: 40 },
    ],
  })
  const t = linha(r, 'treino')
  ok('conta 3 treinos', t?.texto.startsWith('3 treinos'), t?.texto)
  ok('soma os minutos', t?.texto.includes('135 min'), t?.texto)
  ok('compara com a semana passada', t?.texto.includes('1 a mais'), t?.texto)
  ok('e marca como bom', t?.bom === true)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    sessoes: [
      { data: '2026-08-28', duracaoMin: 40 },
      { data: '2026-08-19', duracaoMin: 40 },
      { data: '2026-08-20', duracaoMin: 40 },
      { data: '2026-08-21', duracaoMin: 40 },
    ],
  })
  const t = linha(r, 'treino')
  ok('treinou menos, e o texto diz', t?.texto.includes('2 a menos'), t?.texto)
  /* Sem drama: o texto informa, e a tela não pinta de vermelho. */
  ok('mas continua sendo uma linha', t !== undefined)
  ok('só não é "bom"', t?.bom === false)
}

{
  const r = semanaDaPessoa({ ...vazio, sessoes: [{ data: '2026-08-28', duracaoMin: null }] })
  ok('primeira semana não compara com nada', !linha(r, 'treino')?.texto.includes('semana passada'),
    linha(r, 'treino')?.texto)
  ok('e sem duração não inventa minutos', !linha(r, 'treino')?.texto.includes('min'),
    linha(r, 'treino')?.texto)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    sessoes: [
      { data: '2026-08-24', duracaoMin: 40 },
      /* Fora da janela por um dia: 23/08 é o sétimo dia para trás a partir de
         30/08 contando de-6, então entra na semana ANTERIOR. */
      { data: '2026-08-23', duracaoMin: 40 },
    ],
  })
  ok('a borda da janela é exata', linha(r, 'treino')?.texto.startsWith('1 treino'),
    linha(r, 'treino')?.texto)
}

console.log('\n3. peso — duas pesagens, e ruído de balança não conta')

{
  const r = semanaDaPessoa({
    ...vazio,
    pesos: [{ data: '2026-08-25', kg: 80 }, { data: '2026-08-30', kg: 79.2 }],
  })
  ok('perdeu 0,8', linha(r, 'peso')?.texto === '−0,8 kg nesta semana', linha(r, 'peso')?.texto)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    pesos: [{ data: '2026-08-25', kg: 80 }, { data: '2026-08-30', kg: 82 }],
  })
  ok('ganhou 2, sem casa decimal', linha(r, 'peso')?.texto === '+2 kg nesta semana',
    linha(r, 'peso')?.texto)
  /* Quem ganha massa e quem emagrece leem a mesma tela. Um alvo transformaria
     uma das duas leituras em fracasso. */
  ok('subir não é "ruim"', linha(r, 'peso')?.bom === true)
}

{
  const r = semanaDaPessoa({ ...vazio, pesos: [{ data: '2026-08-30', kg: 80 }] })
  ok('uma pesagem só não vira linha', linha(r, 'peso') === undefined)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    pesos: [{ data: '2026-08-25', kg: 80 }, { data: '2026-08-30', kg: 80.1 }],
  })
  /* 100 g em uma semana é ruído de balança, e chamar isso de progresso ensina a
     não acreditar no número. */
  ok('100 g não vira progresso', linha(r, 'peso') === undefined)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    pesos: [{ data: '2026-08-25', kg: 80 }, { data: '2026-08-30', kg: 79.8 }],
  })
  ok('200 g já conta', linha(r, 'peso')?.texto === '−0,2 kg nesta semana', linha(r, 'peso')?.texto)
}

{
  /* Fora de ordem na entrada: a conta ordena antes, senão a "primeira" pesagem
     seria a que veio primeiro na lista e o sinal poderia inverter. */
  const r = semanaDaPessoa({
    ...vazio,
    pesos: [{ data: '2026-08-30', kg: 79 }, { data: '2026-08-25', kg: 80 }],
  })
  ok('a ordem da lista não inverte o sinal', linha(r, 'peso')?.texto.startsWith('−'),
    linha(r, 'peso')?.texto)
}

console.log('\n4. calorias — três dias, no mínimo')

{
  const consumo = [
    { data: '2026-08-28', calorias: 2000 },
    { data: '2026-08-29', calorias: 2100 },
    { data: '2026-08-30', calorias: 1900 },
  ]
  const r = semanaDaPessoa({ ...vazio, consumo })
  ok('média de 2.000', linha(r, 'calorias')?.texto.includes('2.000 kcal'), linha(r, 'calorias')?.texto)
  ok('e a meta aparece', linha(r, 'calorias')?.texto.includes('meta de 2.000'))
  ok('dentro de 10% é bom', linha(r, 'calorias')?.bom === true)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    consumo: [{ data: '2026-08-29', calorias: 2000 }, { data: '2026-08-30', calorias: 2000 }],
  })
  /* Dois dias não é média de semana: é uma amostra que engana. */
  ok('dois dias não viram média', linha(r, 'calorias') === undefined)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    consumo: [
      { data: '2026-08-28', calorias: null },
      { data: '2026-08-29', calorias: null },
      { data: '2026-08-30', calorias: 2000 },
    ],
  })
  /* Null é "não dá para saber", e não zero. Contar os nulos puxaria a média
     para baixo e o app diria que ela comeu 667 kcal por dia. */
  ok('dia sem caloria não entra na média', linha(r, 'calorias') === undefined)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    metaDeCalorias: null,
    consumo: [
      { data: '2026-08-28', calorias: 2000 },
      { data: '2026-08-29', calorias: 2000 },
      { data: '2026-08-30', calorias: 2000 },
    ],
  })
  ok('sem meta, mostra só a média', !linha(r, 'calorias')?.texto.includes('meta'),
    linha(r, 'calorias')?.texto)
}

console.log('\n5. água — só quando bateu')

{
  const agua = [
    { data: '2026-08-28', ml: 1000 }, { data: '2026-08-28', ml: 1200 },
    { data: '2026-08-29', ml: 500 },
    { data: '2026-08-30', ml: 2500 },
  ]
  const r = semanaDaPessoa({ ...vazio, agua })
  ok('soma os copos do dia', linha(r, 'agua')?.texto === 'bateu a meta de água em 2 dias',
    linha(r, 'agua')?.texto)
}

{
  const r = semanaDaPessoa({ ...vazio, agua: [{ data: '2026-08-30', ml: 500 }] })
  ok('nenhum dia batido não vira linha', linha(r, 'agua') === undefined)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    metaDeAguaMl: null,
    agua: [{ data: '2026-08-30', ml: 3000 }],
  })
  ok('sem meta não dá para dizer se bateu', linha(r, 'agua') === undefined)
}

console.log('\n6. constância')

{
  const r = semanaDaPessoa({
    ...vazio,
    agua: ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28']
      .map(data => ({ data, ml: 500 })),
  })
  ok('cinco dias contam', linha(r, 'constancia')?.texto === 'anotou alguma coisa em 5 dos 7 dias',
    linha(r, 'constancia')?.texto)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    agua: ['2026-08-28','2026-08-29','2026-08-30'].map(data => ({ data, ml: 500 })),
  })
  ok('quatro ou menos não vira linha', linha(r, 'constancia') === undefined)
}

{
  /* Vários registros no MESMO dia contam um dia só. */
  const r = semanaDaPessoa({
    ...vazio,
    agua: Array.from({ length: 10 }, () => ({ data: '2026-08-30', ml: 250 })),
  })
  ok('dez copos num dia não são dez dias', linha(r, 'constancia') === undefined)
}

{
  /* Assuntos diferentes no mesmo dia também contam um. */
  const r = semanaDaPessoa({
    ...vazio,
    agua: ['2026-08-24','2026-08-25','2026-08-26'].map(data => ({ data, ml: 500 })),
    consumo: ['2026-08-27','2026-08-28'].map(data => ({ data, calorias: 2000 })),
    sessoes: [{ data: '2026-08-24', duracaoMin: 40 }],
  })
  ok('assuntos diferentes somam dias distintos',
    linha(r, 'constancia')?.texto === 'anotou alguma coisa em 5 dos 7 dias',
    linha(r, 'constancia')?.texto)
}

console.log('\n7. entrada torta não derruba')

{
  const r = semanaDaPessoa({
    ...vazio,
    sessoes: [{ data: 'ontem', duracaoMin: 40 }, { data: '', duracaoMin: 40 }],
    pesos: [{ data: '30/08/2026', kg: 80 }],
    agua: [{ data: '2026-8-30', ml: 3000 }],
  })
  ok('data fora do formato é ignorada', r.vazia === true, JSON.stringify(r.linhas))
}

{
  const r = semanaDaPessoa({
    ...vazio,
    hoje: '2027-01-02',
    sessoes: [{ data: '2026-12-28', duracaoMin: 40 }, { data: '2027-01-01', duracaoMin: 40 }],
  })
  ok('a janela atravessa a virada do ano', linha(r, 'treino')?.texto.startsWith('2 treinos'),
    linha(r, 'treino')?.texto)
}

{
  const r = semanaDaPessoa({
    ...vazio,
    hoje: '2028-03-02',
    sessoes: [{ data: '2028-02-29', duracaoMin: 40 }],
  })
  ok('e o 29 de fevereiro', linha(r, 'treino')?.texto.startsWith('1 treino'),
    linha(r, 'treino')?.texto)
}

console.log('\n' + passou + ' passaram, ' + falhou + ' falharam')
if (falhou > 0) process.exit(1)
