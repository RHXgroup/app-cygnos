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
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  diaVazio,
  type Digestao,
  type DiaDoCiclo as Dia,
  type Energia,
  type Fluxo,
  type Humor,
} from '../lib/ciclo'
import { estilosDe, paleta } from '../lib/tema'
import {
  relacaoDoDia,
  resumoDoDia,
  temAlgoAnotado,
} from '../lib/resumoDoDiaDoCiclo'

/* Um dia do calendário do ciclo.
 *
 * ── Duas versões erradas antes desta ──────────────────────────────────────
 * A PRIMEIRA era um formulário de nove blocos, e as etiquetas quebravam em duas
 * e três linhas: vinte linhas de rolagem para marcar uma cólica.
 *
 * A SEGUNDA trocou cada bloco por uma fileira que rolava de lado. Coube na
 * tela, e ficou pior — quem usou não achava mais nada: "fluxo aparece até
 * moderado, se eu quiser ver intenso tenho que arrastar; dor não cabe tudo,
 * lombar, cansaço e insônia eu não consigo ver". Rolagem lateral ESCONDE, e o
 * que está escondido não existe. Numa tela em que a pessoa passa três segundos,
 * a opção fora do quadro nunca é marcada.
 *
 * ── O que estava errado nas duas era a QUANTIDADE ─────────────────────────
 * Nove categorias não cabem de jeito nenhum: quebrando linha viram uma parede,
 * e em fileira viram um esconderijo. O conserto não era de desenho, era de
 * conteúdo — e a pergunta certa era "isto tudo precisa estar aqui?".
 *
 * Saíram três, e a tela passou a caber quebrando linha, que é o jeito que
 * mostra tudo de uma vez:
 *
 *   PELE      não muda conselho de nutrição nenhum. Era registro por registro.
 *   CABEÇA    dizia o mesmo que humor — "estressada" e "ansiosa" são a mesma
 *             marcação feita duas vezes, e duas perguntas para uma resposta é
 *             como se ensina alguém a parar de responder.
 *   SECREÇÃO  é o marcador de fertilidade de verdade, e só interessa a quem
 *             está tentando engravidar. Para todo o resto era uma pergunta
 *             íntima sem retorno nenhum. Volta no dia em que a intenção de
 *             engravidar estiver ligada na tela — a coluna continua no banco
 *             esperando por isso.
 *
 * Sobraram seis, e cada uma se justifica sozinha: FLUXO e DOR são o ciclo;
 * ENERGIA muda treino; DIGESTÃO e VONTADE DE COMER são nutrição pura, e são
 * onde este app tem o que os aplicativos de ciclo não têm; HUMOR é o que mais
 * se registra em qualquer um deles.
 *
 * As colunas que saíram da tela continuam indo e voltando do banco intactas —
 * o dia carregado entra no estado inteiro e é gravado inteiro. Quem já tinha
 * marcado "pele oleosa" não perde nada por a pergunta ter saído.
 *
 * ── A separação é a tela ──────────────────────────────────────────────────
 * Dois blocos, e a distância entre eles é o desenho todo:
 *
 *   O DE CIMA vai para a nutricionista, se ela ligou o compartilhamento.
 *   O DE BAIXO nunca sai — relação, proteção, nota privada. Não existe chave
 *   para ligar isso, e no banco a função que espelha não lê essas colunas.
 *
 * ── Por que nada é obrigatório ────────────────────────────────────────────
 * O objetivo é ela registrar, não preencher um formulário. Um dia com só
 * "cólica" marcado já vale, e é o que a maioria vai fazer. */

/* ── As categorias ─────────────────────────────────────────────────────────
 *
 * Cada uma delas tem a opção POSITIVA primeiro, e isso não é enfeite: sem ela,
 * só quem está mal registra, e o padrão que o app devolve sai sempre negativo.
 * A pessoa abre e lê que fica mal todo mês, porque os dias bons ela nunca teve
 * onde marcar. */

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

/* Só DOR. Inchaço, náusea e intestino ficam em "digestão" — a mesma informação
   em dois lugares apareceria duas vezes na ficha dela. */
