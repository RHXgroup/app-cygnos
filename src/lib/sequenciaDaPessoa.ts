/* Há quantos dias ela não abandona isto — e o que falta para o próximo marco.
 *
 * ── Por que esta é a peça que faltava ─────────────────────────────────────
 * Pesquisei antes de escrever, porque já construí coisa daqui de cabeça e deu
 * errado. Dois números decidiram o desenho:
 *
 *   70% das pessoas largam um aplicativo de registro alimentar em DUAS
 *   SEMANAS quando ele parece trabalhoso. Quem gasta mais de 15 minutos por
 *   dia registrando tem 2,1 vezes mais chance de largar até o terceiro mês.
 *
 *   E o melhor previsor de retenção longa que o Duolingo já mediu não é
 *   retenção de 30 dias: é a pessoa CHEGAR AOS 7 DIAS seguidos. Sete é o
 *   número que separa quem fica de quem some.
 *
 * O app já tinha sequência de treino e de água, cada uma no seu canto. Não
 * tinha a do app inteiro — que é justamente a que a pessoa sente.
 *
 * ── O perdão, e por que ele é limitado ────────────────────────────────────
 * Sequência sem perdão é uma armadilha: a pessoa esquece um dia, perde 40 dias
 * de história e não volta mais. Sequência com perdão demais não significa nada.
 *
 * A medida veio de teste real: duas folgas funcionam melhor do que uma, e três
 * é igual a duas. Passando disso o número perde sentido e a pessoa percebe.
 *
 * A regra aqui é uma frase, e isso é de propósito — sequência que a pessoa não
 * consegue prever vira loteria, e loteria não cria hábito:
 *
 *   PULAR UM DIA NÃO QUEBRA. PULAR DOIS SEGUIDOS, QUEBRA.
 *
 * ── E o número não mente ──────────────────────────────────────────────────
 * A conta é de DIAS REGISTRADOS DE VERDADE, não de dias de calendário. Quem
 * registra dia sim, dia não durante um mês vê "15 dias", e não "30" — porque
 * quinze foi o que ela fez. O perdão evita o zero; ele não infla o número.
 *
 * É a diferença entre reconhecer o esforço e bajular. Um app que diz 30 quando
 * foram 15 é descoberto na primeira conferida, e aí nada que ele diz vale mais.
 *
 * ── O que conta como dia ──────────────────────────────────────────────────
 * Registro de verdade: comida, água, peso, sono ou treino. ABRIR O APP NÃO
 * CONTA. Contar abertura transformaria a sequência em medida de quem abre por
 * culpa, que é exatamente o oposto do que ela existe para incentivar.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { ehDataReal, emDias, somandoDias } from './datas.ts'

/* Quantos dias seguidos sem registro a sequência aguenta.
 *
 * Um. "Pulei ontem" não quebra; "sumi o fim de semana" quebra. Dois é o teto
 * que a literatura de hábito sustenta, e aqui ele vale como INTERVALO — o que
 * dá a mesma folga com uma regra que cabe numa frase. */
const FOLGA_EM_DIAS = 1

/* Os marcos. Sete primeiro, porque é o que a medida diz que importa; depois os
   que a pessoa já espera de qualquer contador. */
export const MARCOS = [7, 14, 30, 60, 100, 180, 365]

export type Sequencia = {
  /* Dias REGISTRADOS de verdade, contando para trás. Nunca é maior do que o
     número de dias em que ela de fato fez alguma coisa. */
  dias: number
  /* Verdadeiro quando hoje ainda não tem registro E ontem tinha. É o único
     estado em que vale avisar: a sequência está viva e depende de hoje. */
  emRisco: boolean
  /* Verdadeiro quando ela já registrou hoje. A tela usa para não pedir de novo
     o que já foi feito. */
  hojeFeito: boolean
  /* O próximo marco, e quantos dias faltam. Nulos quando ela já passou do
     último — aí o número sozinho já é a recompensa. */
  proximoMarco: number | null
  faltamParaOMarco: number | null
  /* Verdadeiro quando HOJE fechou um marco. Existe para a tela comemorar uma
     vez, no dia, e não toda vez que a pessoa abrir depois. */
  marcoHoje: boolean
}

export const SEM_SEQUENCIA: Sequencia = {
  dias: 0,
  emRisco: false,
  hojeFeito: false,
  proximoMarco: MARCOS[0],
  faltamParaOMarco: MARCOS[0],
  marcoHoje: false,
}

/* A sequência, a partir das datas em que ela registrou alguma coisa.
 *
 * Recebe datas soltas, e não um objeto por assunto, porque a pergunta é "ela
 * apareceu?" e não "o que ela fez?". Quem monta o conjunto é a tela, que já tem
 * os dados carregados — assim isto não faz ida à rede nenhuma. */
