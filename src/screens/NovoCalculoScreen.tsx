import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { contaDoGasto, salvarCalculo } from '../lib/calculoDaPaciente'
import { ATIVIDADES, type ChaveAtividade, type Sexo } from '../lib/energia'
import { useDesvioDoTeclado } from '../lib/teclado'
import { estilosDe, paleta } from '../lib/tema'
import { FONTE } from '../lib/fontes'

/* Um gasto energético novo, feito no celular.
 *
 * ──────────────────── O que ela vê enquanto digita ────────────────────
 * A conta aparece embaixo, a cada tecla. É o que transforma o erro de digitação
 * ("750 kg") em algo que ela percebe antes de gravar -- e não no dia em que o
 * plano sair com cinco mil calorias.
 *
 * ──────────────────── Os campos são os que mudam o número ────────────────────
 * Peso, altura, idade, sexo e atividade. Fator de lesão, MLG, gestante e peso
 * alvo ficam no sistema: são cinco campos a mais para um caso que não é o do
 * celular, e cada um deles é uma decisão clínica que ela toma sentada, não
 * entre uma consulta e outra. */
export function NovoCalculoScreen({
  pacienteId,
  nome,
  pesoSugerido,
  alturaSugerida,
  idadeSugerida,
  sexoSugerido,
  onFechar,
  onSalvou,
}: {
  pacienteId: number
  nome: string
  /** O último peso que a ficha conhece, para ela não redigitar. */
  pesoSugerido?: number | null
  alturaSugerida?: number | null
  idadeSugerida?: number | null
  sexoSugerido?: Sexo | null
  onFechar: () => void
  onSalvou: (mensagem: string) => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()

  const [peso, setPeso] = useState(pesoSugerido ? String(pesoSugerido).replace('.', ',') : '')
  const [altura, setAltura] = useState(alturaSugerida ? String(Math.round(alturaSugerida)) : '')
  const [idade, setIdade] = useState(idadeSugerida ? String(idadeSugerida) : '')
  const [sexo, setSexo] = useState<Sexo>(sexoSugerido ?? 'F')
  const [atividade, setAtividade] = useState<ChaveAtividade>('moderado')
  const [observacoes, setObservacoes] = useState('')

  const [salvando, setSalvando] = useState(false)
  const salvandoAgora = useRef(false)
  const [erro, setErro] = useState('')

  const [alturaDaTela, setAlturaDaTela] = useState(0)
  const respiro = useDesvioDoTeclado(bottom, alturaDaTela || undefined)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (salvando) return true
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [salvando, onFechar])

  const nPeso = numero(peso)
  const nAltura = numero(altura)
  const nIdade = numero(idade)

  const conta =
    nPeso > 0 && nAltura > 0 && nIdade >= 0
      ? contaDoGasto({ pesoKg: nPeso, alturaCm: nAltura, idade: nIdade, sexo, atividade })
      : null

  const pronto = conta !== null && !salvando

  async function salvar() {
    if (salvando || salvandoAgora.current) return
    salvandoAgora.current = true
    setSalvando(true)
    setErro('')

    const r = await salvarCalculo({
      pacienteId,
      pesoKg: nPeso,
      alturaCm: nAltura,
      idade: nIdade,
      sexo,
      atividade,
      observacoes,
    })

    salvandoAgora.current = false
    setSalvando(false)

    if (r.tipo === 'erro') {
      setErro(r.mensagem)
      return
    }
    onSalvou(`Gasto de ${r.get.toLocaleString('pt-BR')} kcal guardado na ficha.`)
  }

  return (
    <View
      style={[styles.tela, { paddingTop: top + 8 }]}
      onLayout={e => setAlturaDaTela(e.nativeEvent.layout.height)}
    >
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => !salvando && onFechar()}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela} numberOfLines={1}>
          Gasto de {nome.split(' ')[0]}
        </Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: respiro + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.linhaDeCampos}>
          <Campo
            rotulo="Peso (kg)"
            valor={peso}
            onMudar={t => setPeso(t.replace(/[^0-9.,]/g, '').slice(0, 6))}
            placeholder="72,4"
            styles={styles}
          />
          <Campo
            rotulo="Altura (cm)"
            valor={altura}
            onMudar={t => setAltura(t.replace(/[^0-9]/g, '').slice(0, 3))}
            placeholder="165"
            styles={styles}
          />
          <Campo
            rotulo="Idade"
            valor={idade}
            onMudar={t => setIdade(t.replace(/[^0-9]/g, '').slice(0, 3))}
            placeholder="34"
            styles={styles}
          />
        </View>

        <Text style={styles.rotulo}>SEXO PARA A FÓRMULA</Text>
        <View style={styles.chips}>
          {(['F', 'M'] as Sexo[]).map(x => (
            <Chip
              key={x}
              rotulo={x === 'F' ? 'Feminino' : 'Masculino'}
              ativo={sexo === x}
              onPress={() => setSexo(x)}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.rotulo}>ATIVIDADE</Text>
        <View style={styles.chips}>
          {ATIVIDADES.map(a => (
            <Chip
              key={a.chave}
              rotulo={a.rotulo}
              ativo={atividade === a.chave}
              onPress={() => setAtividade(a.chave)}
              styles={styles}
            />
          ))}
        </View>

        {/* A conta, enquanto ela digita. */}
        {conta && (
          <View style={styles.cartaoDaConta}>
            <View style={styles.numeros}>
              <View style={styles.numero}>
                <Text style={styles.valor}>{conta.tmb.toLocaleString('pt-BR')}</Text>
                <Text style={styles.rotuloDoNumero}>TMB</Text>
              </View>
              <View style={styles.numero}>
                <Text style={[styles.valor, styles.valorForte]}>
                  {conta.get.toLocaleString('pt-BR')}
                </Text>
                <Text style={styles.rotuloDoNumero}>GASTO TOTAL</Text>
              </View>
            </View>
            <Text style={styles.detalheDaConta}>
              {conta.nomeDaFormula}, fator {atividadePorExtenso(atividade)}.
            </Text>
          </View>
        )}

        <Text style={styles.rotulo}>OBSERVAÇÃO (OPCIONAL)</Text>
        <TextInput
          value={observacoes}
          onChangeText={setObservacoes}
          placeholder="O que explica este número…"
          placeholderTextColor={paleta().inkFraco}
          multiline
          style={[styles.campo, styles.campoLongo]}
          accessibilityLabel="Observação do cálculo"
        />

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={() => void salvar()}
          disabled={!pronto}
          style={({ pressed }) => [styles.botao, !pronto && styles.botaoApagado, pressed && styles.pressionado]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !pronto }}
          accessibilityLabel="Guardar cálculo"
        >
          {salvando ? (
            <ActivityIndicator size="small" color={paleta().cores.branco} />
          ) : (
            <Text style={styles.textoDoBotao}>Guardar cálculo</Text>
          )}
        </Pressable>

        <Text style={styles.nota}>
          Guarda um cálculo NOVO, sem apagar o anterior — é assim que o sistema
          também faz, e é o que deixa comparar. Fator de lesão, massa magra e
          gestante continuam no computador.
        </Text>
      </ScrollView>
    </View>
  )
}

