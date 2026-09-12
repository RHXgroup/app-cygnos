import { folhaPadrao, seguro, type TimbradoDaNutri } from './folhaPadrao'
import { comMarcacoes } from './marcacoesDoTexto'
import { comoSeChama, type DocumentoDaPaciente } from './fichaCompleta'

/* Reexportado para a tela, que já importava daqui: o TEXTO mudou de arquivo,
   e o caminho de quem usa não precisa mudar junto. */
export { semMarcacoes } from './marcacoesDoTexto'

/* O PDF de um receituário, atestado ou prescrição -- no padrão da casa.
 *
 * ──────────────────── O pedido ────────────────────
 * "Clico e não faz nada. Não poderia gerar o PDF igual tá pronto no sistema?"
 *
 * ──────────────────── A moldura NÃO mora aqui ────────────────────
 * Quem desenha timbrado, título, data e rodapé é `folhaPadrao` -- a mesma do
 * plano, que ele aprovou. Aqui fica só o MIOLO. Foi decisão dele que todo PDF
 * do app saia igual: uma folha com moldura própria seria o app dizendo que
 * cada papel vem de um lugar diferente.
 *
 * ──────────────────── Texto de gente, e não HTML de gente ────────────────────
 * O conteúdo vem do sistema como texto solto, escrito por ela. Vai escapado
 * (`seguro`), e as quebras de linha viram parágrafos: se fosse injetado cru, um
 * `<` digitado por ela quebraria a folha inteira -- e nada do que ela escreve
 * deveria virar marcação. */

export function folhaDoDocumento(
  documento: DocumentoDaPaciente,
  paciente: string,
  nutri: TimbradoDaNutri | null,
  agora: Date = new Date(),
): string {
  const corpo = [
    documento.medicamentos.length > 0 ? tabelaDeItens(documento) : '',
    documento.conteudo ? emParagrafos(documento.conteudo) : '',
    documento.medicamentos.length === 0 && !documento.conteudo
      ? '<p class="vazio">Este documento não tem texto guardado no sistema.</p>'
      : '',
    /* ── O FIM ESCRITO ──
     *
     * Relato dele, sobre um contrato: "a contratante, testemunha, essas coisas
     * não estão aparecendo... pulou uma nova página, provavelmente". Pulou
     * mesmo: um contrato tem duas páginas, e o visualizador que abre do lado de
     * fora -- a prévia do WhatsApp, o leitor do celular -- mostra a primeira e
     * não avisa que existe outra.
     *
     * A folha não consegue numerar as páginas (o motor de impressão do Android
     * não desenha contador de página), mas consegue dizer onde ela ACABA. Quem
     * não vê esta linha sabe que ainda falta rolar -- e isso separa "o app
     * cortou o documento" de "o meu leitor abriu só a primeira folha". */
    '<p class="fim">— fim do documento —</p>',
  ]
    .filter(Boolean)
    .join('\n')

  return folhaPadrao({
    /* O que o documento É -- contrato, avaliação, encaminhamento --, e não a
       base 'atestado' que treze modelos diferentes gravam. Um contrato de
       prestação de serviços saindo com "ATESTADO" no canto é papel errado. */
    rotulo: comoSeChama(documento),
    titulo: comoSeChama(documento),
    subtitulo: `Paciente: ${paciente}`,
    corpo,
    nutri,
    agora,
    cssExtra: `
      .itens { width: 100%; border-collapse: collapse; margin-bottom: 18px }
      .itens th {
        text-align: left; font-size: 11px; letter-spacing: .4px; text-transform: uppercase;
        color: #6b7264; border-bottom: 1px solid #e2e5dd; padding: 0 0 6px
      }
      .itens td { padding: 9px 10px 9px 0; border-bottom: 1px solid #f0f2ed; vertical-align: top }
      .itens td.nome { font-weight: 600; color: #262921 }
      /* Uma linha sozinha no pé ou no alto da página é o que faz um documento
         longo parecer cortado; e a linha de assinatura partida ao meio é papel
         que ninguém aceita. */
      .texto p { margin-bottom: 10px; orphans: 3; widows: 3; page-break-inside: avoid }
      .texto mark { background: #fdf0a0; padding: 0 2px }
      .texto .grande { font-size: 1.15em }
      .texto .pequeno { font-size: 0.85em; color: #4b5347 }
      .vazio { color: #6b7264; font-style: italic }
      .fim {
        margin-top: 20px; text-align: center; color: #9aa396;
        font-size: 11px; letter-spacing: .06em;
      }
    `,
  })
}

/* A data do documento entra no título quando existe: um receituário sem data
   impressa é um papel que ninguém sabe de quando é -- e o rodapé traz a data em
   que o PDF foi gerado, que é outra coisa. */
export function tituloComData(documento: DocumentoDaPaciente): string {
  const base = comoSeChama(documento)
  if (!documento.quando) return base
  const [ano, mes, dia] = documento.quando.split('-')
  return dia && mes && ano ? `${base} — ${dia}/${mes}/${ano}` : base
}

function tabelaDeItens(documento: DocumentoDaPaciente): string {
  const linhas = documento.medicamentos
    .map(
      m => `<tr>
        <td class="nome">${seguro(m.nome)}</td>
        <td>${seguro(m.dosagem ?? '')}</td>
        <td>${seguro(m.frequencia ?? '')}</td>
      </tr>`,
    )
    .join('\n')

  return `<table class="itens">
    <thead><tr><th>Item</th><th>Dosagem</th><th>Como tomar</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`
}

const emParagrafos = (texto: string): string =>
  `<div class="texto">${texto
    .split(/\n{2,}/)
    .map(p => `<p>${comMarcacoes(seguro(p.trim())).replace(/\n/g, '<br>')}</p>`)
    .join('\n')}</div>`


/* O mesmo vocabulário da tela (`CicloEDocumentos`), e com reserva explícita:
   um tipo novo no sistema não pode sair impresso como `undefined`. */
const ROTULOS: Record<string, string> = {
  receituario: 'Receituário',
  atestado: 'Atestado',
  encaminhamento: 'Encaminhamento',
  solic_exames_lab: 'Solicitação de exames',
  solic_exames_bio: 'Solicitação de exames',
  avaliacao_antro: 'Avaliação antropométrica',
  relatorio_inicial: 'Relatório inicial',
  relatorio_sequencial: 'Relatório de consultas',
  contrarreferencia: 'Contrarreferência',
  plano_qualitativo: 'Plano qualitativo',
  outro: 'Documento',
}

export const rotuloDoTipo = (tipo: string): string =>
  Object.hasOwn(ROTULOS, tipo) ? ROTULOS[tipo] : 'Documento'

/* "receituario-Maria-Silva-20260912.pdf". Mesma forma do nome do plano: sem
   acento, sem espaço, e com a data -- é o nome que chega no WhatsApp dela. */
export function nomeDoArquivoDoDocumento(
  documento: DocumentoDaPaciente,
  paciente: string,
  agora: Date = new Date(),
): string {
  const limpo = (texto: string) =>
    [...texto.normalize('NFD')]
      .filter(c => {
        const n = c.codePointAt(0) ?? 0
        return n < 0x300 || n > 0x36f
      })
      .join('')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)

  const dois = (n: number) => String(n).padStart(2, '0')
  const data = Number.isNaN(agora.getTime())
    ? ''
    : `-${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}`

  return `${limpo(comoSeChama(documento)) || 'documento'}-${limpo(paciente) || 'paciente'}${data}.pdf`
}

