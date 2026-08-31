import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { NovoPlanoScreen } from './NovoPlanoScreen'
import { supabase } from '../lib/supabase'
import { dataNumerica } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

export type Plano = {
  id: string
  nome: string
  observacao: string | null
  criado_em: string
}

/* Os planos que o próprio paciente montou no app.
 *
 * Quando o vínculo com a nutricionista existir, o plano prescrito por ela vem
 * de outra tabela e merece uma seção separada aqui — de quem é cada plano é a
 * informação mais importante da tela, e uma lista só apagaria isso. */
export function PlanosScreen({ sessao, onFechar }: { sessao: Session; onFechar: () => void }) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [planos, setPlanos] = useState<Plano[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    let ativo = true

    supabase
      .from('app_planos')
      .select('id, nome, observacao, criado_em')
      .eq('conta_id', sessao.user.id)
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) setErro('Não foi possível carregar seus planos.')
        else setPlanos((data ?? []) as Plano[])
        setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [sessao.user.id])

  if (criando) {
    return (
      <NovoPlanoScreen
        contaId={sessao.user.id}
        onCancelar={() => setCriando(false)}
        onCriado={plano => {
          /* No topo porque a lista é do mais novo para o mais antigo — a mesma
             ordem que o banco devolve. */
          setPlanos(atuais => [plano, ...atuais])
          setCriando(false)
        }}
      />
    )
  }

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
        <Text style={styles.tituloTela}>Planejamento alimentar</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, planos.length === 0 && styles.conteudoVazio]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {!!erro && <Text style={styles.erro}>{erro}</Text>}

          {planos.length === 0 && !erro ? (
            <View style={styles.vazio}>
              <View style={styles.circulo}>
                <Ionicons name="nutrition-outline" size={28} color={paleta().cores.verde} />
              </View>
              <Text style={styles.tituloVazio}>Nenhum plano por aqui</Text>
              <Text style={styles.textoVazio}>
                Crie o seu primeiro planejamento alimentar para organizar as refeições do seu dia.
              </Text>
            </View>
          ) : (
            planos.map(p => <CartaoPlano key={p.id} plano={p} />)
          )}
        </ScrollView>
      )}

      {/* Fora da rolagem: o botão é a razão de a tela existir e não pode
          depender de o paciente rolar até o fim de uma lista longa. */}
      <View style={[styles.rodape, { paddingBottom: Math.max(bottom, 16) }]}>
        <Pressable
          onPress={() => setCriando(true)}
          style={({ pressed }) => [styles.botaoCriar, pressed && styles.botaoCriarPressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={paleta().cores.branco} />
          <Text style={styles.textoBotaoCriar}>Criar plano alimentar</Text>
        </Pressable>
      </View>
    </View>
  )
}

function CartaoPlano({ plano }: { plano: Plano }) {
  const styles = estilos()
  return (
    <View style={styles.cartao}>
      <View style={styles.icone}>
        <Ionicons name="restaurant-outline" size={18} color={paleta().cores.verde} />
      </View>

      <View style={styles.textoCartao}>
        <Text style={styles.nome} numberOfLines={1}>
          {plano.nome}
        </Text>
        {!!plano.observacao && (
          <Text style={styles.observacao} numberOfLines={2}>
            {plano.observacao}
          </Text>
        )}
        <Text style={styles.data}>Criado em {dataNumerica(new Date(plano.criado_em))}</Text>
      </View>
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
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 12 },
  /* Lista vazia: o bloco de convite ocupa o espaço todo e fica no meio, em vez
     de grudado no topo. */
  conteudoVazio: { flexGrow: 1, justifyContent: 'center' },

  erro: { fontSize: 13.5, lineHeight: 20, color: t.cores.erroTexto, textAlign: 'center' },

  vazio: { alignItems: 'center', paddingHorizontal: 12 },
  circulo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  tituloVazio: { fontSize: 17, fontWeight: '800', color: t.cores.ink },
  textoVazio: {
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 20,
    color: t.inkSuave,
    textAlign: 'center',
  },

  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: t.cores.cartao,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.cores.verdeClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoCartao: { flex: 1 },
  nome: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
  observacao: { marginTop: 3, fontSize: 13, lineHeight: 18, color: t.inkSuave },
  data: { marginTop: 4, fontSize: 11.5, color: t.inkFraco },

  rodape: { paddingHorizontal: 20, paddingTop: 10 },
  botaoCriar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: t.cores.verde,
  },
  botaoCriarPressionado: { backgroundColor: t.cores.verdeEscuro },
  textoBotaoCriar: { fontSize: 15.5, fontWeight: '700', color: t.cores.branco },
  }),
)