export function sequenciaDaPessoa(datasComRegistro: Iterable<string>, hoje: string): Sequencia {
  if (!ehDataReal(hoje)) return SEM_SEQUENCIA

  /* Set próprio, e só com data real: uma data inventada ('2026-02-31') passa no
     formato, não existe no calendário, e o JavaScript escorrega para março —
     entrando na contagem como um dia que nunca houve. */
  const dias = new Set<string>()
  for (const d of datasComRegistro) {
    if (ehDataReal(d) && d <= hoje) dias.add(d)
  }
  if (dias.size === 0) return SEM_SEQUENCIA

  const hojeFeito = dias.has(hoje)

  /* De onde começar a contar para trás.
   *
   * Se hoje ainda não tem registro, a contagem começa ONTEM: o dia não acabou,
   * e zerar a sequência de quem ainda vai jantar seria punir o relógio. */
  const inicio = hojeFeito ? hoje : somandoDias(hoje, -1)
  if (!dias.has(inicio)) {
    /* Nem hoje nem ontem. A sequência acabou; o que sobrou é história. */
    return { ...SEM_SEQUENCIA, hojeFeito: false, emRisco: false }
  }

  let contados = 0
  let cursor = inicio
  /* Teto de segurança: dois anos. Sem ele, um conjunto com data corrompida
     poderia fazer o laço andar para trás indefinidamente. */
  for (let passos = 0; passos < 800; passos++) {
    if (dias.has(cursor)) {
      contados++
      cursor = somandoDias(cursor, -1)
      continue
    }
    /* Buraco. Só continua se ele couber na folga E se houver registro do outro
       lado — um buraco no fim da história não é folga, é o começo dela. */
    let pulados = 0
    let olhando = cursor
    while (pulados <= FOLGA_EM_DIAS && !dias.has(olhando)) {
      pulados++
      olhando = somandoDias(olhando, -1)
    }
    if (pulados > FOLGA_EM_DIAS || !dias.has(olhando)) break
    cursor = olhando
  }

  const proximoMarco = MARCOS.find(m => m > contados) ?? null
  /* Marco fechado HOJE: o número bateu num marco e foi hoje que ele fechou.
     Sem a segunda condição, a tela comemoraria os 7 dias todos os dias até
     virar 8 — e comemoração repetida deixa de ser comemoração. */
  const marcoHoje = hojeFeito && MARCOS.includes(contados)

  return {
    dias: contados,
    /* Em risco só quando há o que perder: ontem tem registro, hoje não. */
    emRisco: !hojeFeito && contados > 0,
    hojeFeito,
    proximoMarco,
    faltamParaOMarco: proximoMarco === null ? null : proximoMarco - contados,
    marcoHoje,
  }
}

/* A frase da sequência, escrita aqui e não na tela.
 *
 * Aqui porque o que ela PODE dizer depende do que o número sustenta, e essa
 * decisão é desta camada — a mesma razão de `avisoDaSemana` existir.
 *
 * ── O tom, que é metade do trabalho ───────────────────────────────────────
 * Nada de "você falhou", "não perca", "sua sequência está em perigo". Ameaça
 * funciona uma vez e depois vira o motivo de desinstalar — e num app de saúde,
 * onde a pessoa já chega se cobrando, ela cobra em cima de cobrança.
 *
 * O convite é sempre para o próximo passo pequeno, nunca para o julgamento do
 * que passou. */
export function fraseDaSequencia(s: Sequencia): string {
  if (s.dias === 0) {
    return 'Registre alguma coisa hoje — água já conta — e a sua sequência começa.'
  }

  if (s.marcoHoje) {
    if (s.dias === 7) return 'Uma semana inteira. É aqui que vira hábito de verdade.'
    if (s.dias === 30) return 'Um mês. Isso é mais do que a maioria consegue.'
    return `${s.dias} dias. Vale parar um segundo e reparar nisso.`
  }

  if (s.emRisco) {
    /* Convite, e não ameaça. E diz o caminho mais barato de todos, porque quem
       está prestes a pular um dia não vai preencher um formulário. */
    return s.dias === 1
      ? 'Você começou ontem. Um copo de água hoje já mantém de pé.'
      : `${s.dias} dias seguidos até ontem. Um copo de água hoje já mantém.`
  }

  if (s.faltamParaOMarco !== null && s.faltamParaOMarco <= 2 && s.proximoMarco !== null) {
    return s.faltamParaOMarco === 1
      ? `${s.dias} dias. Amanhã fecha ${s.proximoMarco}.`
      : `${s.dias} dias. Faltam ${s.faltamParaOMarco} para ${s.proximoMarco}.`
  }

  return s.dias === 1 ? 'Primeiro dia registrado.' : `${s.dias} dias seguidos.`
}
