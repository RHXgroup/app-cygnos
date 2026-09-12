/* Data e hora digitadas viram um instante -- ou uma recusa com frase.
 *
 * Fica fora da tela, e sem importar nada de runtime, porque é a parte que erra:
 * 31/02, hora 25:00, ano de dois dígitos, a consulta marcada para o ano que vem
 * por um dedo no teclado. A tela desenha; aqui decide-se o que vale.
 *
 * ── O fuso mora AQUI, e é por isso que a função recebe `agora` ─────────────
 * O que sai é um `Date`, que é um INSTANTE, e o banco guarda `timestamptz`.
 * Montar a data com `new Date(ano, mes - 1, dia, hora, min)` usa o fuso DO
 * APARELHO -- que é o dela, no consultório -- e é exatamente o que se quer:
 * "quinta, 14h" é quinta 14h onde ela está. Quem converte para UTC é o
 * `toISOString` na hora de mandar.
 *
 * A armadilha do outro lado já custou uma rodada na Aurora: texto sem fuso
 * ("2026-09-12T14:00") chega ao `timestamptz` como UTC e a consulta anda três
 * horas. Por isso esta função devolve `Date`, e não texto. */

export type LeituraDoHorario =
  | { tipo: 'ok'; quando: Date }
  | { tipo: 'erro'; mensagem: string }

/* Quanto tempo para trás a agenda aceita. Marcar consulta que já aconteceu é
   legítimo -- ela atendeu e está lançando depois --, mas um ano atrás é dedo
   errado no ano, não memória. */
const ANOS_PARA_TRAS = 1
/* E para a frente: dois anos cobre qualquer acompanhamento; mais que isso é
   2026 digitado como 2226. */
const ANOS_PARA_FRENTE = 2

const soDigitos = (v: string) => v.replace(/\D/g, '')

export function lerHorarioDaConsulta(
  data: string,
  hora: string,
  agora: Date = new Date(),
): LeituraDoHorario {
  const d = soDigitos(data)
  const h = soDigitos(hora)

  if (d.length !== 8) return { tipo: 'erro', mensagem: 'Escreva a data completa, como 12/09/2026.' }
  if (h.length !== 4) return { tipo: 'erro', mensagem: 'Escreva a hora completa, como 14:30.' }

  const dia = Number(d.slice(0, 2))
  const mes = Number(d.slice(2, 4))
  const ano = Number(d.slice(4))
  const horas = Number(h.slice(0, 2))
  const minutos = Number(h.slice(2))

  if (mes < 1 || mes > 12) return { tipo: 'erro', mensagem: 'Esse mês não existe.' }
  if (horas > 23) return { tipo: 'erro', mensagem: 'A hora vai até 23.' }
  if (minutos > 59) return { tipo: 'erro', mensagem: 'Os minutos vão até 59.' }

  const quando = new Date(ano, mes - 1, dia, horas, minutos, 0, 0)

  /* A volta é a prova: o JavaScript aceita 31 de fevereiro e escorrega para 3
     de março sem reclamar -- e a consulta apareceria num dia que ela não
     escolheu. */
  if (
    quando.getFullYear() !== ano ||
    quando.getMonth() !== mes - 1 ||
    quando.getDate() !== dia
  ) {
    return { tipo: 'erro', mensagem: 'Essa data não existe. Confira o dia.' }
  }

  /* Os limites andam pelo CALENDÁRIO, e não por 365,25 dias: com a conta em
     dias, "daqui a dois anos" caía fora por causa de um 29 de fevereiro no
     meio -- o teste pegou. `setFullYear` sobre uma cópia faz o ano virar ano. */
  const limite = (anos: number) => {
    const d = new Date(agora.getTime())
    d.setFullYear(d.getFullYear() + anos)
    return d
  }
  if (quando < limite(-ANOS_PARA_TRAS)) {
    return { tipo: 'erro', mensagem: 'Essa data está muito no passado. Confira o ano.' }
  }
  if (quando > limite(ANOS_PARA_FRENTE)) {
    return { tipo: 'erro', mensagem: 'Essa data está muito longe. Confira o ano.' }
  }

  return { tipo: 'ok', quando }
}

/* "quinta, 12 de setembro, 14:30" -- a frase de conferência antes de marcar.
   Existe porque o campo mostra 12/09/2026 e ninguém confere dia da semana de
   cabeça: é olhando "quinta" que ela percebe que queria sexta. */
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function horarioPorExtenso(quando: Date): string {
  if (Number.isNaN(quando.getTime())) return ''
  const hh = String(quando.getHours()).padStart(2, '0')
  const mm = String(quando.getMinutes()).padStart(2, '0')
  return `${DIAS[quando.getDay()]}, ${quando.getDate()} de ${MESES[quando.getMonth()]}, ${hh}:${mm}`
}

/* O fim, para a tela dizer "das 14:30 às 15:30" sem a pessoa somar de cabeça
   -- e é a soma que revela a duração errada antes de ela marcar. */
export function fimDaConsulta(quando: Date, duracaoMin: number): string {
  const fim = new Date(quando.getTime() + Math.max(1, duracaoMin) * 60000)
  return `${String(fim.getHours()).padStart(2, '0')}:${String(fim.getMinutes()).padStart(2, '0')}`
}
