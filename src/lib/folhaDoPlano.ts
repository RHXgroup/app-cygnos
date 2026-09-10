import type { PlanoDaPaciente } from './planoDoPacienteDaNutri'

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
export function seguro(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* "10/09/2026". A data em que a folha foi gerada, e não a do plano: é o que
   responde "esta folha é a mais nova?" quando ela acha duas na bolsa. */
function hojePorExtenso(agora: Date): string {
  if (Number.isNaN(agora.getTime())) return ''
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()}`
}

export function folhaDoPlano(
  plano: PlanoDaPaciente,
  paciente: string,
  agora: Date = new Date(),
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

  /* `@page` com margem: sem isto o Chrome do Android imprime colado na borda e
     a impressora corta a primeira coluna. */
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #2F3722;
    font-size: 12pt;
    line-height: 1.45;
    margin: 0;
  }
  header { border-bottom: 2px solid #2F3722; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 19pt; margin: 0 0 2px; letter-spacing: -0.4px; }
  .paciente { font-size: 13pt; font-weight: 600; margin: 0; }
  .quando { font-size: 10pt; color: #6F7C52; margin: 4px 0 0; }
  .descricao { font-size: 11pt; color: #3F4A2E; margin: 10px 0 0; }
  section { margin-bottom: 14px; break-inside: avoid; }
  h2 {
    font-size: 12.5pt;
    margin: 0 0 4px;
    padding-bottom: 3px;
    border-bottom: 1px solid #DFE3D4;
  }
  .hora { color: #6F7C52; font-weight: 600; margin-right: 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  .item { }
  .qtd { text-align: right; white-space: nowrap; padding-left: 14px; color: #3F4A2E; }
  .vazio { color: #6F7C52; font-style: italic; }
  footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 1px solid #DFE3D4;
    font-size: 9pt;
    color: #6F7C52;
  }
</style>
</head>
<body>
  <header>
    <h1>${seguro(plano.titulo)}</h1>
    <p class="paciente">${seguro(paciente)}</p>
    <p class="quando">Gerado em ${hojePorExtenso(agora)}</p>
    ${plano.descricao ? `<p class="descricao">${seguro(plano.descricao)}</p>` : ''}
  </header>
  ${refeicoes || '<p>Este plano ainda não tem refeições montadas.</p>'}
  <footer>
    Cygnos &middot; folha gerada no aplicativo. Em caso de dúvida, vale o plano do sistema.
  </footer>
</body>
</html>`
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
