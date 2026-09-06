import AsyncStorage from '@react-native-async-storage/async-storage'

/* Se o aviso do recado dela já apareceu.
 *
 * ── Por que precisa de marca ───────────────────
 * O aviso é um AVISO: aparece, ela lê, some sozinho. Só que o recado
 * continua no banco até a nutricionista escrever outro — às vezes
 * uma semana. Sem marca, o mesmo "Bom dia, continue assim!" apareceria em toda
 * abertura do app durante sete dias, e aviso que se repete é o banner que a
 * pessoa aprende a fechar sem ler. Aí ele deixou de funcionar justamente no
 * dia em que ela escrever algo que importa.
 *
 * ── Marcado pelo CRIADO_EM, e não por um booleano ───────────
 * A marca guarda QUAL recado apareceu. Um "já vi" simples esconderia
 * também o próximo, que é outra mensagem, de outro dia — e essa
 * a paciente nunca veria. O texto não serve de chave: ela pode repetir a
 * mesma frase na semana seguinte, e aquela é uma mensagem nova.
 *
 * ── E some sem rede de segurança? Não ────────────────────
 * Some da tela inicial, não da vida: o recado também está em
 * Mensagens, que é onde a paciente procura quando lembrar que "a nutri
 * falou alguma coisa". É o que torna o desaparecimento seguro.
 *
 * ── Fica no aparelho ─────────────────────────
 * É preferência de leitura, não dado de saúde. Quem trocar de
 * telefone vê o aviso uma vez a mais, e isso não é problema nenhum. */

export const CHAVE_RECADO_VISTO = 'cygnos:recado-visto'

export async function recadoJaVisto(criadoEm: string): Promise<boolean> {
  /* Recado sem data não tem como ser marcado, então aparece sempre. É
     o lado certo de errar: ver duas vezes é muito menos ruim do que nunca
     ver. */
  if (!criadoEm) return false
  try {
    return (await AsyncStorage.getItem(CHAVE_RECADO_VISTO)) === criadoEm
  } catch {
    return false
  }
}

export async function marcarRecadoVisto(criadoEm: string): Promise<void> {
  if (!criadoEm) return
  try {
    await AsyncStorage.setItem(CHAVE_RECADO_VISTO, criadoEm)
  } catch {
    /* Idem: no pior caso ele aparece de novo amanhã. */
  }
}
