/* A meta de caloria que acompanha o corpo, em vez de congelar no dia do cálculo.
 *
 * ── O que isto acrescenta ao que já existe ────────────────────────────────
 * `gastoReal.ts` já mede o gasto pelo que ela comeu e pelo que o peso fez —
 * e é uma medida honesta, com trava de dias, de cobertura e de faixa. O que
 * faltava era o passo seguinte: transformar essa medida em META.
 *
 * Sem isso o gasto medido é uma curiosidade na tela do peso. Com isso, ele
 * responde a única pergunta que a pessoa tem: "então eu como quanto?".
 *
 * ── O limite que NÃO é técnico ────────────────────────────────────────────
 * Se a caloria veio da nutricionista, esta função NÃO propõe trocar. Nem com o
 * número medido na mão, nem com a diferença gritando.
 *
 * A meta prescrita é conduta clínica: pode existir déficit menor de propósito,
 * fase de manutenção, restrição por exame, gestação. Um aplicativo que
 * sobrescreve isso porque a aritmética discorda está praticando nutrição sem
 * ser nutricionista — e o Cygnos existe para o outro lado disso.
 *
 * O que ele faz nesse caso é o que uma boa paciente faria: leva o número para
 * ela. Quem decide continua sendo quem prescreveu.
 *
 * ── As três travas da proposta ────────────────────────────────────────────
 * 1. DIFERENÇA MATERIAL. Mexer na meta por 40 kcal é ruído com cara de
 *    conselho — e uma meta que muda toda semana ensina a não confiar nela.
 * 2. PASSO LIMITADO. A medida pode estar errada (diário subnotificado, peso
 *    corrompido). Um pulo de 900 kcal de uma vez transforma um erro de medida
 *    em fome ou em ganho de peso. Ela anda até 400 por vez e volta na próxima.
 * 3. PISO. Nunca abaixo de 1.200 kcal, aconteça o que acontecer com a conta.
 *    Abaixo disso não se garante micronutriente com comida de verdade, e essa
 *    é a fronteira entre dieta e problema.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho, e é testado em `metaAdaptativa.teste.mts`. */

import type { GastoReal } from './gastoReal.ts'

export type ObjetivoDePeso = 'perder' | 'manter' | 'ganhar'

export type SugestaoDeMeta =
  /* Nada a dizer: sem medida confiável, ou a meta atual já está onde deveria. */
  | { tipo: 'nada' }
  /* A meta é dela, e dá para propor um número novo. */
  | { tipo: 'sugerir'; kcal: number; frase: string }
  /* A meta é da nutricionista. Não se mexe: mostra a diferença e oferece
     levar o assunto para quem prescreveu. */
  | { tipo: 'contar_para_ela'; frase: string }

/* Quanto se tira do gasto para perder, e quanto se põe para ganhar.
 *
 * 15% e 10%. Não é chute: déficit maior derruba aderência e massa magra junto,
 * e superávit maior vira gordura em vez de músculo. São as faixas que a
 * literatura de composição corporal repete há duas décadas. */
const CORTE_PARA_PERDER = 0.15
const SOBRA_PARA_GANHAR = 0.10

/* Menos que isto é ruído. Os dois precisam valer: 100 kcal em 1.400 é mudança
   de verdade; 100 kcal em 3.200 não é. */
const DIFERENCA_MINIMA_KCAL = 100
const DIFERENCA_MINIMA_FRACAO = 0.05

/* O quanto a meta pode andar de uma vez. */
const PASSO_MAXIMO = 400

/* O chão, e ele não tem exceção. */
const PISO_KCAL = 1200

const arredondar = (n: number): number => Math.round(n / 10) * 10

const emKcal = (n: number): string => n.toLocaleString('pt-BR') + ' kcal'

