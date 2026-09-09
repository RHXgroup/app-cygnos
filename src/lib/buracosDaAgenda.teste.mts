/* Os buracos da agenda, com o relógio na mão.
 *
 * O que este arquivo protege: "quando eu tenho vaga?" é respondido por uma
 * conta de intervalo, e conta de intervalo neste projeto já errou na virada de
 * hora em quatro telas diferentes. Aqui dá para põr o relógio às 15h de uma
 * quarta e conferir o que ela veria.
 *
 * Rode com: node --experimental-strip-types src/lib/buracosDaAgenda.teste.mts */

import {
  buracosDoDia,
  duracaoPorExtenso,
  emMinutos,
  EXPEDIENTE_PADRAO,
  MINIMO_DO_BURACO_MIN,
  type Expediente,
} from './buracosDaAgenda.ts'
import type { ConsultaDoDia } from './diaDaNutri.ts'
import { readFileSync } from 'node:fs'

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

/* Quarta, 09/09/2026. Dia de expediente no padrão (1-5). */
const QUARTA = new Date(2026, 8, 9, 12, 0, 0)
const DOMINGO = new Date(2026, 8, 13, 12, 0, 0)
const cedo = new Date(2026, 8, 9, 7, 0, 0)   // antes de abrir
const asTresDaTarde = new Date(2026, 8, 9, 15, 0, 0)

let proximoId = 1
function consulta(h: number, m: number, duracao: number | null, extra: Partial<ConsultaDoDia> = {}): ConsultaDoDia {
  return {
    id: proximoId++,
    quando: new Date(2026, 8, 9, h, m, 0).toISOString(),
    nome: 'Paciente',
    duracao,
    status: 'confirmada',
    tipo: null,
    ...extra,
  }
}

/** "09:00-10:00" para cada buraco, no relógio local. */
const emTexto = (bs: { de: number; ate: number }[]) =>
  bs.map(b => {
    const f = (t: number) => {
      const x = new Date(t)
      return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0')
    }
    return f(b.de) + '-' + f(b.ate)
  })

// ──── emMinutos ────
ok('08:00 vira 480', emMinutos('08:00') === 480)
ok('8:00 sem zero tambem', emMinutos('8:00') === 480)
ok('18:30 vira 1110', emMinutos('18:30') === 1110)
ok('00:00 vira 0', emMinutos('00:00') === 0)
ok('23:59 vale', emMinutos('23:59') === 1439)
ok('24:00 nao existe', emMinutos('24:00') === null)
ok('08:60 nao existe', emMinutos('08:60') === null)
ok('vazio e nulo', emMinutos('') === null)
ok('texto e nulo', emMinutos('meio-dia') === null)
ok('com segundos ainda le', emMinutos('08:00:00') === 480)

// ──── O dia vazio ────
{
  const b = buracosDoDia([], QUARTA, cedo)
  ok('dia sem consulta e um buraco so', b.length === 1)
  ok('e ele vai de ponta a ponta do expediente', emTexto(b)[0] === '08:00-18:00')
  ok('com os minutos certos', b[0]?.minutos === 600)
}

// ──── Uma consulta no meio parte o dia em dois ────
{
  const b = buracosDoDia([consulta(10, 0, 60)], QUARTA, cedo)
  ok('uma consulta faz dois buracos', b.length === 2)
  ok('antes e depois, na ordem', emTexto(b).join(' | ') === '08:00-10:00 | 11:00-18:00')
}

// ──── Sem duracao, supoe a padrao -- e nao zero ────
{
  const b = buracosDoDia([consulta(10, 0, null)], QUARTA, cedo)
  ok('duracao nula nao vira consulta de zero minuto',
    emTexto(b)[1] === '10:50-18:00')
  const c = buracosDoDia([consulta(10, 0, 0)], QUARTA, cedo)
  ok('duracao ZERO tambem cai na suposta', emTexto(c)[1] === '10:50-18:00')
}

// ──── Consultas coladas nao criam buraco de zero ────
{
  const b = buracosDoDia([consulta(10, 0, 60), consulta(11, 0, 60)], QUARTA, cedo)
  ok('duas coladas nao inventam buraco entre elas', b.length === 2)
  ok('e o vao some', emTexto(b).join(' | ') === '08:00-10:00 | 12:00-18:00')
}

