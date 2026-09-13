import assert from 'node:assert/strict'
import type { ConsultaDoDia } from './diaDaNutri'
import {
  lerPerguntaBasica,
  respostaDaAgenda,
  respostaDoProximo,
  respostaDoRecebido,
} from './perguntaBasica.ts'

let passaram = 0
let falharam = 0
function caso(nome: string, f: () => void) {
  try {
    f()
    passaram++
    console.log('  ok   ', nome)
  } catch (e) {
    falharam++
    console.log('  FALHOU', nome)
    console.log('        ', (e as Error).message.split(String.fromCharCode(10))[0])
  }
}

/* Horários montados no fuso da máquina, e não em UTC: a resposta escreve a hora
   do relógio dela, e o teste tem de passar em qualquer fuso em que rode. */
const em = (dia: number, h: number, m = 0) => new Date(2026, 8, dia, h, m).toISOString()
const AGORA = new Date(2026, 8, 12, 10, 30).getTime() // sábado, 12/09, 10:30

const consulta = (id: number, quando: string, nome: string, status = 'confirmada'): ConsultaDoDia => ({
  id, quando, nome, status, duracao: 60, tipo: 'retorno',
})

console.log('')
console.log('reconhece as perguntas básicas -- estas vão SEM IA')

for (const [frase, tipo] of [
  ['Quem é o meu próximo paciente?', 'proximo_paciente'],
  ['próximo paciente', 'proximo_paciente'],
  ['Aurora, qual a próxima consulta?', 'proximo_paciente'],
  ['quem vem agora', 'proximo_paciente'],
  ['Minha agenda de hoje', 'agenda_hoje'],
  ['o que eu tenho hoje?', 'agenda_hoje'],
  ['Quantas consultas tenho hoje', 'agenda_hoje'],
  ['agenda de amanhã', 'agenda_amanha'],
  ['Me mostra minha agenda amanhã', 'agenda_amanha'],
  ['Quanto eu recebi hoje?', 'recebido_hoje'],
  ['quanto entrou hoje, por favor', 'recebido_hoje'],
] as const) {
  caso(`"${frase}"`, () => assert.equal(lerPerguntaBasica(frase), tipo))
}

console.log('')
console.log('e deixa para a IA o que PARECE básico e não é')

for (const frase of [
  // Ação, e não pergunta: responder com um nome em vez de marcar seria o pior erro.
  'marca o próximo paciente para amanhã',
  'Agenda um retorno para amanhã às 15h',
  'cancela a consulta de hoje',
  'confirma as consultas de hoje',
  // Pergunta sobre UMA paciente: exige buscar, e isso é a Aurora.
  'qual a próxima consulta da Suelen',
  'quem é o próximo paciente depois da Maria',
  // Período que a lista não cobre.
  'minha agenda da semana que vem',
  'quanto eu recebi esse mês',
  // Análise: é para isto que a IA existe.
  'como está a evolução da Adriana',
  '',
]) {
  caso(`"${frase}" vai para a IA`, () => assert.equal(lerPerguntaBasica(frase), null))
}

console.log('')
console.log('o próximo paciente')

caso('o próximo de hoje, com hora', () => {
  const r = respostaDoProximo(
    [consulta(1, em(12, 9), 'Ana Lima', 'realizada'), consulta(2, em(12, 14), 'Maria Alves')],
    AGORA,
  )
  assert.equal(r, 'Seu próximo paciente é Maria Alves, hoje às 14:00.')
})

caso('a que já passou não é a próxima, mesmo sendo a mais cedo', () => {
  const r = respostaDoProximo([consulta(1, em(12, 9), 'Ana Lima'), consulta(2, em(13, 8), 'João Souza')], AGORA)
  assert.match(r, /João Souza, amanhã às 08:00/)
})

caso('cancelada e pedido não aceito não contam', () => {
  const r = respostaDoProximo(
    [
      consulta(1, em(12, 11), 'Cancelada Silva', 'cancelada'),
      consulta(2, em(12, 12), 'Pedido Souza', 'solicitada'),
      consulta(3, em(12, 16), 'Maria Alves'),
    ],
    AGORA,
  )
  assert.match(r, /Maria Alves, hoje às 16:00/)
})

caso('pendente avisa que não foi confirmada', () => {
  const r = respostaDoProximo([consulta(1, em(12, 15), 'Maria Alves', 'pendente')], AGORA)
  assert.match(r, /ainda não foi confirmada/)
})

caso('mais adiante, com o dia da semana e a data', () => {
  const r = respostaDoProximo([consulta(1, em(17, 10), 'Maria Alves')], AGORA)
  assert.match(r, /quinta-feira \(17\/09\) às 10:00/)
})

caso('sem nenhuma, diz que não há', () => {
  assert.match(respostaDoProximo([], AGORA), /não tem consulta marcada/)
})

console.log('')
console.log('a agenda do dia')

caso('até três, todos os nomes', () => {
  const r = respostaDaAgenda(
    [consulta(1, em(12, 9), 'Ana Lima', 'realizada'), consulta(2, em(12, 14), 'Maria Alves'), consulta(3, em(12, 16, 30), 'João Souza')],
    'hoje',
    AGORA,
  )
  assert.equal(r, 'Hoje você tem 3 consultas: 09:00 Ana Lima, 14:00 Maria Alves e 16:30 João Souza.')
})

caso('mais de três: quantas são, e só as próximas três', () => {
  const r = respostaDaAgenda(
    [9, 11, 13, 15, 17].map((h, i) => consulta(i, em(12, h), 'Paciente ' + h)),
    'hoje',
    AGORA,
  )
  assert.match(r, /^Hoje você tem 5 consultas\. As próximas: 11:00 Paciente 11, 13:00 Paciente 13 e 15:00 Paciente 15\.$/)
})

caso('amanhã não mistura com hoje', () => {
  const r = respostaDaAgenda([consulta(1, em(12, 14), 'Hoje Silva'), consulta(2, em(13, 9), 'Amanha Souza')], 'amanha', AGORA)
  assert.equal(r, 'Amanhã você tem 1 consulta: 09:00 Amanha Souza.')
})

caso('cancelada não aparece na agenda', () => {
  const r = respostaDaAgenda([consulta(1, em(12, 14), 'Cancelada Silva', 'cancelada')], 'hoje', AGORA)
  assert.equal(r, 'Hoje você não tem consulta marcada.')
})

console.log('')
console.log('o recebido do dia')

const reais = (n: number) => 'R$ ' + n

caso('com recebimento, valor e quantos', () => {
  assert.equal(respostaDoRecebido({ recebido: 640, quantasBaixas: 2 }, reais), 'Hoje entrou R$ 640, em 2 recebimentos.')
})

caso('zero não vira "você recebeu R$ 0" -- pode ser falta de permissão', () => {
  assert.equal(
    respostaDoRecebido({ recebido: 0, quantasBaixas: 0 }, reais),
    'Não há recebimento registrado hoje que eu consiga ver.',
  )
})

caso('leitura que falhou devolve nulo, e a pergunta vai para a IA', () => {
  assert.equal(respostaDoRecebido(null, reais), null)
})

console.log('')
console.log(`${passaram} passaram, ${falharam} falharam`)
console.log('')
if (falharam > 0) process.exit(1)
