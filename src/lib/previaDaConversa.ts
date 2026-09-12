/* O que a lista de conversas escreve embaixo de cada nome.
 *
 * ──────────────────── Por que isto é uma lib, e testada ────────────────────
 * Parece formatação e não é: é a única coisa que ela lê antes de decidir abrir.
 * As três formas de errar aqui já aconteceram do lado do site, e cada uma
 * mandou alguém abrir a conversa errada ou deixar de abrir a certa:
 *
 *  1. O app manda um "." no lugar da legenda quando a pessoa só grava um áudio.
 *     Na lista, um ponto ao lado do nome parecia toque errado na tela -- e a
 *     paciente achava que tinha falado com ela, e não tinha.
 *  2. Sem o "Você:", a última mensagem da CONVERSA parece a última mensagem
 *     DELA -- e uma resposta que a nutricionista já deu se lê como pergunta
 *     pendente.
 *  3. "há 1 horas".
 *
 * Não importa nada em tempo de execução, de propósito: é o que permite
 * exercitar os três casos sem o aparelho (ver o `exclude` do tsconfig). */

export type PreviaDaConversa = {
  ultima: string | null
  ultimaDe: string | null
  ultimaEm: string | null
  ultimaAnexoTipo?: string | null
}

/* O ponto que o app manda quando só há áudio. Com anexo ele não é mensagem, é
   marcação -- e some. Sem anexo, um ponto é o que a pessoa escreveu, e fica. */
const SO_MARCACAO = '.'

/**
 * A linha embaixo do nome. Vazia quando a conversa nunca teve mensagem --
 * e aí a tela mostra o convite, em vez de uma linha em branco.
 */
export function previaDaConversa(c: PreviaDaConversa): string {
  /* Comparação com a string, e não índice de `Record`: um valor novo em `de`
     não pode virar "undefined: " no meio da lista. Armadilha 10. */
  const quem = c.ultimaDe === 'nutricionista' ? 'Você: ' : ''

  if (c.ultimaAnexoTipo === 'foto') return quem + 'Foto'
  if (c.ultimaAnexoTipo === 'audio') return quem + 'Áudio'
  if (c.ultimaAnexoTipo === 'video') return quem + 'Vídeo'

  const texto = typeof c.ultima === 'string' ? c.ultima.trim() : ''
  if (!texto) return ''
  /* Anexo de tipo DESCONHECIDO cai aqui, e o "." sozinho continua sendo
     marcação: o campo pode ganhar um terceiro tipo ('video') antes de esta tela
     saber desenhá-lo, e nesse dia o certo é "Anexo", não um ponto. */
  if (texto === SO_MARCACAO && c.ultimaAnexoTipo) return quem + 'Anexo'
  return quem + texto
}

/**
 * "agora", "há 12 min", "há 3 horas", "há 2 dias".
 *
 * `agora` entra por parâmetro para dar para exercitar. Sem isso o teste
 * dependeria do relógio da máquina, que é o tipo de teste que passa hoje e
 * falha na virada do mês sem ninguém entender.
 */
export function desdeQuando(iso: string | null, agora: number = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  /* Data ilegível devolve vazio, e não "há NaN min". Nada garante o formato do
     que vem do banco quando alguém mexe numa coluna. */
  if (!Number.isFinite(t)) return ''

  const min = Math.floor((agora - t) / 60000)
  /* Futuro vira "agora". Relógio do aparelho atrasado em 40 segundos faria a
     mensagem que acabou de chegar dizer "há -1 min". */
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`

  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`

  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`

  const m = Math.floor(d / 30)
  return `há ${m} ${m === 1 ? 'mês' : 'meses'}`
}

/** "14:05" — a hora dentro do balão, no fuso do aparelho. */
export function horaDaMensagem(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * A legenda dentro do balão: o texto, ou vazio quando ele é só a marcação do
 * áudio. Mesma regra da prévia, e por isso mora no mesmo lugar -- as duas
 * divergirem faria a lista dizer "Áudio" e o balão mostrar um ponto.
 */
export function legendaDoBalao(texto: string | null, anexoTipo: string | null): string {
  const t = typeof texto === 'string' ? texto.trim() : ''
  return anexoTipo && (t === '' || t === SO_MARCACAO) ? '' : t
}
