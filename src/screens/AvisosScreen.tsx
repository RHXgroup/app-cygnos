import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { carregarAvisos, guardarMarca, type Aviso } from '../lib/avisos'
import { cores, inkFraco, inkSuave } from '../theme'

/* O que aconteceu do lado da nutricionista.
 *
 * A tela é uma lista e nada mais: aqui não se responde, não se marca e não se
 * cancela nada. Cada aviso é uma frase e o caminho para o assunto dela está na
 * tela própria — o sino informa, e é só isso que ele promete.
 *
 * ── Carregar não é ver ─────────────────────────────────────────────────────
 * O retrato do estado atual só é guardado DEPOIS de a lista aparecer, e é isso
 * que faz um aviso continuar novo se a pessoa abriu o app no bolso e nem olhou.
 * Guardar no momento da busca marcaria como visto o que ninguém viu. */
export function AvisosScreen({ onFechar }: { onFechar: () => void }) {
  const { top } = useSafeAreaInsets()

  const [lista, setLista] = useState<Aviso[] | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true

    carregarAvisos()
      .then(({ lista, marca }) => {
        if (!vivo) return
        setLista(lista)
        /* Agora sim: a lista está na tela. */
        guardarMarca(marca)
      })
      .catch(() => vivo && setLista([]))
      .finally(() => {
        if (vivo) setAtualizando(false)
      })

    return () => {
      vivo = false
    }
  }, [versao])

  /* Mesma razão do resto do app: o que muda, muda do lado dela, e voltar do
     segundo plano é quando isso pode ter acontecido. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') setVersao(v => v + 1)
    })
    return () => sub.remove()
  }, [])

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Avisos</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {!lista ? (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, lista.length === 0 && styles.conteudoVazio]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => {
                setAtualizando(true)
                setVersao(v => v + 1)
              }}
              tintColor={cores.limao}
            />
          }
        >
          {lista.length === 0 ? (
            <Vazio />
          ) : (
            lista.map(a => <Linha key={a.id} aviso={a} />)
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Linha({ aviso }: { aviso: Aviso }) {
  return (
    <View style={[styles.cartao, aviso.novo && styles.cartaoNovo]}>
      <View style={styles.circulo}>
        <Ionicons name={aviso.icone} size={18} color={cores.verde} />
      </View>

      <View style={styles.texto}>
        <View style={styles.linhaTitulo}>
          <Text style={styles.titulo}>{aviso.titulo}</Text>
          {aviso.novo && (
            <View style={styles.etiqueta}>
              <Text style={styles.textoEtiqueta}>Novo</Text>
            </View>
          )}
        </View>
        <Text style={styles.corpo}>{aviso.texto}</Text>
      </View>
    </View>
  )
}

/* Vazio é a resposta certa quase sempre, então ele não pode parecer defeito. */
function Vazio() {
  return (
    <View style={styles.vazio}>
      <View style={styles.circuloVazio}>
        <Ionicons name="notifications-outline" size={26} color={cores.verde} />
      </View>
      <Text style={styles.tituloVazio}>Nada de novo por aqui</Text>
      <Text style={styles.textoVazio}>
        Quando a sua nutricionista marcar uma consulta, responder a um pedido ou publicar um plano,
        o aviso aparece nesta tela.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { fontSize: 17, fontWeight: '800', color: cores.ink },

  conteudo: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8, gap: 10 },
  /* Só o vazio cresce para centralizar; a lista fica no topo, como lista. */
  conteudoVazio: { flexGrow: 1, justifyContent: 'center' },

  cartao: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: cores.cartao,
  },
  /* O que é novidade ganha o menta, e não um ponto: a diferença precisa
     aparecer com a tela inteira à vista, não item por item. */
  cartaoNovo: { backgroundColor: cores.verdeMenta },

  circulo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },

  texto: { flex: 1, gap: 3 },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flexShrink: 1, fontSize: 14.5, fontWeight: '700', color: cores.ink },
  corpo: { fontSize: 13, lineHeight: 19, color: inkSuave },

  etiqueta: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: cores.verdeClaro,
  },
  textoEtiqueta: { fontSize: 10.5, fontWeight: '800', color: cores.limao, letterSpacing: 0.3 },

  vazio: { alignItems: 'center', paddingHorizontal: 24, gap: 10 },
  circuloVazio: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tituloVazio: { fontSize: 17, fontWeight: '800', color: cores.ink, textAlign: 'center' },
  textoVazio: { fontSize: 13.5, lineHeight: 20, color: inkFraco, textAlign: 'center' },
})
