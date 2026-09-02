import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { carregarCalculoAtivo } from '../lib/energia'
import { carregarMetas } from '../lib/metas'
import { carregarPeso } from '../lib/peso'
import { sugerirPlano, type PlanoSugerido } from '../lib/planoIA'
import { milhar } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'
import type { RefeicaoEscolhida } from './RefeicoesDoDiaScreen'

/* O que a IA precisa saber antes de montar.
 *
 * Quase tudo já está no app: as calorias e os macros vêm das metas, e peso,
 * altura, idade e sexo vêm do cálculo energético. Perguntar de novo o que já
 * foi respondido é o jeito mais rápido de fazer alguém desistir de um
 * formulário.
 *
 * O que sobra para perguntar é só o que o app não tem como saber: o que a
 * pessoa não come, o que lhe faz mal, e o que ela quiser dizer por cima. Três
 * campos, todos opcionais.
 *
 * ── A alergia tem tratamento próprio ───────────────────────────────────────
 * Ela não é "mais uma preferência". É o único campo aqui cuja resposta errada
 * manda alguém para o hospital, e por isso vai separada do "não como", com o
 * seu próprio rótulo e o seu próprio aviso — em vez de as duas caírem num
 * campo de observações onde a pessoa escreve as duas coisas misturadas. */

type Estado = 'carregando' | 'formulario' | 'montando' | 'sem_meta'

