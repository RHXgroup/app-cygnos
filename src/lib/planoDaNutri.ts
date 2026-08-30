import { supabase } from './supabase'
import { falha } from './erros'
import type { DiaSemana, ItemSalvo, PlanoCompleto, RefeicaoSalva } from './plano'

/* O plano alimentar da nutricionista, no formato do plano do app.
 *
 * ── Por que converter, e não criar um segundo tipo ──────────────────────────
 * A tela inicial já sabe desenhar `PlanoCompleto`: o bloco do plano, o
 * totalizador, o cartão da próxima refeição e o pilar de refeições da meta do
 * dia leem todos esse formato. Um tipo paralelo obrigaria cada um desses
 * lugares a saber que existem dois tipos de plano — e a decidir, um por um, o
 * que fazer com cada. Convertendo aqui, o resto do app continua sem saber.
 *
 * O que ele precisa saber está numa flag só: `daNutricionista`. Ela existe para
 * a tela não oferecer edição de uma coisa que o app não pode editar.
 *
 * ── Um dia, e não a semana ──────────────────────────────────────────────────
 * O plano do app tem UM cardápio que se repete nos dias marcados. O do sistema
 * tem cardápio POR DIA — uma rotina guarda refeições diferentes em cada dia da
 * semana. Os dois não cabem um no outro, e a conversão resolve isso pegando o
 * cardápio de HOJE. É o que a tela inicial quer de qualquer forma: ela responde
 * "o que eu como hoje", não "como é a minha semana". A semana inteira continua
 * inteira na tela de detalhe do planejamento.
 *
 * ── Só leitura ──────────────────────────────────────────────────────────────
 * Nada aqui escreve. O plano é dela, e quem edita é ela, de lá. */

/* `plano_refeicoes.dia_semana` do sistema web é 0 = SEGUNDA … 6 = domingo — não
   é a convenção do `Date.getDay()`, que o app usa em todo o resto. A conversão
   mora aqui e em mais lugar nenhum. */
const hojeNaConvencaoDoPlano = () => (new Date().getDay() + 6) % 7

type Linha = {
  plano_id: number
  plano_titulo: string | null
  plano_descricao: string | null
  refeicao_id: number | null
  dia_semana: number | null
  refeicao_nome: string | null
  horario: string | null
  item_id: number | null
  rotulo: string | null
  quantidade_g: string | number | null
  medida_caseira: string | null
  alimento_id: number | null
  alimento_nome: string | null
  alimento_marca: string | null
  kcal_100: string | number | null
  proteina_100: string | number | null
  carbo_100: string | number | null
  lipideo_100: string | number | null
  fibra_100: string | number | null
}

const numero = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

/* Como a quantidade foi dita, na forma em que foi dita — é isso que o app
   mostra embaixo do nome do alimento. A medida caseira ganha do peso quando
   existe: "2 fatias" é o que a pessoa serve, "60 g" é o que a balança diria. */
function descricaoDoItem(gramas: number | null, medida: string | null): string {
  const caseira = medida?.trim()
  if (caseira && gramas !== null) return `${caseira} · ${gramas} g`
  if (caseira) return caseira
  if (gramas !== null) return `${gramas} g`
  return 'Quantidade a combinar'
}

export async function carregarPlanoDaNutri(): Promise<PlanoCompleto | null> {
  const { data, error } = await supabase.rpc('app_plano_do_paciente')
  /* `falha` pelo motivo do console, e não pelo da tela: os dois lugares que
     chamam esta função engolem o erro de propósito — sem o plano dela, o app
     mostra o plano próprio, que é a resposta certa. Só que engolir sem registrar
     é como o defeito da RPC de conteúdo passou despercebido: a lista
     simplesmente não aparecia, e nada em lugar nenhum dizia por quê. Ver a
     armadilha 12 do AGENTS.md, que é sobre os DOIS lados. */
  if (error) throw new Error(falha('Não consegui carregar o plano da sua nutricionista.', error))

  const linhas = (data ?? []) as Linha[]
  if (linhas.length === 0) return null

  /* Linha com refeição nula é plano existente e ainda sem cardápio (ver a
     migração 20260803000006). Ele continua sendo o plano — só não tem o que
     mostrar hoje. */
  const comRefeicao = linhas.filter(l => l.refeicao_id !== null)

  /* Plano de um dia só guarda tudo num `dia_semana` qualquer e vale todo dia —
     é como o sistema web trata "cardápio diário". Filtrar por hoje nesse caso
     esvaziaria o plano em seis dias de cada sete. */
  const dias = new Set(comRefeicao.map(l => l.dia_semana))
  const umDiaSo = dias.size <= 1
  const hoje = hojeNaConvencaoDoPlano()

  const deHoje = umDiaSo ? comRefeicao : comRefeicao.filter(l => l.dia_semana === hoje)

  const refeicoes: RefeicaoSalva[] = []

  for (const l of deHoje) {
    let refeicao = refeicoes.find(r => r.id === String(l.refeicao_id))
    if (!refeicao) {
      refeicao = {
        id: String(l.refeicao_id),
        rotulo: l.refeicao_nome ?? 'Refeição',
        /* 'HH:MM' é o que o app espera, e é o que a coluna guarda. Sem hora, o
           cartão da próxima refeição simplesmente não elege esta. */
        hora: (l.horario ?? '').slice(0, 5),
        itens: [],
      }
      refeicoes.push(refeicao)
    }

    if (l.item_id === null) continue

    const item: ItemSalvo = {
      id: String(l.item_id),
      alimentoId: l.alimento_id,
      nome: l.alimento_nome ?? l.rotulo ?? 'Item sem nome',
      marca: l.alimento_marca,
      descricao: descricaoDoItem(numero(l.quantidade_g), l.medida_caseira),
      gramasTotais: numero(l.quantidade_g),
      /* Nulo quando nenhum dos dois catálogos tem o dado (ver a ponte na
         migração 20260803000011). O app já sabe lidar: item sem caloria fica
         fora da soma e o total avisa quantos ficaram. */
      caloriasPor100g: numero(l.kcal_100),
      proteinasPor100g: numero(l.proteina_100),
      carboidratosPor100g: numero(l.carbo_100),
      gordurasPor100g: numero(l.lipideo_100),
      fibrasPor100g: numero(l.fibra_100),
      /* O plano do sistema não tem o conceito de "ou" (arroz OU macarrão) que o
         plano do app tem. Lista vazia, e não uma tradução inventada. */
      variacoes: [],
    }

    refeicao.itens.push(item)
  }

  const primeira = linhas[0]

  return {
    id: `nutri-${primeira.plano_id}`,
    nome: primeira.plano_titulo?.trim() || 'Plano da sua nutricionista',
    observacao: descricaoDeVerdade(primeira.plano_descricao),
    /* O sistema não devolve a data de criação por aqui, e o bloco do plano não
       mostra "criado em" para plano da nutricionista — ver BlocoPlano. */
    criadoEm: '',
    ativo: true,
    /* Já filtrado para hoje, então o dia de hoje é o único que este objeto
       representa. É o que faz o selo "Vale hoje" dizer a verdade sem a tela
       precisar saber de nada disso. */
    diasSemana: [new Date().getDay() as DiaSemana],
    refeicoes,
    daNutricionista: true,
  }
}

/* `planos_alimentares.descricao` guarda a palavra "rotina" como marcador de
   tipo, e não como texto para ler. Mesmo cuidado de conteudoNutri.ts. */
function descricaoDeVerdade(bruta: string | null): string | null {
  const texto = bruta?.trim()
  if (!texto || texto.toLowerCase() === 'rotina') return null
  return texto
}
