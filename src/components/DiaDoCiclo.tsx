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
import {
  diaVazio,
  type Cabeca,
  type Digestao,
  type DiaDoCiclo as Dia,
  type Energia,
  type Fluxo,
  type Humor,
  type Pele,
  type Secrecao,
} from '../lib/ciclo'
import { estilosDe, paleta } from '../lib/tema'

/* Um dia do calendário do ciclo.
 *
 * ── O desenho, e por que ele mudou ────────────────────────────────────────
 * A primeira versão era um FORMULÁRIO: oito blocos de etiquetas que quebravam
 * em duas e três linhas, uma parede de rolagem. Quem usou disse "está péssima",
 * e estava — a tela pedia trabalho em vez de aceitar uma marcação.
 *
 * Agora cada categoria é UMA LINHA que rola de lado. Oito categorias viram oito
 * linhas em vez de vinte, e a tela inteira cabe quase sem rolar. É o que os
 * aplicativos de ciclo fazem, e é o que faz marcar um dia levar três toques em
 * vez de uma expedição.
 *
 * E o selecionado é PREENCHIDO, não contornado. Contorno fino de 1px some no
 * meio de doze etiquetas iguais — a pessoa marcava e não via o que marcou.
 *
 * ── O vermelho que voltou ─────────────────────────────────────────────────
 * O botão de "minha menstruação começou" era um bloco vermelho de alarme
 * ocupando o topo da tela. É o mesmo erro que o calendário tinha: vermelho de
 * ERRO para menstruação. Virou uma linha com a cor do ciclo, do tamanho do que
 * ela é.
 *
 * ── A separação é a tela ──────────────────────────────────────────────────
 * Dois blocos, e a distância entre eles é o desenho todo:
 *
 *   O DE CIMA vai para a nutricionista, se ela ligou o compartilhamento.
 *   O DE BAIXO nunca sai — relação, proteção, nota privada. Não existe chave
 *   para ligar isso, e no banco a função que espelha não lê essas colunas.
 *
 * Cada bloco DIZ isso antes de a pessoa escrever, e não numa nota de rodapé.
 *
 * ── Por que nada é obrigatório ────────────────────────────────────────────
 * O objetivo é ela registrar, não preencher um formulário. Um dia com só
 * "cólica" marcado já vale, e é o que a maioria vai fazer. */

/* ── As categorias ─────────────────────────────────────────────────────────
 *
 * Vieram de comparar com o Clue, que registra em 12 categorias de ~4 opções, e
 * não em 200 campos soltos. A lição maior daquela comparação não é a
 * quantidade: é que TODA categoria tem a opção positiva.
 *
 * Sem ela, só quem está mal registra — e o padrão que o app devolve sai sempre
 * negativo. A pessoa abre e lê que fica mal todo mês, porque os dias bons ela
 * nunca teve onde marcar.
 *
 * Por isso a primeira opção de cada lista é a boa, e não a queixa. */

/* 'escape' não é fluxo leve: é sangramento fora do período, é outra coisa, e é
   justamente o que faz alguém procurar ajuda. Chamá-lo de leve some com a
   informação dentro da média. */
const FLUXOS: { valor: Fluxo; rotulo: string }[] = [
  { valor: 'nenhum', rotulo: 'nenhum' },
  { valor: 'escape', rotulo: 'escape' },
  { valor: 'leve', rotulo: 'leve' },
  { valor: 'moderado', rotulo: 'moderado' },
  { valor: 'intenso', rotulo: 'intenso' },
]

/* Só DOR. Inchaço, náusea e intestino saíram daqui e viraram "digestão" — a
   mesma informação em dois lugares apareceria duas vezes na ficha dela. */
const SINTOMAS = [
  'cólica',
  'dor de cabeça',
  'seio dolorido',
  'dor de ovulação',
  'dor lombar',
  'cansaço',
  'insônia',
]

const HUMORES: { valor: Humor; rotulo: string }[] = [
  { valor: 'bem', rotulo: 'bem' },
  { valor: 'feliz', rotulo: 'feliz' },
  { valor: 'irritada', rotulo: 'irritada' },
  { valor: 'triste', rotulo: 'triste' },
  { valor: 'ansiosa', rotulo: 'ansiosa' },
  { valor: 'oscilando', rotulo: 'oscilando' },
]

