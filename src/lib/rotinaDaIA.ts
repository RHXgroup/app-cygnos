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
  /* Só a leitura de ficha preenche: "leva o braço acima da linha do ombro".
     Aparece quando a pessoa declarou uma limitação e AQUELE exercício carrega a
     região dela. */
  alerta?: string | null
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
/* `Object.create(null)` e não `{}`, e isto veio de bug achado sondando entrada
   hostil: um objeto literal HERDA `constructor`, `valueOf`, `toString` e mais
   meia dúzia. Se a chave vem de fora — do JSON de uma IA, do que a pessoa
   digitou —, `MAPA['constructor']` devolve a função construtora, e o teste
   `=== undefined` não pega, porque função não é undefined.

   O efeito medido: um dia de treino virava uma FUNÇÃO, e ia assim para o
   banco. Sem protótipo, a busca só encontra o que foi escrito aqui. */
const DIAS: Record<string, DiaSemana> = Object.assign(Object.create(null), {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
  /* O modelo escorrega para a forma acentuada e para a extensa de vez em
     quando. Aceitar custa uma linha; recusar joga fora o dia inteiro. */
  sáb: 6, sabado: 6, sábado: 6, domingo: 0, segunda: 1, terca: 2, terça: 2,
  quarta: 3, quinta: 4, sexta: 5,
})

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

/* Um exercício mais o aviso que veio com ele.
 *
 * O alerta NÃO vira `observacao` nem `adaptado_de`: ele não é parte do
 * exercício, é uma leitura sobre ele. A ficha da academia continua exatamente
 * como o professor montou — quem decide o que fazer com o aviso é a pessoa, na
 * tela de conferência, e o que ela não usar não chega ao banco. */
export type ExercicioComAlerta = ExercicioNovo & { alerta: string | null }

export type RotinaConvertida = {
  divisao: string | null
  nivel: string | null
  observacao: string | null
  exercicios: ExercicioComAlerta[]
  /* O que foi descartado, e por quê. A tela não precisa mostrar tudo, mas
     precisa poder dizer "montei 4 dias e um exercício não deu para ler" em vez
     de entregar uma rotina furada em silêncio. */
  problemas: Problema[]
}

export function rotinaDaIA(bruto: unknown): RotinaConvertida {
  const problemas: Problema[] = []
  const exercicios: ExercicioComAlerta[] = []

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
        alerta: texto(e?.alerta).slice(0, 200) || null,
        /* Nasce nulo sempre. A rotina que a IA monta já respeita a limitação, e
           a ficha da academia é copiada como está — em nenhum dos dois houve
           troca de exercício, então marcar um original seria inventar uma
           história que não aconteceu. Só a adaptação pedida por ela preenche. */
        adaptadoDe: null,
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

/* ── Editar a rotina antes de ela virar rotina ─────────────────────────────*/

/* Estas três moram aqui, e não dentro da tela de conferência, por um motivo
 * que custou caro: enquanto estavam lá, não davam para exercitar. E são elas
 * que decidem em que dia cada exercício cai e em que ordem ele aparece — os
 * dois lugares onde erro passa calado, porque uma rotina no dia errado parece
 * uma rotina.
 *
 * Regra do projeto: só `import type` neste arquivo, e por isso ele roda fora
 * do aparelho.
 *
 * ── E por que as três são genéricas ────────────────────────────────────────
 * Elas mexem em `dia` e `ordem`, e devolvem o MESMO tipo que receberam. Sem o
 * genérico, um `ExercicioComAlerta[]` entrava e saía como `ExercicioNovo[]`, e
 * o alerta desaparecia do tipo — sem erro nenhum, porque o valor continua lá em
 * tempo de execução. A tela pararia de conseguir mostrá-lo só por ter movido um
 * bloco de dia. */

/* Move o BLOCO inteiro de um dia para outro.
 *
 * Um exercício por vez seria pior: ficha de academia é "Treino A", um conjunto
 * que anda junto. O caso comum é "isto aqui é quarta, não segunda" — e a IA
 * sempre chuta segunda, porque o prompt manda converter o primeiro bloco nela e
 * ficha não diz dia da semana.
 *
 * Mover para um dia que JÁ TEM exercício junta os dois, e isso é o certo: quem
 * arrastou o bloco A para a quarta em que já havia o B quis os dois na quarta.
 * A ordem de quem chega continua depois de quem já estava. */
export function moverDia<T extends ExercicioNovo>(
  exercicios: T[],
  de: DiaSemana,
  para: DiaSemana,
): T[] {
  if (de === para) return exercicios
  const quantosJaHa = exercicios.filter(e => e.dia === para).length
  let n = 0
  return exercicios.map(e =>
    e.dia === de ? { ...e, dia: para, ordem: quantosJaHa + n++ } : e,
  )
}

/* Tira um exercício pela posição na lista. */
export const tirarDaRotina = <T extends ExercicioNovo>(exercicios: T[], i: number): T[] =>
  exercicios.filter((_, n) => n !== i)

/* Renumera a ordem dentro de cada dia, do zero e sem buraco.
 *
 * Tirar exercício e mover bloco deixam furo na numeração — (0, 2, 3) —, e a
 * próxima leitura ordena por ela. Um furo não quebra nada hoje, mas vira
 * pergunta sem resposta para quem for ler depois: sumiu um exercício, ou a
 * numeração é que está torta?
 *
 * A ordem RELATIVA é preservada: quem estava antes continua antes. */
export function renumerar<T extends ExercicioNovo>(exercicios: T[]): T[] {
  const porDia = new Map<DiaSemana, number>()
  return exercicios.map(e => {
    const n = porDia.get(e.dia) ?? 0
    porDia.set(e.dia, n + 1)
    return { ...e, ordem: n }
  })
}
