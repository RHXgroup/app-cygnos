import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PlanoEmAbas, type RefeicaoEmAbas } from '../components/PlanoEmAbas'
import { trocasDoMeuPlano, type TrocasPorItem } from '../lib/trocasDoPlano'
import type { PlanoCompleto } from '../lib/plano'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

/* O plano inteiro, por refeição -- com a cara da página do link.
 *
 * ──────────────────── Por que existe ────────────────────
 * Ele mandou a foto da página pública do plano: "essa tela é muito legal, a
 * forma que ela demonstra café, almoço, janta; acho que está melhor que a
 * nossa". A tela inicial do app mostra o dia para REGISTRAR -- o que comeu, a
 * água, o peso. Aqui é para LER o plano inteiro, que é outra coisa e merecia
 * outra tela.
 *
 * ──────────────────── E o que ela traz de novo ────────────────────
 * As TROCAS. A nutricionista cadastra "pode trocar por" item a item no sistema,
 * a página do link mostra, e o aplicativo nunca mostrou -- então quem usava o
 * app não sabia que podia trocar nada. Vêm de `app_substituicoes_do_plano`.
 */
export function MeuPlanoScreen({
  plano,
  onFechar,
}: {
  plano: PlanoCompleto
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [trocas, setTrocas] = useState<TrocasPorItem>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [puxando, setPuxando] = useState(false)

  useEffect(() => {
    let vivo = true
    void trocasDoMeuPlano().then(t => {
      if (!vivo) return
      setTrocas(t)
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  /* Sem lista de dependências: põe este tratador na frente do central do
     `App.tsx`, que só sabe fechar. Armadilha 1. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFechar()
      return true
    })
    return () => sub.remove()
  })

  const refeicoes: RefeicaoEmAbas[] = plano.refeicoes.map(r => ({
    id: r.id,
    nome: r.rotulo,
    hora: r.hora || null,
    itens: r.itens.map(i => ({
      id: i.id,
      nome: i.nome,
      detalhe: i.descricao || null,
      trocas: trocas.get(i.id) ?? [],
    })),
  }))

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.voltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloDaTela} numberOfLines={1}>
          {plano.nome}
        </Text>
        <View style={styles.voltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: 28 + bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={puxando}
            onRefresh={() => {
              setPuxando(true)
              void trocasDoMeuPlano()
                .then(setTrocas)
                .finally(() => setPuxando(false))
            }}
            tintColor={paleta().cores.verde}
            colors={[paleta().cores.verde]}
            progressBackgroundColor={paleta().cores.cartao}
          />
        }
      >
        {refeicoes.length === 0 ? (
          <View style={styles.vazio}>
            <Ionicons name="restaurant-outline" size={22} color={paleta().inkFraco} />
            <Text style={styles.textoVazio}>Este plano ainda não tem refeições.</Text>
          </View>
        ) : (
          <PlanoEmAbas
            refeicoes={refeicoes}
            rodape={
              /* Dito enquanto as trocas ainda estão chegando: sem isto, quem
                 abre e não vê o botão de trocar conclui que o plano não tem
                 troca nenhuma -- e não volta para conferir. */
              carregando
                ? 'Procurando as opções de troca…'
                : 'Toque em "trocar" para ver o que a sua nutricionista deixou como equivalente.'
            }
          />
        )}
      </ScrollView>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    cabecalho: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
    voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloDaTela: {
      flex: 1,
      fontFamily: FONTE.forte,
      fontSize: 17,
      color: t.cores.ink,
      textAlign: 'center',
    },
    conteudo: { paddingHorizontal: 16, gap: 10 },
    vazio: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 40,
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
    },
    textoVazio: { fontFamily: FONTE.normal, fontSize: 14, color: t.inkSuave, textAlign: 'center' },
  }),
)