const ENERGIAS: { valor: Energia; rotulo: string }[] = [
  { valor: 'energizada', rotulo: 'energizada' },
  { valor: 'normal', rotulo: 'normal' },
  { valor: 'baixa', rotulo: 'baixa' },
  { valor: 'exausta', rotulo: 'exausta' },
]

const DIGESTOES: { valor: Digestao; rotulo: string }[] = [
  { valor: 'bem', rotulo: 'bem' },
  { valor: 'inchada', rotulo: 'inchada' },
  { valor: 'gases', rotulo: 'gases' },
  { valor: 'enjoada', rotulo: 'enjoada' },
  { valor: 'presa', rotulo: 'presa' },
  { valor: 'solta', rotulo: 'solta' },
]

/* O marcador de fertilidade que ela observa sem depender de exame. Os nomes são
   os que se usam de verdade — "clara de ovo" é o termo, e traduzi-lo para algo
   mais formal faria quem procura por ele não encontrar. */
const SECRECOES: { valor: Secrecao; rotulo: string }[] = [
  { valor: 'seca', rotulo: 'seca' },
  { valor: 'pegajosa', rotulo: 'pegajosa' },
  { valor: 'cremosa', rotulo: 'cremosa' },
  { valor: 'clara_de_ovo', rotulo: 'clara de ovo' },
  { valor: 'atipica', rotulo: 'diferente' },
]

const CABECAS: { valor: Cabeca; rotulo: string }[] = [
  { valor: 'focada', rotulo: 'focada' },
  { valor: 'calma', rotulo: 'calma' },
  { valor: 'dispersa', rotulo: 'dispersa' },
  { valor: 'estressada', rotulo: 'estressada' },
]

