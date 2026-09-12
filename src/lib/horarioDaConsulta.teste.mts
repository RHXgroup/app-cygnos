import { lerHorarioDaConsulta, horarioPorExtenso, fimDaConsulta } from './horarioDaConsulta.ts'

let falhas = 0
const ok = (cond: boolean, nome: string) => {
  console.log(cond ? '  ok    ' + nome : '  FALHOU ' + nome)
  if (!cond) falhas++
}

const AGORA = new Date(2026, 8, 11, 10, 0)
const ler = (d: string, h: string) => lerHorarioDaConsulta(d, h, AGORA)

console.log('\nhorario da consulta\n')

{
  const r = ler('12/09/2026', '14:30')
  ok(r.tipo === 'ok', 'data e hora normais passam')
  if (r.tipo === 'ok') {
    ok(r.quando.getFullYear() === 2026 && r.quando.getMonth() === 8 && r.quando.getDate() === 12,
      'o dia e o mes sao os digitados')
    ok(r.quando.getHours() === 14 && r.quando.getMinutes() === 30, 'a hora e a digitada')
    ok(horarioPorExtenso(r.quando) === 'sábado, 12 de setembro, 14:30', 'a frase diz o dia da semana')
    ok(fimDaConsulta(r.quando, 60) === '15:30', 'o fim soma a duracao')
    ok(fimDaConsulta(r.quando, 45) === '15:15', 'e com 45 minutos tambem')
  }
}

ok(ler('12092026', '1430').tipo === 'ok', 'aceita sem barra e sem dois pontos')
ok(ler('12/9/2026', '14:30').tipo === 'erro', 'mes de um digito e incompleto')
ok(ler('12/09/26', '14:30').tipo === 'erro', 'ano de dois digitos e incompleto')
ok(ler('', '14:30').tipo === 'erro', 'data vazia')
ok(ler('12/09/2026', '').tipo === 'erro', 'hora vazia')
ok(ler('12/09/2026', '14').tipo === 'erro', 'hora pela metade')

{
  const r = ler('31/02/2026', '10:00')
  ok(r.tipo === 'erro' && /não existe/.test(r.mensagem), '31 de fevereiro e recusado, e nao escorrega para marco')
}
ok(ler('12/13/2026', '10:00').tipo === 'erro', 'mes 13')
ok(ler('12/00/2026', '10:00').tipo === 'erro', 'mes zero')
ok(ler('12/09/2026', '25:00').tipo === 'erro', 'hora 25')
ok(ler('12/09/2026', '10:75').tipo === 'erro', 'minuto 75')
ok(ler('29/02/2028', '10:00').tipo === 'ok', '29 de fevereiro de ano bissexto vale')
ok(ler('29/02/2026', '10:00').tipo === 'erro', '29 de fevereiro de ano comum nao vale')

ok(ler('10/09/2026', '08:00').tipo === 'ok', 'ontem vale: ela lanca o que ja atendeu')
{
  const r = ler('11/09/2020', '08:00')
  ok(r.tipo === 'erro' && /passado/.test(r.mensagem), 'seis anos atras e ano digitado errado')
}
{
  const r = ler('11/09/2030', '08:00')
  ok(r.tipo === 'erro' && /longe/.test(r.mensagem), 'quatro anos a frente e ano digitado errado')
}
ok(ler('11/09/2028', '08:00').tipo === 'ok', 'dois anos a frente ainda vale')

/* Meia-noite e o fim que vira o dia seguinte: a soma nao pode devolver 24:30. */
{
  const r = ler('12/09/2026', '00:00')
  ok(r.tipo === 'ok' && r.quando.getHours() === 0, 'meia-noite e hora valida')
  if (r.tipo === 'ok') ok(fimDaConsulta(r.quando, 60) === '01:00', 'e o fim dela e uma da manha')
}
{
  const r = ler('12/09/2026', '23:30')
  ok(r.tipo === 'ok' && fimDaConsulta(r.quando, 60) === '00:30', 'consulta que atravessa a meia-noite nao vira 24:30')
}
ok(horarioPorExtenso(new Date('lixo')) === '', 'data invalida nao vira frase suja')
ok(fimDaConsulta(new Date(2026, 8, 12, 14, 0), 0) !== '', 'duracao zero nao quebra')

console.log('\n' + (falhas === 0 ? 'todos passaram' : falhas + ' falharam') + '\n')
process.exit(falhas === 0 ? 0 : 1)
