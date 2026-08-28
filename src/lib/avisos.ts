import AsyncStorage from '@react-native-async-storage/async-storage'
import { carregarMinhasConsultas, consultaLegivel, type MinhaConsulta } from './agenda'
import { carregarCatalogo } from './nutricionista'
import { carregarPlanoDaNutri } from './planoDaNutri'

/* Os avisos do sino.
 *
 * ── Por que isto existe sem tabela nenhuma ─────────────────────────────────
 * A versão completa deste recurso é uma tabela de eventos que o SISTEMA grava
 * quando alguma coisa acontece — ver docs/o-que-o-app-precisa-do-sistema.md,
 * item 3.1. Ela não existe ainda, e enquanto não existir o app não fica sem
 * avisos: tudo o que ele precisa saber ele já lê.
 *
 * O truque é guardar o que a pessoa viu da última vez e comparar. Vínculo novo,
 * plano novo, consulta que mudou de estado — as três coisas que acontecem do
 * lado DELA são visíveis daqui, e a diferença entre o que está lá agora e o que
 * estava na última visita É o aviso.
 *
 * ── O que esta versão não faz ──────────────────────────────────────────────
 * Não avisa com o app fechado: sem push, o aviso nasce quando a pessoa abre.
 * Não vê o que aconteceu e desaconteceu entre duas visitas — se a consulta foi
 * confirmada e remarcada antes de ela olhar, só a segunda mudança aparece. E
 * não sabe de nada que o app não lê: comentário no diário, mensagem, receita.
 *
 * Quando a tabela de eventos existir, o `carregarAvisos` troca de fonte e as
 * telas continuam iguais. */

export type Aviso = {
  /* Estável entre aberturas, e é o que impede o mesmo aviso de contar duas
     vezes: ele é montado a partir do assunto e do estado, não de um contador. */
  id: string
  titulo: string
  texto: string
  icone: 'calendar' | 'checkmark-circle' | 'hourglass-outline' | 'person-add' | 'restaurant'
  /* Novidade desde a última visita. O que apenas continua pedindo ação — um
     pedido em aberto, por exemplo — entra com `novo: false`: ele é estado, e
     não notícia, e piscar como novidade toda vez o transformaria em ruído. */
  novo: boolean
}

/* O retrato da última visita. Só chaves, nada de conteúdo: o que interessa é se
   mudou, e guardar textos aqui seria manter uma segunda cópia da verdade. */
type Marca = {
  /* id da consulta → status em que ela estava. */
  consultas: Record<string, string>
  nutricionistaId: string | null
  planoId: string | null
}

const CHAVE = 'avisos:marca:v1'

async function lerMarca(): Promise<Marca | null> {
  try {
    const cru = await AsyncStorage.getItem(CHAVE)
    if (!cru) return null
    const m = JSON.parse(cru) as Marca
    /* Formato torto é tratado como primeira visita, e não como erro: o pior que
       acontece é a pessoa não ver um aviso que já era antigo. */
    return m && typeof m === 'object' && m.consultas ? m : null
  } catch {
    return null
  }
}

export async function guardarMarca(marca: Marca): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(marca))
  } catch {
    /* Não conseguir guardar significa repetir avisos na próxima abertura.
       Chato, e muito melhor do que derrubar a tela por causa disso. */
  }
}

export type Avisos = {
  lista: Aviso[]
  /* O retrato de AGORA. A tela guarda isto quando a pessoa olha — e não antes:
     carregar não é ver. */
  marca: Marca
}

/* O retrato do que existe AGORA, já com as datas escritas.
 *
 * A data chega formatada, e não como instante: é o que deixa a decisão abaixo
 * sem nenhuma dependência — nem de rede, nem de fuso, nem de relógio. E é o que
 * permite exercitá-la com casos de mesa, que é como o erro de anunciar recusa
 * como aceite foi encontrado. */
export type Retrato = {
  consultas: { id: number; status: string; quando: string }[]
  nutricionista: { id: string; nome: string } | null
  planoId: string | null
}

export const marcaDe = (r: Retrato): Marca => ({
  consultas: Object.fromEntries(r.consultas.map(c => [String(c.id), c.status])),
  nutricionistaId: r.nutricionista?.id ?? null,
  planoId: r.planoId,
})

/* A decisão, e só ela. Sem I/O, sem Date, sem AsyncStorage: entra o que existe
   agora mais o que a pessoa viu da última vez, sai a lista. */
