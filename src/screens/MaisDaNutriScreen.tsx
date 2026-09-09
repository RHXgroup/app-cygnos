import { useCallback, useEffect, useState } from 'react'
import {
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
import { dinheiroDoDia, reais, type DinheiroDoDia } from '../lib/financeiroDoDia'
import { carregarPerfilDaNutri, type PerfilDaNutri } from '../lib/souNutri'
import { RAIO_CARTAO, estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'

/* O resto: o dinheiro do dia inteiro, as ferramentas, e a saída.
 *
 * ──────────────────── Por que o financeiro mora aqui, e não numa aba própria ────────────────────
 * Porque não há tela de financeiro no app, e não vai haver tão cedo: lançar,
 * baixar e conciliar são trabalho sentado. O que cabe no bolso é o NÚMERO --
 * quanto entrou, quanto vence, quanto tenho para pagar -- e o resto ela pede à
 * Aurora, que já lança conta a receber com cartão de confirmação.
 *
 * Uma aba inteira para três números ensinaria em duas semanas que ali não tem
 * nada; três números dentro de "Mais" são encontrados por quem foi procurar. */

export function MaisDaNutriScreen({
  onSair,
  onLerCodigo,
}: {
  onSair: () => void
  onLerCodigo: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [perfil, setPerfil] = useState<PerfilDaNutri | null>(null)
  const [dinheiro, setDinheiro] = useState<DinheiroDoDia | null>(null)
  const [puxando, setPuxando] = useState(false)

  const buscar = useCallback(async () => {
    setDinheiro(await dinheiroDoDia())
  }, [])

  useEffect(() => {
    let vivo = true
    void carregarPerfilDaNutri().then(p => {
      if (vivo) setPerfil(p)
    })
    void buscar()
    return () => {
      vivo = false
    }
  }, [buscar])

  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e === 'active') void buscar()
    })
    return () => sub.remove()
  }, [buscar])

  /* O bloco todo só aparece quando há movimento. Zero aqui não é resposta: as
     políticas de `contas_receber` e `contas_pagar` exigem permissão de
     financeiro, e quem não a tem recebe ZERO LINHA sem erro nenhum -- idêntico
     a "não há nada hoje". Escrever "R$ 0" cobriria os dois casos com uma
     afirmação que o app não pode fazer, para quem decide dinheiro com ela.
     Item 6 do AGENTS.md. */
  const temMovimento =
    !!dinheiro &&
    (dinheiro.quantasBaixas > 0 || dinheiro.quantasVencendo > 0 || dinheiro.quantasAPagar > 0)

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={puxando}
            onRefresh={() => {
              setPuxando(true)
              void buscar().finally(() => setPuxando(false))
            }}
            tintColor={paleta().cores.verde}
            colors={[paleta().cores.verde]}
            progressBackgroundColor={paleta().cores.cartao}
          />
        }
      >
        <Text style={styles.titulo}>Mais</Text>

        {temMovimento && dinheiro && (
          <View style={styles.cartao}>
            <Text style={styles.rotuloDoBloco}>O DINHEIRO DE HOJE</Text>

            {dinheiro.quantasBaixas > 0 && (
              <LinhaDeValor
                rotulo="Recebido"
                valor={reais(dinheiro.recebido)}
                quantas={dinheiro.quantasBaixas}
                cor={paleta().cores.verde}
              />
            )}
            {dinheiro.quantasVencendo > 0 && (
              <LinhaDeValor
                rotulo="A receber, vence hoje"
                valor={reais(dinheiro.vencendo)}
                quantas={dinheiro.quantasVencendo}
                cor={paleta().cores.gold}
              />
            )}
            {dinheiro.quantasAPagar > 0 && (
              <LinhaDeValor
                rotulo="A pagar hoje"
                valor={reais(dinheiro.aPagar)}
                quantas={dinheiro.quantasAPagar}
                cor={paleta().cores.gold}
              />
            )}

            {/* Diz onde se resolve, porque a tela mostra e não deixa agir --
                e uma tela que só mostra sem dizer o que fazer é um beco. */}
            <Text style={styles.dica}>
              Para lançar, peça à Aurora. Baixar e conciliar continuam no sistema.
            </Text>
          </View>
        )}

        <View style={styles.cartao}>
          <Text style={styles.rotuloDoBloco}>FERRAMENTAS</Text>
          <Opcao
            icone="barcode-outline"
            titulo="Ler código de barras"
            texto="Guardar um produto na sua base de alimentos"
            onPress={onLerCodigo}
          />
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotuloDoBloco}>CONTA</Text>
          {!!perfil && <Text style={styles.nomeDaConta}>{perfil.nome}</Text>}
          <Opcao icone="log-out-outline" titulo="Sair da conta" onPress={onSair} />
        </View>

        <Text style={styles.rodape}>
          O que não tem tela aqui, a Aurora faz · e o que ela ainda não faz,
          continua no sistema, no computador.
        </Text>
      </ScrollView>
    </View>
  )
}

