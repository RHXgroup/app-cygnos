import type { DiaSemana } from './plano'
import type { ExercicioNovo } from './treino'

/* O núcleo puro da rotina de treino da IA: JSON que veio da rede vira exercício
 * do app.
 *
 * Vive separado de `treinoIA.ts` pelo mesmo motivo que `sugestaoParaPlano` vive
 * separado de `planoIA`: aqui não há import de runtime nenhum — só de tipo, que
 * some na compilação. Isso torna este arquivo executável fora do aparelho, e é
 * o que permite exercitar a conversão com JSON de verdade em vez de confiar que
 * ela está certa.
 *
 * A parte que fala com a rede fica lá; o que decide o que vira exercício fica
 * aqui, e é esta que erra.
 *
 * ── O que a IA devolve não é dado, é texto que se parece com dado ──────────
 * O modelo é instruído a devolver JSON num formato exato, e quase sempre
 * devolve. "Quase sempre" é o problema: dia com nome errado, série como texto,
 * repetição como número, exercício sem nome, o dia inteiro vazio. Nada disso
 * pode derrubar a tela nem virar linha muda no banco.
 *
 * A regra é a mesma do resto do app: valor que não dá para entender é
 * DESCARTADO e CONTADO, nunca chutado. Quem chama recebe os exercícios que
 * deram certo e a lista do que caiu, e a tela decide o que dizer. */

export type ExercicioDaIA = {
  nome?: string | null
  series?: number | string | null
  reps?: number | string | null
  descanso_seg?: number | string | null
}

export type DiaDaIA = {
  foco?: string | null
  duracao_min?: number | string | null
  exercicios?: ExercicioDaIA[] | null
}

export type RotinaDaIA = {
  divisao?: string | null
  nivel?: string | null
  dias?: Record<string, DiaDaIA> | null
  observacao?: string | null
}

/* As chaves que o prompt manda a IA usar, e o número do dia na semana que o
   resto do app usa (0 = domingo, como `Date.getDay`). */
const DIAS: Record<string, DiaSemana> = {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
  /* O modelo escorrega para a forma acentuada e para a extensa de vez em
     quando. Aceitar custa uma linha; recusar joga fora o dia inteiro. */
  sáb: 6, sabado: 6, sábado: 6, domingo: 0, segunda: 1, terca: 2, terça: 2,
  quarta: 3, quinta: 4, sexta: 5,
}

const SERIES_MAX = 12
const EXERCICIOS_POR_DIA_MAX = 15
const NOME_MAX = 60
/* Meia hora entre séries não é descanso, é outro treino. */
const DESCANSO_MAX_SEG = 600

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/* Número inteiro dentro de uma faixa, ou null.
 *
 * Aceita texto porque a IA alterna entre `3` e `"3"` na mesma resposta, e
 * recusar o segundo perderia metade dos exercícios. Mas aceita só o que É um
 * número: "3 a 4" não vira 3 — vira null, e a série fica em branco, que a tela
 * já sabe desenhar. Chutar o primeiro número de um intervalo inventa uma
 * prescrição que ninguém escreveu. */
function inteiro(v: unknown, minimo: number, maximo: number): number | null {
  if (v === null || v === undefined) return null
  const s = typeof v === 'number' ? String(v) : texto(v)
  if (!/^\d+([.,]\d+)?$/.test(s)) return null
  const n = Math.round(Number(s.replace(',', '.')))
  if (!Number.isFinite(n) || n < minimo || n > maximo) return null
  return n
}

/* A repetição é TEXTO no banco, e tem de continuar texto aqui.
 *
 * "8-12", "até a falha" e "30s" são respostas válidas e nenhuma cabe num
 * inteiro. Se a IA mandar o número 10, vira "10". */
function repeticoes(v: unknown): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v)) : null
  const s = texto(v)
  return s ? s.slice(0, 20) : null
}

export type Problema = { onde: string; motivo: string }

export type RotinaConvertida = {
  divisao: string | null
  nivel: string | null
  observacao: string | null
  exercicios: ExercicioNovo[]
  /* O que foi descartado, e por quê. A tela não precisa mostrar tudo, mas
     precisa poder dizer "montei 4 dias e um exercício não deu para ler" em vez
     de entregar uma rotina furada em silêncio. */
  problemas: Problema[]
}

export function rotinaDaIA(bruto: unknown): RotinaConvertida {
  const problemas: Problema[] = []
  const exercicios: ExercicioNovo[] = []

  const r = (bruto ?? {}) as RotinaDaIA
  const dias = r.dias

  if (!dias || typeof dias !== 'object' || Array.isArray(dias)) {
    return {
      divisao: null, nivel: null, observacao: null, exercicios: [],
      problemas: [{ onde: 'rotina', motivo: 'A resposta não trouxe nenhum dia de treino.' }],
    }
  }

  for (const [chave, valor] of Object.entries(dias)) {
    const dia = DIAS[chave.trim().toLowerCase()]
    if (dia === undefined) {
      problemas.push({ onde: chave, motivo: 'Não reconheci esse dia da semana.' })
      continue
    }

    const lista = valor?.exercicios
    if (!Array.isArray(lista) || lista.length === 0) {
      problemas.push({ onde: chave, motivo: 'Esse dia veio sem exercício nenhum.' })
      continue
    }

    /* A ordem é a posição na lista, e não um campo que a IA mande: ela repete
       número e pula número, e a ordem é o que decide o que a pessoa lê primeiro
       na tela. Quem sabe a sequência é a própria lista. */
    let ordem = 0
    for (const e of lista) {
      if (ordem >= EXERCICIOS_POR_DIA_MAX) {
        problemas.push({ onde: chave, motivo: 'Vieram exercícios demais nesse dia; usei os primeiros.' })
        break
      }
      const nome = texto(e?.nome).slice(0, NOME_MAX)
      if (nome.length < 2) {
        problemas.push({ onde: chave, motivo: 'Um exercício veio sem nome.' })
        continue
      }

      const descanso = inteiro(e?.descanso_seg, 5, DESCANSO_MAX_SEG)
      exercicios.push({
        dia,
        nome,
        ordem,
        series: inteiro(e?.series, 1, SERIES_MAX),
        repeticoes: repeticoes(e?.reps),
        /* A IA não sabe quanto a pessoa levanta, e não deve fingir que sabe.
           Carga em branco é a resposta honesta, e é o que a pessoa preenche
           depois do primeiro treino. */
        cargaKg: null,
        /* O descanso não tem coluna própria; vira observação, que é onde a
           pessoa lê na hora de treinar. */
        observacao: descanso === null ? null : `Descanso ${descanso}s`,
      })
      ordem++
    }
  }

  return {
    divisao: texto(r.divisao).slice(0, 60) || null,
    nivel: texto(r.nivel).slice(0, 30) || null,
    observacao: texto(r.observacao).slice(0, 400) || null,
    exercicios,
    problemas,
  }
}
