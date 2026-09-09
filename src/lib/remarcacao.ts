/* O que ela digita para remarcar, virando um instante -- ou uma recusa.
 *
 * ──────────────────── Por que isto é uma lib, e não duas funções dentro da tela ────────────────────
 * Porque é a parte que erra. O resto do remarcar é uma chamada de RPC; aqui é
 * onde "31/02", "25:00", "3/9" e o ano que ela não digitou viram uma data. Fora
 * da tela isso roda no Node e dá para exercitar de verdade, com o relógio
 * parado -- ver o `.teste.mts` ao lado.
 *
 * ──────────────────── A REGRA DO ANO, que é a única coisa aqui que "adivinha" ────────────────────
 * Ela digita 16/09, sem ano, porque ninguém digita o ano de uma consulta da
 * semana que vem. Duas leituras possíveis, e as duas estão certas em algum dia
 * do calendário:
 *
 *   - em 09 de setembro, "16/09" é daqui a uma semana
 *   - em 28 de dezembro, "05/01" é daqui a oito dias, e NÃO onze meses atrás
 *
 * Então: o ano corrente; e se isso cair no passado, o ano seguinte. Nunca o
 * anterior -- remarcar é sempre para a frente, e o banco recusa o passado de
 * qualquer jeito. O que esta regra evita é ela digitar 05/01 em dezembro e
 * receber uma recusa que parece defeito.
 *
 * O limite disso é honesto e vale escrever: quem quiser remarcar para dali a
 * treze meses precisa digitar o ano, e a máscara aceita. É um caso raro contra
 * um caso de toda virada de ano. */

/** Só dígitos, com a barra entrando sozinha: `16` vira `16/`, `1609` vira `16/09`. */
export function mascaraDeData(bruto: string): string {
  const n = bruto.replace(/[^0-9]/g, '').slice(0, 8)
  if (n.length <= 2) return n
  if (n.length <= 4) return n.slice(0, 2) + '/' + n.slice(2)
  return n.slice(0, 2) + '/' + n.slice(2, 4) + '/' + n.slice(4)
}

/** `1430` vira `14:30`. Dois pontos, e nunca vírgula: hora não é decimal. */
export function mascaraDeHora(bruto: string): string {
  const n = bruto.replace(/[^0-9]/g, '').slice(0, 4)
  if (n.length <= 2) return n
  return n.slice(0, 2) + ':' + n.slice(2)
}

export type Remarcacao =
  | { tipo: 'ok'; quando: Date }
  | { tipo: 'erro'; mensagem: string }

/**
 * `16/09` + `14:30` vira o instante, no relógio DELA.
 *
 * `agora` entra por parâmetro para o teste poder parar o relógio -- sem isso a
 * regra do ano só daria para exercitar em dezembro.
 */
export function interpretarRemarcacao(
  data: string,
  hora: string,
  agora: Date = new Date(),
): Remarcacao {
  const d = data.replace(/[^0-9]/g, '')
  const h = hora.replace(/[^0-9]/g, '')

  /* As duas faltas são dita uma de cada vez, e nomeando qual: "preencha os
     campos" faz ela olhar os dois procurando o que está errado. */
  if (d.length < 4) return { tipo: 'erro', mensagem: 'Escreva a data assim: 16/09.' }
  if (h.length < 4) return { tipo: 'erro', mensagem: 'Escreva a hora assim: 14:30.' }

  const dia = Number(d.slice(0, 2))
  const mes = Number(d.slice(2, 4))
  const horas = Number(h.slice(0, 2))
  const minutos = Number(h.slice(2, 4))

  if (mes < 1 || mes > 12) return { tipo: 'erro', mensagem: 'Esse mês não existe.' }
  if (dia < 1 || dia > 31) return { tipo: 'erro', mensagem: 'Esse dia não existe.' }
  if (horas > 23) return { tipo: 'erro', mensagem: 'A hora vai de 00 a 23.' }
  if (minutos > 59) return { tipo: 'erro', mensagem: 'Os minutos vão de 00 a 59.' }

  /* O ano digitado ganha de qualquer regra: se ela escreveu, é porque quis. */
  const anoDigitado = d.length === 8 ? Number(d.slice(4, 8)) : null
  if (anoDigitado !== null && (anoDigitado < 2000 || anoDigitado > 2100)) {
    return { tipo: 'erro', mensagem: 'Esse ano não parece certo.' }
  }

  const monta = (ano: number) => new Date(ano, mes - 1, dia, horas, minutos, 0, 0)

  /* `new Date(2026, 1, 31)` NÃO estoura: transborda para 03/03. 31 de fevereiro
     viraria uma consulta em março, marcada sem ninguém ver -- que é o mesmo
     transbordo que já mordeu o vencimento de parcela no site. Conferir o dia de
     volta é o único jeito de pegar. */
  const conferido = (ano: number): Date | null => {
    const x = monta(ano)
    return x.getDate() === dia && x.getMonth() === mes - 1 ? x : null
  }

  if (anoDigitado !== null) {
    const x = conferido(anoDigitado)
    return x ? { tipo: 'ok', quando: x } : { tipo: 'erro', mensagem: 'Esse dia não existe nesse mês.' }
  }

  const desteAno = conferido(agora.getFullYear())
  if (desteAno && desteAno.getTime() > agora.getTime()) return { tipo: 'ok', quando: desteAno }

  /* Passou, ou 29/02 num ano que não é bissexto: tenta o ano seguinte. Em
     dezembro isso é o caso NORMAL, e não a exceção. */
  const proximo = conferido(agora.getFullYear() + 1)
  if (proximo) return { tipo: 'ok', quando: proximo }

  /* Sobrou 29/02 caindo em dois anos não bissextos seguidos -- só acontece com
     dia inválido de verdade, porque um dos dois próximos anos é bissexto em no
     máximo quatro tentativas. Dizer o que está errado é melhor que travar. */
  return { tipo: 'erro', mensagem: 'Esse dia não existe nesse mês.' }
}
