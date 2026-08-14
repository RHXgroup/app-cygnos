import { useMemo, useState } from 'react'
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  ANGULOS,
  angulosComFoto,
  dataDaSessao,
  distanciaEntre,
  fotoDoAngulo,
  rotuloCurtoDoAngulo,
  sessoesComAngulo,
  type AnguloFoto,
  type SessaoDeFotos,
} from '../lib/fotos'
import { cores, inkFraco, inkSuave } from '../theme'

/* A comparação das fotos de evolução — montada pela PESSOA.
 *
 * A tela não decide o que vale a pena comparar. Ela abre no par mais óbvio (a
 * primeira foto contra a mais recente, que é o arco inteiro) e a partir daí sai
 * da frente: qualquer data contra qualquer data, em qualquer ângulo. Comparar
 * dois meses seguidos do meio do tratamento, ou a mesma data consigo mesma para
 * só olhar de perto, são escolhas legítimas — e nenhuma delas é impedida aqui.
 *
 * O que a tela NÃO faz é inventar sentido: não calcula progresso, não diz se
 * melhorou, não põe seta para cima. Quem lê essas fotos é a pessoa, e quem
 * interpreta é a nutricionista dela. */
export function ComparativoFotos({ sessoes }: { sessoes: SessaoDeFotos[] }) {
  const angulos = useMemo(() => angulosComFoto(sessoes), [sessoes])

  const [angulo, setAngulo] = useState<AnguloFoto>(angulos[0] ?? 'frente')

  const doAngulo = useMemo(() => sessoesComAngulo(sessoes, angulo), [sessoes, angulo])

  /* Guardadas por id da consulta, e não por posição: ao trocar de ângulo a lista
     muda de tamanho, e um índice apontaria para outra data sem avisar. */
  const [antesId, setAntesId] = useState<number | null>(null)
  const [depoisId, setDepoisId] = useState<number | null>(null)

  /* A escolha da pessoa vale enquanto existir neste ângulo. Quando ela troca
     para um ângulo que a nutricionista só fotografou duas vezes, o que sobra é
     cair no par mais óbvio de novo — melhor do que uma metade vazia. */
  const antes = doAngulo.find(s => s.consultaId === antesId) ?? doAngulo[0]
  const depois = doAngulo.find(s => s.consultaId === depoisId) ?? doAngulo[doAngulo.length - 1]

  const [ampliada, setAmpliada] = useState<{ url: string; legenda: string } | null>(null)

  if (angulos.length === 0) return null

  /* Uma sessão só não é comparação: `antes` e `depois` caem na mesma foto, e
     mostrá-la duas vezes lado a lado com "no mesmo dia" embaixo seria a tela
     fingindo um par que não existe. Uma foto, do tamanho de uma foto. */
  const soUma = doAngulo.length < 2
  const intervalo = soUma ? null : distanciaEntre(antes?.data ?? null, depois?.data ?? null)

  return (
    <>
      {angulos.length > 1 && (
        <>
          <Text style={styles.rotuloBloco}>Ângulo</Text>
          <View style={styles.fitas}>
            {angulos.map(a => {
              const aberto = a === angulo
              return (
                <Pressable
                  key={a}
                  onPress={() => setAngulo(a)}
                  style={[styles.fita, aberto && styles.fitaAberta]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: aberto }}
                  accessibilityLabel={ANGULOS.find(x => x.chave === a)?.rotulo ?? a}
                >
                  <Text style={[styles.textoFita, aberto && styles.textoFitaAberto]}>
                    {rotuloCurtoDoAngulo(a)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </>
      )}

      {/* As fotos vêm ANTES dos seletores: é o que a pessoa veio ver, e empurrar
          a comparação para baixo de duas fitas de data faria ela rolar a tela
          para encontrar o próprio corpo. */}
      {soUma ? (
        <View style={styles.solo}>
          <Coluna titulo={null} sessao={antes} angulo={angulo} onAmpliar={setAmpliada} />
        </View>
      ) : (
        <View style={styles.par}>
          <Coluna titulo="Antes" sessao={antes} angulo={angulo} onAmpliar={setAmpliada} />
          <Coluna titulo="Depois" sessao={depois} angulo={angulo} onAmpliar={setAmpliada} />
        </View>
      )}

      {!!intervalo && (
        <View style={styles.intervalo}>
          <Ionicons name="time-outline" size={13} color={cores.verde} />
          <Text style={styles.textoIntervalo}>{intervalo}</Text>
        </View>
      )}

      {doAngulo.length < 2 ? (
        <Text style={styles.explicacao}>
          Há uma sessão de fotos deste ângulo. Quando houver outra, dá para comparar as duas aqui.
        </Text>
      ) : (
        <>
          <Text style={styles.explicacao}>
            Escolha as duas datas que você quiser comparar.
          </Text>
          <FitaDeDatas
            titulo="Antes"
            sessoes={doAngulo}
            escolhida={antes?.consultaId ?? null}
            onEscolher={setAntesId}
          />
          <FitaDeDatas
            titulo="Depois"
            sessoes={doAngulo}
            escolhida={depois?.consultaId ?? null}
            onEscolher={setDepoisId}
          />
        </>
      )}

      {/* Tela cheia com fundo preto: é onde a foto finalmente aparece do tamanho
          que dá para olhar. Sem zoom — o app não tem biblioteca de gesto, e um
          pinch pela metade é pior do que nenhum. */}
      <Modal
        visible={!!ampliada}
        transparent
        animationType="fade"
        onRequestClose={() => setAmpliada(null)}
      >
        <Pressable style={styles.fundoAmpliada} onPress={() => setAmpliada(null)}>
          {!!ampliada && (
            <>
              <Image
                source={{ uri: ampliada.url }}
                style={styles.fotoAmpliada}
                resizeMode="contain"
                accessibilityLabel={ampliada.legenda}
              />
              <Text style={styles.legendaAmpliada}>{ampliada.legenda}</Text>
            </>
          )}
          <View style={styles.fecharAmpliada}>
            <Ionicons name="close" size={24} color={cores.branco} />
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

/* `titulo` nulo é a foto sozinha: sem "Antes" em cima de nada. */
function Coluna({
  titulo,
  sessao,
  angulo,
  onAmpliar,
}: {
  titulo: string | null
  sessao: SessaoDeFotos | undefined
  angulo: AnguloFoto
  onAmpliar: (f: { url: string; legenda: string }) => void
}) {
  const foto = fotoDoAngulo(sessao, angulo)
  const quando = dataDaSessao(sessao?.data ?? null)
  const legenda = titulo ? `${titulo} · ${quando}` : quando

  return (
    <View style={styles.coluna}>
      {!!titulo && <Text style={styles.tituloColuna}>{titulo}</Text>}

      {foto ? (
        <Pressable
          onPress={() => onAmpliar({ url: foto.url, legenda })}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${legenda}. Toque para ampliar.`}
        >
          <Image source={{ uri: foto.url }} style={styles.foto} resizeMode="cover" />
        </Pressable>
      ) : (
        /* Só acontece com dado torto (sessão listada sem a foto do ângulo). Diz
           o que houve em vez de mostrar um quadrado cinza sem explicação. */
        <View style={[styles.foto, styles.fotoVazia]}>
          <Ionicons name="image-outline" size={22} color={inkFraco} />
          <Text style={styles.textoFotoVazia}>Sem foto deste ângulo</Text>
        </View>
      )}

      <Text style={styles.dataColuna}>{quando}</Text>
    </View>
  )
}

function FitaDeDatas({
  titulo,
  sessoes,
  escolhida,
  onEscolher,
}: {
  titulo: string
  sessoes: SessaoDeFotos[]
  escolhida: number | null
  onEscolher: (id: number) => void
}) {
  return (
    <View style={styles.blocoDatas}>
      <Text style={styles.rotuloBloco}>{titulo}</Text>
      {/* Rolagem horizontal, e não wrap: um paciente de dois anos tem vinte e
          poucas datas, e em fita quebrada elas ocupariam meia tela. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.datas}
      >
        {sessoes.map(s => {
          const aberta = s.consultaId === escolhida
          return (
            <Pressable
              key={s.consultaId}
              onPress={() => onEscolher(s.consultaId)}
              style={[styles.data, aberta && styles.dataAberta]}
              accessibilityRole="button"
              accessibilityState={{ selected: aberta }}
              accessibilityLabel={`${titulo}: ${dataDaSessao(s.data)}`}
            >
              <Text style={[styles.textoData, aberta && styles.textoDataAberta]}>
                {dataDaSessao(s.data)}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  rotuloBloco: {
    marginTop: 16,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: cores.verde,
    marginBottom: 6,
  },

  fitas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fita: {
    flexGrow: 1,
    minWidth: 64,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  fitaAberta: { backgroundColor: cores.verdeMenta, borderColor: cores.verdeClaro },
  textoFita: { fontSize: 12.5, fontWeight: '600', color: inkSuave },
  textoFitaAberto: { fontWeight: '800', color: cores.verdeEscuro },

  par: { flexDirection: 'row', gap: 10, marginTop: 16 },
  /* Sozinha ela não ocupa a largura toda: 3:4 em tela cheia fica mais alta que o
     visor, e a data embaixo sairia da dobra. `row` como no par, para o `flex: 1`
     da coluna resolver contra a largura nos dois casos — num contêiner de altura
     automática ele não teria eixo principal para crescer. */
  solo: { flexDirection: 'row', marginTop: 16, alignSelf: 'center', width: '64%' },
  coluna: { flex: 1 },
  tituloColuna: { fontSize: 12, fontWeight: '700', color: inkSuave, marginBottom: 6 },
  /* Retrato 3:4, que é como se fotografa corpo inteiro. Altura fixa pelo aspecto
     mantém as duas colunas do mesmo tamanho mesmo quando as fotos vêm com
     proporções diferentes — sem isso, uma foto deitada empurraria a outra. */
  foto: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 14,
    backgroundColor: cores.cartao,
  },
  fotoVazia: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  textoFotoVazia: { fontSize: 11.5, color: inkFraco, textAlign: 'center', paddingHorizontal: 8 },
  dataColuna: { marginTop: 6, fontSize: 12.5, fontWeight: '600', color: cores.ink },

  intervalo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: cores.verdeMenta,
  },
  textoIntervalo: { fontSize: 12.5, fontWeight: '700', color: cores.verdeEscuro },

  explicacao: { marginTop: 16, fontSize: 13, lineHeight: 19, color: inkSuave },

  blocoDatas: { marginTop: 4 },
  datas: { gap: 6, paddingRight: 20 },
  data: {
    paddingHorizontal: 12,
    height: 36,
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  dataAberta: { backgroundColor: cores.verdeMenta, borderColor: cores.verdeClaro },
  textoData: { fontSize: 12.5, fontWeight: '600', color: inkSuave },
  textoDataAberta: { fontWeight: '800', color: cores.verdeEscuro },

  fundoAmpliada: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fotoAmpliada: { width: '100%', height: '82%' },
  legendaAmpliada: { marginTop: 14, fontSize: 13, fontWeight: '600', color: cores.branco },
  fecharAmpliada: { position: 'absolute', top: 48, right: 20 },
})
