/* A MOLDURA de todo PDF que o aplicativo gera.
 *
 * ──────────────────── O pedido ────────────────────
 * "O relatório não é só plano alimentar não: tem que ser nesse padrão qualquer
 * PDF que o sistema for gerar -- o plano alimentar, o plano terapêutico, todos."
 *
 * Então a moldura mora aqui, e não dentro da folha do plano. Quem for gerar um
 * PDF novo escreve só o MIOLO e chama `folhaPadrao`: o timbrado, a data, o
 * título com a barra verde e o rodapé da marca vêm de graça, iguais aos de lá.
 *
 * ──────────────────── De onde saíram as medidas ────────────────────
 * De `relatorioClinico.ts`, no sistema (CSS_BASE, cabecalhoHTML,
 * rodapeSanoHTML). Copiadas, e não importadas: são dois repositórios, e o
 * `import` não atravessa. Se lá mudar, aqui precisa mudar junto -- e é por isso
 * que estão num arquivo só, e não espalhadas.
 *
 * Este arquivo não importa NADA de runtime, para o teste rodar fora do
 * aparelho. */

/** Escapa texto para caber dentro do HTML sem quebrar a folha. */
export function seguro(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* O timbrado: quem assina a folha.
 *
 * Os campos são os do cabeçalho dos relatórios do sistema. A linha de contato
 * chega pronta -- quem sabe juntar telefone, endereço e Instagram é quem leu o
 * perfil, e este arquivo precisa continuar puro. */
export type TimbradoDaNutri = {
  nome: string
  crn: string | null
  contato: string | null
  /* O endereço da logo (ou da foto) JÁ ASSINADO, quando ela tem uma. Nulo
     quando não tem, ou quando a assinatura falhou: imagem que não carrega deixa
     um buraco no papel impresso, e um buraco é pior do que não ter logo. */
  logo?: string | null
}

/* "10 de setembro de 2026", como nos relatórios do sistema.
 *
 * Escrita à mão, e NÃO com `toLocaleDateString`: o Hermes sai de fábrica sem a
 * tabela completa do Intl, e o mês sairia em inglês em parte dos aparelhos --
 * num papel que a paciente leva para casa. */
const MESES_POR_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function dataPorExtenso(agora: Date): string {
  if (Number.isNaN(agora.getTime())) return ''
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(agora.getDate())} de ${MESES_POR_EXTENSO[agora.getMonth()]} de ${agora.getFullYear()}`
}

export type FolhaPadrao = {
  /* O que vai no canto direito, em maiúsculas: "Plano alimentar", "Plano
     terapêutico". Quem recebe o papel lê aquele canto para saber o que tem na
     mão -- é a mesma escolha do sistema. */
  rotulo: string
  titulo: string
  /* A linha abaixo do título: "Paciente: Maria Alves". */
  subtitulo?: string | null
  /* O miolo, em HTML, já escapado por quem montou. */
  corpo: string
  nutri?: TimbradoDaNutri | null
  agora?: Date
  /* CSS a mais, para o miolo. O do sistema tem o mesmo campo, pelo mesmo
     motivo: cada relatório desenha uma coisa diferente por dentro. */
  cssExtra?: string
}

export function folhaPadrao(o: FolhaPadrao): string {
  const agora = o.agora ?? new Date()
  const nome = o.nutri?.nome?.trim() || 'Cygnos'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${seguro(o.titulo)} — Cygnos</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #262921;
    font-size: 13px;
    line-height: 1.5;
    padding: 4px;
  }
  .top {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    background: linear-gradient(100deg,#f5f7f3,#fbfcfa 55%,#ffffff);
    border: 1px solid #e2e5dd; border-radius: 14px; padding: 15px 20px; margin-bottom: 20px;
  }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0 }
  .brand img { width: 46px; height: 46px; border-radius: 10px; object-fit: contain; flex-shrink: 0 }
  .brand .nm { font-size: 19px; font-weight: 700; color: #2f3921; letter-spacing: -.3px }
  .brand .crn { font-size: 12px; font-weight: 600; color: #555; margin-top: 1px }
  .brand .ct { font-size: 10px; color: #8a9b93; margin-top: 3px }
  .top .r { text-align: right; flex-shrink: 0 }
  .top .r .doc { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #2f3921 }
  .top .r .em { font-size: 11px; color: #5a6b64; margin-top: 3px }
  .top .r .dt { font-size: 11px; font-weight: 600; color: #41473A }
  .top .r .selo {
    display: inline-block; margin-top: 5px; background: #eff2ea; border-radius: 20px;
    padding: 2px 8px; font-size: 9px; color: #536835; font-weight: 600;
  }
  h1 { font-size: 18px; color: #2f3921; margin-bottom: 2px; padding-left: 11px; border-left: 4px solid #79954e }
  .sub { color: #5a6b64; font-size: 12px; margin: 2px 0 16px 15px }
  footer {
    margin-top: 22px; padding-top: 12px; border-top: 1px solid #dfe0dc;
    text-align: center; color: #8a9b93; font-size: 11px;
  }
  footer b { color: #2f3921; font-weight: 600 }
  footer .sitio { color: #728654 }
${o.cssExtra ?? ''}
</style>
</head>
<body>
  <div class="top">
    <div class="brand">
      ${o.nutri?.logo ? `<img src="${seguro(o.nutri.logo)}" alt="">` : ''}
      <div>
        <div class="nm">${seguro(nome)}</div>
        ${o.nutri?.crn ? `<div class="crn">${seguro(o.nutri.crn)}</div>` : ''}
        ${o.nutri?.contato ? `<div class="ct">${seguro(o.nutri.contato)}</div>` : ''}
      </div>
    </div>
    <div class="r">
      <div class="doc">${seguro(o.rotulo)}</div>
      <div class="em">Emitido em</div>
      <div class="dt">${dataPorExtenso(agora)}</div>
      <div class="selo">via Cygnos</div>
    </div>
  </div>

  <h1>${seguro(o.titulo)}</h1>
  ${o.subtitulo ? `<div class="sub">${seguro(o.subtitulo)}</div>` : ''}

  ${o.corpo}

  <footer>
    Gerado com <b>Cygnos</b> · sistema para nutricionistas · <span class="sitio">cygnos-nutri.com</span>
  </footer>
</body>
</html>`
}
