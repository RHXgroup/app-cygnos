import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { estilosDe, paleta } from '../lib/tema'

export type TipoDeBotao = 'primario' | 'secundario' | 'texto' | 'perigo'

/* O botão do app, num lugar só.
 *
 * ── O que havia antes ─────────────────────────────────────────────────────
 * CENTO E UM estilos chamados `botao*`, espalhados por 43 telas, e nenhum
 * componente compartilhado. Oito raios diferentes (14, 16, 12, 20, 10, 11, 18,
 * 4), altura variando de 40 a 54, e cada tela repetindo à mão o estado de
 * pressionado — quando repetia.
 *
 * Nada disso estava errado sozinho. Junto, é o que faz o app parecer várias
 * mãos em vez de um produto: a mesma ação tem peso diferente dependendo da
 * tela em que a pessoa está.
 *
 * ── As decisões, e por que cada uma ──────────────────────────────────────
 * **Raio 14.** Não é gosto: é o que o app já usa mais (103 vezes contra 65 do
 * segundo). Padronizar no que já é maioria muda o mínimo de telas e é o que
 * parece "o app", e não "a tela nova".
 *
 * **Altura 54 no primário, 46 no secundário.** O alvo mínimo confortável de
 * toque é 48; abaixo disso erra quem tem a mão grande, quem está com o celular
 * na outra mão, e quem tem tremor — que neste app não é hipótese, é público. O
 * secundário fica em 46 de propósito: ele é a saída, e não deve competir de
 * tamanho com a ação.
 *
 * **Desabilitado é 0.45 e continua LEGÍVEL.** Botão apagado a ponto de não se
 * ler não comunica "falta alguma coisa" — comunica "quebrou". Quem lê o rótulo
 * entende o que vai acontecer quando ele acender.
 *
 * **Pressionado escurece, não encolhe.** Escala precisa de animação para não
 * parecer defeito, e animação em botão de formulário atrasa a resposta. Cor
 * mais escura é instantânea e é o que o Android faz.
 *
 * ── Carregando é estado do BOTÃO ─────────────────────────────────────────
 * `ocupado` troca o rótulo pelo indicador e para de responder ao toque. Sem
 * isso, dois toques viram duas ações — e no envio de mensagem, duas mensagens.
 * A largura não muda: o indicador ocupa o lugar do texto, então o botão não
 * salta enquanto a rede responde. */
export function Botao({
  rotulo,
  onPress,
  tipo = 'primario',
  icone,
  ocupado = false,
  desligado = false,
  largo = true,
  acessibilidade,
  children,
}: {
  rotulo: string
  onPress: () => void
  tipo?: TipoDeBotao
  icone?: keyof typeof Ionicons.glyphMap
  ocupado?: boolean
  desligado?: boolean
  /* Ocupa a largura toda. Falso para botão que divide a linha com outro. */
  largo?: boolean
  /* Quando o rótulo não basta sozinho: "Salvar" numa tela com três coisas
     salváveis precisa dizer qual. */
  acessibilidade?: string
  children?: ReactNode
}) {
  const styles = estilos()
  const inerte = ocupado || desligado
  const cor = corDoTexto(tipo)

  return (
    <Pressable
      onPress={onPress}
      disabled={inerte}
      style={({ pressed }) => [
        styles.base,
        tipo === 'primario' && styles.primario,
        tipo === 'secundario' && styles.secundario,
        tipo === 'texto' && styles.texto,
        tipo === 'perigo' && styles.perigo,
        !largo && styles.estreito,
        pressed && !inerte && pressionado(tipo, styles),
        desligado && styles.desligado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={acessibilidade ?? rotulo}
      accessibilityState={{ disabled: inerte, busy: ocupado }}
    >
      {ocupado ? (
        <ActivityIndicator size="small" color={cor} />
      ) : (
        <View style={styles.linha}>
          {!!icone && <Ionicons name={icone} size={18} color={cor} />}
          <Text style={[styles.rotulo, { color: cor }]} numberOfLines={1}>
            {rotulo}
          </Text>
          {children}
        </View>
      )}
    </Pressable>
  )
}

/* A cor do texto sai do TIPO, e não de quem chama.
 *
 * Deixar a tela escolher foi como nasceram os "branco no limão" espalhados por
 * aí: `sobreLimao` existe porque branco sobre o limão do tema claro não se lê,
 * e quem escreve `color: branco` à mão não lembra disso. */
const corDoTexto = (tipo: TipoDeBotao): string =>
  tipo === 'primario'
    ? paleta().cores.branco
    : tipo === 'perigo'
      ? paleta().cores.erroTexto
      : paleta().cores.verde

const pressionado = (tipo: TipoDeBotao, styles: ReturnType<typeof estilos>) =>
  tipo === 'primario' ? styles.primarioPressionado : styles.claroPressionado

const estilos = estilosDe(t =>
  StyleSheet.create({
    base: {
      height: 54,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    estreito: { alignSelf: 'flex-start' },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rotulo: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },

    primario: { backgroundColor: t.cores.verde },
    primarioPressionado: { backgroundColor: t.cores.verdeEscuro },

    secundario: {
      height: 46,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
    },
    texto: { height: 44, backgroundColor: 'transparent', paddingHorizontal: 12 },
    perigo: {
      height: 46,
      backgroundColor: t.cores.erroFundo,
      borderWidth: 1,
      borderColor: t.cores.erroBorda,
    },
    claroPressionado: { opacity: 0.65 },

    /* Legível de propósito. Ver o comentário do cabeçalho. */
    desligado: { opacity: 0.45 },
  }),
)
