/* Os objetivos que o PACIENTE escolhe sozinho.
 *
 * ── Por que onze, e não os vinte e três ───────────────────────────────────
 * O sistema tem 23 objetivos em `objetivos_nutricionais`, cada um com ajuste
 * calórico, proteína por quilo e divisão de macros. A tentação é espelhar os 23
 * aqui — e seria errado.
 *
 * O corte não é "clínico ou não". É outra pergunta, e ela dá uma linha muito
 * mais limpa: **a pessoa já sabe isso sobre si?**
 *
 * Sete são direção de vida — emagrecer, ganhar músculo, render no esporte.
 * Ninguém precisa examinar ninguém.
 *
 * Quatro são condição que ela JÁ TEM e já sabe que tem: diabetes, colesterol
 * alto, menopausa, intestino que não vai bem. Marcar não é se diagnosticar, é
 * dizer o que já foi dito por um médico ou o que o corpo diz todo dia. E os
 * ajustes dos quatro são brandos — de 0 a −10%.
 *
 * Doze ficam de fora, e não é excesso de zelo:
 *
 *   · `doenca_renal` restringe proteína para 0,80 g/kg — marcar por engano
 *     causa dano real, e a conduta depende de exame;
 *   · gestação, lactação e bariátrica mudam por trimestre ou por fase, com
 *     suplementação e laboratório;
 *   · tireoide, esteatose e SOP se calibram por exame de sangue;
 *   · compulsão alimentar — o próprio texto do sistema diz que "peso não é o
 *     alvo primário" e que a conduta é articulada com psicologia. Uma lista de
 *     objetivos de app é o lugar errado para isso;
 *   · seletividade, neurodesenvolvimento e pediátrico são sobre um FILHO, e não
 *     sobre quem tem a conta;
 *   · sarcopenia é achado clínico, não escolha.
 *
 * Os doze continuam existindo e continuam vindo de quem pode prescrevê-los — a
 * nutricionista —, e o app os MOSTRA quando ela define, sem deixar escolher.
 *
 * ── Os slugs são os do sistema, de propósito ──────────────────────────────
 * `emagrecimento`, `hipertrofia`, `manutencao`… são as mesmas palavras de
 * `objetivos_nutricionais.slug`. Traduzir aqui criaria duas línguas para o
 * mesmo assunto, e no dia em que alguém cruzasse os dois lados a conversa não
 * fecharia — armadilha 5 do AGENTS.md atravessando a fronteira do banco, que é
 * exatamente o que aconteceu com a trava do texto da conversa.
 *
 * ── E os três antigos continuam válidos ───────────────────────────────────
 * `perda`, `manter` e `ganho` estão gravados nas contas que existem hoje.
 * Apagá-los da lista faria todo mundo aparecer "sem foco definido" da noite
 * para o dia. Eles continuam sendo lidos e traduzidos; o que muda é o que se
 * pode ESCOLHER daqui em diante. */

import { aSuaNutri } from './tratamentoDaNutri.ts'

/* Para onde o peso deve ir.
 *
 * É o que a tela de Peso usa para dizer se a variação foi na direção desejada,
 * e é a única coisa que os sete precisam ter em comum — um objetivo sem sentido
 * de peso deixaria aquela tela sem resposta.
 *
 * `manter` cobre mais do que parece: recomposição corporal e reeducação
 * alimentar trabalham perto da manutenção de propósito, e chamar a segunda de
 * "perder" seria o app inventando uma meta que ninguém pediu. */
export type SentidoDoPeso = 'perder' | 'manter' | 'ganhar'

