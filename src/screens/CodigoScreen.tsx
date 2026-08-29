import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { carregarCatalogo, jaVinculado } from '../lib/nutricionista'
import { supabase } from '../lib/supabase'
import { cores, inkFraco, inkMedio, inkSuave } from '../theme'

/* De quanto em quanto tempo a tela pergunta se o vínculo já aconteceu.
 *
 * Esta é a ÚNICA tela do app que pergunta sozinha, e o motivo é o momento: a
 * pessoa está de pé na frente da nutricionista, acabou de ditar oito
 * caracteres, e a única coisa que ela quer saber é se funcionou. O vínculo é
 * feito do lado DELA, e nada avisa o aparelho — em toda outra tela isso se
 * resolve com puxar para atualizar, mas aqui puxar seria pedir que a pessoa
 * adivinhasse que precisa puxar.
 *
 * Quatro segundos é curto o bastante para parecer imediato e longo o bastante
 * para a pergunta ser barata: ela devolve um número, e só. */
const SEGUNDOS_ENTRE_PERGUNTAS = 4

/* O código tem 8 caracteres e é lido em voz alta. Mostrar em dois blocos de
   quatro é o que faz alguém conseguir ditar sem se perder — e são dois blocos
   de texto com espaço entre eles, não um hífen de verdade: assim o que se copia
   é exatamente o que está no banco. */
const METADE = 4

