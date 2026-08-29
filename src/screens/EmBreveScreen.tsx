import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { estilosDe, paleta } from '../lib/tema'

/* Abas que ainda não têm conteúdo. Existir em branco é melhor que a aba não
   responder ao toque: o app fica coerente e fica claro que a parte que falta é
   o conteúdo, não a navegação. */
export function EmBreveScreen({
  titulo,
  icone,
  mostrarSair = false,
  email,
}: {
  titulo: string
  icone: keyof typeof Ionicons.glyphMap
  mostrarSair?: boolean
  email?: string
}) {
  const styles = estilos()
  return (
    <View style={styles.tela}>
      <View style={styles.circulo}>
        <Ionicons name={icone} size={28} color={paleta().cores.verde} />
      </View>
      <Text style={styles.titulo}>{titulo}</Text>
      <Text style={styles.texto}>Esta parte ainda está sendo construída.</Text>

      {mostrarSair && (
        <>
          {!!email && <Text style={styles.email}>{email}</Text>}
          <Pressable
            onPress={() => supabase.auth.signOut()}
            style={({ pressed }) => [styles.botaoSair, pressed && styles.botaoSairPressionado]}
          >
            <Ionicons name="log-out-outline" size={17} color={paleta().cores.verde} />
            <Text style={styles.textoBotaoSair}>Sair da conta</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
    backgroundColor: t.cores.fundo,
  },
  circulo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  titulo: { fontSize: 19, fontWeight: '700', color: t.cores.ink },
  texto: { fontSize: 14, color: t.inkSuave, textAlign: 'center' },
  email: { marginTop: 18, fontSize: 13, color: t.inkFraco },
  botaoSair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    height: 48,
    paddingHorizontal: 26,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.verde,
  },
  botaoSairPressionado: { backgroundColor: t.cores.verdeMenta },
  textoBotaoSair: { fontSize: 15, fontWeight: '600', color: t.cores.verde },
  }),
)