export type Objetivo = {
  /* O mesmo slug de `objetivos_nutricionais` no sistema. */
  chave: string
  /* Verbo no infinitivo: é sempre lido depois de "Seu foco é…" ou dentro de um
     botão. */
  nome: string
  /* Uma linha, escrita para quem vai marcar — e não a `descricao` do sistema,
     que é de profissional para profissional. "Aumento ponderal em pacientes com
     magreza constitucional" não é frase para alguém que só quer engordar. */
  resumo: string
  sentido: SentidoDoPeso
  /* O ícone do Ionicons. Fica aqui e não na tela para os sete nascerem juntos:
     uma lista com seis ícones e um sem é a primeira coisa que se nota. */
  icone: string

  /* ── OS NÚMEROS, e por que eles moram junto do nome ────────────────────
   *
   * Escolher um objetivo não é só rotular: a tela de Cálculo Energético parte
   * dele para sugerir o ajuste calórico e a divisão de macros. Ela tinha as
   * próprias tabelas, com os três antigos — e com valores DIFERENTES dos do
   * sistema (perda era -15 aqui e -20 lá; a proteína da manutenção era 1,6
   * aqui e 1,4 lá).
   *
   * Duas tabelas do mesmo fato em dois repositórios divergem, e ninguém
   * descobre por qual delas a conta passou. Estes são os do sistema, copiados
   * de `objetivos_nutricionais` — a mesma fonte que a nutricionista usa. */
  ajustePct: number
  proteinaGkg: number
  carboPct: number

  /* É uma condição de saúde, e não uma direção de vida.
   *
   * Não muda cálculo nenhum: muda o que a TELA diz. Quem marca "controlar a
   * glicemia" merece ler que vale contar isso à nutricionista — o app ajusta as
   * calorias, e quem acompanha diabetes é gente, não uma lista.
   *
   * Um booleano e não um grupo separado na lista: separar em duas seções
   * ("normais" e "de saúde") carimbaria a pessoa antes de ela escolher. */
  pedeAcompanhamento?: true
}

export const OBJETIVOS: Objetivo[] = [
  {
    chave: 'emagrecimento',
    nome: 'Perder gordura',
    resumo: 'Emagrecer sem perder músculo pelo caminho.',
    sentido: 'perder',
    icone: 'trending-down-outline',
    ajustePct: -20,
    proteinaGkg: 1.8,
    carboPct: 40,
  },
  {
    chave: 'manutencao',
    nome: 'Manter o peso',
    resumo: 'Ficar onde está, com mais constância.',
    sentido: 'manter',
    icone: 'remove-outline',
    ajustePct: 0,
    proteinaGkg: 1.4,
    carboPct: 50,
  },
  {
    chave: 'hipertrofia',
    nome: 'Ganhar músculo',
    resumo: 'Crescer com treino de força e comida suficiente.',
    sentido: 'ganhar',
    icone: 'barbell-outline',
    ajustePct: 15,
    proteinaGkg: 1.9,
    carboPct: 45,
  },
  {
    chave: 'ganho_peso',
    nome: 'Ganhar peso',
    resumo: 'Subir de peso com saúde, sem forçar.',
    sentido: 'ganhar',
    icone: 'trending-up-outline',
    ajustePct: 18,
    proteinaGkg: 1.6,
    carboPct: 50,
  },
  {
    chave: 'recomposicao',
    nome: 'Trocar gordura por músculo',
    resumo: 'O peso quase não muda — o corpo muda.',
    sentido: 'manter',
    icone: 'swap-horizontal-outline',
    ajustePct: -5,
    proteinaGkg: 2.0,
    carboPct: 40,
  },
  {
    chave: 'reeducacao_alimentar',
    nome: 'Reeducação alimentar',
    resumo: 'Mudar o jeito de comer, para valer.',
    sentido: 'manter',
    icone: 'restaurant-outline',
    ajustePct: 0,
    proteinaGkg: 1.4,
    carboPct: 50,
  },
  {
    chave: 'performance_esportiva',
    nome: 'Render no esporte',
    resumo: 'Treinar melhor, recuperar mais rápido.',
    sentido: 'ganhar',
    icone: 'flash-outline',
    ajustePct: 5,
    proteinaGkg: 1.8,
    carboPct: 55,
  },

  /* ── OS QUATRO QUE A PESSOA JÁ SABE TER ────────────────────────────────
     Vêm por último de propósito: quem abre a lista procurando emagrecer não
     precisa passar por quatro condições de saúde antes de achar o seu. */
  {
    chave: 'controle_glicemico',
    nome: 'Controlar a glicemia',
    resumo: 'Segurar o açúcar do sangue ao longo do dia.',
    sentido: 'perder',
    icone: 'pulse-outline',
    ajustePct: -10,
    proteinaGkg: 1.5,
    carboPct: 40,
    pedeAcompanhamento: true,
  },
  {
    chave: 'cardiovascular',
    nome: 'Cuidar do coração',
    resumo: 'Melhorar colesterol e pressão pela comida.',
    sentido: 'manter',
    icone: 'heart-outline',
    ajustePct: 0,
    proteinaGkg: 1.3,
    carboPct: 50,
    pedeAcompanhamento: true,
  },
  {
    chave: 'menopausa',
    nome: 'Menopausa e climatério',
    resumo: 'Peso, osso e disposição nessa fase.',
    sentido: 'perder',
    icone: 'flower-outline',
    ajustePct: -10,
    proteinaGkg: 1.6,
    carboPct: 45,
    pedeAcompanhamento: true,
  },
  {
    chave: 'saude_intestinal',
    nome: 'Saúde intestinal',
    resumo: 'Regular o intestino e reduzir o inchaço.',
    sentido: 'manter',
    icone: 'leaf-outline',
    ajustePct: 0,
    proteinaGkg: 1.4,
    carboPct: 50,
    pedeAcompanhamento: true,
  },
]

