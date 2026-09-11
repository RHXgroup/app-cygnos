import AsyncStorage from '@react-native-async-storage/async-storage'
import { apagarTodosOsAvisos } from './avisosDaNutri'
import { falha } from './erros'
import {
  desligarLembreteDaSequencia,
  desligarLembretes,
  desligarLembretesDeAgua,
  notificacoes,
} from './lembretes'
import { supabase } from './supabase'

/* Sair da conta, e o que o aparelho guarda dela.
 *
 * ── O defeito ─────────────────────────────────────────────────────────────
 * Os avisos da nutricionista e os lembretes do paciente moram no APARELHO, e
 * não na conta: a lista no disco e o agendamento no sistema. Sair da conta não
 * tocava em nada disso. Quem entrasse em seguida no mesmo celular -- a colega
 * de consultório, o celular emprestado, quem testa alternando contas -- era
 * avisado na hora marcada com o texto da outra pessoa: "ligar para a Maria
 * sobre o exame". E o paciente seguinte recebia "hora do almoço" do plano de
 * outro. Achado na terceira rodada de testes, perguntando o que sobrevive a
 * trocar de conta.
 *
 * ── Por que NÃO no `SIGNED_OUT` ───────────────────────────────────────────
 * Sessão que vence também chega como `SIGNED_OUT`. Apagar ali faria a
 * nutricionista perder os avisos sem ter saído de nada -- ela só entraria de
 * novo e acharia a lista vazia. As duas portas certas são outras (desenho da
 * sessão APP 2):
 *
 *   1. SAIR DE PROPÓSITO. `sairDaConta()`, logo abaixo, limpa ANTES do
 *      `signOut`. Toda saída que a PESSOA pede passa por ela -- eram cinco
 *      chamadas soltas de `signOut` (Mais, Perfil, Em breve, excluir conta e
 *      a área da nutricionista), e a próxima tela copiaria a que não limpa
 *      (armadilha 5). As três que continuam com `signOut` direto -- duas na
 *      recuperação de senha e o portão do `App` para conta sem cadastro --
 *      derrubam uma sessão que nasceu ali e nunca chegou a agendar nada.
 *
 *   2. OUTRA PESSOA ENTROU. Sessão venceu, e quem entra é outra conta. O dono
 *      do que está guardado fica anotado; se quem entra não é ele, limpa. Se é
 *      a mesma nutricionista voltando, nada some.
 *
 * O que NÃO sai daqui: a fila de registros sem sinal (`pendentes.ts`). Ela já
 * separa por conta, e o almoço pendurado de alguém sobe quando essa pessoa
 * voltar -- jogar fora seria perder o registro, que é o que ela existe para
 * impedir. */

const CHAVE_DONO = 'cygnos:dono-do-aparelho'

/* Quanto a limpeza pode segurar a saída. Notificação e disco respondem em
   milissegundos; o teto existe para o dia em que o módulo nativo travar, e
   "sair" nunca pode virar um botão que não faz nada. */
const TETO_DA_LIMPEZA_MS = 3000

async function limparOQueEDaConta(): Promise<void> {
  /* `allSettled`: um pedaço que falha não impede os outros. Os três
     `desligar` já engolem a própria falha; os avisos também. */
  await Promise.allSettled([
    desligarLembretes(),
    desligarLembretesDeAgua(),
    desligarLembreteDaSequencia(),
    apagarTodosOsAvisos(),
  ])
  /* O que JÁ caiu na gaveta de notificações também é da conta que saiu.
     `dismissAll` só alcança as deste app. */
  try {
    await (await notificacoes()).dismissAllNotificationsAsync()
  } catch (e) {
    falha('Não consegui limpar a gaveta de notificações.', e)
  }
}

const comTeto = (p: Promise<void>): Promise<void> =>
  Promise.race([p, new Promise<void>(ok => setTimeout(ok, TETO_DA_LIMPEZA_MS))])

/** A saída do app. Toda tela que desconecta chama esta, e não `signOut`. */
export async function sairDaConta(): Promise<void> {
  await comTeto(limparOQueEDaConta())
  try {
    await AsyncStorage.removeItem(CHAVE_DONO)
  } catch {
    /* Sem o disco, a porta 2 limpa de novo quando alguém entrar. Limpar duas
       vezes não machuca. */
  }
  await supabase.auth.signOut()
}

/* A porta 2. Fora do ouvinte: o `onAuthStateChange` não pode esperar ida ao
   disco nem ao sistema dentro dele, e o `setTimeout` o devolve na hora. */
async function conferirDono(id: string): Promise<void> {
  try {
    const dono = await AsyncStorage.getItem(CHAVE_DONO)
    if (dono === id) return
    if (dono) await comTeto(limparOQueEDaConta())
    await AsyncStorage.setItem(CHAVE_DONO, id)
  } catch (e) {
    falha('Não consegui conferir de quem é o que está guardado no aparelho.', e)
  }
}

supabase.auth.onAuthStateChange((_evento, sessao) => {
  /* Sem sessão -- saída ou sessão vencida -- não apaga nada: quem decide é
     quem ENTRAR depois. */
  const id = sessao?.user.id
  if (!id) return
  setTimeout(() => void conferirDono(id), 0)
})
