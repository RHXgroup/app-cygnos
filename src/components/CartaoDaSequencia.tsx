import { StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { fraseDaSequencia, type Sequencia } from '../lib/sequenciaDaPessoa'
import { estilosDe, paleta } from '../lib/tema'

/* A sequência: há quantos dias ela não abandona isto.
 *
 * ── Por que este cartão existe ────────────────────────────────────────────
 * Pesquisei antes de desenhar, porque já construí coisa daqui de cabeça e o
 * resultado foi refeito duas vezes. Dois números decidiram:
 *
 *   70% das pessoas largam um app de registro alimentar em DUAS SEMANAS quando
 *   ele parece trabalhoso.
 *
 *   E o melhor previsor de retenção longa já medido em escala não é retenção de
 *   30 dias — é a pessoa CHEGAR AOS 7 DIAS seguidos.
 *
 * Sete é o número que separa quem fica de quem some. Por isso o cartão fala
 * dele desde o primeiro dia, e por isso o marco existe.
 *
 * ── O que ele NÃO faz, e é a parte difícil ────────────────────────────────
 * Não ameaça. Nada de "você vai perder a sua sequência", "não quebre agora",
 * chama vermelha, contagem regressiva. Ameaça funciona uma vez e depois vira o
 * motivo de desinstalar — e num app de saúde, onde a pessoa já chega se
 * cobrando, o app cobrando em cima é o empurrão para fora.
 *
 * O estado "em risco" existe, mas o que ele muda é o CONVITE, não o tom: em vez
 * do número seco, a frase oferece o caminho mais barato que existe ("um copo de
 * água já mantém"). Quem está prestes a pular um dia não vai preencher
 * formulário nenhum.
 *
 * Há um teste que reprova a tela se qualquer frase contiver ameaça — ver
 * `sequenciaDaPessoa.teste.mts`, item 6.
 *
 * ── E não aparece do nada ─────────────────────────────────────────────────
 * Com zero dias o cartão some. Um "0 dias seguidos" na primeira abertura é o
 * app começando a conversa cobrando, e a pessoa ainda não fez nada para dever.
 * Quem tem zero vê o resto da tela; a sequência aparece quando existir. */

export function CartaoDaSequencia({ sequencia }: { sequencia: Sequencia }) {
  const styles = estilos()

  /* Sem sequência, sem cartão. Ver o comentário acima: um zero aqui é cobrança
     antes de a pessoa ter feito qualquer coisa. */
  if (sequencia.dias === 0) return null

  const comemorando = sequencia.marcoHoje
  const t = paleta()

  return (
    <View
      style={[styles.cartao, comemorando && styles.cartaoMarco]}
      accessibilityRole="summary"
      accessibilityLabel={`${sequencia.dias} dias seguidos. ${fraseDaSequencia(sequencia)}`}
    >
      <View style={[styles.medalha, comemorando && styles.medalhaMarco]}>
        <Ionicons
          /* Chama para a sequência viva, medalha para o marco. E a chama NÃO
             muda de cor quando está em risco: cor de alerta transformaria o
             convite em ameaça, que é exatamente o que este cartão evita. */
          name={comemorando ? 'ribbon' : 'flame'}
          size={19}
          color={comemorando ? t.cores.branco : t.cores.cicloForte}
        />
      </View>

      <View style={styles.texto}>
        <View style={styles.linhaNumero}>
          <Text style={[styles.numero, comemorando && styles.numeroMarco]}>{sequencia.dias}</Text>
          <Text style={[styles.unidade, comemorando && styles.unidadeMarco]}>
            {sequencia.dias === 1 ? 'dia' : 'dias'}
          </Text>
        </View>
        <Text style={[styles.frase, comemorando && styles.fraseMarco]} numberOfLines={2}>
          {fraseDaSequencia(sequencia)}
        </Text>
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    cartao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
    /* O marco é o único momento em que o cartão preenche. Um por vez, e só no
       dia — comemoração que se repete deixa de ser comemoração. */
    cartaoMarco: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },

    medalha: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.cores.cicloFundo,
    },
    medalhaMarco: { backgroundColor: 'rgba(255,255,255,0.22)' },

    texto: { flex: 1, gap: 1 },
    linhaNumero: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
    numero: { fontSize: 22, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.5 },
    numeroMarco: { color: t.cores.branco },
    unidade: { fontSize: 13, fontWeight: '600', color: t.inkMedio },
    unidadeMarco: { color: t.cores.branco, opacity: 0.9 },
    frase: { fontSize: 12.5, color: t.inkMedio, lineHeight: 17 },
    fraseMarco: { color: t.cores.branco, opacity: 0.95 },
  }),
)