export function metaAdaptativa(entrada: {
  gasto: GastoReal | null
  /* O que vale hoje. Null quando ela nunca definiu meta nenhuma — e aí não há
     o que comparar, só o que oferecer. */
  metaAtual: number | null
  objetivo: ObjetivoDePeso
  /* A caloria veio da nutricionista? Ver o bloco lá em cima: isso muda o
     desfecho inteiro, não só a redação. */
  prescritaPelaNutri: boolean
}): SugestaoDeMeta {
  const { gasto, metaAtual, objetivo, prescritaPelaNutri } = entrada

  /* Sem medida não há proposta. `gastoReal` já devolve null quando faltam dias
     ou cobertura -- confiar nele é o certo, e refazer a trava aqui seria uma
     segunda cópia da mesma regra. */
  if (!gasto) return { tipo: 'nada' }

  const bruta =
    objetivo === 'perder' ? gasto.kcal * (1 - CORTE_PARA_PERDER)
    : objetivo === 'ganhar' ? gasto.kcal * (1 + SOBRA_PARA_GANHAR)
    : gasto.kcal

  /* O piso entra ANTES do passo. Ao contrário, uma meta de 1.300 com proposta
     de 900 andaria para 1.100 -- respeitando o passo e furando o piso. */
  const comPiso = Math.max(arredondar(bruta), PISO_KCAL)

  /* Sem meta anterior não há passo a limitar: o número proposto é o número. */
  if (metaAtual === null || !Number.isFinite(metaAtual) || metaAtual <= 0) {
    return prescritaPelaNutri
      ? { tipo: 'nada' }
      : {
          tipo: 'sugerir',
          kcal: comPiso,
          frase:
            'Pelo que você registrou nos últimos ' + gasto.diasRegistrados +
            ' dias, o seu gasto é de cerca de ' + emKcal(gasto.kcal) +
            ' por dia. Para ' + (objetivo === 'perder' ? 'perder peso' : objetivo === 'ganhar' ? 'ganhar peso' : 'manter o peso') +
            ', a meta seria ' + emKcal(comPiso) + '.',
        }
  }

  const diferenca = comPiso - metaAtual
  const cabe =
    Math.abs(diferenca) >= DIFERENCA_MINIMA_KCAL &&
    Math.abs(diferenca) >= metaAtual * DIFERENCA_MINIMA_FRACAO
  if (!cabe) return { tipo: 'nada' }

  /* A meta é conduta dela. Mostra a diferença e para por aqui. */
  if (prescritaPelaNutri) {
    return {
      tipo: 'contar_para_ela',
      frase:
        'Pelo que você registrou, o seu gasto está em cerca de ' + emKcal(gasto.kcal) +
        ' por dia, e a sua meta prescrita é ' + emKcal(metaAtual) +
        '. Isso pode ser de propósito. Vale contar para a sua nutricionista na próxima conversa.',
    }
  }

  const andou = Math.max(-PASSO_MAXIMO, Math.min(PASSO_MAXIMO, diferenca))
  const nova = Math.max(arredondar(metaAtual + andou), PISO_KCAL)

  /* O passo pode ter zerado a diferença por arredondamento. */
  if (nova === metaAtual) return { tipo: 'nada' }

  return {
    tipo: 'sugerir',
    kcal: nova,
    frase:
      'Nos últimos ' + gasto.diasRegistrados + ' dias você registrou uma média de ' +
      emKcal(gasto.mediaConsumida) + ' por dia, e o peso ' +
      (gasto.variacaoKg < -0.2 ? 'caiu ' + Math.abs(gasto.variacaoKg).toFixed(1).replace('.', ',') + ' kg'
        : gasto.variacaoKg > 0.2 ? 'subiu ' + gasto.variacaoKg.toFixed(1).replace('.', ',') + ' kg'
        : 'ficou onde estava') +
      '. Isso põe o seu gasto perto de ' + emKcal(gasto.kcal) +
      ', então a meta ' + (nova > metaAtual ? 'sobe' : 'desce') + ' para ' + emKcal(nova) + '.',
  }
}

/* ──────────────────── DE OBJETIVO CLÍNICO PARA DIREÇÃO DE CALORIA ────────────────────
 *
 * `objetivos.ts` tem onze objetivos, e a maioria NÃO diz nada sobre caloria:
 * controle glicêmico, saúde intestinal, cardiovascular e menopausa são conduta,
 * e a caloria dentro deles pode ir para qualquer lado — depende do exame, do
 * peso, da fase.
 *
 * Então o mapa cobre só os quatro que têm direção óbvia no próprio nome, e
 * devolve NULL no resto. Null aqui quer dizer "não proponho", e não "manter":
 * chutar manutenção para quem está em tratamento de menopausa é o app dando
 * conduta com cara de conveniência.
 *
 * É a armadilha 10 do AGENTS pelo lado que interessa: valor vindo do banco não
 * indexa um `Record` cru, e o desconhecido tem de admitir que é desconhecido. */
const DIRECAO: Record<string, ObjetivoDePeso> = {
  emagrecimento: 'perder',
  manutencao: 'manter',
  reeducacao_alimentar: 'manter',
  hipertrofia: 'ganhar',
  ganho_peso: 'ganhar',
}

/* `Object.hasOwn`, e não o índice cru: o mapa é um objeto comum, e objeto comum
   HERDA. `DIRECAO['constructor']` devolve a função Object, que não é nula --
   achado por força bruta, com cinco mil entradas sorteadas. Nenhum objetivo do
   banco se chama "constructor" hoje; a armadilha 10 existe justamente para o
   dia em que um valor novo aparece na coluna. */
export const direcaoDoObjetivo = (chave: string | null | undefined): ObjetivoDePeso | null =>
  chave && Object.hasOwn(DIRECAO, chave) ? DIRECAO[chave] : null