/* Os três que já estavam gravados, traduzidos para os novos.
 *
 * Só para LER. Uma conta antiga com `perda` continua mostrando "Perder
 * gordura", e no dia em que a pessoa tocar em qualquer opção, o valor gravado
 * passa a ser o slug novo. Não há migração de dados: ela acontece sozinha, no
 * uso, e conta que ninguém abrir continua funcionando do mesmo jeito. */
const ANTIGOS: Record<string, string> = {
  perda: 'emagrecimento',
  manter: 'manutencao',
  ganho: 'ganho_peso',
}

/* O objetivo de uma chave vinda do BANCO, ou null.
 *
 * Nunca o índice cru — armadilha 10 do AGENTS.md. Uma chave desconhecida (a
 * nutricionista define `gestacao` do lado dela, por exemplo) devolve null, e
 * quem chama decide o que dizer. Devolver um dos sete no lugar seria pior: o
 * app afirmaria um foco que a pessoa não escolheu. */
export function objetivoDe(chave: string | null | undefined): Objetivo | null {
  if (!chave) return null
  const normalizada = ANTIGOS[chave] ?? chave
  return OBJETIVOS.find(o => o.chave === normalizada) ?? null
}

/* Como o foco aparece na tela.
 *
 * O texto de reserva ADMITE que o app não sabe, em vez de chutar um dos sete —
 * dizer "perder gordura" para quem tem um objetivo clínico definido pela
 * nutricionista é pior do que não dizer nada. */
export const nomeDoObjetivo = (chave: string | null | undefined): string =>
  chave === null || chave === undefined
    ? 'sem foco definido'
    : (objetivoDe(chave)?.nome ?? `um foco definido pel${aSuaNutri()}`)

/* Para onde o peso deve ir, segundo o foco escolhido.
 *
 * Null quando não há foco ou quando ele é de fora dos sete: a tela de Peso
 * mostra só a variação nesse caso, sem dizer se ela é a desejada — que é o
 * único tratamento honesto para um objetivo que este app não sabe interpretar. */
export const sentidoDoObjetivo = (chave: string | null | undefined): SentidoDoPeso | null =>
  objetivoDe(chave)?.sentido ?? null
