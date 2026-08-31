import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  INICIAIS_DA_SEMANA,
  NOMES_DOS_MESES,
  formaNaFaixa,
  marcaDoDia,
  mesDe,
  podeAvancar,
  primeiroDiaDaSemana,
  type Marca,
} from '../lib/calendarioDoCiclo'
import { estilosDe, paleta } from '../lib/tema'

/* O calendário do mês.
 *
 * ── O desenho, e por que ele mudou ────────────────────────────────────────
 * A primeira versão tinha, na MESMA célula, um círculo cheio + uma faixa + uma
 * borda tracejada + um anel verde + um ponto + um coração. Seis sistemas
 * visuais brigando por 34 pixels, e quem usou leu como "velho" e "vermelho
 * demais".
 *
 * Agora o dia de menstruação é só FUNDO TINGIDO com o número na cor. Sem
 * círculo cheio e sem número branco — branco sobre vermelho é vocabulário de
 * alerta, e menstruação não é alerta. É o que Apple Saúde e Clue fazem.
 *
 * O único preenchimento forte da tela é HOJE, em tinta neutra. Um por tela é o
 * que faz ele significar alguma coisa; três não significam nenhum.
 *
 * ── E o dia selecionado deixou de ser uma caixa ───────────────────────────
 * Ele tinha um anel próprio, e quem usou leu como "um negócio quadrado quando
 * eu seleciono um dia". Dois contornos na mesma célula — o anel de hoje e o de
 * selecionado — brigam, e o de selecionado ainda ganhava do que a célula
 * significa.
 *
 * Agora o selecionado é só o número em NEGRITO. É suficiente porque o dia
 * selecionado nunca está sozinho: ou a folha dele está aberta por cima, ou o
 * cartão logo abaixo já está mostrando o que tem nele.
 *
 * ── O que saiu ────────────────────────────────────────────────────────────
 * A borda tracejada do previsto (truque de 2010, e chamava mais atenção que o
 * dia registrado), o anel verde da janela fértil (virou ponto embaixo), a
 * moldura do cartão (era mais uma linha competindo com as sete da grade) e a
 * legenda de quatro itens — as cores se explicam, e ela era a maior fonte de
 * ruído da tela.
 *
 * E o verde parou de fazer três trabalhos: era fértil, era selecionado e era
 * anotação. Agora é só fértil.
 *
 * ── O que ele pinta, e a ordem ────────────────────────────────────────────
 * O que ela REGISTROU vence o que o app previu, sempre. Um dia pintado de
 * "previsto" por cima de um que ela marcou faria o app discordar dela na cara
 * dela.
 *
 * ── O futuro é visível, e não registrável ─────────────────────────────────
 * Dá para ver o mês que vem — é onde a previsão aparece —, e não dá para marcar
 * um dia que ainda não aconteceu. Registrar o futuro é a única entrada que
 * envenena a mediana sem ninguém perceber. */

/* O raio das pontas da faixa. Metade da altura dela, para a ponta virar um
   semicírculo em vez de um canto arredondado. */
const RAIO = 15

