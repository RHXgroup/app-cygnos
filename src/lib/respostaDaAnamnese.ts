/* Uma resposta de anamnese, virando linhas para a tela.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * A anamnese é preenchida no sistema da nutricionista e chega aqui como
 * `jsonb`. O app desenhava assim:
 *
 *     if (typeof v === 'object') return JSON.stringify(v)
 *
 * Com um comentário defendendo a escolha: "melhor mostrar o bruto do que
 * esconder que existe resposta ali". Isso fazia sentido quando ninguém sabia a
 * forma dos valores. Deixou de fazer quando o sistema passou a ter campos com
 * forma conhecida — e o resultado, fotografado no aparelho, foi a paciente
 * lendo isto na tela dela:
 *
 *     Escala de Bristol
 *     {"tipo":"Tipo 3 — Como salsicha, com rachaduras na superfície (normal)"}
 *
 *     Pele, cabelo, unha, boca e olhos
 *     {"Boca":["Normal"],"Pele":["Normal"],"Unha":["Quebradiça / fina"]…}
 *
 * ── E o segundo defeito, no mesmo lugar ──────────────────────────────────
 * O ramo de lista fazia `Object.entries(linha)` em cada item, supondo que toda
 * lista é de OBJETOS — que é o caso do "grupo repetível". Mas a múltipla
 * escolha guarda lista de TEXTOS, e `Object.entries('Gases')` devolve
 * `[['0','G'],['1','a'],['2','s']…]`: a resposta aparecia uma letra por linha.
 * Ninguém tinha relatado, e ele estava lá do mesmo jeito.
 *
 * ── Por que uma lib, e pura ──────────────────────────────────────────────
 * Porque a decisão é sobre FORMA de dado que vem de fora, que é exatamente o
 * caso em que este projeto testa de verdade — e porque há um quarto lugar que
 * desenha isto (o web tem dois, e este é o terceiro). A regra num lugar só é o
 * que impede o próximo a divergir.
 *
 * As formas abaixo foram LIDAS do banco, não deduzidas:
 *
 *   escala_bristol          {"tipo": "Tipo 3 — …", "cor": "Marrom (normal)"}
 *   escala_sinais_clinicos  {"Boca": ["Normal"], "Pele": ["Normal"], …}
 *   escala_urina            "Nível 4 — Amarelo — hora de beber água"
 *   checkbox_multi          ["Gases", "Inchaço/distensão"]
 *   grupo_repetivel         [{"Horário preferido": "19h30", "Tipo": "Musculação"}]
 */

/* O traço, e não string vazia: um rótulo sem nada embaixo se lê como tela
   quebrada, e "—" diz "perguntaram e não respondeu". */
export const SEM_RESPOSTA = '—'

const ehTextoUtil = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/* Um valor simples vira o texto dele. Nunca JSON. */
function simples(v: unknown): string | null {
  if (v === true) return 'Sim'
  if (v === false) return 'Não'
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return String(v)
  if (ehTextoUtil(v)) return v.trim()
  return null
}

/* As linhas que a tela desenha para uma resposta.
 *
 * Lista, e não texto único, porque as respostas compostas são naturalmente
 * várias linhas — "Boca: Normal", "Pele: Normal" — e juntá-las com vírgula
 * daria um parágrafo que ninguém lê. Vazio quer dizer "não respondeu", e quem
 * chama desenha o traço.
 *
 * A ordem das regras importa: do mais específico para o mais genérico, e o
 * genérico do fim NUNCA devolve JSON. */
export function linhasDaResposta(valor: unknown): string[] {
  const s = simples(valor)
  if (s !== null) return [s]
  if (valor === null || valor === undefined) return []

  /* ── LISTA ──────────────────────────────────────────────────────────────
   * Duas listas diferentes moram aqui, e distinguir é o conserto:
   *   ["Gases", "Inchaço"]                  múltipla escolha
   *   [{"Horário": "19h30", "Tipo": "…"}]   grupo repetível
   *
   * Item a item, e não pelo primeiro: uma lista com um texto e um objeto no
   * meio é improvável, mas tratar pelo primeiro faria o resto sair errado
   * calado — que é o defeito que este arquivo existe para acabar. */
  if (Array.isArray(valor)) {
    const linhas: string[] = []
    for (const item of valor) {
      const t = simples(item)
      if (t !== null) {
        linhas.push(t)
        continue
      }
      if (item && typeof item === 'object') {
        const partes = Object.entries(item as Record<string, unknown>)
          .map(([k, v]) => {
            const tv = simples(v)
            return tv === null ? null : `${k}: ${tv}`
          })
          .filter((x): x is string => x !== null)
        if (partes.length) linhas.push(partes.join(' · '))
      }
    }
    return linhas
  }

  /* ── OBJETO ─────────────────────────────────────────────────────────────
   * Também dois, e os dois com forma conhecida:
   *   {"tipo": "Tipo 3 — …", "cor": "Marrom"}    escala de Bristol
   *   {"Boca": ["Normal"], "Pele": ["Normal"]}   sinais clínicos
   *
   * O mesmo laço serve para os dois: chave e valor, com o valor achatado. É o
   * que evita ter uma regra por tipo de campo aqui dentro — o tipo mora no
   * sistema da nutricionista, e uma cópia dele aqui seria mais uma coisa para
   * divergir. */
  if (typeof valor === 'object') {
    const linhas: string[] = []
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      const dentro = linhasDaResposta(v)
      if (dentro.length === 0) continue
      /* Chave de uma letra ou número não é rótulo: é índice de lista, e
         escrevê-lo faria "0: Normal". Nesse caso vai só o valor. */
      const rotulo = /^\d+$/.test(chave) ? '' : `${maiuscula(chave)}: `
      linhas.push(rotulo + dentro.join(' · '))
    }
    return linhas
  }

  return []
}

/* "boca" → "Boca". As chaves vêm como a nutricionista digitou no sistema, e
   nem todas chegam capitalizadas. */
const maiuscula = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

/* Atalho para quem só quer uma linha — o resumo de um cartão, por exemplo. */
export const textoDaResposta = (valor: unknown): string => {
  const linhas = linhasDaResposta(valor)
  return linhas.length ? linhas.join(' · ') : SEM_RESPOSTA
}