const PELES: { valor: Pele; rotulo: string }[] = [
  { valor: 'boa', rotulo: 'boa' },
  { valor: 'oleosa', rotulo: 'oleosa' },
  { valor: 'seca', rotulo: 'seca' },
  { valor: 'acne', rotulo: 'acne' },
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

  /* Uma categoria de escolha única, em UMA linha que rola de lado.
     Tocar no que já está marcado desmarca — é o único jeito de voltar atrás num
     campo opcional, e "marquei sem querer" acontece. */
  const umaEscolha = <T extends string>(
    titulo: string,
    opcoes: { valor: T; rotulo: string }[],
    atual: T | null,
    ao: (v: T | null) => void,
  ) => (
    <Linha titulo={titulo} styles={styles}>
      {opcoes.map(o => (
        <Etiqueta
          key={o.valor}
          ativa={atual === o.valor}
          onPress={() => ao(atual === o.valor ? null : o.valor)}
          styles={styles}
        >
          {o.rotulo}
        </Etiqueta>
      ))}
    </Linha>
  )

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
          <Pressable
            onPress={() => onSalvar(d)}
            disabled={salvando}
            style={styles.botaoSalvar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Salvar"
          >
            {salvando ? (
              <ActivityIndicator size="small" color={paleta().cores.verde} />
            ) : (
              <Text style={styles.textoSalvar}>Salvar</Text>
            )}
          </Pressable>
        </View>

        {carregando ? (
          <ActivityIndicator color={paleta().cores.verde} style={{ marginTop: 30 }} />
        ) : (
          <ScrollView
            contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* O começo do ciclo, primeiro e sozinho: é o único campo que muda o
                cálculo inteiro, e é o que a pessoa veio marcar quando abriu um
                dia do passado.

                Uma LINHA, e não um bloco vermelho ocupando o topo. O bloco era
                o mesmo erro do calendário — vermelho de alarme para uma coisa
                que não é alarme. */}
            <Pressable
              onPress={() => onMarcarComeco(!ehComecoDeCiclo)}
              style={[styles.comeco, ehComecoDeCiclo && styles.comecoLigado]}
              accessibilityRole="button"
              accessibilityState={{ selected: ehComecoDeCiclo }}
            >
              <Ionicons
                name={ehComecoDeCiclo ? 'water' : 'water-outline'}
                size={19}
                color={ehComecoDeCiclo ? paleta().cores.cicloForte : paleta().inkMedio}
              />
              <Text style={[styles.textoComeco, ehComecoDeCiclo && styles.textoComecoLigado]}>
                Minha menstruação começou neste dia
              </Text>
              {ehComecoDeCiclo && (
                <Ionicons name="checkmark" size={18} color={paleta().cores.cicloForte} />
              )}
            </Pressable>

            {umaEscolha('Fluxo', FLUXOS, d.fluxo, v => setD(x => ({ ...x, fluxo: v })))}
            {umaEscolha('Energia', ENERGIAS, d.energia, v => setD(x => ({ ...x, energia: v })))}

            <Linha titulo="Dor" styles={styles}>
              {SINTOMAS.map(s => (
                <Etiqueta
                  key={s}
                  ativa={d.sintomas.includes(s)}
                  onPress={() => setD(x => ({ ...x, sintomas: alternar(x.sintomas, s) }))}
                  styles={styles}
                >
                  {s}
                </Etiqueta>
              ))}
            </Linha>

            {umaEscolha('Digestão', DIGESTOES, d.digestao, v => setD(x => ({ ...x, digestao: v })))}
            {umaEscolha('Humor', HUMORES, d.humor, v => setD(x => ({ ...x, humor: v })))}
            {umaEscolha('Cabeça', CABECAS, d.cabeca, v => setD(x => ({ ...x, cabeca: v })))}
            {umaEscolha('Pele', PELES, d.pele, v => setD(x => ({ ...x, pele: v })))}
            {umaEscolha('Secreção', SECRECOES, d.secrecao, v => setD(x => ({ ...x, secrecao: v })))}

            {/* O campo que nenhum app de ciclo tem e nenhum app de nutrição tem.
                Só faz sentido onde os dois moram juntos. */}
            <Linha titulo="Vontade de comer" styles={styles}>
              {DESEJOS.map(v => (
                <Etiqueta
                  key={v}
                  ativa={d.desejoAlimentar.includes(v)}
                  onPress={() =>
                    setD(x => ({ ...x, desejoAlimentar: alternar(x.desejoAlimentar, v) }))
                  }
                  styles={styles}
                >
                  {v}
                </Etiqueta>
              ))}
            </Linha>

            <TextInput
              value={d.observacao ?? ''}
              onChangeText={t => setD(x => ({ ...x, observacao: t }))}
              placeholder="Recado para a sua nutricionista"
              placeholderTextColor={paleta().inkFraco}
              keyboardAppearance="dark"
              multiline
              textAlignVertical="top"
              maxLength={500}
              style={styles.campo}
              accessibilityLabel="Recado para a sua nutricionista"
            />

            {/* Discreto, e no fim do bloco que ele descreve: no topo virava um
                aviso legal que se lê uma vez e nunca mais. */}
            <View style={styles.nota}>
              <Ionicons name="people-outline" size={14} color={paleta().inkFraco} />
              <Text style={styles.textoNota}>
                Tudo acima vai para a sua nutricionista, se você tiver ligado o compartilhamento.
              </Text>
            </View>

            {/* ── O que NUNCA sai ──────────────────────────────────────── */}
            <View style={styles.privado}>
              <View style={styles.tituloPrivado}>
                <Ionicons name="lock-closed" size={15} color={paleta().cores.verde} />
                <Text style={styles.textoTituloPrivado}>Só seu</Text>
              </View>
              <Text style={styles.explicacaoPrivado}>
                Não vai para a sua nutricionista nem para ninguém, e não existe opção para ligar
                isso.
              </Text>

              <View style={styles.linhaSwitch}>
                <Text style={styles.rotuloSwitch}>Tive relação neste dia</Text>
                <Switch
                  value={d.relacao === true}
                  onValueChange={v =>
                    setD(x => ({
                      ...x,
                      relacao: v ? true : null,
                      /* Desligar a relação limpa a proteção: o banco recusa
                         proteção sem relação, e um "sim" solto na tela seria uma
                         resposta que ela não deu. */
                      relacaoProtegida: v ? x.relacaoProtegida : null,
                    }))
                  }
                  trackColor={{ false: paleta().cores.trilho, true: paleta().cores.verde }}
                  accessibilityLabel="Tive relação neste dia"
                />
              </View>

              {d.relacao === true && (
                <View style={styles.chipsPrivado}>
                  <Etiqueta
                    ativa={d.relacaoProtegida === true}
                    onPress={() =>
                      setD(x => ({
                        ...x,
                        relacaoProtegida: x.relacaoProtegida === true ? null : true,
                      }))
                    }
                    styles={styles}
                  >
                    com proteção
                  </Etiqueta>
                  <Etiqueta
                    ativa={d.relacaoProtegida === false}
                    onPress={() =>
                      setD(x => ({
                        ...x,
                        relacaoProtegida: x.relacaoProtegida === false ? null : false,
                      }))
                    }
                    styles={styles}
                  >
                    sem proteção
                  </Etiqueta>
                </View>
              )}

              <TextInput
                value={d.notaPrivada ?? ''}
                onChangeText={t => setD(x => ({ ...x, notaPrivada: t }))}
                placeholder="Nota só sua"
                placeholderTextColor={paleta().inkFraco}
                keyboardAppearance="dark"
                multiline
                textAlignVertical="top"
                maxLength={500}
                style={styles.campo}
                accessibilityLabel="Nota privada"
              />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  )
}

/* Uma categoria em UMA linha que rola de lado.
 *
 * Era um bloco com quebra de linha, e oito deles viravam vinte linhas de
 * rolagem — a parede que fez a tela ser chamada de péssima. Em linha, oito
 * categorias são oito linhas, e a tela cabe quase inteira. */
function Linha({
  titulo,
  children,
  styles,
}: {
  titulo: string
  children: React.ReactNode
  styles: ReturnType<typeof estilos>
}) {
  return (
    <View style={styles.categoria}>
      <Text style={styles.tituloCategoria}>{titulo}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.fileira}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  )
}

