/* Quem está na ficha quando a Aurora é aberta de dentro dela.
 *
 * ──────────────────── Por que este arquivo é SÓ um tipo ────────────────────
 * Ele nasceu com quatro funções: montar o prefixo `Sobre a paciente #412:`,
 * validar o id, impedir o prefixo de empilhar no "tentar de novo", e trocar o
 * `#412` de volta pelo nome na resposta.
 *
 * Todas foram apagadas antes de subir, e o motivo vale mais do que elas: a
 * regra JÁ EXISTIA. `AuroraDaNutriScreen` monta o prefixo, o "tentar de novo"
 * reenvia a pergunta SEM prefixo (então não há o que empilhar), o id vem da
 * linha da ficha (então não há o que validar), e quem troca o número pelo nome
 * é o servidor, que é o único lado que pode -- o nome não sai do aparelho.
 *
 * Eu escrevi as quatro sem ter olhado, e teria subido uma segunda cópia de uma
 * regra que já funciona. É a armadilha 5, e o preço dela não é o trabalho
 * perdido: é o dia em que as duas cópias divergem e ninguém sabe por qual das
 * duas a tela passa.
 *
 * ──────────────────── E por que o tipo ficou ────────────────────
 * Porque quatro telas o atravessam -- a ficha, e as três que abrem a ficha
 * (lista, agenda, painel) -- até a área, que é quem hospeda a Aurora. Escrever
 * `{ pacienteId: number; nome: string }` à mão em quatro lugares é a mesma
 * duplicação, só que de forma.
 *
 * ──────────────────── O que viaja, e o que não ────────────────────
 * `pacienteId` vai ao servidor, dentro da pergunta, como `#412`. `nome` NÃO
 * viaja: fica na tela dela, onde já estava -- ela está olhando a ficha. É o
 * recorte do DPA 1.7 que ele escolheu quando eu perguntei ("1 — Só o número").
 */
export type PacienteEmFoco = {
  pacienteId: number
  /** Só para a tela dela. Não vai à rede. */
  nome: string
}
