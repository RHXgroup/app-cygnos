import { falha } from './erros'
import { supabase } from './supabase'

/* Os dias em que ela registrou alguma coisa.
 *
 * Aqui não há regra nenhuma: lê e devolve. Quem DECIDE o que aquilo significa
 * — quantos dias seguidos, se está em risco, qual o próximo marco — mora em
 * `sequenciaDaPessoa`, que não importa nada de execução e por isso tem teste de
 * verdade. Mesmo corte de `ciclo`/`cicloDaPessoa` e `planoIA`/`sugestaoParaPlano`.
 *
 * ── Uma chamada, e não cinco ──────────────────────────────────────────────
 * São cinco tabelas por trás (comida, água, peso, sono, treino), e a função
 * `app_dias_com_registro` junta as cinco no servidor. Cinco consultas na
 * abertura da tela inicial seriam cinco idas à rede num aparelho que pode estar
 * no ônibus — e a inicial é a tela que mais abre no dia.
 *
 * ── Nunca recebe a conta ──────────────────────────────────────────────────
 * A função no banco usa `auth.uid()`. Se a conta viesse por parâmetro, qualquer
 * pessoa autenticada leria os dias de outra passando o uuid dela — e a lista de
 * dias em que alguém registrou peso ou sono é informação de saúde. */

/* Quanto histórico pedir. Um ano cobre qualquer sequência que exista, e são no
   máximo 365 datas de 10 caracteres — menos do que uma foto de perfil. */
const DIAS_DE_HISTORICO = 400

/* Devolve as datas, ou uma lista VAZIA quando falha.
 *
 * Vazio, e não erro, de propósito: item 11 do AGENTS.md. Isto alimenta um
 * pedaço da tela inicial, e uma sequência que não carregou não pode derrubar a
 * tela inteira nem cobri-la com uma mensagem. Sem os dias, o cartão da
 * sequência simplesmente não aparece — que é o comportamento certo para quem
 * ainda não tem sequência nenhuma.
 *
 * O erro continua indo para o console, porque engolir em silêncio já custou uma
 * sessão inteira de investigação neste projeto. */
export async function carregarDiasComRegistro(): Promise<string[]> {
  const { data, error } = await supabase.rpc('app_dias_com_registro', {
    p_dias: DIAS_DE_HISTORICO,
  })

  if (error) {
    falha('Não consegui carregar a sua sequência.', error)
    return []
  }

  /* A função devolve `setof date`, que chega como lista de strings ISO. Mas
     `rpc` tipa como `unknown`, e um `as string[]` cru deixaria passar o dia em
     que alguém mudar o retorno para objeto — e aí a sequência contaria
     "[object Object]" como um dia. */
  if (!Array.isArray(data)) return []
  return data.filter((d): d is string => typeof d === 'string' && d.length === 10)
}
