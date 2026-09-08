import { supabase } from './supabase'

/* A frase de quem autentica e não tem tela nenhuma para ver.
 *
 * ──────────────────── Ela mudou de significado, e é por isso que mudou de nome ────────────────────
 * Enquanto o app era só do paciente, a pergunta era "é de paciente?" e a
 * resposta não mandava a nutricionista embora com "entre pelo site". Agora a
 * conta dela TEM destino aqui -- o painel do dia --, e a frase antiga passou a
 * ser mentira para o caso mais comum de quem a via.
 *
 * O que sobra é um caso menor e real: conta que existe no Auth e em nenhuma das
 * duas tabelas. Uma colaboradora do sistema web, um cadastro de teste. Deixar
 * entrar mostraria um app sem nada dentro, e a conclusão natural de quem vê
 * isso é que os dados sumiram.
 *
 * Quem responde a pergunta agora é `quemEntrou()`, em lib/souNutri -- e ele
 * pergunta pelas DUAS tabelas de uma vez, que é o que esta lib não fazia.
 * `ehContaDePaciente` foi apagada junto, e não deixada de reserva: duas
 * respostas para "quem entrou" divergem, e ninguém descobre por qual das duas a
 * tela passou. Armadilha 5. */
/* Mora aqui, e não no App, para a tela de recuperação poder usar a mesma frase
   sem importar do App e fechar um ciclo de importação. */
export const AVISO_CONTA_SEM_CADASTRO =
  'Esta conta não tem cadastro de paciente nem de nutricionista no Cygnos. Se ela é do sistema web, entre por lá; ou crie sua conta de paciente aqui.'

/* Exclusão da própria conta.
 *
 * Quem apaga de verdade é a edge function `app-excluir-conta`, no repo do
 * sistema: sumir com a linha de `auth.users` exige service role, que não pode
 * viver dentro de um aplicativo instalado no aparelho de ninguém. Daqui só sai
 * o pedido, assinado com o token de quem está logado — o `functions.invoke` já
 * o envia sozinho.
 *
 * O `signOut` fica de fora de propósito: quem chama é a tela, depois de mostrar
 * a confirmação. Sair aqui dentro derrubaria o App para o login antes de a
 * pessoa ler que deu certo. */

/* A mesma palavra que a função espera no corpo. Exportada porque a tela precisa
   dela para comparar com o que foi digitado — dois literais soltos acabariam
   divergindo no dia em que um dos lados mudasse. */
export const PALAVRA_CONFIRMACAO = 'EXCLUIR'

export type ResultadoExclusao = { tipo: 'ok' } | { tipo: 'erro'; mensagem: string }

export async function excluirConta(): Promise<ResultadoExclusao> {
  const { data, error } = await supabase.functions.invoke('app-excluir-conta', {
    body: { confirmacao: PALAVRA_CONFIRMACAO },
  })

  if (error) {
    return {
      tipo: 'erro',
      mensagem: 'Não consegui excluir a conta agora. Verifique a conexão e tente de novo.',
    }
  }

  /* A função responde 200 só quando apagou. Qualquer outra coisa aqui é um
     caminho que não previmos, e tratar como sucesso mandaria a pessoa para o
     login achando que a conta sumiu. */
  if (!data?.ok) {
    return { tipo: 'erro', mensagem: 'Não consegui excluir a conta agora. Tente de novo.' }
  }

  return { tipo: 'ok' }
}