// ──── SOBREPOSTAS: o cursor nao pode voltar ────
{
  /* Uma das 10:00 as 12:00 e outra das 10:30 as 11:00. Se o cursor andasse
     para a segunda, o buraco seguinte comecaria as 11:00 -- em cima de alguem
     que ainda esta ali. */
  const b = buracosDoDia([consulta(10, 0, 120), consulta(10, 30, 30)], QUARTA, cedo)
  ok('sobreposta nao abre buraco falso', emTexto(b).join(' | ') === '08:00-10:00 | 12:00-18:00')
}
{
  /* Fora de ordem na entrada: a lista do banco vem ordenada, mas a funcao e
     publica e nao pode depender disso. */
  const b = buracosDoDia([consulta(15, 0, 60), consulta(10, 0, 60)], QUARTA, cedo)
  ok('entrada fora de ordem sai certa',
    emTexto(b).join(' | ') === '08:00-10:00 | 11:00-15:00 | 16:00-18:00')
}

// ──── Buraco curto nao aparece ────
{
  /* Entre 10:00-10:50 e 11:10 sobram 20 minutos: menos que a consulta padrao. */
  const b = buracosDoDia([consulta(10, 0, 50), consulta(11, 10, 50)], QUARTA, cedo)
  ok('fresta de 20 minutos nao vira vaga',
    emTexto(b).join(' | ') === '08:00-10:00 | 12:00-18:00')
  ok('nenhum buraco abaixo do minimo escapa',
    b.every(x => x.minutos >= MINIMO_DO_BURACO_MIN))
}

// ──── O PASSADO ────
{
  const b = buracosDoDia([consulta(10, 0, 60)], QUARTA, asTresDaTarde)
  ok('as 15h o buraco da manha sumiu', b.length === 1)
  ok('e o de agora comeca AGORA, e nao as 11:00', emTexto(b)[0] === '15:00-18:00')
}
{
  /* Agora DENTRO de um buraco que ja tinha comecado: ele e cortado, nao
     descartado -- ela ainda pode encaixar alguem no que sobrou. */
  const b = buracosDoDia([consulta(16, 0, 60)], QUARTA, asTresDaTarde)
  ok('buraco em curso e cortado em agora', emTexto(b).join(' | ') === '15:00-16:00 | 17:00-18:00')
}
{
  const depoisDeFechar = new Date(2026, 8, 9, 19, 0, 0)
  ok('depois do expediente nao sobra buraco nenhum',
    buracosDoDia([], QUARTA, depoisDeFechar).length === 0)
}

// ──── Cancelada e encaixe NAO ocupam ────
{
  const b = buracosDoDia([consulta(10, 0, 60, { status: 'cancelada' })], QUARTA, cedo)
  ok('cancelada nao ocupa', emTexto(b).join('') === '08:00-18:00')
}
{
  /* Encaixe existe para caber onde nao cabia: ele se sobrepoe de proposito.
     Se fechasse o buraco, marcar um apagaria da tela a vaga que continua vaga. */
  const b = buracosDoDia([consulta(10, 0, 60, { encaixe: true })], QUARTA, cedo)
  ok('encaixe nao fecha buraco', emTexto(b).join('') === '08:00-18:00')
  const c = buracosDoDia([consulta(10, 0, 60, { encaixe: null })], QUARTA, cedo)
  ok('encaixe nulo ocupa, como qualquer consulta', c.length === 2)
}

