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

/* "10 de setembro de 2026", como nos relatórios do sistema. A data em que a
   folha foi gerada, e não a do plano: é o que responde "esta folha é a mais
   nova?" quando ela acha duas na bolsa.
   
   Escrita à mão, e NÃO com `toLocaleDateString`: o Hermes sai de fábrica sem a
   tabela completa do Intl, e o mês sairia em inglês em parte dos aparelhos --
   num papel que a paciente leva para casa. */
const MESES_POR_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function hojePorExtenso(agora: Date): string {
  if (Number.isNaN(agora.getTime())) return ''
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(agora.getDate())} de ${MESES_POR_EXTENSO[agora.getMonth()]} de ${agora.getFullYear()}`
}

/* O timbrado: quem assina a folha.
 *
 * Os três campos são os mesmos do cabeçalho dos relatórios do sistema
 * (`cabecalhoHTML`, em `relatorioClinico.ts`): nome, registro e a linha de
 * contato já montada. Montada FORA porque quem sabe juntar telefone, endereço e
 * Instagram é quem leu o perfil -- esta função tem de continuar pura para o
 * teste rodar fora do aparelho. */
export type TimbradoDaNutri = {
  nome: string
  crn: string | null
  contato: string | null
}

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

  /* ──────────────────── O PADRÃO É O DO SISTEMA ────────────────────
   *
   * "O PDF está gerando, só que tem que fazer gerar no padrão dos relatórios do
   * sistema."
   *
   * O que estava aqui era uma folha inventada no app: outra tipografia, outro
   * verde, outro cabeçalho. Impressa ao lado de um atestado ou de um relatório
   * clínico, parecia de outra casa -- e quem recebe não sabe que são dois
   * programas; sabe que é a nutricionista dela.
   *
   * As medidas abaixo vêm de `relatorioClinico.ts` (CSS_BASE, cabecalhoHTML e
   * rodapeSanoHTML): a faixa do timbrado com o gradiente, o título com a barra
   * verde à esquerda, a tabela com o cabeçalho em maiúsculas e o rodapé da
   * marca. Copiadas, e não importadas -- são dois repositórios, e o `import`
   * não atravessa.
   *
   * O que NÃO veio: logo, foto e assinatura. Elas moram em balde privado e
   * precisam de endereço assinado, que vence; uma imagem que não carrega deixa
   * um buraco no papel impresso, que é pior do que não ter imagem. O selo "via
   * Cygnos" continua, em texto.
   *
   * `@page` com margem: sem isto o Chrome do Android imprime colado na borda e
   * a impressora corta a primeira coluna. */
  const dataExt = hojePorExtenso(agora)
  const nomeDaNutri = nutri?.nome?.trim() || 'Cygnos'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${seguro(plano.titulo)} — Cygnos</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #262921;
    font-size: 13px;
    line-height: 1.5;
    padding: 8px;
  }
  .top {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    background: linear-gradient(100deg,#f5f7f3,#fbfcfa 55%,#ffffff);
    border: 1px solid #e2e5dd; border-radius: 14px; padding: 15px 22px; margin-bottom: 20px;
  }
  .brand .nm { font-size: 20px; font-weight: 700; color: #2f3921; letter-spacing: -.3px }
  .brand .crn { font-size: 12px; font-weight: 600; color: #555; margin-top: 1px }
  .brand .ct { font-size: 10px; color: #8a9b93; margin-top: 3px }
  .top .r { text-align: right; flex-shrink: 0 }
  .top .r .doc { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #2f3921 }
  .top .r .em { font-size: 11px; color: #5a6b64; margin-top: 3px }
  .top .r .dt { font-size: 11px; font-weight: 600; color: #41473A }
  .top .r .selo {
    display: inline-block; margin-top: 5px; background: #eff2ea; border-radius: 20px;
    padding: 2px 7px; font-size: 9px; color: #536835; font-weight: 600;
  }
  h1 { font-size: 18px; color: #2f3921; margin-bottom: 2px; padding-left: 11px; border-left: 4px solid #79954e }
  .sub { color: #5a6b64; font-size: 12px; margin: 2px 0 16px 15px }
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
  .vazio { color: #8a9b93; font-style: italic }
  footer {
    margin-top: 22px; padding-top: 12px; border-top: 1px solid #dfe0dc;
    text-align: center; color: #8a9b93; font-size: 11px;
  }
  footer b { color: #2f3921; font-weight: 600 }
  footer .sitio { color: #728654 }
</style>
</head>
<body>
  <div class="top">
    <div class="brand">
      <div class="nm">${seguro(nomeDaNutri)}</div>
      ${nutri?.crn ? `<div class="crn">${seguro(nutri.crn)}</div>` : ''}
      ${nutri?.contato ? `<div class="ct">${seguro(nutri.contato)}</div>` : ''}
    </div>
    <div class="r">
      <div class="doc">Plano alimentar</div>
      <div class="em">Emitido em</div>
      <div class="dt">${dataExt}</div>
      <div class="selo">via Cygnos</div>
    </div>
  </div>

  <h1>${seguro(plano.titulo)}</h1>
  <div class="sub">Paciente: ${seguro(paciente)}</div>
  ${plano.descricao ? `<p class="descricao">${seguro(plano.descricao)}</p>` : ''}

  ${refeicoes || '<p class="vazio">Este plano ainda não tem refeições montadas.</p>'}

  <footer>
    Gerado com <b>Cygnos</b> · sistema para nutricionistas · <span class="sitio">cygnos-nutri.com</span>
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
