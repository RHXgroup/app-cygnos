import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  INICIAIS_DA_SEMANA,
  NOMES_DOS_MESES,
  marcaDoDia,
  mesDe,
  podeAvancar,
  primeiroDiaDaSemana,
  type Marca,
} from '../lib/calendarioDoCiclo'
import { estilosDe, paleta } from '../lib/tema'

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
          const fertil = ferteis.has(d.data) && marca !== 'menstruada'
          const escolhido = d.data === selecionado
          return (
            <Pressable
              key={d.data}
              onPress={() => onSelecionar(d.data)}
              disabled={d.futuro}
              style={styles.celula}
              accessibilityRole="button"
              accessibilityState={{ selected: escolhido, disabled: d.futuro }}
              accessibilityLabel={`Dia ${d.dia}${
                marca === 'menstruada' ? ', menstruada' : marca === 'previsto' ? ', previsto' : ''
              }${fertil ? ', janela fértil' : ''}`}
            >
              <View
                style={[
                  styles.dia,
                  marca === 'menstruada' && styles.diaMenstruada,
                  marca === 'previsto' && styles.diaPrevisto,
                  fertil && styles.diaFertil,
                  d.ehHoje && styles.diaHoje,
                  escolhido && styles.diaEscolhido,
                ]}
              >
                <Text
                  style={[
                    styles.numero,
                    d.futuro && styles.numeroFuturo,
                    marca === 'menstruada' && styles.numeroClaro,
                    escolhido && styles.numeroClaro,
                  ]}
                >
                  {d.dia}
                </Text>
              </View>
              {/* O ponto de "tem anotação" só aparece quando o dia não está
                  pintado por outra coisa — senão vira sujeira em cima da cor. */}
              {marca === 'anotado' && <View style={styles.ponto} />}
            </Pressable>
          )
        })}
      </View>

      <View style={styles.legenda}>
        <Item cor={paleta().cores.erroTexto} texto="menstruada" styles={styles} />
        <Item cor={paleta().cores.erroBorda} texto="previsto" styles={styles} />
        <Item cor={paleta().cores.verdeClaro} texto="janela fértil" styles={styles} />
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
    celula: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
    dia: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    diaMenstruada: { backgroundColor: t.cores.erroTexto },
    diaPrevisto: { borderWidth: 1.5, borderColor: t.cores.erroBorda, borderStyle: 'dashed' },
    diaFertil: { backgroundColor: t.cores.verdeClaro },
    diaHoje: { borderWidth: 1.5, borderColor: t.cores.ink },
    diaEscolhido: { backgroundColor: t.cores.verde },
    numero: { fontSize: 14, fontWeight: '600', color: t.cores.ink },
    numeroFuturo: { color: t.inkFraco },
    numeroClaro: { color: t.cores.branco, fontWeight: '800' },
    ponto: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.cores.verde,
      marginTop: 1,
    },

    legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
    itemLegenda: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    bolinhaLegenda: { width: 9, height: 9, borderRadius: 5 },
    textoLegenda: { fontSize: 11, color: t.inkFraco },
  }),
)
