import { supabase } from './supabase'
import { falha } from './erros'

/* O dinheiro do dia dela.
 *
 * ──────────────────── Duas perguntas, e só duas ────────────────────
 * Quanto entrou hoje, e quanto vence hoje e ainda não entrou. O painel do site
 * tem mais -- pagos, a pagar, gráficos --, e nada disso é decisão de quem está
 * em pé entre duas consultas. Número grande só para o que ela resolve olhando.
 *
 * ──────────────────── Zero NÃO é resposta aqui ────────────────────
 * Item 6 do AGENTS.md, e neste caso com uma volta a mais. A política de
 * `contas_receber_baixas` exige `func_pode('{financeiro,receber,baixar}')`: quem
 * não tem a permissão recebe ZERO LINHA, sem erro nenhum -- indistinguível de
 * "não entrou nada hoje".
 *
 * Escrever "R$ 0" nesse caso seria o app afirmando uma coisa que ele não sabe,
 * para a pessoa que decide dinheiro com esse número. Por isso o bloco só
 * aparece quando HÁ movimento: ausência não afirma nada, e é honesta nos dois
 * casos. Dia sem recebimento também não precisa de cartão dizendo zero.
 *
 * ──────────────────── A soma é feita aqui, e não no banco ────────────────────
 * O PostgREST não agrega, e uma função nova só para somar cinco linhas seria um
 * lugar a mais para divergir do site. São poucas linhas por dia por consultório;
 * somar no aparelho é mais barato que manter duas contas. */

export type DinheiroDoDia = {
  /* Centavos não: ela lê "R$ 640" e segue a vida. */
  recebido: number
  quantasBaixas: number
  vencendo: number
  quantasVencendo: number
}

const soma = (linhas: { valor: unknown }[]): number =>
  linhas.reduce((total, l) => {
    const n = typeof l.valor === 'number' ? l.valor : Number(l.valor)
    return total + (Number.isFinite(n) ? n : 0)
  }, 0)

/* O dia no fuso do APARELHO. `data_pagamento` e `data_vencimento` são `date`,
   e não `timestamptz`: comparar com um ISO completo traria o dia errado para
   quem está a oeste de Greenwich depois das 21h. */
function hojeLocal(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

export async function dinheiroDoDia(): Promise<DinheiroDoDia | null> {
  const hoje = hojeLocal()

  const [baixas, vencendo] = await Promise.all([
    supabase
      .from('contas_receber_baixas')
      .select('valor_pago')
      .eq('data_pagamento', hoje),
    supabase
      .from('contas_receber')
      .select('valor')
      .eq('status', 'pendente')
      .eq('data_vencimento', hoje),
  ])

  /* Erro nas DUAS é "não deu para perguntar", e a o bloco não aparece --
     que é o mesmo desfecho de "não tem permissão". As duas ausências se
     parecem de propósito: nenhuma delas autoriza a tela a afirmar um número. */
  if (baixas.error && vencendo.error) {
    falha('Não consegui ler o financeiro do dia.', baixas.error)
    return null
  }
  if (baixas.error) falha('Não consegui ler o que entrou hoje.', baixas.error)
  if (vencendo.error) falha('Não consegui ler o que vence hoje.', vencendo.error)

  const pagas = (baixas.data ?? []) as { valor_pago: number | null }[]
  const abertas = (vencendo.data ?? []) as { valor: number | null }[]

  return {
    recebido: soma(pagas.map(l => ({ valor: l.valor_pago }))),
    quantasBaixas: pagas.length,
    vencendo: soma(abertas.map(l => ({ valor: l.valor }))),
    quantasVencendo: abertas.length,
  }
}

/* "R$ 640", "R$ 1.250". Sem centavos: o painel é leitura de relance, e
   ",00" em toda linha só ocupa largura. Com centavos quando existem, porque aí
   arredondar mudaria o número que ela vai conferir no sistema. */
export function reais(valor: number): string {
  if (!Number.isFinite(valor)) return 'R$ 0'
  const redondo = Math.abs(valor % 1) < 0.005
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: redondo ? 0 : 2,
    maximumFractionDigits: redondo ? 0 : 2,
  })
}