export function CalendarioMes({
  ano,
  mes,
  hoje,
  menstruada,
  previstos,
  ferteis,
  anotados,
  comRelacao,
  selecionado,
  onSelecionar,
  onTrocarMes,
}: {
  ano: number
  mes: number
  hoje: string
  /* Dias em que ela menstruou. Quando não marcou o fim, são os dias de fluxo
     que já aconteceram — a faixa cheia. */
  menstruada: Set<string>
  /* A próxima menstruação prevista, MAIS o resto do fluxo deste ciclo que ainda
     deve vir. Os dois no tom fraco, pela mesma razão: ainda não aconteceram. */
  previstos: Set<string>
  /* A janela fértil estimada. Só sai quando há previsão de verdade. */
  ferteis: Set<string>
  /* Dias com alguma anotação clínica — desenha um ponto embaixo do número. */
  anotados: Set<string>
  /* Dias com relação registrada — desenha um coração.
   *
   * Marca própria, e não mais um ponto, porque é o que a pessoa procura no
   * calendário quando volta: é o único registro que ela faz para lembrar de uma
   * data, e não para descrever como se sentiu. Gota para fluxo, coração para
   * relação e carinha para humor é o vocabulário que Clue e Flo já usam. */
  comRelacao: Set<string>
  selecionado: string | null
  onSelecionar: (data: string) => void
  onTrocarMes: (passo: -1 | 1) => void
}) {
  const styles = estilos()
  const dias = mesDe(ano, mes, hoje)
  const vazios = primeiroDiaDaSemana(ano, mes)
  const podeIrAdiante = podeAvancar(ano, mes, hoje)

  return (
    <View style={styles.bloco}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>
          {NOMES_DOS_MESES[mes - 1]} {ano}
        </Text>
        <View style={styles.setas}>
          <Pressable
            onPress={() => onTrocarMes(-1)}
            style={styles.seta}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
          >
            <Ionicons name="chevron-back" size={19} color={paleta().inkMedio} />
          </Pressable>
          <Pressable
            onPress={() => podeIrAdiante && onTrocarMes(1)}
            disabled={!podeIrAdiante}
            style={styles.seta}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
          >
            <Ionicons
              name="chevron-forward"
              size={19}
              color={podeIrAdiante ? paleta().inkMedio : paleta().inkFraco}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.semana}>
        {INICIAIS_DA_SEMANA.map((s, i) => (
          <Text key={i} style={styles.inicial}>
            {s}
          </Text>
        ))}
      </View>

      <View style={styles.grade}>
        {/* Os espaços antes do dia 1. Sem eles o mês inteiro sai deslocado, e um
            calendário deslocado é pior do que nenhum: a pessoa marca o dia
            errado achando que marcou o certo. */}
        {Array.from({ length: vazios }, (_, i) => (
          <View key={`vazio-${i}`} style={styles.celula} />
        ))}

        {dias.map(d => {
          const marca: Marca = marcaDoDia(d.data, menstruada, previstos, anotados)
          const ehMenstruada = marca === 'menstruada'
          const ehPrevisto = marca === 'previsto'
          const fertil = ferteis.has(d.data) && !ehMenstruada
          const escolhido = d.data === selecionado
          const temAnotacao = anotados.has(d.data)
          const teveRelacao = comRelacao.has(d.data)

          /* A FAIXA. Os dias de menstruação viram uma barra contínua tingida,
             arredondada nas pontas — e não círculos soltos. A faixa mostra que
             aquilo é um período; os círculos mostravam eventos sem relação.

             A forma depende dos vizinhos, e a quebra de semana tem regra
             própria: sábado fecha à direita e domingo abre à esquerda mesmo com
             o vizinho marcado, senão a barra atravessaria a borda da grade. */
          const forma = ehMenstruada
            ? formaNaFaixa(d.data, menstruada)
            : ehPrevisto
              ? formaNaFaixa(d.data, previstos)
              : 'sozinho'
          const abre = forma === 'sozinho' || forma === 'inicio'
          const fecha = forma === 'sozinho' || forma === 'fim'

          return (
            <Pressable
              key={d.data}
              onPress={() => onSelecionar(d.data)}
              disabled={d.futuro}
              style={styles.celula}
              accessibilityRole="button"
              accessibilityState={{ selected: escolhido, disabled: d.futuro }}
              accessibilityLabel={`Dia ${d.dia}${
                ehMenstruada ? ', menstruada' : ehPrevisto ? ', previsto' : ''
              }${fertil ? ', janela fértil' : ''}${temAnotacao ? ', com anotação' : ''}${
                teveRelacao ? ', com relação' : ''
              }`}
            >
              {(ehMenstruada || ehPrevisto) && (
                <View
                  style={[
                    styles.faixa,
                    ehMenstruada ? styles.faixaMenstruada : styles.faixaPrevista,
                    {
                      borderTopLeftRadius: abre ? RAIO : 0,
                      borderBottomLeftRadius: abre ? RAIO : 0,
                      borderTopRightRadius: fecha ? RAIO : 0,
                      borderBottomRightRadius: fecha ? RAIO : 0,
                      marginLeft: abre ? 4 : 0,
                      marginRight: fecha ? 4 : 0,
                    },
                  ]}
                />
              )}

              {/* Um contorno só na tela, e ele é o de hoje. O anel do dia
                  selecionado saiu daqui: dois contornos na mesma célula brigam,
                  e o segundo lia como caixa quadrada. */}
              <View style={[styles.dia, d.ehHoje && styles.diaHoje]}>
                <Text
                  style={[
                    styles.numero,
                    ehMenstruada && styles.numeroMenstruada,
                    ehPrevisto && styles.numeroPrevisto,
                    d.futuro && !ehPrevisto && styles.numeroFuturo,
                    d.ehHoje && styles.numeroHoje,
                    escolhido && styles.numeroEscolhido,
                  ]}
                >
                  {d.dia}
                </Text>
              </View>

              {/* As marcas, embaixo do número. Altura fixa mesmo vazia, senão o
                  número pula de linha conforme o dia tem marca ou não, e o mês
                  inteiro fica desalinhado. */}
              <View style={styles.marcas}>
                {fertil && <View style={styles.pontoFertil} />}
                {teveRelacao && (
                  <Ionicons name="heart" size={9} color={paleta().cores.cicloForte} />
                )}
                {temAnotacao && <View style={styles.pontoAnotado} />}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    /* Sem borda e sem cartão: o calendário respira contra o fundo da tela. A
       moldura era mais uma linha competindo com as sete da grade. */
    bloco: { gap: 10, paddingVertical: 4 },

    cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    /* Alinhado à esquerda e grande: é um título, e não um rótulo espremido
       entre duas setas. */
    titulo: { fontSize: 18, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
    setas: { flexDirection: 'row', gap: 4 },
    seta: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },

    semana: { flexDirection: 'row' },
    inicial: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: t.inkFraco,
      letterSpacing: 0.5,
    },

    grade: { flexDirection: 'row', flexWrap: 'wrap' },
    /* 14,28% é 1/7. Percentual, e não largura fixa: em aparelho estreito uma
       largura fixa empurraria o sétimo dia para a linha de baixo, e o mês
       inteiro sairia torto. */
    celula: {
      width: '14.28%',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
    },
    /* A camada da faixa, atrás do número. Ocupa a célula inteira na horizontal
       para encostar na vizinha e formar a barra contínua. */
    faixa: { ...StyleSheet.absoluteFillObject, top: 6, bottom: 12 },
    faixaMenstruada: { backgroundColor: t.cores.cicloFundo },
    /* Previsto é a MESMA faixa, mais fraca. A borda tracejada de antes era
       truque de 2010, e chamava mais atenção do que o dia registrado. */
    faixaPrevista: { backgroundColor: t.cores.cicloFundo, opacity: 0.45 },

    dia: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    diaHoje: { backgroundColor: t.cores.ink, borderRadius: 15 },

    numero: { fontSize: 14.5, fontWeight: '600', color: t.cores.ink },
    /* Número NA COR, e não branco sobre preenchimento. Branco sobre vermelho é
       vocabulário de alerta, e menstruação não é alerta. */
    numeroMenstruada: { color: t.cores.cicloForte, fontWeight: '800' },
    numeroPrevisto: { color: t.cores.cicloPrevisto, fontWeight: '700' },
    numeroFuturo: { color: t.inkFraco },
    numeroHoje: { color: t.cores.branco, fontWeight: '800' },
    /* O selecionado é só o peso da fonte. Ele nunca precisa se defender sozinho:
       ou a folha do dia está aberta por cima, ou o cartão abaixo do calendário
       está mostrando o que tem nele. */
    numeroEscolhido: { fontWeight: '900' },

    marcas: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      height: 10,
      marginTop: 1,
    },
    /* A janela fértil virou ponto, e não anel: ela é ESTIMATIVA, e um anel em
       volta do número pesava tanto quanto o dia que ela registrou. */
    pontoFertil: { width: 4, height: 4, borderRadius: 2, backgroundColor: t.cores.verde },
    pontoAnotado: { width: 4, height: 4, borderRadius: 2, backgroundColor: t.inkFraco },
  }),
)