function LinhaDeValor({
  rotulo,
  valor,
  quantas,
  cor,
}: {
  rotulo: string
  valor: string
  quantas: number
  cor: string
}) {
  const styles = estilos()
  return (
    <View style={styles.linhaDeValor}>
      <View style={styles.textosDoValor}>
        <Text style={styles.rotuloDoValor}>{rotulo}</Text>
        {/* Quantas, e não só o total: "R$ 900" é uma coisa quando é uma conta e
            outra quando são nove. */}
        <Text style={styles.quantasDoValor}>
          {quantas === 1 ? '1 conta' : quantas + ' contas'}
        </Text>
      </View>
      <Text style={[styles.valor, { color: cor }]}>{valor}</Text>
    </View>
  )
}

function Opcao({
  icone,
  titulo,
  texto,
  onPress,
}: {
  icone: keyof typeof Ionicons.glyphMap
  titulo: string
  texto?: string
  onPress: () => void
}) {
  const styles = estilos()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.opcao, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <Ionicons name={icone} size={20} color={paleta().cores.verde} />
      <View style={styles.textosDaOpcao}>
        <Text style={styles.tituloDaOpcao}>{titulo}</Text>
        {!!texto && <Text style={styles.textoDaOpcao}>{texto}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={paleta().inkFraco} />
    </Pressable>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    conteudo: { paddingHorizontal: 16, gap: 12 },
    titulo: {
      fontFamily: FONTE.bruta,
      fontSize: 29,
      color: t.cores.ink,
      letterSpacing: -1,
      lineHeight: 32,
      paddingBottom: 4,
    },

    cartao: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      padding: 16,
      gap: 2,
    },
    /* Deixa de ser MAIÚSCULA ESPAÇADA de 10,5. Era o rótulo padrão da área
       inteira, repetido em cada bloco de cada tela -- e rótulo em tudo é
       rótulo em nada: o olho para de ler os que importam junto com os que não
       importam. Vira texto normal, um degrau abaixo do conteúdo. */
    rotuloDoBloco: {
      fontFamily: FONTE.meia,
      fontSize: 12.5,
      color: t.inkFraco,
      paddingBottom: 8,
    },

    linhaDeValor: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    textosDoValor: { flex: 1 },
    rotuloDoValor: { fontFamily: FONTE.normal, fontSize: 14, color: t.cores.ink },
    quantasDoValor: { fontFamily: FONTE.normal, fontSize: 12, color: t.inkFraco, marginTop: 1 },
    valor: {
      fontFamily: FONTE.forte,
      fontSize: 19,
      letterSpacing: -0.6,
      fontVariant: ['tabular-nums'],
    },
    dica: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco, lineHeight: 17, paddingTop: 8 },

    opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    textosDaOpcao: { flex: 1 },
    tituloDaOpcao: { fontSize: 15, color: t.cores.ink },
    textoDaOpcao: { fontSize: 12.5, color: t.inkFraco, marginTop: 1 },
    nomeDaConta: { fontSize: 14, color: t.inkSuave, paddingBottom: 4 },

    rodape: { fontSize: 12, color: t.inkFraco, lineHeight: 18, paddingHorizontal: 4, paddingTop: 4 },
    pressionado: { opacity: 0.7 },
  }),
)
