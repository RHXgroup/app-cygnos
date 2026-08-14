import { supabase } from './supabase'

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
