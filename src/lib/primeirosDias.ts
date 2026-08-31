/* O primeiro dia, que era só formulário.
 *
 * ── O que acontecia ───────────────────────────────────────────────────────
 * Quem instalava o app às dez da noite abria a tela inicial e via seis cartões
 * vazios, um "Cadastre um plano!" e — depois das onze da manhã, o que às dez da
 * noite sempre vale — a frase "Você ainda não anotou nada hoje".
 *
 * Ou seja: uma cobrança, trinta segundos depois de instalar, por um dia que a
 * pessoa passou sem ter o app.
 *
 * ── E, pior, o app não devolvia nada ──────────────────────────────────────
 * Todo retorno daqui tem mínimo de dados. A sequência precisa de um registro; a
 * tendência do peso, de três semanas; as descobertas, de quatro dias por grupo;
 * o gasto medido, de catorze dias. No primeiro dia a pessoa só DÁ — preenche
 * meta, preenche peso, anota comida — e não recebe nada de volta.
 *
 * É o dia em que mais gente desiste, e é o único dia em que o app não fala.
 *
 * ── O que este arquivo faz ────────────────────────────────────────────────
 * Devolve alguma coisa ANTES de a pessoa trabalhar, usando o que ela já contou
 * quando criou a conta: peso, altura, idade, sexo. Com isso o app calcula a
 * meta dela e MOSTRA o número — trabalho feito por ela, e não para ela.
 *
 * Quando não dá para calcular, pede UM dado — o peso —, e diz o que ele
 * destrava. Um campo com um motivo é diferente de um formulário.
 *
 * ── E some sozinho ────────────────────────────────────────────────────────
 * Depois de três dias com registro, nada disto aparece. Cartão de boas-vindas
 * que fica para sempre vira ruído, e ruído numa tela que a pessoa abre cinco
 * vezes por dia custa mais do que o que ele ensinou.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import { ehDataReal } from './datas.ts'

export type PassoInicial = {
  chave: 'peso' | 'meta' | 'anotar' | 'amanha'
  titulo: string
  /* O corpo do cartão. Diz o que o app SABE ou o que ele passa a saber — nunca
     o que a pessoa deixou de fazer. */
  texto: string
  botao: string
  destino: 'peso' | 'metas' | 'contador' | null
}

export type Entrada = {
  /* Os dias em que ela registrou QUALQUER coisa — comida, água, peso, sono,
     treino. É o mesmo conjunto da sequência, e de propósito: dois jeitos de
     contar "dias de uso" divergiriam, e aí o cartão sumiria num dia em que a
     sequência ainda diz 2. */
  diasComRegistro: string[]
  hoje: string
  /* A hora, para a frase caber no dia. Convidar para o café da manhã às dez da
     noite é a mesma falta de atenção que cobrar o almoço de quem acabou de
     instalar. */
  hora: number
  /* Se ela já tem meta de calorias definida. */
  temMeta: boolean
  /* O que o app conseguiu calcular do corpo dela, quando conseguiu. Chega
     PRONTO: quem sabe fazer essa conta é `metasSugeridas`, e importá-la aqui
     puxaria o resto junto. Nulo quando falta peso. */
  kcalSugerida: number | null
}

/* Três dias. Depois disso a pessoa já viu a sequência contar, já viu o total do
   dia fechar, e o cartão passa a ocupar o lugar de coisa que ela quer ver.

   Três, e não sete: com sete, quem usa o app todo dia continuaria recebendo
   instrução na segunda-feira da semana seguinte. */
const DIAS_DE_BOAS_VINDAS = 3

const milhar = (n: number) => Math.round(n).toLocaleString('pt-BR')

/* A conta vem de fora, e "não deu para calcular" chega de mais de um jeito.
 *
 * `null` era o único previsto, e `NaN` atravessava: `metasSugeridas` devolve
 * nulo, mas quem chama pode passar o resultado de uma divisão. O título saía
 * "A sua meta seria NaN kcal por dia" — e ainda com um botão embaixo.
 *
 * Achado pelo teste, e é a mesma família do que a sonda da foto pegou: uma
 * entrada de tipo certo, valor impossível. */
