/* Contas de data em texto ISO, num lugar só.
 *
 * ── Por que este arquivo existe ───────────────────────────────────────────
 * `somandoDias` e a checagem de data existiam em TRÊS cópias — no calendário,
 * na fertilidade e no padrão do ciclo. A terceira cópia foi escrita sem a
 * checagem que as outras já tinham, e uma sonda de entrada hostil pegou as duas
 * consequências no mesmo dia:
 *
 *   `formaNaFaixa('nada', …)` ESTOUROU com "Invalid time value" — tela branca
 *   no calendário se qualquer data torta chegasse do banco.
 *
 *   `avisoDaSemana('2026-02-31', …)` produziu aviso. O formato passa, a data
 *   não existe, e o JavaScript escorrega para 3 de março sem reclamar. O app
 *   diria "a sua menstruação deve vir em 6 dias" apoiado numa data inventada.
 *
 * É o item 5 do AGENTS.md com nome e sobrenome: duas implementações do mesmo
 * assunto sempre divergem, e ninguém descobre por qual das duas a tela passou.
 *
 * ── Só `import type` em quem usa ──────────────────────────────────────────
 * Este arquivo não importa nada, e por isso continua rodando fora do aparelho —
 * que é a condição para as quatro libs de ciclo terem teste de verdade. */

const DIA = 86400000
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const doISO = (iso: string): number => Date.parse(iso + 'T00:00:00Z')
export const paraISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/* A data existe MESMO no calendário?
 *
 * O formato bater não basta: `Date.parse('2026-02-31T00:00:00Z')` NÃO dá erro —
 * o JavaScript escorrega para 3 de março e devolve um número perfeitamente
 * válido. A volta é a prova: se o ISO reconstruído a partir do número não for
 * igual ao que entrou, a data não existia.
 *
 * Eu já tinha escrito no código que `Date.parse` daria NaN nesse caso. Não dá,
 * e um teste pegou. */
export const ehDataReal = (iso: unknown): iso is string => {
  if (typeof iso !== 'string' || !ISO.test(iso)) return false
  const ms = doISO(iso)
  return Number.isFinite(ms) && paraISO(ms) === iso
}

/* Soma dias. Devolve o ORIGINAL quando a data não existe, em vez de estourar:
 * quem chama está desenhando uma tela, e uma exceção aqui é tela branca. Data
 * inválida que sai igual ao que entrou não casa com nada e some sozinha do
 * resultado, que é o comportamento certo. */
export const somandoDias = (iso: string, dias: number): string =>
  ehDataReal(iso) ? paraISO(doISO(iso) + dias * DIA) : iso

/* Quantos dias entre duas datas. Zero quando alguma não existe — e quem chama
 * decide o que fazer com isso, porque "zero dias" e "não sei" só se distinguem
 * no contexto de quem perguntou. */
export const emDias = (de: string, ate: string): number =>
  ehDataReal(de) && ehDataReal(ate) ? Math.round((doISO(ate) - doISO(de)) / DIA) : 0

/* Em que dia da semana a data cai. 0 é domingo, como `Date.getDay()`. Devolve
 * -1 para data que não existe, e quem chama trata: um dia da semana inventado
 * colocaria a célula na coluna errada do calendário. */
export const diaDaSemana = (iso: string): number =>
  ehDataReal(iso) ? new Date(doISO(iso)).getUTCDay() : -1

/* A segunda-feira da semana daquela data, em ISO.
 *
 * `getUTCDay()` devolve 0 para domingo. Domingo pertence à semana que COMEÇOU
 * na segunda anterior -- seis dias atrás, e não no dia seguinte. Sem esse
 * ajuste o cartão da semana aparecia duas vezes em toda virada de domingo para
 * segunda.
 *
 * ──────────────────── Por que ela veio de `semanaVista` para cá ────────────────────
 * Lá ela morava ao lado de duas funções de AsyncStorage, e por isso ninguém
 * conseguia importá-la de uma lib pura -- qualquer import daquele arquivo
 * arrasta o aparelho inteiro junto. A agenda da nutricionista precisa da mesma
 * conta para desenhar a semana, e o próximo passo óbvio seria escrever a
 * segunda cópia. Armadilha 5: ao invés disso, ela mudou de casa e o chamador
 * antigo passou a importar daqui. */
/* '1990-04-27' -> a idade em anos completos hoje.
 *
 * ──────────────────── Por que ela mora aqui, e não em `energia` nem em `pacientesDaNutri` ────────────────────
 * Porque existiam DUAS, com a mesma forma -- `(string, Date) => number` -- e
 * comportamentos diferentes para entrada torta. Trocar o import compilava, e o
 * `tsc` não tinha como avisar: é a armadilha 5 na sua forma mais cara, a de
 * duas funções que só diferem no que fazem quando o dado está errado.
 *
 * A que ficou é a cuidadosa, e a diferença não é acadêmica: a outra devolvia
 * `NaN` para data vazia, e `NaN !== null` -- então a tela de gasto energético,
 * que guarda `number | null` e libera o cálculo com `idade !== null`, aceitava
 * a idade inválida e produzia uma caloria NaN sem nada reclamar.
 *
 * Contada na mão porque diferença de datas em milissegundos erra em ano
 * bissexto. E o "hoje" entra por parâmetro para dar para exercitar a véspera do
 * aniversário sem esperar o dia chegar. */
export function idadeDe(nascimento: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!ehDataReal(nascimento)) return null

  const [ano, mes, dia] = nascimento.split('-').map(Number)
  let anos = hoje.getFullYear() - ano
  /* O ajuste do aniversário que ainda não veio este ano. Sem ele, quem faz anos
     em dezembro aparece um ano mais velho durante onze meses. */
  const jaFez =
    hoje.getMonth() + 1 > mes || (hoje.getMonth() + 1 === mes && hoje.getDate() >= dia)
  if (!jaFez) anos--

  /* Fora da faixa devolve nulo, e nunca zero: um bebê de meses e uma data
     absurda são coisas diferentes, e "0 anos" mistura as duas. */
  return anos >= 0 && anos < 130 ? anos : null
}

export const segundaDa = (iso: string): string => {
  if (!ehDataReal(iso)) return iso
  const dia = diaDaSemana(iso)
  return somandoDias(iso, -(dia === 0 ? 6 : dia - 1))
}
