import { totalDe, type Agua } from './agua'
import { totaisConsumidos, type ItemConsumo } from './consumo'
import { dataISO } from './formatar'
import type { Metas } from './metas'
import type { PlanoCompleto } from './plano'
import { tempoDormindo, type Noite } from './sono'

/* O anel de "Meta do dia" da tela inicial.
 *
 * Ele foi o último número inventado do app. Agora sai de tudo que o app mede de
 * verdade — e as regras abaixo existem para que ele não vire um número bonito
 * que ninguém consegue justificar.
 *
 * ── Quatro pilares, peso igual ────────────────────────────────────────────
 * Alimentação, Refeições, Água e Sono. A média é dos PILARES, não dos campos:
 * somando campo a campo, caloria e os quatro macros seriam cinco dos oito
 * valores e a comida sozinha decidiria o anel, com água e sono valendo um oitavo
 * cada. Agrupado, cada assunto pesa o mesmo.
 *
 * ── Só entra o que tem meta ───────────────────────────────────────────────
 * Quem não definiu meta de fibras não pode ser puxado para baixo por fibras.
 * Mesma regra de todo o resto do app: null é "não acompanho isso", não zero.
 *
 * ── Só entra o que o app registra ─────────────────────────────────────────
 * Passos e treinos têm meta em app_metas, mas o app não registra nem um nem
 * outro. Entrassem, ficariam em 0% para sempre e o anel jamais passaria de 50% —
 * um teto invisível que a pessoa nunca entenderia. Voltam a contar no dia em que
 * tiverem tela.
 *
 * ── Passar da meta não vale mais que cumpri-la ────────────────────────────
 * Cada pilar é limitado a 100%. Beber quatro litros não compensa uma noite mal
 * dormida, e comer o dobro das calorias não é o dobro de sucesso. Por outro
 * lado, passar da meta também NÃO é punido aqui: o anel mede o quanto do dia foi
 * cumprido, não dá nota. Quem comeu além da conta lê isso no cartão de Calorias,
 * que diz "480 kcal acima da meta" com todas as letras — o anel não precisa
 * repetir a bronca. */

export type ChavePilar = 'alimentacao' | 'refeicoes' | 'agua' | 'sono'

export type Pilar = {
  chave: ChavePilar
  rotulo: string
  icone: 'flame-outline' | 'restaurant-outline' | 'water-outline' | 'moon-outline'
  /* 0 a 1, já limitado. */
  fracao: number
  /* O que o número quer dizer, em português. É o que torna o anel auditável:
     um percentual que não se decompõe é um percentual em que não se confia. */
  detalhe: string
}

export type MetaDoDia = {
  /* 0 a 100. */
  percentual: number
  pilares: Pilar[]
  /* Nada definido além do padrão de água: o anel existe, mas está medindo quase
     nada, e a tela precisa poder dizer isso em vez de exibir um número magro
     como se fosse desempenho ruim. */
  soAgua: boolean
}

const limitar = (n: number) => Math.min(Math.max(n, 0), 1)

/* Média das metas de alimentação que existem: calorias e os quatro macros.
 *
 * Média entre elas, e não a caloria sozinha: quem bateu a caloria comendo só
 * carboidrato não cumpriu o dia, e o pilar tem de enxergar isso. */
function pilarAlimentacao(metas: Metas, consumo: ItemConsumo[]): Pilar | null {
  const t = totaisConsumidos(consumo)

  const pares: { meta: number | null; comido: number | null }[] = [
    { meta: metas.calorias, comido: t.calorias },
    { meta: metas.proteinas, comido: t.proteinas },
    { meta: metas.carboidratos, comido: t.carboidratos },
    { meta: metas.gorduras, comido: t.gorduras },
    { meta: metas.fibras, comido: t.fibras },
  ]

  const comMeta = pares.filter(p => p.meta !== null && p.meta > 0)
  if (comMeta.length === 0) return null

  const fracao =
    comMeta.reduce((s, p) => s + limitar((p.comido ?? 0) / p.meta!), 0) / comMeta.length

  const detalhe =
    metas.calorias !== null
      ? `${Math.round(t.calorias ?? 0)} de ${metas.calorias} kcal`
      : `${comMeta.length} ${comMeta.length === 1 ? 'meta' : 'metas'} de nutriente`

  return { chave: 'alimentacao', rotulo: 'Alimentação', icone: 'flame-outline', fracao, detalhe }
}