const kcalUtil = (v: number | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/* Como chamar a refeição que vem agora. Os mesmos cortes de `refeicaoPelaHora`
   em `consumo.ts` — duas escadas de horário no mesmo app fariam o convite dizer
   "jantar" e a tela de registro abrir em "lanche da tarde". */
function refeicaoDaHora(hora: number): string {
  if (hora < 10) return 'o café da manhã'
  if (hora < 12) return 'o lanche da manhã'
  if (hora < 15) return 'o almoço'
  if (hora < 18) return 'o lanche da tarde'
  if (hora < 22) return 'o jantar'
  return 'a ceia'
}

export function passoInicial(e: Entrada): PassoInicial | null {
  if (!ehDataReal(e.hoje)) return null

  const dias = new Set<string>()
  for (const d of e.diasComRegistro) {
    if (ehDataReal(d) && d <= e.hoje) dias.add(d)
  }
  if (dias.size >= DIAS_DE_BOAS_VINDAS) return null

  const registrouHoje = dias.has(e.hoje)

  /* 1. Sem peso não há conta possível.
   *
   * Vem primeiro porque é o único dado que o app não tem jeito de deduzir, e
   * porque ele destrava três coisas de uma vez: a meta de calorias, a de
   * proteína (que é por quilo) e a de água. Dizer isso é o que separa "mais um
   * campo" de "o campo que vale por três". */
  const kcal = kcalUtil(e.kcalSugerida)

  if (kcal === null) {
    return {
      chave: 'peso',
      titulo: 'Falta um número',
      texto:
        'Com o seu peso eu calculo sozinho quanto você precisa de caloria, de proteína e de ' +
        'água por dia. É a única coisa que eu não tenho como saber por você.',
      botao: 'Registrar meu peso',
      destino: 'peso',
    }
  }

  /* 2. Dá para calcular, e ela ainda não tem meta.
   *
   * O número aparece ANTES do toque, e não depois. É o único momento do
   * primeiro dia em que o app entrega trabalho pronto, e escondê-lo atrás de um
   * botão "calcular" desperdiçaria justamente isso. */
  if (!e.temMeta) {
    return {
      chave: 'meta',
      titulo: `A sua meta seria ${milhar(kcal)} kcal por dia`,
      texto:
        'Calculei pelo seu peso, altura, idade e sexo. Você pode usar como está e mudar ' +
        'depois — nada aqui fica travado.',
      botao: 'Usar essa meta',
      destino: 'metas',
    }
  }

  /* 3. Tem meta e ainda não anotou nada hoje.
   *
   * Convite, e não cobrança, e no tempo verbal certo para a hora. A frase
   * antiga — "Você ainda não anotou nada hoje" — é verdadeira e inútil: a
   * pessoa sabe. O que falta é o próximo gesto, e o tamanho dele. */
  if (!registrouHoje) {
    return {
      chave: 'anotar',
      titulo: `Comece por ${refeicaoDaHora(e.hora)}`,
      texto:
        'Anotar uma refeição leva menos de um minuto — dá para tirar uma foto do prato e ' +
        'conferir o que eu li. É daqui que sai todo o resto.',
      botao: 'Anotar agora',
      destino: 'contador',
    }
  }

  /* 4. Ela anotou. Agora o app diz o que vem — porque o que vem é real.
   *
   * A sequência já conta 1 desde o primeiro registro, e o cartão dela está logo
   * acima. O que ainda não existe é a MÉDIA: com dois dias o app começa a
   * comparar, e é isso que ele promete aqui.
   *
   * Prometer só o que tem data marcada. "Em breve o app vai te conhecer" é o
   * tipo de frase que não custa nada escrever e não vale nada ler. */
  /* Pelo que ela JÁ TEM, e não pelo que falta. Escrito ao contrário, a frase do
     primeiro dia caía no segundo e a do segundo no primeiro — e as duas
     continuavam gramaticais, que é como esse tipo de troca sobrevive à
     leitura. */
  if (dias.size === 1) {
    return {
      chave: 'amanha',
      titulo: 'Pronto — o primeiro dia está registrado',
      texto:
        'Amanhã, com dois dias anotados, eu começo a comparar um dia com o outro e a te ' +
        'mostrar o que muda.',
      botao: 'Anotar mais alguma coisa',
      destino: 'contador',
    }
  }

  return {
    chave: 'amanha',
    titulo: 'Dois dias anotados',
    texto:
      'A partir daqui eu já consigo comparar um dia com o outro — é disso que saem as suas ' +
      'médias, e é o que faz o resto do app deixar de ser tela em branco.',
    botao: 'Anotar mais alguma coisa',
    destino: 'contador',
  }
}