// ──── O EXPEDIENTE ────
{
  const meio: Expediente = { inicio: '09:00', fim: '13:00', diasDaSemana: [1, 2, 3, 4, 5] }
  const b = buracosDoDia([], QUARTA, cedo, meio)
  ok('respeita o expediente dela', emTexto(b)[0] === '09:00-13:00')
}
{
  /* Consulta marcada FORA do expediente nao pode gerar buraco invertido. */
  const meio: Expediente = { inicio: '09:00', fim: '13:00', diasDaSemana: [1, 2, 3, 4, 5] }
  const b = buracosDoDia([consulta(20, 0, 60)], QUARTA, cedo, meio)
  ok('consulta depois do fechamento nao inverte nada', emTexto(b)[0] === '09:00-13:00')
  ok('e nao cria buraco negativo', b.every(x => x.minutos > 0))
}
{
  const torto: Expediente = { inicio: '18:00', fim: '08:00', diasDaSemana: [1, 2, 3, 4, 5] }
  const b = buracosDoDia([], QUARTA, cedo, torto)
  ok('fim antes do inicio cai no padrao 08-18', emTexto(b)[0] === '08:00-18:00')
}
{
  const vazio: Expediente = { inicio: 'lixo', fim: 'lixo', diasDaSemana: [1, 2, 3, 4, 5] }
  const b = buracosDoDia([], QUARTA, cedo, vazio)
  ok('hora torta cai no padrao', emTexto(b)[0] === '08:00-18:00')
}
{
  ok('domingo nao tem buraco nenhum', buracosDoDia([], DOMINGO, cedo).length === 0)
  const seteDias: Expediente = { ...EXPEDIENTE_PADRAO, diasDaSemana: [1, 2, 3, 4, 5, 6, 7] }
  ok('quem atende domingo tem', buracosDoDia([], DOMINGO, cedo, seteDias).length === 1)
  const semDias: Expediente = { ...EXPEDIENTE_PADRAO, diasDaSemana: [] }
  ok('lista de dias vazia cai no padrao, e nao apaga a semana',
    buracosDoDia([], QUARTA, cedo, semDias).length === 1)
}

// ──── Entrada torta ────
{
  const b = buracosDoDia(
    [{ id: 9, quando: 'amanha de tarde', nome: 'X', duracao: 60, status: 'confirmada', tipo: null }],
    QUARTA, cedo,
  )
  ok('data que nao parseia e descartada, e nao vira NaN', emTexto(b).join('') === '08:00-18:00')
  ok('nenhum minuto NaN escapa', b.every(x => Number.isFinite(x.minutos)))
}
{
  ok('dia invalido devolve lista vazia', buracosDoDia([], new Date('lixo'), cedo).length === 0)
}

// ──── duracaoPorExtenso ────
ok('50 min', duracaoPorExtenso(50) === '50 min')
ok('59 min', duracaoPorExtenso(59) === '59 min')
ok('60 vira 1h redondo', duracaoPorExtenso(60) === '1h')
ok('190 vira 3h10', duracaoPorExtenso(190) === '3h10')
ok('125 zera a esquerda', duracaoPorExtenso(125) === '2h05')
ok('120 nao vira 2h00', duracaoPorExtenso(120) === '2h')
ok('zero nao vira "0 min"', duracaoPorExtenso(0) === '')
ok('negativo nao vira nada', duracaoPorExtenso(-30) === '')
ok('NaN nao vira "NaN min"', duracaoPorExtenso(Number.NaN) === '')
ok('Infinity tambem nao', duracaoPorExtenso(Number.POSITIVE_INFINITY) === '')

/* ──── OS DOIS NUMEROS QUE PRECISAM CONCORDAR ────
 *
 * `MINIMO_DO_BURACO_MIN` esta escrito aqui e `DURACAO_SUPOSTA_MIN` esta em
 * `diaDaNutri`, e eles nao podem ser importados: este arquivo so roda no Node
 * porque a lib nao importa nada de runtime. Numero repetido e a armadilha 5
 * esperando acontecer.
 *
 * Entao o teste LE o outro arquivo como texto. Se alguem mudar a duracao
 * suposta da agenda e esquecer daqui, a tela passa a oferecer uma vaga onde a
 * consulta nao cabe -- e isso nao daria erro em lugar nenhum. */
{
  const outro = readFileSync(new URL('./diaDaNutri.ts', import.meta.url), 'utf8')
  const m = /export const DURACAO_SUPOSTA_MIN\s*=\s*(\d+)/.exec(outro)
  ok('achei a constante no diaDaNutri (o teste conferindo a si mesmo)', m !== null)
  ok('a duracao suposta da agenda bate com o minimo do buraco',
    m !== null && Number(m[1]) === MINIMO_DO_BURACO_MIN)
}

console.log(passou + ' passaram, ' + falhas.length + ' falharam')
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
