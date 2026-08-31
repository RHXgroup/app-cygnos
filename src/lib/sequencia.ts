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

/* As datas, `null` quando NÃO DEU PARA LER, e lista vazia quando ela não
 * registrou nada.
 *
 * ── Por que os dois casos são separados ───────────────────────────────────
 * Eram a mesma coisa — falha devolvia vazio —, e passaram a não poder ser.
 *
 * Para a SEQUÊNCIA, tanto faz: os dois escondem o cartão, e uma sequência que
 * não carregou não pode dizer que a pessoa perdeu a dela.
 *
 * Para o cartão do PRIMEIRO DIA é o contrário: lista vazia é o motivo de ele
 * aparecer. Com os dois indistinguíveis, uma falha de rede mostraria "Falta um
 * número" a quem usa o app há meses — e é o pior momento possível para o app
 * parecer que esqueceu quem ela é.
 *
 * ── E continua sem rejeitar ───────────────────────────────────────────────
 * Item 11 do AGENTS.md: isto alimenta um pedaço da tela inicial, e não pode
 * derrubá-la nem cobri-la com uma mensagem. Quem decide o que fazer com a
 * ausência é a tela.
 *
 * O erro continua indo para o console, porque engolir em silêncio já custou uma
 * sessão inteira de investigação neste projeto. */
export async function carregarDiasComRegistro(): Promise<string[] | null> {
  const { data, error } = await supabase.rpc('app_dias_com_registro', {
    p_dias: DIAS_DE_HISTORICO,
  })

  if (error) {
    falha('Não consegui carregar a sua sequência.', error)
    return null
  }

  /* A função devolve `setof date`, que chega como lista de strings ISO. Mas
     `rpc` tipa como `unknown`, e um `as string[]` cru deixaria passar o dia em
     que alguém mudar o retorno para objeto — e aí a sequência contaria
     "[object Object]" como um dia.

     Formato inesperado é falha nossa, e não conta vazia: também vira nulo. */
  if (!Array.isArray(data)) return null
  return data.filter((d): d is string => typeof d === 'string' && d.length === 10)
}
