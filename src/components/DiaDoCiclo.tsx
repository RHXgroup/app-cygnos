import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { diaVazio, type DiaDoCiclo as Dia, type Fluxo, type Humor } from '../lib/ciclo'
import { estilosDe, paleta } from '../lib/tema'

/* Um dia do calendário do ciclo.
 *
 * ── A separação é a tela ──────────────────────────────────────────────────
 * Dois blocos, e a distância entre eles é o desenho todo:
 *
 *   O DE CIMA vai para a nutricionista, se ela ligou o compartilhamento. Fluxo,
 *   sintoma, humor, vontade de comer, recado. Isso muda plano alimentar.
 *
 *   O DE BAIXO nunca sai. Relação, proteção, nota privada. Não existe chave
 *   para ligar isso, porque não existe motivo clínico de nutrição para alguém
 *   precisar saber — e no banco a função que espelha não lê essas colunas.
 *
 * Cada bloco DIZ isso, com todas as letras, e não numa nota de rodapé. Quem
 * abre esta tela precisa saber onde está pisando antes de escrever, e não
 * depois.
 *
 * ── Por que nada é obrigatório ────────────────────────────────────────────
 * Mesma razão do questionário: o objetivo é a pessoa registrar, não preencher
 * um formulário. Um dia com só "cólica" marcado já vale — e é o que a maioria
 * vai fazer. */

const FLUXOS: { valor: Fluxo; rotulo: string }[] = [
  { valor: 'nenhum', rotulo: 'nenhum' },
  { valor: 'leve', rotulo: 'leve' },
  { valor: 'moderado', rotulo: 'moderado' },
  { valor: 'intenso', rotulo: 'intenso' },
]

const SINTOMAS = [
  'cólica',
  'inchaço',
  'dor de cabeça',
  'seio dolorido',
  'acne',
  'intestino solto',
  'intestino preso',
  'náusea',
  'cansaço',
  'insônia',
]

const HUMORES: { valor: Humor; rotulo: string }[] = [
  { valor: 'bem', rotulo: 'bem' },
  { valor: 'irritada', rotulo: 'irritada' },
  { valor: 'triste', rotulo: 'triste' },
  { valor: 'ansiosa', rotulo: 'ansiosa' },
  { valor: 'oscilando', rotulo: 'oscilando' },
]

const DESEJOS = ['doce', 'salgado', 'carboidrato', 'chocolate', 'gordura', 'sem fome']

