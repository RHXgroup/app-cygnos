import { folhaPadrao, seguro, type TimbradoDaNutri } from './folhaPadrao'
import { comoSeChama, type DocumentoDaPaciente } from './fichaCompleta'

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

/* Os marcadores do editor do sistema viram tag.
 *
 * O editor guarda destaque dentro do próprio texto (o vocabulário está em
 * `lib/textoRico.ts`, no sistema):
 *
 *     **negrito**   _itálico_   __sublinhado__   ==marca-texto==
 *     ++grande++    ~~pequeno~~
 *
 * Sem traduzir isso, o contrato saía do app com `**CLÁUSULA 1ª**` escrito
 * assim, marcadores e tudo -- e o que era título de cláusula virava linha igual
 * às outras.
 *
 * Feito DEPOIS do escape, sobre o texto já seguro: um `<b>` que ela tenha
 * digitado continua sendo texto, e só os nossos marcadores viram tag.
 *
 * A ordem é a mesma da leitura de lá -- `**` antes de `*`, `__` antes de `_` --
 * e as classes são `[^*]` em vez de `.+?` porque dois destaques na mesma linha
 * viravam um só, engolindo o que estava no meio. */
export function comMarcacoes(escapado: string): string {
  return escapado
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/\+\+([^+]+)\+\+/g, '<span class="grande">$1</span>')
    .replace(/~~([^~]+)~~/g, '<span class="pequeno">$1</span>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

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

/* O mesmo texto para LER na tela, sem os marcadores.
 *
 * A tela mostra texto simples -- negrito dentro de um parágrafo exigiria partir
 * cada linha em vários `<Text>`, e o que ela faz aqui é conferir o conteúdo,
 * não revisar a diagramação. Tirar os marcadores é melhor do que mostrá-los:
 * `**CLÁUSULA 1ª**` na tela é o app expondo o próprio encanamento. */
export function semMarcacoes(texto: string): string {
  return texto
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\+\+([^+]+)\+\+/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
}