function Campo({
  rotulo,
  valor,
  onMudar,
  placeholder,
  styles,
}: {
  rotulo: string
  valor: string
  onMudar: (t: string) => void
  placeholder: string
  styles: ReturnType<typeof estilos>
}) {
  return (
    <View style={styles.campoCurto}>
      <Text style={styles.rotuloDoCampo}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={onMudar}
        placeholder={placeholder}
        placeholderTextColor={paleta().inkFraco}
        keyboardType="decimal-pad"
        style={styles.campo}
        accessibilityLabel={rotulo}
      />
    </View>
  )
}

function Chip({
  rotulo,
  ativo,
  onPress,
  styles,
}: {
  rotulo: string
  ativo: boolean
  onPress: () => void
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, ativo && styles.chipAtivo, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
    >
      <Text style={[styles.textoDoChip, ativo && styles.textoDoChipAtivo]}>{rotulo}</Text>
    </Pressable>
  )
}

/* Vírgula E ponto: o teclado decimal do Android manda um ou outro conforme o
   idioma do celular, e o campo aceita os dois (armadilha 3, pelo lado que já
   custou um peso dez vezes maior). */
const numero = (v: string) => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const atividadePorExtenso = (chave: ChaveAtividade) =>
  (ATIVIDADES.find(a => a.chave === chave)?.fator ?? 1).toLocaleString('pt-BR')

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
    tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

    conteudo: { paddingHorizontal: 16, gap: 10 },

    linhaDeCampos: { flexDirection: 'row', gap: 10 },
    campoCurto: { flex: 1 },
    rotuloDoCampo: { fontSize: 12, color: t.inkSuave, marginBottom: 4 },
    campo: {
      backgroundColor: t.cores.superficie,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: t.cores.ink,
      fontFamily: FONTE.normal,
    },
    campoLongo: { minHeight: 70, textAlignVertical: 'top' },

    rotulo: {
      marginTop: 8,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: t.inkFraco,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipAtivo: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    textoDoChip: { fontSize: 13, fontWeight: '700', color: t.inkSuave },
    textoDoChipAtivo: { color: t.cores.branco },

    cartaoDaConta: {
      marginTop: 10,
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      padding: 16,
      gap: 8,
    },
    numeros: { flexDirection: 'row', gap: 20 },
    numero: { flex: 1, alignItems: 'center', gap: 2 },
    valor: { fontSize: 26, fontWeight: '800', color: t.inkSuave },
    valorForte: { color: t.cores.verde },
    rotuloDoNumero: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, color: t.inkFraco },
    detalheDaConta: { fontSize: 12.5, color: t.inkFraco, textAlign: 'center' },

    erro: { fontSize: 13, color: t.cores.erroTexto, marginTop: 6 },
    botao: {
      marginTop: 12,
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    botaoApagado: { opacity: 0.45 },
    textoDoBotao: { fontSize: 15, fontWeight: '800', color: t.cores.branco },
    pressionado: { opacity: 0.75 },
    nota: { fontSize: 12, lineHeight: 17, color: t.inkFraco, marginTop: 8 },
  }),
)
