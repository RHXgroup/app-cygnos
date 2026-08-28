import { buscarAlimentos, type Alimento } from './alimentos'
import { novaChave, type ItemAlimento, type RefeicaoMontada } from './plano'
import { montar, termosParaBuscar, type Convertido, type PlanoDaIA } from './sugestaoParaPlano'
import { supabase } from './supabase'

/* A IA monta o primeiro plano de quem não tem nutricionista.
 *
 * Montar um plano do zero é o degrau mais alto do app. Escolher refeição por
 * refeição, alimento por alimento, quantidade por quantidade, sem saber quanto
 * é muito nem quanto é pouco — é aí que um leigo desiste. Quem tem
 * nutricionista recebe o plano pronto dela; quem não tem encarava a tela vazia.
 *
 * ── O que isto NÃO é ───────────────────────────────────────────────────────
 * Prescrição. A sugestão vem, a pessoa lê item por item, tira o que não come,
 * muda o que não gosta, e SÓ ENTÃO vira plano. Mesma doutrina da foto do prato
 * e do ditado: o que a IA produz passa pelos olhos de quem vai comer antes de
 * virar número no diário.
 *
 * ── Por que cada alimento é procurado na nossa base ────────────────────────
 * A IA devolve um nome ("Arroz branco cozido") e a sua própria estimativa
 * nutricional. A estimativa é reserva, não resposta: o que a base tem foi
 * conferido, e o que a IA calcula é lembrança de treino. Procurar primeiro
 * também é o que faz o item virar um alimento DE VERDADE do app — com id, que
 * a pessoa pode trocar, ajustar e reusar depois.
 *
 * Quando não acha, o item entra com a estimativa e marcado como tal. Descartar
 * seria pior: o plano chegaria com buracos, e a soma do dia sairia menor do que
 * a comida escrita ali.
 *
 * ── A conversão em si mora em `sugestaoParaPlano` ──────────────────────────
 * Aqui fica só o que fala com a rede. Lá é código puro, sem import de runtime,
 * e por isso dá para exercitá-lo com JSON de verdade fora do aparelho — que é
 * o que sobra de teste automatizado neste projeto. */

export type ItemSugerido = ItemAlimento & { estimado: boolean }

export type RefeicaoSugerida = Omit<RefeicaoMontada, 'itens'> & { itens: ItemSugerido[] }

export type PlanoSugerido = Omit<Convertido, 'refeicoes'> & { refeicoes: RefeicaoSugerida[] }

export type Pedido = {
  kcal: number
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
  refeicoes: number
  idade: number | null
  genero: string | null
  pesoKg: number | null
  alturaCm: number | null
  tipoDieta: string
  evitar: string
  alergias: string
  observacao: string
}

export type ResultadoSugestao =
  | { tipo: 'ok'; plano: PlanoSugerido }
  /* A recusa por meta baixa demais tem nome próprio: a saída dela é a pessoa
     rever a meta, e não tentar de novo. */
  | { tipo: 'meta_baixa'; mensagem: string }
  | { tipo: 'erro'; mensagem: string }

export async function sugerirPlano(p: Pedido): Promise<ResultadoSugestao> {
  let bruto: PlanoDaIA
  try {
    const { data, error } = await supabase.functions.invoke('app-sugerir-plano', {
      body: {
        kcal: p.kcal,
        proteinas: p.proteinas,
        carboidratos: p.carboidratos,
        gorduras: p.gorduras,
        refeicoes: p.refeicoes,
        idade: p.idade,
        genero: p.genero,
        pesoKg: p.pesoKg,
        alturaCm: p.alturaCm,
        tipoDieta: p.tipoDieta,
        evitar: p.evitar,
        alergias: p.alergias,
        observacao: p.observacao,
      },
    })

    if (error) {
      /* O supabase-js embrulha a resposta de erro: sem abrir o context, toda
         falha viraria "FunctionsHttpError" na tela — e a função foi escrita
         justamente para dizer o que aconteceu. Mesmo tratamento da foto do
         prato e do ditado. */
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      const codigo = corpo?.error as string | undefined

      if (codigo === 'kcal_baixa' || codigo === 'sem_kcal') {
        return {
          tipo: 'meta_baixa',
          mensagem:
            String(corpo?.message ?? '') ||
            'Preciso de uma meta de calorias maior para montar o plano.',
        }
      }
      if (codigo === 'forbidden' || codigo === 'unauthorized') {
        return { tipo: 'erro', mensagem: 'Sua sessão expirou. Entre de novo para pedir o plano.' }
      }
      if (codigo === 'plano_longo') {
        return { tipo: 'erro', mensagem: 'O plano ficou grande demais. Tente com menos refeições.' }
      }
      return {
        tipo: 'erro',
        mensagem: 'Não consegui montar o plano agora. Verifique a conexão e tente de novo.',
      }
    }

    bruto = (data?.plano ?? {}) as PlanoDaIA
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui falar com o servidor. Verifique a conexão.' }
  }

  /* Uma busca por item, todas de uma vez.
   *
   * Em série seriam trinta idas ao banco em sequência, e a tela ficaria meio
   * minuto parada num "montando…" — depois de já ter esperado a IA. Em paralelo
   * é uma espera só. */
  const termos = termosParaBuscar(bruto)
  const achados: (Alimento | null)[][] = await Promise.all(
    termos.map(linha =>
      Promise.all(
        linha.map(async termo => {
          if (!termo) return null
          const r = await buscarAlimentos(termo)
          return r.tipo === 'ok' ? (r.alimentos[0] ?? null) : null
        }),
      ),
    ),
  )

  const convertido = montar(bruto, achados)
  if (!convertido) {
    return { tipo: 'erro', mensagem: 'A sugestão não trouxe alimento nenhum. Tente de novo.' }
  }

  /* As chaves de linha entram aqui: `novaChave` mora em plano.ts, que puxa o
     Supabase junto, e é justamente o que o núcleo puro não pode importar. */
  return {
    tipo: 'ok',
    plano: {
      ...convertido,
      refeicoes: convertido.refeicoes.map(r => ({
        chave: novaChave(),
        rotulo: r.rotulo,
        hora: r.hora,
        itens: r.itens.map(i => ({ ...i, chave: novaChave(), variacoes: [] })),
      })),
    },
  }
}
