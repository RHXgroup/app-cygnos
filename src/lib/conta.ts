import { supabase } from './supabase'

/* Esta conta é de paciente do app?
 *
 * O Auth do Supabase é um só para os dois sistemas: a mesma tabela de usuários
 * atende o painel da nutricionista e o aplicativo do paciente. Autenticar,
 * portanto, não quer dizer nada sobre QUEM entrou. Quem separa os dois mundos é
 * a existência da linha em `app_contas`.
 *
 * Sem esta verificação, uma nutricionista entra no app com a conta do sistema
 * web e vê a casca vazia: sem nome, sem vínculo, sem registro. E a conclusão
 * natural de quem vê isso é que os dados sumiram.
 *
 * Devolve `null` quando não deu para perguntar. Erro de rede não pode barrar
 * ninguém: paciente legítimo no elevador sem sinal seria expulso do próprio
 * app. Na dúvida, deixa entrar, e as telas lidam com a ausência de dados como
 * já lidam hoje. */
/* Mora aqui, e não no App, para a tela de recuperação poder usar a mesma frase
   sem importar do App e fechar um ciclo de importação. */
export const AVISO_NAO_E_PACIENTE =
  'Esta conta é do sistema Cygnos para nutricionistas, e o aplicativo é para pacientes. Entre pelo site com ela, ou crie sua conta de paciente aqui.'

export async function ehContaDePaciente(): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('app_contas')
    .select('id')
    .maybeSingle()

  if (error) return null
  return data !== null
}

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
