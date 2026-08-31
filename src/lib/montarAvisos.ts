/* A DECISÃO dos avisos do sino, e só ela.
 *
 * Sem I/O, sem Date, sem AsyncStorage, sem um único import de runtime: entra o
 * que existe agora mais o que a pessoa viu da última vez, sai a lista. É o que
 * permite exercitá-la com casos de mesa — e foi assim que o erro de anunciar
 * uma consulta RECUSADA como "pedido aceito" apareceu, antes de chegar a
 * qualquer aparelho.
 *
 * Quem fala com a rede é lib/avisos.ts. Mesma separação de sugestaoParaPlano e
 * planoIA, e pelo mesmo motivo: lá fica o que busca, aqui o que decide, e é o
 * que decide que erra.
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
 * não sabe de nada que o app não lê: comentário no diário, receita nova.
 *
 * Mensagem é a exceção, e a única que não depende do truque: `lida_em` é do
 * banco, então ali o app não adivinha o que a pessoa viu — ele sabe. */

export type Aviso = {
  /* Estável entre aberturas, e é o que impede o mesmo aviso de contar duas
     vezes: ele é montado a partir do assunto e do estado, não de um contador. */
  id: string
  titulo: string
  texto: string
  icone:
    | 'calendar'
    | 'checkmark-circle'
    | 'hourglass-outline'
    | 'person-add'
    | 'restaurant'
    | 'chatbubble-ellipses'
  /* Novidade desde a última visita. O que apenas continua pedindo ação — um
     pedido em aberto, por exemplo — entra com `novo: false`: ele é estado, e
     não notícia, e piscar como novidade toda vez o transformaria em ruído. */
  novo: boolean
  /* Para onde o toque leva. Um aviso que não leva a lugar nenhum é meia
     informação: a pessoa lê "pedido aguardando resposta" e fica sem saber onde
     olhar o resto.
       'nutricionista' → a ficha dela, onde a consulta aparece por extenso
       'mensagens'     → a conversa
       'inicio'        → fecha os avisos, porque o assunto já está na tela inicial
       null            → não há para onde ir, e o cartão não finge que há */
  destino: 'nutricionista' | 'mensagens' | 'inicio' | null
}

/* O retrato da última visita. Só chaves, nada de conteúdo: o que interessa é se
   mudou, e guardar textos aqui seria manter uma segunda cópia da verdade. */
export type Marca = {
  /* id da consulta → status em que ela estava. */
  consultas: Record<string, string>
  nutricionistaId: string | null
  planoId: string | null
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
  /* Quantas ela mandou e ele ainda não leu. Não entra na marca de propósito —
     ver o aviso lá embaixo. */
  mensagensNaoLidas: number
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

  /* Mensagem não lida vem primeiro, e é o único aviso que NÃO passa pelo
     retrato da última visita.
   *
   * Todo o resto aqui é adivinhação: o app compara o que vê agora com o que viu
   * antes, porque não tem como saber o que a pessoa leu. Mensagem tem: `lida_em`
   * é do banco, e vale entre aparelhos — o que ele leu no celular não pisca de
   * novo no tablet.
   *
   * Por isso também aparece na primeira visita, ao contrário dos outros. Quem
   * reinstala o app e tem mensagem sem ler continua tendo mensagem sem ler; a
   * regra de "nada é novidade na estreia" existe para não anunciar como novo um
   * plano de três meses atrás, e não para esconder o que espera resposta. */
  if (agora.mensagensNaoLidas > 0) {
    const uma = agora.mensagensNaoLidas === 1
    lista.push({
      id: `mensagens:${agora.mensagensNaoLidas}`,
      titulo: uma ? 'Mensagem nova' : `${agora.mensagensNaoLidas} mensagens novas`,
      /* Nome em branco cai no texto sem nome.
       *
       * Ele vem do banco por `coalesce(nome_completo, nome)`, e nada garante
       * que o segundo esteja preenchido. Sem esta guarda a frase saía como
       * " escreveu para você", com um vão no lugar de quem escreveu. */
      texto: agora.nutricionista?.nome?.trim()
        ? `${agora.nutricionista.nome.trim()} escreveu para você. Toque para ler e responder.`
        : 'Você tem mensagem sem ler. Toque para ler e responder.',
      icone: 'chatbubble-ellipses',
      novo: true,
      destino: 'mensagens',
    })
  }

  if (!primeiraVez) {
    if (agora.nutricionista && marca.nutricionistaId !== agora.nutricionista.id) {
      lista.push({
        id: `vinculo:${agora.nutricionista.id}`,
        titulo: 'Você tem uma nutricionista',
        texto: `${agora.nutricionista.nome} passou a acompanhar você. O que ela registrar aparece aqui no app.`,
        icone: 'person-add',
        novo: true,
        destino: 'nutricionista',
      })
    }

    if (agora.planoId && marca.planoId !== agora.planoId) {
      lista.push({
        id: `plano:${agora.planoId}`,
        titulo: 'Plano alimentar novo',
        texto: 'A sua nutricionista publicou um plano novo. Ele já está valendo na tela inicial.',
        icone: 'restaurant',
        novo: true,
        /* O plano novo já está valendo na tela inicial: o toque devolve para lá. */
        destino: 'inicio',
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
        destino: 'nutricionista',
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
        destino: 'nutricionista',
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
      destino: 'nutricionista',
    })
  }

  return lista
}

/* Quantos pedem atenção de verdade — o número do ponto vermelho. */
export const quantosNovos = (lista: Aviso[]) => lista.filter(a => a.novo).length
