import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GlifoDoDegrau } from './GlifoDoDegrau'
import { DEGRAUS, type Degrau } from '../lib/escadaDaAceitacao'
import { coresDaEscada } from '../lib/coresDaEscada'
import { acentoEfetivo, estilosDe, paleta } from '../lib/tema'

/* A escada de aceitação, nas duas leituras que ela precisa ter.
 *
 *   `escolher`  a mãe registrando: sete botões grandes, com a cena embaixo.
 *   `mostrar`   a mãe virando o celular para o filho: a trilha, sem toque,
 *               com o degrau de hoje aceso e a fala em primeira pessoa.
 *
 * Um componente só porque é a MESMA escada. Dois componentes divergiriam no dia
 * em que um degrau mudasse de nome, e aí a criança veria uma escada e a mãe
 * outra — que é a armadilha 5 aplicada a pixels.
 *
 * ── O que este arquivo NÃO decide ─────────────────────────────────────────
 * Nada. Os degraus, as falas e as cores vêm de `lib/escadaDaAceitacao.ts` e
 * `lib/coresDaEscada.ts`, que são puros e testados fora do aparelho — inclusive
 * a garantia de que os sete se leem em qualquer acento que a pessoa escolha.
 * Aqui há só o desenho. */

export function EscadaDaAceitacao({
  modo,
  atual,
  onEscolher,
}: {
  modo: 'escolher' | 'mostrar'
  /* O degrau de agora. `null` antes do primeiro registro. */
  atual: Degrau | null
  onEscolher?: (d: Degrau) => void
}) {
  const styles = estilos()
  const cores = coresDaEscada(acentoEfetivo(), paleta().cores.fundo)

  if (modo === 'mostrar') return <Trilha atual={atual} cores={cores} styles={styles} />

  return (
    <View style={styles.lista}>
      {DEGRAUS.map((d, i) => (
        <Pressable
          key={d.chave}
          onPress={() => onEscolher?.(d)}
          style={({ pressed }) => [styles.opcao, pressed && styles.opcaoPressionada]}
          accessibilityRole="button"
          /* O rótulo lê a CENA junto, e não só o nome: quem usa leitor de tela
             precisa da mesma desambiguação que o texto de baixo dá a quem vê.
             "Mexeu, brincou" sozinho não diz o que se está afirmando. */
          accessibilityLabel={`${d.paraMae}. ${d.cena}`}
        >
          <View style={[styles.selo, { backgroundColor: cores[i].leve, borderColor: cores[i].traco }]}>
            <GlifoDoDegrau sentido={d.sentido} cor={cores[i].traco} tamanho={23} />
          </View>
          <View style={styles.textos}>
            <Text style={styles.nome}>{d.paraMae}</Text>
            <Text style={styles.cena}>{d.cena}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

/* A trilha: sete marcas subindo, com a de hoje acesa.
 *
 * As anteriores ficam preenchidas de leve — o caminho já andado —, e as
 * seguintes ficam vazias. Nenhuma delas é riscada nem apagada: o que vem
 * depois é convite, não pendência. */
function Trilha({
  atual,
  cores,
  styles,
}: {
  atual: Degrau | null
  cores: ReturnType<typeof coresDaEscada>
  styles: ReturnType<typeof estilos>
}) {
  const nivelAtual = atual?.nivel ?? 0

  return (
    <View>
      <View style={styles.trilha}>
        {DEGRAUS.map((d, i) => {
          const passado = d.nivel < nivelAtual
          const hoje = d.nivel === nivelAtual
          return (
            <View key={d.chave} style={styles.colunaTrilha}>
              <View
                style={[
                  styles.marca,
                  /* O PIXEL cresce com o degrau: a escada é uma escada, e não
                     sete caixas iguais coloridas. `height` aqui é altura de
                     verdade; o degrau chama-se `nivel` justamente para as duas
                     palavras não disputarem o mesmo sentido neste arquivo. */
                  { height: 16 + i * 7 },
                  passado && { backgroundColor: cores[i].leve },
                  hoje && { backgroundColor: cores[i].traco },
                ]}
              />
            </View>
          )
        })}
      </View>

      {atual && (
        <View style={styles.hoje}>
          <View style={[styles.seloHoje, { backgroundColor: cores[atual.nivel - 1].leve }]}>
            <GlifoDoDegrau
              sentido={atual.sentido}
              cor={cores[atual.nivel - 1].traco}
              tamanho={30}
            />
          </View>
          {/* Primeira pessoa, presente, sem número. A criança lê o que ELA
              fez — ver a fala `paraFilho` em lib/escadaDaAceitacao.ts. */}
          <Text style={styles.falaDoFilho}>{atual.paraFilho}</Text>
        </View>
      )}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  lista: { gap: 7 },

  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    /* Alto de propósito: quem responde está de pé, com uma mão, no fim de uma
       refeição. Alvo pequeno aqui vira toque errado, e toque errado num
       registro clínico é pior que registro nenhum. */
    minHeight: 62,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: t.cores.superficie,
  },
  opcaoPressionada: { backgroundColor: t.cores.trilho },

  selo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textos: { flex: 1 },
  nome: { fontSize: 15.5, fontWeight: '600', color: t.cores.ink },
  cena: { fontSize: 12.5, lineHeight: 17, color: t.inkFraco, marginTop: 1 },

  trilha: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 66,
  },
  colunaTrilha: { flex: 1, justifyContent: 'flex-end' },
  marca: {
    borderRadius: 4,
    backgroundColor: t.cores.trilho,
  },

  hoje: { alignItems: 'center', marginTop: 16, gap: 9 },
  seloHoje: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  falaDoFilho: {
    fontSize: 19,
    fontWeight: '600',
    color: t.cores.ink,
    textAlign: 'center',
  },
  }),
)