export function SugerirPlanoScreen({
  contaId,
  refeicoes,
  onPronto,
  onVoltar,
  onDefinirMetas,
}: {
  contaId: string
  refeicoes: RefeicaoEscolhida[]
  /* A sugestão pronta. Quem recebe é a tela de montar, que já sabe editar e
     gravar — aqui não se grava nada. */
  onPronto: (plano: PlanoSugerido) => void
  onVoltar: () => void
  /* Sem meta de calorias não há o que pedir à IA. Em vez de um beco sem saída,
     a tela oferece o caminho para definir. */
  onDefinirMetas: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erro, setErro] = useState('')

  /* O que veio do app, e que a pessoa não precisa digitar de novo. */
  const [kcal, setKcal] = useState<number | null>(null)
  const [macros, setMacros] = useState<{
    proteinas: number | null
    carboidratos: number | null
    gorduras: number | null
  }>({ proteinas: null, carboidratos: null, gorduras: null })
  const [corpo, setCorpo] = useState<{
    idade: number | null
    genero: string | null
    pesoKg: number | null
    alturaCm: number | null
  }>({ idade: null, genero: null, pesoKg: null, alturaCm: null })

  const [tipoDieta, setTipoDieta] = useState('')
  const [evitar, setEvitar] = useState('')
  const [alergias, setAlergias] = useState('')
  const [observacao, setObservacao] = useState('')

  function sair() {
    /* Fecha o teclado antes de sair: com ele no ar a janela do Android está
       encolhida, e a tela de trás se desenha comprimida. */
    Keyboard.dismiss()
    onVoltar()
  }

  /* Sem lista de dependências: a tela de trás não tem degrau interno, mas esta
     precisa ganhar do voltar central para fechar o teclado antes de sair. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (estado === 'montando') return true /* montando não se interrompe */
      sair()
      return true
    })
    return () => sub.remove()
  })

  useEffect(() => {
    let ativo = true

    Promise.all([
      carregarMetas(contaId),
      carregarCalculoAtivo(contaId),
      carregarPeso(contaId),
    ]).then(([rMetas, rCalculo, rPeso]) => {
      if (!ativo) return

      const metas = rMetas.tipo === 'ok' ? rMetas.metas : null
      const calculo = rCalculo.tipo === 'ok' ? rCalculo.calculo : null

      /* A meta da pessoa primeiro; o alvo do cálculo energético como reserva.
         Quem calculou o gasto e não transformou em meta ainda tem um número
         bom ali, e recusar por causa disso seria burocracia. */
      const alvo = metas?.calorias ?? calculo?.alvoKcal ?? null
      if (!alvo) {
        setEstado('sem_meta')
        return
      }

      setKcal(alvo)
      setMacros({
        proteinas: metas?.proteinas ?? null,
        carboidratos: metas?.carboidratos ?? null,
        gorduras: metas?.gorduras ?? null,
      })

      /* O peso mais recente do diário vale mais que o do cálculo, que pode ser
         de meses atrás — é o mesmo número, mas um deles envelheceu. */
      const registros = rPeso.tipo === 'ok' ? rPeso.peso.registros : []
      /* Escolhe pela data em vez de confiar na ordem: a lista vem da mais
         recente para a mais antiga, mas depender disso amarraria esta tela à
         ordenação de outra. */
      const ultimo =
        registros.length > 0 ? registros.reduce((a, b) => (a.data >= b.data ? a : b)).kg : null

      setCorpo({
        idade: calculo?.idade ?? null,
        genero: calculo?.sexo ?? null,
        pesoKg: ultimo ?? calculo?.peso ?? null,
        alturaCm: calculo?.alturaCm ?? null,
      })
      setEstado('formulario')
    })

    return () => {
      ativo = false
    }
  }, [contaId])

  async function montar() {
    if (!kcal) return
    Keyboard.dismiss()
    setErro('')
    setEstado('montando')

    const r = await sugerirPlano({
      kcal,
      proteinas: macros.proteinas,
      carboidratos: macros.carboidratos,
      gorduras: macros.gorduras,
      refeicoes: refeicoes.length,
      nomesRefeicoes: refeicoes.map(x => `${x.rotulo} (${x.hora})`),
      idade: corpo.idade,
      genero: corpo.genero,
      pesoKg: corpo.pesoKg,
      alturaCm: corpo.alturaCm,
      tipoDieta: tipoDieta.trim(),
      evitar: evitar.trim(),
      alergias: alergias.trim(),
      observacao: observacao.trim(),
    })

    if (r.tipo === 'ok') {
      onPronto(r.plano)
      return
    }

    setEstado('formulario')
    setErro(r.mensagem)
  }

  const cabecalho = (
    <View style={[styles.cabecalho, { paddingTop: top + 8 }]}>
      <Pressable
        onPress={sair}
        style={styles.botaoVoltar}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
      </Pressable>
      <Text style={styles.tituloTela}>Ajuda da Aurora</Text>
      <View style={styles.botaoVoltar} />
    </View>
  )

  if (estado === 'carregando') {
    return (
      <View style={styles.tela}>
        {cabecalho}
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
        </View>
      </View>
    )
  }

  if (estado === 'sem_meta') {
    return (
      <View style={styles.tela}>
        {cabecalho}
        <View style={styles.centro}>
          <Ionicons name="flag-outline" size={30} color={paleta().inkFraco} />
          <Text style={styles.tituloVazio}>Falta a sua meta de calorias</Text>
          <Text style={styles.textoVazio}>
            É a partir dela que a Aurora decide o tamanho das porções. Sem esse número, o plano
            seria um chute.
          </Text>
          <Pressable
            onPress={onDefinirMetas}
            style={({ pressed }) => [styles.botaoPrincipal, pressed && styles.pressionado]}
            accessibilityRole="button"
          >
            <Text style={styles.textoBotaoPrincipal}>Definir minhas metas</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (estado === 'montando') {
    return (
      <View style={styles.tela}>
        {cabecalho}
        <View style={styles.centro}>
          <ActivityIndicator color={paleta().cores.verde} />
          <Text style={styles.tituloVazio}>Montando o seu dia…</Text>
          <Text style={styles.textoVazio}>
            Leva alguns segundos. Depois você confere item por item antes de virar plano.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {cabecalho}

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.chamada}>
          A Aurora monta uma sugestão para as suas {refeicoes.length}{' '}
          {refeicoes.length === 1 ? 'refeição' : 'refeições'}, e você ajusta o que quiser antes de
          salvar.
        </Text>

        {/* O que já está no app aparece como fato, e não como campo: é o que
            impede a pessoa de digitar de novo o que ela já respondeu, e ao
            mesmo tempo mostra de onde saiu o tamanho das porções. */}
        <View style={styles.blocoSabido}>
          <Text style={styles.rotuloSabido}>Ela vai usar</Text>
          <Text style={styles.textoSabido}>
            {milhar(Math.round(kcal!))} kcal por dia
            {macros.proteinas ? ` · ${Math.round(macros.proteinas)} g de proteína` : ''}
            {corpo.pesoKg ? ` · ${corpo.pesoKg} kg` : ''}
          </Text>
        </View>

        <Campo
          rotulo="Como você come"
          exemplo="Ex: vegetariana, low carb, sem lactose"
          valor={tipoDieta}
          onChange={setTipoDieta}
        />

        <Campo
          rotulo="O que você não come"
          exemplo="Ex: fígado, jiló, peixe"
          valor={evitar}
          onChange={setEvitar}
        />

        {/* Separada do "não come" de propósito: é o único campo desta tela cuja
            resposta errada manda alguém para o hospital. */}
        <Campo
          rotulo="Alergias"
          exemplo="Ex: amendoim, camarão, leite"
          valor={alergias}
          onChange={setAlergias}
          aviso="A Aurora não usa nada que contenha isso. Ainda assim, confira o plano antes de seguir."
        />

        <Campo
          rotulo="Mais alguma coisa"
          exemplo="Ex: treino musculação de manhã, almoço na rua"
          valor={observacao}
          onChange={setObservacao}
          alto
        />

        {!!erro && (
          <View style={styles.blocoErro}>
            <Text style={styles.textoErro}>{erro}</Text>
          </View>
        )}

        <Pressable
          onPress={montar}
          style={({ pressed }) => [styles.botaoPrincipal, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="sparkles-outline" size={17} color={paleta().cores.branco} />
          <Text style={styles.textoBotaoPrincipal}>Montar meu plano</Text>
        </Pressable>

        <Text style={styles.rodape}>
          A sugestão é um ponto de partida, não uma prescrição. Se você tem alguma condição de
          saúde, converse com uma nutricionista.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Campo({
  rotulo,
  exemplo,
  valor,
  onChange,
  aviso,
  alto,
}: {
  rotulo: string
  exemplo: string
  valor: string
  onChange: (t: string) => void
  aviso?: string
  alto?: boolean
}) {
  const styles = estilos()
  return (
    <View style={styles.campo}>
      <Text style={styles.rotuloCampo}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={onChange}
        placeholder={exemplo}
        placeholderTextColor={paleta().inkFraco}
        keyboardAppearance="dark"
        multiline={alto}
        style={[styles.entrada, alto && styles.entradaAlta]}
        accessibilityLabel={rotulo}
      />
      {!!aviso && <Text style={styles.avisoCampo}>{aviso}</Text>}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  tela: { flex: 1, backgroundColor: t.cores.fundo },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  botaoVoltar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: t.cores.ink },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  tituloVazio: { marginTop: 4, fontSize: 16, fontWeight: '800', color: t.cores.ink, textAlign: 'center' },
  textoVazio: { fontSize: 13.5, lineHeight: 20, color: t.inkSuave, textAlign: 'center' },

  conteudo: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
  chamada: { fontSize: 13.5, lineHeight: 20, color: t.inkMedio },

  blocoSabido: {
    padding: 13,
    borderRadius: 14,
    backgroundColor: t.cores.verdeMenta,
    borderWidth: 1,
    borderColor: t.cores.borda,
    gap: 3,
  },
  rotuloSabido: { fontSize: 11.5, fontWeight: '800', color: t.cores.verde, letterSpacing: 0.3 },
  textoSabido: { fontSize: 13.5, fontWeight: '600', color: t.cores.ink },

  campo: { gap: 6 },
  rotuloCampo: { fontSize: 13.5, fontWeight: '700', color: t.cores.ink },
  entrada: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.superficie,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: t.cores.ink,
  },
  entradaAlta: { minHeight: 78, textAlignVertical: 'top' },
  avisoCampo: { fontSize: 11.5, lineHeight: 16, color: t.inkSuave },

  blocoErro: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.erroBorda,
    backgroundColor: t.cores.erroFundo,
  },
  textoErro: { fontSize: 13, lineHeight: 18, color: t.cores.erroTexto },

  botaoPrincipal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: t.cores.verde,
  },
  pressionado: { opacity: 0.8 },
  textoBotaoPrincipal: { fontSize: 15, fontWeight: '800', color: t.cores.branco },

  rodape: { fontSize: 11.5, lineHeight: 17, color: t.inkFraco, textAlign: 'center' },
  }),
)