function Etiqueta({
  ativa,
  onPress,
  children,
  styles,
}: {
  ativa: boolean
  onPress: () => void
  children: React.ReactNode
  styles: ReturnType<typeof estilos>
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.etiqueta, ativa && styles.etiquetaAtiva]}
      accessibilityRole="button"
      accessibilityState={{ selected: ativa }}
    >
      <Text style={[styles.textoEtiqueta, ativa && styles.textoEtiquetaAtiva]}>{children}</Text>
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
      paddingBottom: 6,
    },
    botaoVoltar: { width: 60, height: 44, justifyContent: 'center' },
    tituloTela: { fontSize: 17, fontWeight: '800', color: t.cores.ink },
    /* Salvar no cabeçalho, e não no fim de uma rolagem de dez telas: quem marcou
       uma coisa não devia rolar até o fim para guardá-la. */
    botaoSalvar: { width: 60, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
    textoSalvar: { fontSize: 15, fontWeight: '800', color: t.cores.verde },

    conteudo: { paddingVertical: 6, gap: 14 },

    comeco: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
      paddingHorizontal: 15,
      paddingVertical: 14,
    },
    /* Fundo tingido e texto na cor, e não bloco vermelho cheio. Mesmo raciocínio
       do calendário: menstruação não é alarme. */
    comecoLigado: { backgroundColor: t.cores.cicloFundo, borderColor: t.cores.cicloForte },
    textoComeco: { flex: 1, fontSize: 14.5, fontWeight: '700', color: t.cores.ink },
    textoComecoLigado: { color: t.cores.cicloForte },

    categoria: { gap: 7 },
    tituloCategoria: {
      fontSize: 13,
      fontWeight: '800',
      color: t.cores.ink,
      paddingHorizontal: 20,
    },
    /* O padding fica no CONTEÚDO, e não na rolagem: no container, a primeira
       etiqueta seria cortada ao rolar de volta. */
    fileira: { paddingHorizontal: 20, gap: 8 },

    etiqueta: {
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
    },
    /* PREENCHIDA, e não contornada. Um contorno de 1px some no meio de doze
       etiquetas iguais, e a pessoa marcava sem ver o que marcou. */
    etiquetaAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    textoEtiqueta: { fontSize: 13.5, color: t.inkMedio, fontWeight: '600' },
    textoEtiquetaAtiva: { color: t.cores.branco, fontWeight: '800' },

    campo: {
      marginHorizontal: 20,
      backgroundColor: t.cores.cartao,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: t.cores.ink,
      minHeight: 72,
      lineHeight: 21,
    },

    nota: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 20 },
    textoNota: { flex: 1, fontSize: 11.5, color: t.inkFraco, lineHeight: 16 },

    privado: {
      marginHorizontal: 20,
      marginTop: 6,
      gap: 10,
      backgroundColor: t.cores.verdeClaro,
      borderRadius: 16,
      paddingVertical: 15,
    },
    tituloPrivado: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15 },
    textoTituloPrivado: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
    explicacaoPrivado: { fontSize: 12, color: t.inkMedio, lineHeight: 17, paddingHorizontal: 15 },
    linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15 },
    rotuloSwitch: { flex: 1, fontSize: 14.5, color: t.cores.ink },
    chipsPrivado: { flexDirection: 'row', gap: 8, paddingHorizontal: 15 },
  }),
)
