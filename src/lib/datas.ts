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