const SINTOMAS = [
  'cólica',
  'dor de cabeça',
  'seio dolorido',
  'dor de ovulação',
  'dor lombar',
  'cansaço',
  'insônia',
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

const HUMORES: { valor: Humor; rotulo: string }[] = [
  { valor: 'bem', rotulo: 'bem' },
  { valor: 'feliz', rotulo: 'feliz' },
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
  ehFertil,
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
  /* Se este dia cai na janela fértil estimada.
   *
   * O calendário já pintava o ponto e o painel não dizia nada — quem tocasse
   * num dia marcado abria uma tela que nunca explicava o que a marca queria
   * dizer. Vem PRONTO de cima, e não calculado aqui: quem sabe a janela é a
   * tela do ciclo, que tem a previsão e a duração medida. */
  ehFertil: boolean
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

  /* VER primeiro, EDITAR depois.
   *
   * Tocar num dia abria o editor, sempre. Para um dia em branco está certo —
   * ela tocou para anotar. Para um dia já preenchido está errado: ela tocou
   * para ver, e recebia um formulário com seis categorias de etiqueta para
   * atravessar até achar o que ela mesma já tinha respondido.
   *
   * Ver é o gesto comum; editar é a exceção. */
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    /* Reabrir sempre começa no resumo — mesmo que a última vez tenha terminado
       no editor. Herdar o modo faria o painel abrir diferente conforme o que
       ela fez ontem, e ninguém consegue prever uma tela assim. */
    if (visivel) setEditando(false)
    if (visivel) setD(dia ?? diaVazio(data))
  }, [visivel, data, dia])

  const alternar = (lista: string[], item: string) =>
    lista.includes(item) ? lista.filter(x => x !== item) : [...lista, item]

  /* Uma categoria de escolha única.
     Tocar no que já está marcado desmarca — é o único jeito de voltar atrás num
     campo opcional, e "marquei sem querer" acontece. */
  const umaEscolha = <T extends string>(
    titulo: string,
    opcoes: { valor: T; rotulo: string }[],
    atual: T | null,
    ao: (v: T | null) => void,
  ) => (
    <Categoria titulo={titulo} styles={styles}>
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
    </Categoria>
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
                cálculo inteiro, e é o que a pessoa veio marcar quando abre um
                dia do passado.

                Uma LINHA, e não o bloco vermelho que ocupava o topo. O bloco era
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

            {/* A JANELA FERTIL, quando o dia cai nela.
                O calendario ja pintava o ponto e este painel nao dizia nada:
                quem tocasse num dia marcado abria uma tela que nunca explicava
                o que a marca queria dizer.

                Com a ressalva junto, e nao escondida numa tela acima. A frase
                e a mesma do cartao do ciclo, de proposito: duas redacoes para
                a mesma estimativa fariam uma delas parecer mais firme. */}
            {ehFertil && (
              <View style={styles.fertil}>
                <Ionicons name="ellipse" size={9} color={paleta().cores.cicloForte} />
                <Text style={styles.textoFertil}>
                  Dia dentro da <Text style={styles.forteFertil}>janela fértil estimada</Text>.
                  Estimativa pelas suas datas, erra por dias, e não serve como método
                  contraceptivo.
                </Text>
              </View>
            )}

            {!editando && temAlgoAnotado(dia) ? (
              <>
                {resumoDoDia(dia).map(l => (
                  <View key={l.rotulo} style={styles.linhaResumo}>
                    <Text style={styles.rotuloResumo}>{l.rotulo}</Text>
                    <Text style={styles.valorResumo}>{l.valor}</Text>
                  </View>
                ))}

                {/* A relação fica por último e separada. Este dado nunca sai do
                    aparelho — a função que espelha para a nutricionista não o
                    copia, e isso é garantido pela AUSÊNCIA de código lá. */}
                {relacaoDoDia(dia) !== null && (
                  <View style={styles.linhaResumo}>
                    <Ionicons name="heart" size={14} color={paleta().cores.cicloForte} />
                    <Text style={styles.valorResumo}>{relacaoDoDia(dia)}</Text>
                  </View>
                )}

                <Pressable
                  onPress={() => setEditando(true)}
                  style={({ pressed }) => [styles.botaoEditar, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={17} color={paleta().cores.ink} />
                  <Text style={styles.textoEditar}>Editar este dia</Text>
                </Pressable>
              </>
            ) : (
              <>
            {/* ── O QUE NUNCA SAI vem ANTES dos sintomas ──────────────────
                Estava no fim, depois de fluxo, dor, energia, digestão, humor e
                vontade de comer. Quem só queria marcar que teve relação tinha de
                passar por seis perguntas que não ia responder, e desistia antes —
                concluindo que a marcação não existe. Ela existia, e estava a seis
                seções de distância.

                Os sintomas continuam logo abaixo, para quem quer detalhar. O que
                muda é que responder virou escolha em vez de pedágio. */}
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

            {/* O aviso do compartilhamento vira CABEÇALHO em vez de rodapé.
                Como rodapé ele dizia "tudo ACIMA vai para a nutricionista", e essa
                palavra prendia a ordem: o bloco privado era obrigado a vir depois.
                Dito no topo, ele descreve o bloco que encabeça, e a ordem fica
                livre para seguir o que a pessoa mais faz. */}
            <View style={styles.nota}>
              <Ionicons name="people-outline" size={14} color={paleta().inkFraco} />
              <Text style={styles.textoNota}>
                Daqui para baixo vai para a sua nutricionista, se você tiver ligado o
                compartilhamento.
              </Text>
            </View>

            {umaEscolha('Fluxo', FLUXOS, d.fluxo, v => setD(x => ({ ...x, fluxo: v })))}

            <Categoria titulo="Dor" styles={styles}>
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
            </Categoria>

            {umaEscolha('Energia', ENERGIAS, d.energia, v => setD(x => ({ ...x, energia: v })))}
            {umaEscolha('Digestão', DIGESTOES, d.digestao, v => setD(x => ({ ...x, digestao: v })))}
            {umaEscolha('Humor', HUMORES, d.humor, v => setD(x => ({ ...x, humor: v })))}

            {/* O campo que nenhum app de ciclo tem e nenhum app de nutrição tem.
                Só faz sentido onde os dois moram juntos. */}
            <Categoria titulo="Vontade de comer" styles={styles}>
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
            </Categoria>

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



              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  )
}

/* Uma categoria, com as etiquetas QUEBRANDO LINHA.
 *
 * Já foi fileira que rolava de lado, e foi pior: cabia na tela e escondia
 * metade das opções. Quebrar linha mostra tudo de uma vez, que é o que uma tela
 * de marcação precisa fazer — e só ficou possível porque três categorias
 * saíram. */
function Categoria({
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
      <View style={styles.etiquetas}>{children}</View>
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
  /* ── O resumo do dia ──
     Linhas de leitura, e não campos. O rótulo mais fraco que o valor: quem
     abriu veio ver O QUE ela anotou, e não a lista de perguntas. */
  linhaResumo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: t.cores.borda,
  },
  rotuloResumo: { fontSize: 12.5, color: t.inkFraco, width: 108 },
  valorResumo: { flex: 1, fontSize: 14, fontWeight: '600', color: t.cores.ink },
  botaoEditar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    backgroundColor: t.cores.cartao,
  },
  textoEditar: { fontSize: 15, fontWeight: '700', color: t.cores.ink },

  fertil: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: t.cores.superficie,
    borderWidth: 1,
    borderColor: t.cores.borda,
  },
  textoFertil: { flex: 1, fontSize: 11.5, lineHeight: 16.5, color: t.inkMedio },
  forteFertil: { fontWeight: '800', color: t.cores.ink },

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
    /* Salvar no cabeçalho, e não no fim de uma rolagem: quem marcou uma coisa
       não devia rolar até o fim para guardá-la. */
    botaoSalvar: { width: 60, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
    textoSalvar: { fontSize: 15, fontWeight: '800', color: t.cores.verde },

    conteudo: { paddingHorizontal: 20, paddingVertical: 6, gap: 16 },

    comeco: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
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

    categoria: { gap: 8 },
    tituloCategoria: { fontSize: 13, fontWeight: '800', color: t.cores.ink },
    etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },

    /* Compactas de propósito: sete etiquetas de dor precisam caber em duas
       linhas, e cada pixel de padding aqui vira uma linha a mais lá embaixo. */
    etiqueta: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.cores.borda,
      backgroundColor: t.cores.cartao,
    },
    /* PREENCHIDA, e não contornada. Um contorno de 1px some no meio de doze
       etiquetas iguais, e a pessoa marcava sem ver o que marcou. */
    etiquetaAtiva: { backgroundColor: t.cores.verde, borderColor: t.cores.verde },
    textoEtiqueta: { fontSize: 13, color: t.inkMedio, fontWeight: '600' },
    textoEtiquetaAtiva: { color: t.cores.branco, fontWeight: '800' },

    campo: {
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

    nota: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    textoNota: { flex: 1, fontSize: 11.5, color: t.inkFraco, lineHeight: 16 },

    privado: {
      marginTop: 2,
      gap: 10,
      backgroundColor: t.cores.verdeClaro,
      borderRadius: 16,
      padding: 15,
    },
    tituloPrivado: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    textoTituloPrivado: { fontSize: 14.5, fontWeight: '800', color: t.cores.ink },
    explicacaoPrivado: { fontSize: 12, color: t.inkMedio, lineHeight: 17 },
    linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rotuloSwitch: { flex: 1, fontSize: 14.5, color: t.cores.ink },
    chipsPrivado: { flexDirection: 'row', gap: 8 },
  }),
)
