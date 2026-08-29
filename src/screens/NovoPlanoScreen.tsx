import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CampoTexto } from '../components/CampoTexto'
import { supabase } from '../lib/supabase'
import { estilosDe, paleta } from '../lib/tema'
import type { Plano } from './PlanosScreen'

const LIMITE_NOME = 80

export function NovoPlanoScreen({
  contaId,
  onCriado,
  onCancelar,
}: {
  contaId: string
  /* Devolve o plano gravado, e não só um aviso de "deu certo": assim a lista
     coloca o novo no topo sem ter de buscar tudo de novo no banco. */
  onCriado: (plano: Plano) => void
  onCancelar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [nome, setNome] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const nomeLimpo = nome.trim()
    if (!nomeLimpo) {
      setErro('Dê um nome ao plano.')
      return
    }

    setErro('')
    setSalvando(true)

    const { data, error } = await supabase
      .from('app_planos')
      .insert({
        conta_id: contaId,
        nome: nomeLimpo,
        /* String vazia viraria uma observação em branco na lista; null é a
           ausência de verdade. */
        observacao: observacao.trim() || null,
      })
      .select('id, nome, observacao, criado_em')
      .single()

    if (error || !data) {
      setErro('Não foi possível salvar o plano. Tente de novo.')
      setSalvando(false)
      return
    }

    onCriado(data as Plano)
  }

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: top + 8 }]}
      /* No Android o próprio sistema já encolhe a janela; no iOS não, e sem
         isto o teclado cobre o botão de salvar. */
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onCancelar}
          style={styles.botaoVoltar}
          hitSlop={8}
          disabled={salvando}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Novo plano</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        <CampoTexto
          rotulo="Nome do plano"
          value={nome}
          onChangeText={t => {
            setNome(t)
            if (erro) setErro('')
          }}
          placeholder="Ex.: Semana de treino"
          maxLength={LIMITE_NOME}
          autoCapitalize="sentences"
          returnKeyType="next"
          erro={erro || null}
        />

        <CampoTexto
          rotulo="Observação"
          ajuda="Opcional — para lembrar do que se trata este plano."
          value={observacao}
          onChangeText={setObservacao}
          placeholder="Ex.: dias em que treino à noite"
          multiline
          numberOfLines={3}
          style={styles.campoObservacao}
          autoCapitalize="sentences"
        />
      </ScrollView>

      <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
        <Pressable
          onPress={salvar}
          disabled={salvando}
          style={({ pressed }) => [
            styles.botaoSalvar,
            pressed && styles.botaoSalvarPressionado,
            salvando && styles.botaoSalvarDesativado,
          ]}
          accessibilityRole="button"
        >
          {salvando ? (
            <ActivityIndicator color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoBotaoSalvar}>Salvar plano</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 18 },
  campoObservacao: {
    height: 96,
    paddingTop: 14,
    /* Sem isto o texto de várias linhas nasce centralizado verticalmente no
       Android. */
    textAlignVertical: 'top',
  },

  rodape: { paddingHorizontal: 20, paddingTop: 10 },
  botaoSalvar: {
    height: 54,
    borderRadius: 16,
    backgroundColor: t.cores.verde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoSalvarPressionado: { backgroundColor: t.cores.verdeEscuro },
  botaoSalvarDesativado: { opacity: 0.6 },
  textoBotaoSalvar: { fontSize: 15.5, fontWeight: '700', color: t.cores.branco },
  }),
)
