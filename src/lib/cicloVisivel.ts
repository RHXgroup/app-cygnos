/* Se a linha do ciclo menstrual aparece para esta pessoa.
 *
 * ── O relato ──────────────────────────────────────────────────────────────
 * "eu sou homem no meu app e aparece o ciclo menstrual rs, não deveria né".
 *
 * Não deveria. A linha ficava lá para todo mundo, com um comentário na tela
 * defendendo a escolha: "quem não menstrua passa por ela todo dia, e um
 * destaque a transformaria em ruído permanente". O raciocínio estava certo
 * sobre o DESTAQUE e errado sobre a EXISTÊNCIA — a conta já sabe o gênero
 * desde o cadastro, e mostrar menstruação para quem se cadastrou como homem
 * não é discrição, é o app não ter olhado um dado que ele tem.
 *
 * ── E por que isto não é um `if genero === feminino` ──────────────────────
 * Porque menstruar não sai do campo `genero`, e um campo de cadastro não é
 * autoridade sobre o corpo de ninguém. Duas regras protegem quem o teste
 * simples deixaria de lado:
 *
 * 1. Só 'masculino' esconde. 'outro', vazio, nulo ou qualquer palavra que o
 *    app não conheça MOSTRAM. Na dúvida, a funcionalidade fica: esconder por
 *    engano tira de alguém uma coisa que ela usa, e o custo do contrário é uma
 *    linha a mais numa lista.
 *
 * 2. Quem já registrou continua vendo, tenha marcado o gênero que tiver. O app
 *    nunca esconde a porta de um dado que a própria pessoa entrou — isso não
 *    seria discrição, seria perder o acesso ao que é dela.
 *
 * A saída que falta, e vale dizer em voz alta: um homem trans que menstrua e
 * ainda não registrou nada cai fora das duas regras. Hoje ele alcança a tela
 * mudando o gênero no perfil, que é editável. O certo é um interruptor
 * próprio, em "Você" — e ele entra no dia em que existir alguém a quem isso
 * importe, e não antes, porque interruptor sem dono é mais uma linha de
 * configuração para todo mundo ler e ninguém usar. */

export function mostraOCiclo({
  genero,
  temRegistro,
}: {
  /* Como veio de `app_contas.genero`: 'feminino', 'masculino', 'outro' — ou
     nulo, que é o que acontece com conta antiga. */
  genero: string | null | undefined
  /* Se já existe qualquer ciclo registrado nesta conta. */
  temRegistro: boolean
}): boolean {
  if (temRegistro) return true
  return (genero ?? '').trim().toLowerCase() !== 'masculino'
}