export function montarAvisos(agora: Retrato, marca: Marca | null): Aviso[] {
  /* Primeira visita: nada é novidade.
   *
   * Sem isto, quem instala o app hoje abre o sino e recebe "plano novo!" por um
   * plano de três meses atrás e "você foi vinculada!" por um vínculo antigo. O
   * estado atual continua aparecendo — o que some é a alegação de que mudou. */
  const primeiraVez = marca === null

  const lista: Aviso[] = []

  if (!primeiraVez) {
    if (agora.nutricionista && marca.nutricionistaId !== agora.nutricionista.id) {
      lista.push({
        id: `vinculo:${agora.nutricionista.id}`,
        titulo: 'Você tem uma nutricionista',
        texto: `${agora.nutricionista.nome} passou a acompanhar você. O que ela registrar aparece aqui no app.`,
        icone: 'person-add',
        novo: true,
      })
    }

    if (agora.planoId && marca.planoId !== agora.planoId) {
      lista.push({
        id: `plano:${agora.planoId}`,
        titulo: 'Plano alimentar novo',
        texto: 'A sua nutricionista publicou um plano novo. Ele já está valendo na tela inicial.',
        icone: 'restaurant',
        novo: true,
      })
    }
  }

  for (const c of agora.consultas) {
    const antes = marca?.consultas[String(c.id)]
    const mudou = !primeiraVez && antes !== c.status

    if (c.status === 'solicitada') {
      /* Estado, não notícia: continua na lista todo dia até ela responder,
         porque é o único item da agenda que espera alguém agir. Mas só conta
         como novidade na primeira vez. */
      lista.push({
        id: `consulta:${c.id}:solicitada`,
        titulo: 'Pedido aguardando resposta',
        texto: `Você pediu ${c.quando}. A consulta ainda não está marcada.`,
        icone: 'hourglass-outline',
        novo: mudou && antes === undefined,
      })
      continue
    }

    if (!mudou) continue

    /* Só anuncia como MARCADA o que o app sabe que quer dizer marcada.
     *
     * Um status que ele não conhece cairia aqui como "pedido aceito" — e o
     * próximo a chegar do banco é justamente 'recusada'. Dizer que foi aceito o
     * que foi recusado é a mentira mais cara que este app pode contar: termina
     * com a pessoa no consultório num dia em que não era esperada. Ver a
     * armadilha 10 do AGENTS.md, que é sobre exatamente isto. */
    if (c.status !== 'pendente' && c.status !== 'confirmada') {
      lista.push({
        id: `consulta:${c.id}:${c.status}`,
        titulo: 'A sua consulta mudou',
        texto: `Houve uma mudança na consulta de ${c.quando}. Confirme com a sua nutricionista antes de se programar para o dia.`,
        icone: 'calendar',
        novo: true,
      })
      continue
    }

    /* Ela marcou sozinha (a consulta nem existia na visita passada) é diferente
       de ela ter aceitado o pedido dele. As duas viram consulta marcada, mas a
       frase que explica o que aconteceu não é a mesma. */
    const dela = antes === undefined
    lista.push({
      id: `consulta:${c.id}:${c.status}`,
      titulo: dela ? 'Consulta marcada para você' : 'Pedido aceito',
      texto: dela
        ? `A sua nutricionista agendou ${c.quando}.`
        : `A sua consulta ficou marcada para ${c.quando}.`,
      icone: 'checkmark-circle',
      novo: true,
    })
  }

  return lista
}

/* A busca. Junta o que está no servidor, escreve as datas e entrega à decisão. */
export async function carregarAvisos(): Promise<Avisos> {
  /* Cada uma falha para o seu lado. Um aviso a menos é melhor do que uma tela
     de erro no lugar de todos. */
  const [consultas, catalogo, plano, marca] = await Promise.all([
    carregarMinhasConsultas().catch(() => [] as MinhaConsulta[]),
    carregarCatalogo().catch(() => null),
    carregarPlanoDaNutri().catch(() => null),
    lerMarca(),
  ])

  const vinculada = catalogo?.tipo === 'ok' ? catalogo.catalogo.vinculada : null

  const agora: Retrato = {
    consultas: consultas.map(c => ({
      id: c.id,
      status: c.status,
      quando: consultaLegivel(c.dataHora),
    })),
    nutricionista: vinculada ? { id: vinculada.id, nome: vinculada.nome } : null,
    planoId: plano?.id ?? null,
  }

  return { lista: montarAvisos(agora, marca), marca: marcaDe(agora) }
}

/* Quantos pedem atenção de verdade — o número do ponto vermelho. */
export const quantosNovos = (lista: Aviso[]) => lista.filter(a => a.novo).length