const diaEMes = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function DiaDoCiclo({
  visivel,
  data,
  dia,
  carregando,
  ehComecoDeCiclo,
  salvando,
  onSalvar,
  onMarcarComeco,
  onFechar,
}: {
  visivel: boolean
  data: string
  /* O que já estava gravado neste dia, ou nulo se nada. */
  dia: Dia | null
  carregando: boolean
  ehComecoDeCiclo: boolean
  salvando: boolean
  onSalvar: (d: Dia) => void
  /* Marcar ou desmarcar que a menstruação começou NESTE dia. Separado do resto
     porque é o único campo que muda o cálculo do ciclo inteiro. */
  onMarcarComeco: (ligado: boolean) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [d, setD] = useState<Dia>(() => diaVazio(data))

  useEffect(() => {
    if (visivel) setD(dia ?? diaVazio(data))
  }, [visivel, data, dia])

  const alternar = (lista: string[], item: string) =>
    lista.includes(item) ? lista.filter(x => x !== item) : [...lista, item]

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView
        style={[styles.tela, { paddingTop: top + 8 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.cabecalho}>
          <Pressable
            onPress={onFechar}
            style={styles.botaoVoltar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <Ionicons name="chevron-down" size={24} color={paleta().cores.ink} />
          </Pressable>
          <Text style={styles.tituloTela}>{diaEMes(data)}</Text>
          <View style={styles.botaoVoltar} />
        </View>

        {carregando ? (
          <ActivityIndicator color={paleta().cores.verde} style={{ marginTop: 30 }} />
        ) : (
          <ScrollView
            contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* O começo do ciclo vem primeiro e sozinho: é o único campo que
                muda o cálculo inteiro, e é o que a pessoa veio marcar quando
                abriu um dia do passado. */}
            <Pressable
              onPress={() => onMarcarComeco(!ehComecoDeCiclo)}
              style={[styles.comeco, ehComecoDeCiclo && styles.comecoLigado]}
              accessibilityRole="button"
              accessibilityState={{ selected: ehComecoDeCiclo }}
            >
              <Ionicons
                name={ehComecoDeCiclo ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={ehComecoDeCiclo ? paleta().cores.branco : paleta().inkMedio}
              />
              <Text style={[styles.textoComeco, ehComecoDeCiclo && styles.textoComecoLigado]}>
                A minha menstruação começou neste dia
              </Text>
            </Pressable>

            {/* ── O que a nutricionista vê ─────────────────────────────── */}
            <View style={styles.aviso}>
              <Ionicons name="people-outline" size={15} color={paleta().inkMedio} />
              <Text style={styles.textoAviso}>
                O que você marcar aqui embaixo vai para a sua nutricionista, se você tiver ligado o
                compartilhamento.
              </Text>
            </View>

            <Secao titulo="Fluxo" styles={styles}>
              <View style={styles.chips}>
                {FLUXOS.map(f => (
                  <Chip
                    key={f.valor}
                    ativo={d.fluxo === f.valor}
                    onPress={() => setD(x => ({ ...x, fluxo: x.fluxo === f.valor ? null : f.valor }))}
                    styles={styles}
                  >
                    {f.rotulo}
                  </Chip>
                ))}
              </View>
            </Secao>

            <Secao titulo="Como você se sentiu" styles={styles}>
              <View style={styles.chips}>
                {SINTOMAS.map(s => (
                  <Chip
                    key={s}
                    ativo={d.sintomas.includes(s)}
                    onPress={() => setD(x => ({ ...x, sintomas: alternar(x.sintomas, s) }))}
                    styles={styles}
                  >
                    {s}
                  </Chip>
                ))}
              </View>
            </Secao>

            <Secao titulo="Humor" styles={styles}>
              <View style={styles.chips}>
                {HUMORES.map(h => (
                  <Chip
                    key={h.valor}
                    ativo={d.humor === h.valor}
                    onPress={() => setD(x => ({ ...x, humor: x.humor === h.valor ? null : h.valor }))}
                    styles={styles}
                  >
                    {h.rotulo}
                  </Chip>
                ))}
              </View>
            </Secao>

            {/* O campo que nenhum app de ciclo tem e nenhum app de nutrição
                tem. Só faz sentido onde os dois moram juntos — e é o que deixa
                a nutricionista ver o padrão em vez de ouvir "eu ataco o
                chocolate uns dias antes". */}
            <Secao titulo="Vontade de comer" styles={styles}>
              <View style={styles.chips}>
                {DESEJOS.map(v => (
                  <Chip
                    key={v}
                    ativo={d.desejoAlimentar.includes(v)}
                    onPress={() =>
                      setD(x => ({ ...x, desejoAlimentar: alternar(x.desejoAlimentar, v) }))
                    }
                    styles={styles}
                  >
                    {v}
                  </Chip>
                ))}
              </View>
            </Secao>

            <Secao titulo="Recado para a sua nutricionista" styles={styles}>
              <TextInput
                value={d.observacao ?? ''}
                onChangeText={t => setD(x => ({ ...x, observacao: t }))}
                placeholder="Alguma coisa que ela precise saber deste dia"
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                multiline
                textAlignVertical="top"
                maxLength={500}
                style={[styles.campo, styles.campoGrande]}
                accessibilityLabel="Recado para a sua nutricionista"
              />
            </Secao>

            {/* ── O que NUNCA sai ──────────────────────────────────────── */}
            <View style={styles.divisor} />

            <View style={styles.avisoPrivado}>
              <Ionicons name="lock-closed" size={15} color={paleta().cores.verde} />
              <Text style={styles.textoAvisoPrivado}>
                Daqui para baixo é só seu. Não vai para a sua nutricionista nem para ninguém, e
                não existe opção para ligar isso.
              </Text>
            </View>

            <Secao titulo="Relação" styles={styles}>
              <View style={styles.linhaSwitch}>
                <Text style={styles.rotuloSwitch}>Tive relação neste dia</Text>
                <Switch
                  value={d.relacao === true}
                  onValueChange={v =>
                    setD(x => ({
                      ...x,
                      relacao: v ? true : null,
                      /* Desligar a relação limpa a proteção: o banco recusa
                         proteção sem relação, e um "sim" solto na tela seria
                         uma resposta que ela não deu. */
                      relacaoProtegida: v ? x.relacaoProtegida : null,
                    }))
                  }
                  trackColor={{ false: paleta().cores.trilho, true: paleta().cores.verde }}
                  accessibilityLabel="Tive relação neste dia"
                />
              </View>
              {d.relacao === true && (
                <View style={styles.chips}>
                  <Chip
                    ativo={d.relacaoProtegida === true}
                    onPress={() =>
                      setD(x => ({ ...x, relacaoProtegida: x.relacaoProtegida === true ? null : true }))
                    }
                    styles={styles}
                  >
                    com proteção
                  </Chip>
                  <Chip
                    ativo={d.relacaoProtegida === false}
                    onPress={() =>
                      setD(x => ({
                        ...x,
                        relacaoProtegida: x.relacaoProtegida === false ? null : false,
                      }))
                    }
                    styles={styles}
                  >
                    sem proteção
                  </Chip>
                </View>
              )}
            </Secao>

            <Secao titulo="Nota só sua" styles={styles}>
              <TextInput
                value={d.notaPrivada ?? ''}
                onChangeText={t => setD(x => ({ ...x, notaPrivada: t }))}
                placeholder="O que você quiser lembrar, e mais ninguém lê"
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                multiline
                textAlignVertical="top"
                maxLength={500}
                style={[styles.campo, styles.campoGrande]}
                accessibilityLabel="Nota privada"
              />
            </Secao>

            <Pressable
              onPress={() => onSalvar(d)}
              disabled={salvando}
              style={({ pressed }) => [
                styles.botao,
                salvando && styles.desligado,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
            >
              {salvando ? (
                <ActivityIndicator color={paleta().cores.branco} />
              ) : (
                <Text style={styles.textoBotao}>Salvar</Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Secao({
  titulo,
  children,
  styles,
}: {
  titulo: string
  children: React.ReactNode
  styles: ReturnType<typeof estilos>
}) {
  return (
    <View style={styles.secao}>
      <Text style={styles.tituloSecao}>{titulo}</Text>
      {children}
    </View>
  )
}

function Chip({
  ativo,
  onPress,
  children,
  styles,
}: {
  ativo: boolean
  onPress: () => void
  children: React.ReactNode
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, ativo && styles.chipAtivo]}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
    >
      <Text style={[styles.textoChip, ativo && styles.textoChipAtivo]}>{children}</Text>
    </Pressable>
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
      paddingBottom: 4,
    },
    botaoVoltar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },

    conteudo: { paddingHorizontal: 20, gap: 16 },

    comeco: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
      paddingHorizontal: 15,
      paddingVertical: 15,
    },
    comecoLigado: { backgroundColor: t.cores.erroTexto, borderColor: t.cores.erroTexto },
    textoComeco: { flex: 1, fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
    textoComecoLigado: { color: t.cores.branco },

    aviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    textoAviso: { flex: 1, fontSize: 12, color: t.inkMedio, lineHeight: 17 },

    divisor: { height: 1, backgroundColor: t.cores.borda, marginTop: 6 },
    avisoPrivado: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: t.cores.verdeClaro,
      borderRadius: 12,
      padding: 13,
    },
    textoAvisoPrivado: { flex: 1, fontSize: 12.5, color: t.cores.ink, lineHeight: 18, fontWeight: '600' },

    secao: { gap: 8 },
    tituloSecao: {
      fontSize: 12,
      fontWeight: '800',
      color: t.inkFraco,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
    },
    chipAtivo: { borderColor: t.cores.verde, backgroundColor: t.cores.verdeMenta },
    textoChip: { fontSize: 13.5, color: t.inkMedio, fontWeight: '600' },
    textoChipAtivo: { color: t.cores.verde, fontWeight: '800' },

    linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rotuloSwitch: { flex: 1, fontSize: 14.5, color: t.cores.ink },

    campo: {
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: t.cores.ink,
    },
    campoGrande: { minHeight: 88, lineHeight: 21 },

    botao: {
      backgroundColor: t.cores.verde,
      borderRadius: 14,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    desligado: { opacity: 0.6 },
    pressionado: { opacity: 0.85 },
    textoBotao: { color: t.cores.branco, fontSize: 15, fontWeight: '800' },
  }),
)
