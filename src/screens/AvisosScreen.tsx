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
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { carregarAvisos, guardarMarca, type Aviso } from '../lib/avisos'
import { estilosDe, paleta } from '../lib/tema'

/* O que aconteceu do lado da nutricionista.
 *
 * Aqui não se responde, não se marca e não se cancela nada: cada aviso é uma
 * frase, e agir é assunto da tela do assunto. O que o cartão faz é LEVAR até
 * ela — ler "pedido aguardando resposta" e não ter para onde ir é meia
 * informação. Quem não tem destino não afunda ao toque nem mostra seta: um alvo
 * que não responde ensina a pessoa a não tocar em nenhum.
 *
 * ── Carregar não é ver ─────────────────────────────────────────────────────
 * O retrato do estado atual só é guardado DEPOIS de a lista aparecer, e é isso
 * que faz um aviso continuar novo se a pessoa abriu o app no bolso e nem olhou.
 * Guardar no momento da busca marcaria como visto o que ninguém viu. */
export function AvisosScreen({
  onFechar,
  onAbrirNutricionistas,
  onAbrirMensagens,
}: {
  onFechar: () => void
  onAbrirNutricionistas: () => void
  onAbrirMensagens: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

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
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Avisos</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {!lista ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, lista.length === 0 && styles.conteudoVazio, { paddingBottom: 32 + bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => {
                setAtualizando(true)
                setVersao(v => v + 1)
              }}
              tintColor={paleta().cores.limao}
            />
          }
        >
          {lista.length === 0 ? (
            <Vazio />
          ) : (
            lista.map(a => (
              <Linha
                key={a.id}
                aviso={a}
                onIr={destinoDe(a.destino, {
                  onAbrirNutricionistas,
                  onAbrirMensagens,
                  onFechar,
                })}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}

/* Um `Record` indexado pelo destino seria mais curto e devolveria `undefined`
   para um valor que não estivesse nele — que é justamente o que a gente NÃO
   quer descobrir em produção. A função com reserva explícita deixa o caso novo
   virar cartão sem seta, e não travamento. Ver a armadilha 10 do AGENTS.md. */
function destinoDe(
  destino: Aviso['destino'],
  ir: { onAbrirNutricionistas: () => void; onAbrirMensagens: () => void; onFechar: () => void },
): (() => void) | undefined {
  if (destino === 'nutricionista') return ir.onAbrirNutricionistas
  if (destino === 'mensagens') return ir.onAbrirMensagens
  if (destino === 'inicio') return ir.onFechar
  return undefined
}

/* Sem destino, o cartão não afunda ao toque e não mostra a seta: um alvo que
   não responde ensina a pessoa a não tocar em nenhum. */
function Linha({ aviso, onIr }: { aviso: Aviso; onIr?: () => void }) {
  const styles = estilos()
  const miolo = (
    <>
      <View style={styles.circulo}>
        <Ionicons name={aviso.icone} size={18} color={paleta().cores.verde} />
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

      {!!onIr && <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />}
    </>
  )

  if (!onIr) return <View style={[styles.cartao, aviso.novo && styles.cartaoNovo]}>{miolo}</View>

  return (
    <Pressable
      onPress={onIr}
      style={({ pressed }) => [
        styles.cartao,
        aviso.novo && styles.cartaoNovo,
        pressed && styles.cartaoPressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${aviso.titulo}. ${aviso.texto}`}
    >
      {miolo}
    </Pressable>
  )
}

/* Vazio é a resposta certa quase sempre, então ele não pode parecer defeito. */
function Vazio() {
  const styles = estilos()
  return (
    <View style={styles.vazio}>
      <View style={styles.circuloVazio}>
        <Ionicons name="notifications-outline" size={26} color={paleta().cores.verde} />
      </View>
      <Text style={styles.tituloVazio}>Nada de novo por aqui</Text>
      <Text style={styles.textoVazio}>
        Quando a sua nutricionista marcar uma consulta, responder a um pedido ou publicar um plano,
        o aviso aparece nesta tela.
      </Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8, gap: 10 },
  /* Só o vazio cresce para centralizar; a lista fica no topo, como lista. */
  conteudoVazio: { flexGrow: 1, justifyContent: 'center' },

  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: t.cores.cartao,
  },
  /* O que é novidade ganha o menta, e não um ponto: a diferença precisa
     aparecer com a tela inteira à vista, não item por item. */
  cartaoNovo: { backgroundColor: t.cores.verdeMenta },
  cartaoPressionado: { backgroundColor: t.cores.superficie },

  circulo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },

  texto: { flex: 1, gap: 3 },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flexShrink: 1, fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
  corpo: { fontSize: 13, lineHeight: 19, color: t.inkSuave },

  etiqueta: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: t.cores.verdeClaro,
  },
  textoEtiqueta: { fontSize: 10.5, fontWeight: '800', color: t.cores.limao, letterSpacing: 0.3 },

  vazio: { alignItems: 'center', paddingHorizontal: 24, gap: 10 },
  circuloVazio: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: t.cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tituloVazio: { fontSize: 17, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
  textoVazio: { fontSize: 13.5, lineHeight: 20, color: t.inkFraco, textAlign: 'center' },
  }),
)
