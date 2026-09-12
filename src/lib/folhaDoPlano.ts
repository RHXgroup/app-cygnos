import type { PlanoDaPaciente } from './planoDoPacienteDaNutri'
import { folhaPadrao, seguro, type TimbradoDaNutri } from './folhaPadrao.ts'

/* Reexportado porque o teste desta folha exercita o escape com nome de alimento
   cheio de `<` e aspas -- e o escape agora mora na moldura, que é de todos. */
export { seguro } from './folhaPadrao.ts'

/* O HTML que vira o PDF do plano.
 *
 * ──────────────────── Por que é lib pura, e testada ────────────────────
 * Porque é montagem de TEXTO a partir de dado que pode vir torto, e o resultado
 * vai para a mão da paciente -- impresso, ou no WhatsApp dela. Um `undefined`
 * numa tela some no meio de outras coisas; num papel entregue ele fica.
 *
 * E porque tem uma armadilha que só morde aqui: nome de alimento vem do banco e
 * pode ter `&`, `<` ou aspas. Colado cru dentro de HTML, um `<` engole o resto
 * do documento -- o PDF sai pela metade, sem erro nenhum, e ninguém confere um
 * PDF linha por linha antes de mandar.
 *
 * Fora do componente isso roda no Node, e dá para exercitar cada uma dessas
 * entradas sem gerar um arquivo.
 *
 * ──────────────────── O que a folha NÃO leva ────────────────────
 * Logotipo, CRN e rodapé de clínica. O sistema tem timbrado próprio e um
 * gerador de relatórios que já assina tudo isso; imitar aqui daria dois papéis
 * parecidos com identidades diferentes saindo da mesma nutricionista. Esta é a
 * folha do CELULAR: serve para imprimir na hora ou mandar para a paciente que
 * está pedindo agora, e diz isso no rodapé.
 */

/** Escapa o que vai para dentro do HTML. Sem isto um `<` corta o documento. */


export function folhaDoPlano(
  plano: PlanoDaPaciente,
  paciente: string,
  agora: Date = new Date(),
  nutri: TimbradoDaNutri | null = null,
): string {
  const refeicoes = plano.refeicoes
    .map(r => {
      const itens = r.itens
        .map(
          i => `
          <tr>
            <td class="item">${seguro(i.rotulo)}</td>
            <td class="qtd">${i.quantidade ? seguro(i.quantidade) : ''}</td>
          </tr>`,
        )
        .join('')

      /* Refeição sem item sai assim mesmo, com a linha dizendo. Some-la faria a
         folha impressa parecer completa quando falta uma refeição inteira -- e
         quem lê o papel não tem como comparar com a tela. */
      const corpo =
        itens ||
        '<tr><td class="item vazio" colspan="2">Sem itens.</td></tr>'

      return `
        <section>
          <h2>
            ${r.horario ? `<span class="hora">${seguro(r.horario)}</span>` : ''}
            ${seguro(r.nome)}
          </h2>
          <table>${corpo}</table>
        </section>`
    })
    .join('')

  /* A MOLDURA vem de `folhaPadrao`, e é a mesma de todo PDF do app: timbrado
   * com o nome e o registro dela, título com a barra verde, rodapé da marca.
   * Aqui fica só o MIOLO -- as refeições --, que é o que muda de um documento
   * para o outro.
   *
   * "O relatório não é só plano alimentar não: qualquer PDF que o sistema for
   * gerar tem que ser nesse padrão." */
  return folhaPadrao({
    rotulo: 'Plano alimentar',
    titulo: plano.titulo,
    subtitulo: 'Paciente: ' + paciente,
    nutri,
    agora,
    corpo:
      (plano.descricao ? `<p class="descricao">${seguro(plano.descricao)}</p>` : '') +
      (refeicoes || '<p class="vazio">Este plano ainda não tem refeições montadas.</p>'),
    cssExtra: `
  .descricao { color: #47582d; background: #f5f7f1; border-radius: 8px; padding: 10px 12px; margin: 0 0 16px; font-size: 12px }
  section { margin-bottom: 16px; break-inside: avoid }
  h2 {
    font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    color: #5a6b64; border-bottom: 2px solid #2f3921; padding-bottom: 5px; margin-bottom: 2px;
  }
  .hora { color: #79954e; margin-right: 8px }
  table { width: 100%; border-collapse: collapse; font-size: 12px }
  td { padding: 7px 8px; border-bottom: 1px solid #e8eae5; vertical-align: top }
  .qtd { text-align: right; white-space: nowrap; padding-left: 14px; color: #5a6b64 }
  .vazio { color: #8a9b93; font-style: italic }`,
  })
}

/* O nome do arquivo. Sem acento, sem espaço e sem barra: um `/` no nome é um
   caminho, e o sistema de arquivos recusa ou cria pasta -- e o nome vem do
   nome da paciente, que tem tudo isso. */
export function nomeDoArquivo(paciente: string, agora: Date = new Date()): string {
  const limpo = String(paciente ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const dois = (n: number) => String(n).padStart(2, '0')
  const data = Number.isNaN(agora.getTime())
    ? ''
    : `-${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}`
  return `plano-${limpo || 'paciente'}${data}.pdf`
}
