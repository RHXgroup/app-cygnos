/* A situação de um paciente na lista: o selo e a linha embaixo do nome.
 *
 * ──────────────────── Por que fora da tela ────────────────────
 * Porque é decisão, e decisão é o que erra. Aqui entram três campos que
 * podem ser nulos, vindos de duas leituras que podem falhar sozinhas, e sai a
 * única frase que a tela mostra sobre aquela pessoa. Fora do componente isso
 * roda no Node com o relógio parado -- e "retorno em 31/02" ou "última em
 * Invalid Date" são exatamente o tipo de coisa que aparece no aparelho de
 * quem usa, e nunca no teste de quem escreveu.
 *
 * ──────────────────── A ordem das perguntas é a regra ────────────────────
 * Inativo ganha de tudo: uma pessoa que saiu da carteira não está "sem
 * retorno", ela está fora -- e chamá-la de pendência põe na fila dela alguém
 * que ninguém vai atender.
 *
 * Depois vem o que JÁ ESTÁ MARCADO, e só então a falta. É a ordem da pergunta
 * que ela faz de verdade: "de quem eu cuido agora?" -- e quem já tem hora
 * marcada não é resposta para isso, mesmo que a última consulta tenha sido há
 * meses.
 *
 * ──────────────────── O que NÃO tem selo ────────────────────
 * "Em dia" também é um selo, e isso é escolha: numa lista onde só o problema
 * é marcado, o olho lê a ausência como "não carregou". Marcar os dois estados
 * custa uma pastilha e tira a dúvida. */

export type Selo = 'hoje' | 'emDia' | 'semRetorno' | 'novo' | 'inativo'

export type Situacao = {
  selo: Selo
  /** O texto da pastilha. Curto: ele divide a linha com o nome. */
  rotulo: string
  /** A linha embaixo do nome, ou vazio quando não há o que dizer. */
  detalhe: string
}

export type SinaisDoPaciente = {
  status: string
  proxima: string | null
  ultima: string | null
}

/** "12/09". Sem o ano, e vazio quando a data não é data. */
function diaMes(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  /* `Number.isFinite` e não `!isNaN`: são equivalentes aqui, mas o projeto já
     pagou caro por um `NaN` que atravessou um guarda escrito com `!== null`, e
     a forma explícita é a que não dá para ler errado. */
  if (!Number.isFinite(t)) return ''
  const dt = new Date(t)
  return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0')
}

/** "16:30", ou vazio. */
function hora(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const dt = new Date(t)
  return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0')
}

/** As duas datas caem no mesmo dia do calendário LOCAL? */
function mesmoDia(iso: string, agora: Date): boolean {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  const dt = new Date(t)
  return (
    dt.getFullYear() === agora.getFullYear() &&
    dt.getMonth() === agora.getMonth() &&
    dt.getDate() === agora.getDate()
  )
}

export function situacaoDoPaciente(p: SinaisDoPaciente, agora: Date = new Date()): Situacao {
  if (p.status && p.status !== 'ativo') {
    return { selo: 'inativo', rotulo: 'inativo', detalhe: '' }
  }

  /* A próxima consulta só vale se a data é legível. Uma data torta caindo
     aqui viraria "retorno em " com a frase pela metade -- pior que nada, porque
     parece que o app perdeu o dado no caminho. */
  if (p.proxima && diaMes(p.proxima)) {
    if (mesmoDia(p.proxima, agora)) {
      const h = hora(p.proxima)
      return { selo: 'hoje', rotulo: 'hoje', detalhe: h ? 'consulta hoje, ' + h : 'consulta hoje' }
    }
    return { selo: 'emDia', rotulo: 'em dia', detalhe: 'retorno em ' + diaMes(p.proxima) }
  }

  if (p.ultima && diaMes(p.ultima)) {
    return { selo: 'semRetorno', rotulo: 'sem retorno', detalhe: 'última em ' + diaMes(p.ultima) }
  }

  /* Sem nenhuma das duas são DOIS casos que a tela não distingue: paciente
     recém-cadastrado, e a leitura dos sinais que falhou. Chamar os dois de
     "novo" mentiria na metade das vezes, então a pastilha diz o que é certo em
     ambos -- não há consulta que o app conheça -- e a linha embaixo fica vazia
     em vez de afirmar história nenhuma. */
  return { selo: 'novo', rotulo: 'sem consulta', detalhe: '' }
}