/* Quantas refeições do plano ativo já foram registradas hoje.
 *
 * O casamento é pelo RÓTULO da refeição, e funciona porque registrar "do meu
 * plano" grava o rótulo do plano, e os chips do contador usam os nomes de
 * sempre. Quando os dois não batem — um plano com "Pré-treino" e um registro em
 * "Lanche da tarde" —, a refeição do plano conta como não feita. É a leitura
 * conservadora de propósito: dar por cumprida uma refeição que não se sabe se
 * foi seria pior do que pedir um toque a mais. */
function pilarRefeicoes(plano: PlanoCompleto | null, consumo: ItemConsumo[]): Pilar | null {
  if (!plano) return null

  const doPlano = plano.refeicoes.filter(r => r.itens.length > 0)
  if (doPlano.length === 0) return null

  const registradas = new Set(consumo.map(i => i.refeicao.trim().toLowerCase()))
  const feitas = doPlano.filter(r => registradas.has(r.rotulo.trim().toLowerCase())).length

  return {
    chave: 'refeicoes',
    rotulo: 'Refeições',
    icone: 'restaurant-outline',
    fracao: feitas / doPlano.length,
    detalhe: `${feitas} de ${doPlano.length} do seu plano`,
  }
}

/* A água sempre tem meta — a tela dela precisa de um número para desenhar —,
   então este pilar existe sempre. */
function pilarAgua(agua: Agua | null): Pilar | null {
  if (!agua || agua.metaMl <= 0) return null

  const bebido = totalDe(agua.hoje)
  return {
    chave: 'agua',
    rotulo: 'Água',
    icone: 'water-outline',
    fracao: limitar(bebido / agua.metaMl),
    detalhe: `${bebido} de ${agua.metaMl} ml`,
  }
}

/* A noite indexada por HOJE — a madrugada que acabou de passar.
 *
 * Sem noite registrada o pilar entra em zero, e não fica de fora. Definir uma
 * meta de sono é escolher acompanhá-la; deixar de registrar não pode subir o
 * anel do dia, do mesmo jeito que não beber água não sobe. */
function pilarSono(metas: Metas, noites: Noite[], hoje: Date): Pilar | null {
  if (metas.sonoHoras === null || metas.sonoHoras <= 0) return null

  const desta = noites.find(n => n.data === dataISO(hoje)) ?? null
  const dormiu = desta ? tempoDormindo(desta) : 0

  return {
    chave: 'sono',
    rotulo: 'Sono',
    icone: 'moon-outline',
    fracao: limitar(dormiu / (metas.sonoHoras * 60)),
    detalhe: desta
      ? `${(dormiu / 60).toFixed(1).replace('.', ',')} de ${metas.sonoHoras}h`
      : 'noite ainda não registrada',
  }
}

export function calcularMetaDoDia({
  metas,
  agua,
  consumo,
  noites,
  plano,
  hoje = new Date(),
}: {
  metas: Metas
  agua: Agua | null
  consumo: ItemConsumo[]
  noites: Noite[]
  plano: PlanoCompleto | null
  hoje?: Date
}): MetaDoDia {
  const pilares = [
    pilarAlimentacao(metas, consumo),
    pilarRefeicoes(plano, consumo),
    pilarAgua(agua),
    pilarSono(metas, noites, hoje),
  ].filter((p): p is Pilar => p !== null)

  const percentual =
    pilares.length === 0
      ? 0
      : (pilares.reduce((s, p) => s + p.fracao, 0) / pilares.length) * 100

  return {
    percentual,
    pilares,
    soAgua: pilares.length === 1 && pilares[0].chave === 'agua',
  }
}

/* Uma frase sobre o dia, para o cabeçalho da folha de detalhe. Escrita a partir
   do anel e não de um pilar específico: quem lê quer saber como está o dia,
   não receber cinco números de uma vez. */
export function fraseDoDia(m: MetaDoDia): string {
  if (m.soAgua) return 'Hoje só a sua água está sendo medida.'
  if (m.percentual >= 95) return 'Dia praticamente completo.'
  if (m.percentual >= 70) return 'Você está perto de fechar o dia.'
  if (m.percentual >= 35) return 'Dia em andamento.'
  return 'O dia mal começou.'
}
