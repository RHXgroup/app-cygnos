/* A sequência do paciente, lida do lado da nutricionista.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * O paciente vê a própria sequência na tela inicial desde o começo
 * ("11 dias seguidos"), e a nutricionista não via nada. Para ela esse número é
 * outra coisa: é ADESÃO, e adesão é informação clínica. "A Juliana registra há
 * 21 dias" e "o Renan parou há 9" mudam o que ela vai conversar na consulta.
 *
 * A triagem da carteira já tinha o lado negativo (o sinal de "sem registrar no
 * app"); faltava o positivo -- e é o positivo que dá o que elogiar, e elogio
 * certo na hora certa é o que segura paciente em acompanhamento.
 *
 * ── A regra é a MESMA do paciente ─────────────────────────────────────────
 * Quem conta os dias é `sequenciaDaPessoa`, com o mesmo perdão ("pular um dia
 * não quebra; pular dois, quebra") e a mesma honestidade (conta dia registrado,
 * não dia de calendário). Duas contas diferentes para a mesma pessoa -- uma na
 * tela dela e outra na da nutricionista -- dariam dois números, e a primeira
 * vez que as duas conversassem sobre isso, uma delas estaria errada.
 *
 * O que muda é só a PESSOA do verbo, e o que se diz quando a sequência caiu:
 * para o paciente o app não diz "você parou há 9 dias" (é cobrança); para a
 * nutricionista diz, porque é exatamente o que ela precisa saber.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { sequenciaDaPessoa } from './sequenciaDaPessoa.ts'
import { ehDataReal, emDias } from './datas.ts'

export type AdesaoDoPaciente =
  /* Não tem conta no app, ou tem e não está vinculado a ela. Não é falta de
     adesão: é outra forma de acompanhamento, e a tela não pode tratar como
     problema. */
  | { tipo: 'sem_app' }
  /* Tem o app e nunca registrou nada. */
  | { tipo: 'sem_registro' }
  /* Sequência viva -- inclusive quando hoje ainda não tem registro e ontem
     tinha: o dia não acabou. */
  | { tipo: 'em_dia'; dias: number; proximoMarco: number | null }
  /* A sequência caiu. Quantos dias desde o último registro. */
  | { tipo: 'parou'; haDias: number }

export function adesaoDoPaciente(
  /* Null quando o paciente não tem app vinculado. Lista vazia quando tem e
     não registrou nada. São dois casos, e a tela diz coisas diferentes. */
  datas: readonly string[] | null,
  hoje: string,
): AdesaoDoPaciente {
  if (datas === null) return { tipo: 'sem_app' }

  const reais = datas.filter(d => ehDataReal(d) && d <= hoje)
  if (reais.length === 0) return { tipo: 'sem_registro' }

  const s = sequenciaDaPessoa(reais, hoje)
  if (s.dias > 0) return { tipo: 'em_dia', dias: s.dias, proximoMarco: s.proximoMarco }

  /* Caiu: conta de CALENDÁRIO desde o último dia registrado. Aqui é o calendário
     que interessa -- "parou há 9 dias" é sobre quanto tempo ela está sem
     aparecer, não sobre quantos registros deixou de fazer. */
  const ultima = reais.reduce((a, b) => (a > b ? a : b))
  return { tipo: 'parou', haDias: emDias(ultima, hoje) }
}

/* Uma frase, na terceira pessoa. */
export function fraseDaAdesao(a: AdesaoDoPaciente): string {
  switch (a.tipo) {
    case 'sem_app':
      return 'Não usa o aplicativo.'
    case 'sem_registro':
      return 'Tem o aplicativo, mas ainda não registrou nada.'
    case 'em_dia':
      return a.dias === 1
        ? 'Registrou hoje ou ontem -- a sequência começou.'
        : 'Registra há ' + a.dias + ' dias seguidos.'
    case 'parou':
      return a.haDias === 1 ? 'Parou de registrar ontem.' : 'Parou de registrar há ' + a.haDias + ' dias.'
  }
}

/* Vale destacar? Só nos dois extremos que mudam a conversa da consulta: quem
   está indo bem há tempo suficiente para merecer elogio, e quem sumiu há tempo
   suficiente para merecer pergunta. O meio -- três dias seguidos, parou
   anteontem -- é ruído, e destacar ruído ensina a ignorar o destaque. */
export function destaqueDaAdesao(a: AdesaoDoPaciente): 'bom' | 'atencao' | null {
  if (a.tipo === 'em_dia' && a.dias >= 7) return 'bom'
  if (a.tipo === 'parou' && a.haDias >= 7) return 'atencao'
  return null
}
