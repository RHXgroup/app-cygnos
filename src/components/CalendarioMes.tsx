import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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

/* O raio das pontas da faixa. Metade da altura dela, para a ponta virar um
   semicírculo perfeito em vez de um canto arredondado. */
const RAIO = 16

/* O calendário do mês, com os dias pintados.
 *
 * ── Por que ele existe ────────────────────────────────────────────────────
 * A primeira versão da tela de ciclo só tinha "minha menstruação começou hoje".
 * Quem lembra na quinta que menstruou na segunda não tinha como dizer isso — e
 * lembrar na quinta é o caso comum, não a exceção. Um controle de ciclo em que
 * só dá para registrar hoje não é controle de ciclo.
 *
 * ── O que ele pinta, e a ordem ────────────────────────────────────────────
 * O que ela REGISTROU vence o que o app previu, sempre. Um dia pintado de
 * "previsto" por cima de um que ela marcou faria o app discordar dela na cara
 * dela.
 *
 * ── O futuro é tocável, mas não registrável ───────────────────────────────
 * Dá para ver o mês que vem — é onde a previsão aparece —, e não dá para marcar
 * um dia que ainda não aconteceu. Registrar o futuro é a única entrada que
 * envenena a mediana sem ninguém perceber. */

export function CalendarioMes({
  ano,
  mes,
  hoje,
  menstruada,
  previstos,
  ferteis,
  anotados,
  selecionado,
  onSelecionar,
  onTrocarMes,
}: {
  ano: number
  mes: number
  hoje: string
  menstruada: Set<string>
  previstos: Set<string>
  /* A janela fértil estimada. Só sai quando há previsão de verdade. */
  ferteis: Set<string>
  /* Dias com alguma anotação — desenha um ponto embaixo do número. */
  anotados: Set<string>
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
        <Pressable
          onPress={() => onTrocarMes(-1)}
          style={styles.seta}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Mês anterior"
        >
          <Ionicons name="chevron-back" size={20} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.titulo}>
          {NOMES_DOS_MESES[mes - 1]} {ano}
        </Text>
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
            size={20}
            color={podeIrAdiante ? paleta().cores.ink : paleta().inkFraco}
          />
        </Pressable>
      </View>

      <View style={styles.semana}>
        {INICIAIS_DA_SEMANA.map((s, i) => (
          <Text key={i} style={styles.inicial}>
            {s}
          </Text>
        ))}
      </View>

      <View style={styles.grade}>
        {/* Os espaços antes do dia 1. Sem eles o mês inteiro sai deslocado, e
            um calendário deslocado é pior do que nenhum: a pessoa marca o dia
            errado achando que marcou o certo. */}
        {Array.from({ length: vazios }, (_, i) => (
          <View key={`vazio-${i}`} style={styles.celula} />
        ))}

        {dias.map(d => {
          const marca: Marca = marcaDoDia(d.data, menstruada, previstos, anotados)
          const ehMenstruada = marca === 'menstruada'
          const fertil = ferteis.has(d.data) && !ehMenstruada
          const escolhido = d.data === selecionado
          const temAnotacao = anotados.has(d.data)

          /* A FAIXA. Cinco dias de menstruação viram uma barra contínua,
             arredondada nas pontas — e não cinco bolinhas soltas. A diferença
             não é enfeite: a faixa mostra que aquilo é um período, e as
             bolinhas mostram cinco eventos sem relação. É o que os aplicativos
             de ciclo bons fazem, e o que faltava aqui. */
          const forma = ehMenstruada
            ? formaNaFaixa(d.data, menstruada)
            : previstos.has(d.data)
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
                ehMenstruada ? ', menstruada' : marca === 'previsto' ? ', previsto' : ''
              }${fertil ? ', janela fértil' : ''}${temAnotacao ? ', com anotação' : ''}`}
            >
              {/* A faixa é uma camada ATRÁS do número e ocupa a célula inteira
                  na horizontal, para encostar na vizinha. Sem isso sobraria um
                  vão entre os dias e a barra sairia picotada. */}
              <View
                style={[
                  styles.faixa,
                  ehMenstruada && styles.faixaMenstruada,
                  marca === 'previsto' && styles.faixaPrevista,
                  (ehMenstruada || marca === 'previsto') && {
                    borderTopLeftRadius: abre ? RAIO : 0,
                    borderBottomLeftRadius: abre ? RAIO : 0,
                    borderTopRightRadius: fecha ? RAIO : 0,
                    borderBottomRightRadius: fecha ? RAIO : 0,
                    marginLeft: abre ? 3 : 0,
                    marginRight: fecha ? 3 : 0,
                  },
                ]}
              />

              <View
                style={[
                  styles.dia,
                  /* O dia registrado ganha o círculo cheio POR CIMA da faixa
                     clara: a faixa diz "este período", e o círculo diz "este
                     dia". Sem os dois, ou some o período ou some o dia. */
                  ehMenstruada && styles.diaMenstruada,
                  /* O anel verde da janela fértil é fino e por fora, e não um
                     bloco cheio: ela é ESTIMATIVA, e um preenchimento sólido
                     pareceria tão certo quanto o dia que ela registrou. */
                  fertil && styles.diaFertil,
                  d.ehHoje && styles.diaHoje,
                  escolhido && styles.diaEscolhido,
                ]}
              >
                <Text
                  style={[
                    styles.numero,
                    d.futuro && styles.numeroFuturo,
                    ehMenstruada && styles.numeroClaro,
                    escolhido && styles.numeroClaro,
                  ]}
                >
                  {d.dia}
                </Text>
              </View>

              {/* O ponto de "tem anotação" aparece SEMPRE, inclusive em cima da
                  faixa — só troca de cor para continuar visível.

                  Antes ele era escondido quando o dia estava pintado, e o
                  efeito foi este: registrar uma coisa no primeiro dia da
                  menstruação não devolvia sinal nenhum na tela. A pessoa salvou
                  e o app não mostrou nada. */}
              <View
                style={[
                  styles.ponto,
                  !temAnotacao && styles.pontoInvisivel,
                  ehMenstruada && styles.pontoClaro,
                ]}
              />
            </Pressable>
          )
        })}
      </View>

      <View style={styles.legenda}>
        <Item cor={paleta().cores.cicloForte} texto="menstruada" styles={styles} />
        <Item cor={paleta().cores.cicloPrevisto} texto="previsto" styles={styles} />
        <Item cor={paleta().cores.verde} texto="janela fértil" styles={styles} />
        <Item cor={paleta().inkFraco} texto="com anotação" styles={styles} />
      </View>
    </View>
  )
}

function Item({
  cor,
  texto,
  styles,
}: {
  cor: string
  texto: string
  styles: ReturnType<typeof estilos>
}) {
  return (
    <View style={styles.itemLegenda}>
      <View style={[styles.bolinhaLegenda, { backgroundColor: cor }]} />
      <Text style={styles.textoLegenda}>{texto}</Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    bloco: {
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cores.borda,
      padding: 12,
      gap: 8,
    },
    cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    seta: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
    titulo: { fontSize: 15.5, fontWeight: '800', color: t.cores.ink },

    semana: { flexDirection: 'row' },
    inicial: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: t.inkFraco,
    },

    grade: { flexDirection: 'row', flexWrap: 'wrap' },
    /* 14,28% é 1/7. Percentual, e não largura fixa: em aparelho estreito uma
       largura fixa empurraria o sétimo dia para a linha de baixo, e o mês
       inteiro sairia torto. */
    celula: {
      width: '14.28%',
      alignItems: 'center',
      justifyContent: 'center',
      height: 46,
    },
    /* A camada da faixa, atrás de tudo. Ocupa a célula inteira na horizontal
       para encostar na vizinha e formar a barra contínua. */
    faixa: { ...StyleSheet.absoluteFillObject, top: 4, bottom: 10 },
    faixaMenstruada: { backgroundColor: t.cores.cicloFundo },
    faixaPrevista: {
      borderTopWidth: 1.5,
      borderBottomWidth: 1.5,
      borderColor: t.cores.cicloPrevisto,
      borderStyle: 'dashed',
    },

    dia: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /* Anel fino, e não bloco cheio: a janela fértil é ESTIMATIVA, e preenchida
       pareceria tão certa quanto o dia que ela registrou. */
    diaMenstruada: { backgroundColor: t.cores.cicloForte },
    diaFertil: { borderWidth: 1.5, borderColor: t.cores.verde },
    diaHoje: { borderWidth: 2, borderColor: t.cores.ink },
    diaEscolhido: { backgroundColor: t.cores.verde },
    numero: { fontSize: 14.5, fontWeight: '600', color: t.cores.ink },
    numeroFuturo: { color: t.inkFraco },
    numeroClaro: { color: t.cores.branco, fontWeight: '800' },
    ponto: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: t.cores.verde,
      marginTop: 3,
    },
    /* Invisível, e não ausente: sem ocupar o mesmo espaço sempre, o número
       pularia para cima e para baixo conforme o dia tem anotação ou não. */
    pontoInvisivel: { opacity: 0 },
    pontoClaro: { backgroundColor: t.cores.branco },

    legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
    itemLegenda: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    bolinhaLegenda: { width: 9, height: 9, borderRadius: 5 },
    textoLegenda: { fontSize: 11, color: t.inkFraco },
  }),
)
