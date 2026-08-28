import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { cores } from '../theme'

/* Apagar com volta.
 *
 * Os diários do app — comida, peso, sono — apagavam de imediato e para sempre,
 * num alvo pequeno, sem pergunta nenhuma. Errar era questão de tempo, e quem
 * errava não tinha nem como saber o que perdeu: o registro já não estava lá
 * para ser lido.
 *
 * ── Por que prazo e não confirmação ────────────────────────────────────────
 * Apagar uma linha do diário é gesto de rotina. Perguntar "tem certeza?" toda
 * vez cobra de todo mundo, em todo apagar certo, o preço do engano de alguns.
 * O prazo não cobra nada de quem acerta e devolve tudo a quem erra.
 *
 * ── Por que segurar o apagar, e não apagar e recriar ───────────────────────
 * Recriar dá um registro NOVO: id novo e, pior, carimbo de hora novo. O café da
 * manhã voltaria marcado como duas da tarde, e o peso de terça viraria peso de
 * hoje. Segurando, nada é recriado, então nada muda.
 *
 * ── Sair não cancela ───────────────────────────────────────────────────────
 * Quem fechou a tela já viu o registro sumir. Encontrá-lo de volta na próxima
 * abertura seria o app desfazendo sozinho uma decisão que ninguém revogou.
 * A saída EFETIVA o que estava pendente. */

/* Cinco segundos: o tempo de os olhos irem da lista até a barra e voltarem.
   Abaixo disso ela some antes de ser lida; acima, vira cartaz preso na tela. */
const SEGUNDOS = 5

export function useApagarComDesfazer<T>({
  remover,
  restaurar,
  apagarDeVerdade,
  aoFalhar,
  aoMudar,
}: {
  /* Tira da lista da tela. Chamado no toque. */
  remover: (item: T) => void
  /* Devolve para a lista — no desfazer, e também quando o banco recusa. Cada
     tela reinsere do seu jeito, porque cada lista tem a sua ordem. */
  restaurar: (item: T) => void
  apagarDeVerdade: (item: T) => Promise<{ erro: string } | null>
  aoFalhar: (erro: string) => void
  /* Avisado no TOQUE, e não na efetivação: quem apaga e fecha a tela em menos
     de cinco segundos sai com o apagar ainda pendente, e efetivar na saída
     seria tarde demais para a tela de trás se atualizar. O que mudou, para
     quem usa, mudou no toque. */
  aoMudar?: () => void
}) {
  const [desfazivel, setDesfazivel] = useState<T | null>(null)

  /* Em ref, e não em estado: quem lê são o temporizador e a limpeza de saída,
     não o desenho — e a limpeza precisa enxergar o valor ATUAL, não o da
     renderização em que ela foi criada. */
  const emEspera = useRef<{ item: T; prazo: ReturnType<typeof setTimeout> } | null>(null)

  /* As funções são recriadas a cada renderização e a limpeza de saída não pode
     depender delas: com elas nas dependências, o efeito rodaria a cada
     renderização e efetivaria o apagar antes da hora. */
  const acoes = useRef({ restaurar, apagarDeVerdade, aoFalhar })
  acoes.current = { restaurar, apagarDeVerdade, aoFalhar }

  async function efetivar() {
    const espera = emEspera.current
    if (!espera) return

    clearTimeout(espera.prazo)
    emEspera.current = null
    setDesfazivel(null)

    const falha = await acoes.current.apagarDeVerdade(espera.item)
    if (falha) {
      acoes.current.restaurar(espera.item)
      acoes.current.aoFalhar(falha.erro)
    }
  }

  function apagar(item: T) {
    /* Dois seguidos: o primeiro perde o direito de voltar e vai embora. Guardar
       uma fila de desfazeres seria prometer o que a barra não mostra. */
    void efetivar()

    remover(item)
    aoMudar?.()
    setDesfazivel(item)
    emEspera.current = {
      item,
      prazo: setTimeout(() => {
        void efetivar()
      }, SEGUNDOS * 1000),
    }
  }

  function desfazer() {
    const espera = emEspera.current
    if (!espera) return

    clearTimeout(espera.prazo)
    emEspera.current = null
    setDesfazivel(null)
    acoes.current.restaurar(espera.item)
  }

  useEffect(
    () => () => {
      const espera = emEspera.current
      if (!espera) return
      clearTimeout(espera.prazo)
      emEspera.current = null
      void acoes.current.apagarDeVerdade(espera.item)
    },
    [],
  )

  return { apagar, desfazer, desfazivel }
}

/* A barra. Flutua sobre o conteúdo em vez de empurrá-lo: nada pode pular de
   lugar por causa de um aviso que dura cinco segundos. */
export function BarraDesfazer({
  texto,
  onDesfazer,
  bottom,
}: {
  texto: string
  onDesfazer: () => void
  /* O inset do aparelho mais o respiro. Quem chama sabe se há barra de abas
     por baixo; isto aqui não tem como saber. */
  bottom: number
}) {
  return (
    <View style={[styles.barra, { bottom }]}>
      <Text style={styles.texto} numberOfLines={1}>
        {texto}
      </Text>
      <Pressable
        onPress={onDesfazer}
        hitSlop={10}
        style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
        accessibilityRole="button"
        accessibilityLabel="Desfazer"
      >
        <Ionicons name="arrow-undo-outline" size={15} color={cores.sobreLimao} />
        <Text style={styles.textoBotao}>Desfazer</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  texto: { flex: 1, fontSize: 13.5, color: cores.ink },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: cores.limao,
  },
  pressionado: { opacity: 0.75 },
  textoBotao: { fontSize: 13.5, fontWeight: '800', color: cores.sobreLimao },
})
