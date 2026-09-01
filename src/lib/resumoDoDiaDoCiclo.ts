/* O que ela anotou naquele dia, em linhas para ler.
 *
 * ── O que estava errado ───────────────────────────────────────────────────
 * Tocar num dia do calendário abria o EDITOR, sempre. Para um dia em branco
 * está certo — ela tocou para anotar. Para um dia já preenchido está errado:
 * ela tocou para VER, e recebia um formulário com seis categorias de etiqueta
 * que ela precisava atravessar para achar a informação que já tinha dado.
 *
 * Ver é o gesto comum; editar é a exceção. A ferramenta que aparece primeiro
 * tem de ser a do gesto comum.
 *
 * ── Só `import type` ──────────────────────────────────────────────────────
 * Roda fora do aparelho. */

import type { DiaDoCiclo } from './ciclo'

/* Uma linha do resumo. O rótulo separado do valor porque a tela desenha os dois
   com pesos diferentes — e juntar aqui obrigaria a tela a cortar a string de
   volta, que é como o corte erra no dia em que o texto mudar. */
export type LinhaDoResumo = { rotulo: string; valor: string }

const lista = (xs: string[] | null | undefined): string | null => {
  if (!Array.isArray(xs)) return null
  const uteis = xs.map(x => (typeof x === 'string' ? x.trim() : '')).filter(x => x.length > 0)
  return uteis.length > 0 ? uteis.join(', ') : null
}

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/* Tem alguma coisa anotada?
 *
 * É esta pergunta que decide se a tela abre no resumo ou no editor, então ela
 * tem de contar TUDO — inclusive a nota privada e a relação, que não aparecem
 * no resumo comum mas são, sozinhas, motivo para o dia não estar em branco. */
export function temAlgoAnotado(d: DiaDoCiclo | null | undefined): boolean {
  if (!d) return false
  return (
    d.fluxo !== null ||
    d.humor !== null ||
    d.energia !== null ||
    d.digestao !== null ||
    d.secrecao !== null ||
    d.cabeca !== null ||
    d.pele !== null ||
    d.relacao !== null ||
    lista(d.sintomas) !== null ||
    lista(d.desejoAlimentar) !== null ||
    texto(d.observacao) !== null ||
    texto(d.notaPrivada) !== null
  )
}

/* As linhas do resumo, na ordem em que a tela pergunta.
 *
 * A MESMA ordem do editor, de propósito: quem leu o resumo e tocou em editar
 * encontra os campos onde acabou de vê-los. Ordem diferente entre ver e editar
 * é o tipo de atrito que ninguém sabe nomear e todo mundo sente.
 *
 * O que está vazio não vira linha. Um resumo com sete "—" é um formulário
 * disfarçado, e o formulário é justamente o que esta tela existe para evitar. */
export function resumoDoDia(d: DiaDoCiclo | null | undefined): LinhaDoResumo[] {
  if (!d) return []

  const linhas: LinhaDoResumo[] = []
  const por = (rotulo: string, valor: string | null) => {
    if (valor !== null) linhas.push({ rotulo, valor })
  }

  por('Fluxo', texto(d.fluxo))
  por('Dor', lista(d.sintomas))
  por('Energia', texto(d.energia))
  por('Digestão', texto(d.digestao))
  por('Humor', texto(d.humor))
  por('Vontade de comer', lista(d.desejoAlimentar))
  por('Anotação', texto(d.observacao))

  return linhas
}

/* Se houve relação naquele dia, e se foi protegida.
 *
 * SEPARADO do resumo comum, e nunca junto: este dado nunca sai do aparelho — a
 * função que espelha para a nutricionista não o copia, e isso é garantido pela
 * AUSÊNCIA de código lá, não por configuração. Misturá-lo nas mesmas linhas do
 * fluxo e do humor convidaria alguém a mandar "o resumo" inteiro para algum
 * lugar sem reparar no que ia junto.
 *
 * Nulo quando ela não respondeu — e não respondeu é diferente de respondeu que
 * não houve. */
export function relacaoDoDia(d: DiaDoCiclo | null | undefined): string | null {
  if (!d || d.relacao === null) return null
  if (!d.relacao) return 'Sem relação'
  return d.relacaoProtegida === true
    ? 'Com relação, protegida'
    : d.relacaoProtegida === false
      ? 'Com relação, sem proteção'
      : 'Com relação'
}
