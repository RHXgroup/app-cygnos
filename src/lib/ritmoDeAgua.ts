import { carregarNoites } from './sono'
import { carregarMetasAtivas } from './metas'
import { horariosDeAgua, janelaAcordada, mlPorGole, type Janela } from './ritmoAgua'

/* Quando beber, e não só quanto — a ida à rede.
 *
 * A meta de água diz dois litros e para por aí. Quem abre o app às dez da noite
 * com zero registrado não tem como recuperar o dia — e quem bebeu tudo de manhã
 * aparece igualzinho a quem distribuiu, porque o número do topo é o mesmo nos
 * dois casos.
 *
 * ── A janela sai do SONO, e não de um horário inventado ────────────────────
 * O app já sabe a que horas a pessoa acorda e deita: está gravado em cada noite.
 * Usar isso é a diferença entre "beba às 9h" para quem levanta às 5h30 e um
 * ritmo que cabe no dia dela.
 *
 * ── E a conta NÃO mora mais aqui ───────────────────────────────────────────
 * Este arquivo tinha a sua própria `janelaDe`, os seus próprios horários e a sua
 * própria hora-padrão — uma segunda implementação de tudo que `ritmoAgua.ts` já
 * fazia para a tela inicial. As duas discordavam em quatro de sete casos
 * medidos, e o resultado era a MESMA pessoa recebendo o cartão do Início por uma
 * janela e o lembrete por outra.
 *
 * Agora sobrou só o que fala com a rede. Quem decide está em `ritmoAgua.ts`,
 * que não importa runtime nenhum e por isso é exercitável fora do aparelho —
 * item 16 do AGENTS.md, e a razão de o corte ser este e não outro. */

/* ── O ritmo de quem está usando o app ──────────────────────────────────────
 *
 * Junta as duas pontas que já existiam e não se falavam: a meta de água, que
 * diz quanto, e as noites registradas, que dizem quando a pessoa está de pé.
 *
 * Falha em qualquer uma cai no padrão em vez de estourar — quem ligou o
 * lembrete quer um lembrete, não uma mensagem de erro. E `daJanelaPadrao` diz à
 * tela que o horário é genérico, para ela poder convidar a registrar o sono em
 * vez de deixar a pessoa achando que o app adivinhou a rotina dela. */
export type RitmoDeAgua = {
  horarios: number[]
  mlPorVez: number
  janela: Janela
  daJanelaPadrao: boolean
}

export async function ritmoDeAgua(contaId: string): Promise<RitmoDeAgua | null> {
  const [rMetas, rNoites] = await Promise.all([
    carregarMetasAtivas(contaId).catch(() => null),
    carregarNoites(contaId, 14).catch(() => null),
  ])

  const metas = rMetas?.tipo === 'ok' ? rMetas.metas : null
  if (!metas?.aguaMl || !metas.copoMl) return null

  const noites = rNoites?.tipo === 'ok' ? rNoites.noites : []
  /* Uma janela só, a mesma da tela inicial. `suposta` diz se ela veio do sono
     dela ou do padrão — e é o que a tela usa para convidar a registrar sono em
     vez de fingir que adivinhou a rotina. */
  const janela = janelaAcordada(noites)

  const horarios = horariosDeAgua(metas.aguaMl, metas.copoMl, janela)
  if (horarios.length === 0) return null

  return {
    horarios,
    mlPorVez: mlPorGole(metas.aguaMl, horarios.length),
    janela,
    daJanelaPadrao: janela.suposta,
  }
}