/* Mesma escolha da tela de perfil: View sobreposta lá no App, não Modal. */
export function CodigoScreen({
  sessao,
  onFechar,
  onVinculou,
}: {
  sessao: Session
  onFechar: () => void
  /* Avisa o App no instante em que o vínculo aparece. Sem isto a pessoa vê o
     "pronto" aqui, fecha, e encontra a tela inicial e a aba Mais ainda dizendo
     que ela não tem nutricionista — o app teria descoberto e guardado só para
     esta tela. */
  onVinculou: () => void
}) {
  const { top } = useSafeAreaInsets()
  const [codigo, setCodigo] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [copiado, setCopiado] = useState(false)
  /* Null enquanto não se sabe; o nome dela quando o vínculo existe. O nome só é
     buscado no instante em que a resposta vira sim — durante a espera, a
     pergunta é um booleano. */
  const [vinculada, setVinculada] = useState<string | null>(null)
  /* Guardado para poder cancelar no desmonte: sem isso, fechar a tela logo após
     copiar deixa um setState mirando um componente que não existe mais. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let ativo = true

    supabase
      .from('app_contas')
      .select('codigo')
      .eq('id', sessao.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return
        setCodigo((data?.codigo as string | undefined) ?? null)
        setCarregando(false)
      })

    return () => {
      ativo = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [sessao.user.id])

  /* Fica perguntando enquanto a tela está aberta e ainda não há vínculo.
   *
   * Para sozinho assim que encontra — e também quando o app vai para segundo
   * plano, porque perguntar de quatro em quatro segundos com a tela apagada é
   * gastar bateria por nada. Volta a perguntar, e pergunta na hora, quando o
   * app volta: é comum a pessoa sair do app para mostrar o código e voltar. */
  useEffect(() => {
    if (vinculada) return

    let ativo = true
    let timer: ReturnType<typeof setTimeout> | null = null

    async function perguntar() {
      if (!ativo) return

      if (await jaVinculado()) {
        if (!ativo) return
        /* Só agora o catálogo, e uma vez: é ele que sabe o nome dela, e é
           pesado demais para entrar no laço. Se ele falhar, o vínculo ainda
           assim aconteceu — a tela mostra sem o nome em vez de continuar
           dizendo que não aconteceu nada. */
        const r = await carregarCatalogo()
        if (!ativo) return
        setVinculada(
          (r.tipo === 'ok' && r.catalogo.vinculada?.nome) || 'a sua nutricionista',
        )
        onVinculou()
        return
      }

      if (ativo) timer = setTimeout(perguntar, SEGUNDOS_ENTRE_PERGUNTAS * 1000)
    }

    void perguntar()

    const sub = AppState.addEventListener('change', e => {
      if (e !== 'active') {
        if (timer) clearTimeout(timer)
        timer = null
        return
      }
      if (timer) clearTimeout(timer)
      void perguntar()
    })

    return () => {
      ativo = false
      if (timer) clearTimeout(timer)
      sub.remove()
    }
  }, [vinculada])

  async function copiar() {
    if (!codigo) return
    await Clipboard.setStringAsync(codigo)
    setCopiado(true)
    if (timer.current) clearTimeout(timer.current)
    /* Volta ao rótulo normal sozinho: o "Copiado!" é confirmação, não estado. */
    timer.current = setTimeout(() => setCopiado(false), 2000)
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
          <Ionicons name="chevron-back" size={22} color={cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Meu código</Text>
        <View style={styles.botaoVoltar} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={cores.verde} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.conteudo}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          <View style={[styles.circulo, vinculada && styles.circuloPronto]}>
            <Ionicons
              name={vinculada ? 'checkmark' : 'link-outline'}
              size={26}
              color={vinculada ? cores.sobreLimao : cores.verde}
            />
          </View>

          {/* O momento em que a espera acaba.
              A pessoa está de pé na frente dela e a única pergunta é "deu
              certo?". Antes a resposta estava em outra tela, e chegar até ela
              exigia sair desta — que é a que ela foi orientada a abrir. */}
          <Text style={styles.chamada}>
            {vinculada ? 'Pronto, vocês estão conectadas' : 'Informe este código à sua nutricionista'}
          </Text>
          <Text style={styles.explicacao}>
            {vinculada
              ? `${vinculada} já pode ver o seu acompanhamento. O plano, as metas e os retornos dela passam a chegar aqui.`
              : 'É com ele que ela encontra a sua conta e vincula você ao consultório dela. O código é seu e não muda.'}
          </Text>

          {codigo ? (
            <>
              <View style={styles.cartaoCodigo}>
                <Text style={styles.codigo}>{codigo.slice(0, METADE)}</Text>
                <Text style={styles.codigo}>{codigo.slice(METADE)}</Text>
              </View>

              <Pressable
                onPress={copiar}
                style={({ pressed }) => [styles.botaoCopiar, pressed && styles.botaoCopiarPressionado]}
                accessibilityRole="button"
                accessibilityLabel="Copiar código"
              >
                <Ionicons
                  name={copiado ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={cores.branco}
                />
                <Text style={styles.textoBotaoCopiar}>{copiado ? 'Copiado!' : 'Copiar código'}</Text>
              </Pressable>

              {/* O aviso some depois do vínculo: ele existe para quem ainda vai
                  ditar o código, e repeti-lo a quem já ditou é ruído. O código
                  em si FICA — ele não muda, e trocar de consultório algum dia
                  vai exigir ditá-lo de novo. */}
              {!vinculada && (
                <Text style={styles.aviso}>
                  Só compartilhe com a sua nutricionista. Com este código ela passa a ver o seu
                  acompanhamento.
                </Text>
              )}
            </>
          ) : (
            /* Mesma situação da tela de perfil: conta criada fora do app não tem
               linha em app_contas, e sem linha não há código. */
            <View style={styles.cartaoSemCodigo}>
              <Text style={styles.textoSemCodigo}>
                Esta conta não tem cadastro completo — ela foi criada fora do app, então ainda não
                tem código de vínculo.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
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

  conteudo: { paddingHorizontal: 20, paddingBottom: 32, alignItems: 'center' },

  circuloPronto: { backgroundColor: cores.limao },
  circulo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: cores.verdeMenta,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  chamada: {
    fontSize: 18,
    fontWeight: '800',
    color: cores.ink,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  explicacao: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 20,
    color: inkSuave,
    textAlign: 'center',
  },

  cartaoCodigo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    /* O espaço entre os dois blocos faz o papel do hífen, sem entrar no valor
       copiado. */
    gap: 14,
    alignSelf: 'stretch',
    marginTop: 24,
    paddingVertical: 22,
    borderRadius: 20,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  codigo: {
    fontSize: 30,
    fontWeight: '800',
    color: cores.ink,
    /* Espaçado letra a letra porque o código é copiado à mão da tela. */
    letterSpacing: 4,
  },

  botaoCopiar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: 16,
    height: 52,
    borderRadius: 16,
    backgroundColor: cores.verde,
  },
  botaoCopiarPressionado: { backgroundColor: cores.verdeEscuro },
  textoBotaoCopiar: { fontSize: 15, fontWeight: '700', color: cores.branco },

  aviso: {
    marginTop: 18,
    fontSize: 12.5,
    lineHeight: 18,
    color: inkFraco,
    textAlign: 'center',
  },

  cartaoSemCodigo: {
    alignSelf: 'stretch',
    marginTop: 24,
    borderRadius: 20,
    backgroundColor: cores.cartao,
    padding: 18,
  },
  textoSemCodigo: { fontSize: 13.5, lineHeight: 20, color: inkMedio, textAlign: 'center' },
})
