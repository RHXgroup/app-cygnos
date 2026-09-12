import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { FONTE } from '../lib/fontes'
import { estilosDe, paleta } from '../lib/tema'

/* O plano lido por refeição, com as trocas -- a cara da página do link.
 *
 * ──────────────────── De onde veio ────────────────────
 * Ele mandou a foto da página pública do plano (a que a paciente abre no
 * navegador) e disse: "essa tela é muito legal, a forma que ela demonstra café,
 * almoço, janta; acho que está melhor que a nossa, do próprio aplicativo; vamos
 * mudar tanto no paciente quanto na nutri".
 *
 * O que foi copiado de lá: as abas por refeição com ícone, o cartão com o
 * horário, a faixa de alergias e -- a parte que o app não tinha de jeito nenhum
 * -- o "pode trocar por", com a quantidade equivalente que ela cadastrou.
 *
 * ──────────────────── Uma peça, dois lados ────────────────────
 * A forma que entra aqui é NEUTRA de propósito: a nutricionista lê o plano de
 * uma paciente (`planoDoPacienteDaNutri`) e o paciente lê o dele
 * (`planoDaNutri`), e as duas leituras têm formatos diferentes por razões que
 * não são desta tela. Cada uma traduz para cá. Sem isso seriam duas telas
 * parecidas -- e a segunda envelheceria, que é a armadilha 5.
 */

export type TrocaEmAbas = {
  nome: string
  /* "269 g", "2 unidades" -- como a nutricionista escreveu. Nulo quando ela não
     disse a quantidade da troca. */
  detalhe: string | null
}

export type ItemEmAbas = {
  id: string
  nome: string
  detalhe: string | null
  trocas: TrocaEmAbas[]
  /* Só do lado DELA: tocar no item abre a troca de alimento. Ausente no app do
     paciente, e aí o item não é botão -- um item que afunda e não faz nada
     ensina em dez segundos a não tentar mais. */
  aoTocar?: () => void
}

export type RefeicaoEmAbas = {
  id: string
  nome: string
  hora: string | null
  itens: ItemEmAbas[]
  /* A linha embaixo do nome da refeição: "420 kcal · 32 g de proteína". Vem
     pronta de quem montou, porque quem sabe somar macro é a tela dela -- o app
     do paciente não mostra esse número no plano. */
  resumo?: string | null
}

/* O ícone sai do NOME da refeição, como no site. Café, almoço, lanche e jantar
   têm desenho próprio; o que não casar com nenhum vira a maçã -- e nunca fica
   sem ícone, que deixaria a aba torta ao lado das outras. */
function iconeDaRefeicao(nome: string): React.ComponentProps<typeof Ionicons>['name'] {
  const n = nome.toLowerCase()
  if (/café|cafe|manhã|manha|desjejum/.test(n)) return 'cafe-outline'
  if (/almoço|almoco/.test(n)) return 'restaurant-outline'
  if (/lanche|tarde|colação|colacao/.test(n)) return 'cafe-outline'
  if (/jantar|noite/.test(n)) return 'moon-outline'
  if (/ceia/.test(n)) return 'moon-outline'
  return 'nutrition-outline'
}

/* A aba "todos" não é uma refeição, então não pode ser um índice: com 4
   refeições, o índice 4 seria uma quinta que não existe. Um símbolo próprio faz
   o `tsc` reclamar de qualquer conta feita com ele. */
const TODOS = 'todos' as const

export function PlanoEmAbas({
  refeicoes,
  alergias = [],
  rodape,
}: {
  refeicoes: RefeicaoEmAbas[]
  /* O que ela não pode comer, escrito no cadastro. Faixa no alto, como no site:
     quem vai TROCAR um item precisa ver isto antes de escolher. */
  alergias?: string[]
  rodape?: string
}) {
  const styles = estilos()
  /* O índice da refeição, ou 'todos'. Ver `TODOS`, logo acima. */
  const [abaAberta, setAbaAberta] = useState<number | typeof TODOS>(0)
  /* Qual item está com a lista de trocas aberta. Um por vez: abrir todas
     transformaria a refeição num paredão de texto, que é o que a página do link
     evita fechando as outras. */
  const [trocaAberta, setTrocaAberta] = useState<string | null>(null)

  /* A aba nunca pode apontar para uma refeição que não existe mais -- o plano
     recarrega e pode vir com menos refeições. 'todos' sempre existe. */
  const aba = useMemo(
    () => (abaAberta === TODOS || abaAberta < refeicoes.length ? abaAberta : 0),
    [abaAberta, refeicoes.length],
  )

  if (refeicoes.length === 0) return null
  /* Com uma refeição só, "todos" mostraria exatamente a mesma coisa que a aba
     dela -- e uma aba que não muda nada ensina a desconfiar das outras. */
  const temTodos = refeicoes.length > 1
  const mostradas = aba === TODOS ? refeicoes : [refeicoes[aba]]

  return (
    <View style={styles.tudo}>
      {alergias.length > 0 && (
        <View style={styles.alergias}>
          <Ionicons name="shield-outline" size={16} color={paleta().cores.gold} />
          <Text style={styles.textoAlergias}>
            <Text style={styles.rotuloAlergias}>Alergias registradas: </Text>
            {alergias.join(', ')}. Confira antes de trocar um item.
          </Text>
        </View>
      )}

      {/* As abas rolam de lado: cinco refeições não cabem na largura de um
          telefone, e espremer o nome quebraria "Café da manhã" no meio. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.abas}
      >
        {refeicoes.map((r, i) => {
          const escolhida = i === aba
          return (
            <Pressable
              key={r.id}
              onPress={() => {
                setAbaAberta(i)
                setTrocaAberta(null)
              }}
              style={({ pressed }) => [styles.aba, escolhida && styles.abaEscolhida, pressed && { opacity: 0.8 }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: escolhida }}
              accessibilityLabel={r.nome + (r.hora ? ', ' + r.hora : '')}
            >
              <Ionicons
                name={iconeDaRefeicao(r.nome)}
                size={18}
                color={escolhida ? paleta().cores.verde : paleta().inkFraco}
              />
              <Text style={[styles.nomeDaAba, escolhida && styles.nomeDaAbaEscolhida]} numberOfLines={1}>
                {r.nome}
              </Text>
            </Pressable>
          )
        })}

        {/* ── TODOS, no fim da fila ──
            "Poderia colocar uma opçãozinha aqui de todos, que ia aparecer tudo
            numa folha. Coloca lá no final." Fica depois das refeições de
            propósito: quem abre o plano quer ver a próxima refeição, e o dia
            inteiro é a segunda pergunta. */}
        {temTodos && (
          <Pressable
            onPress={() => {
              setAbaAberta(TODOS)
              setTrocaAberta(null)
            }}
            style={({ pressed }) => [
              styles.aba,
              aba === TODOS && styles.abaEscolhida,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: aba === TODOS }}
            accessibilityLabel={`Todas as ${refeicoes.length} refeições do dia`}
          >
            <Ionicons
              name="list-outline"
              size={18}
              color={aba === TODOS ? paleta().cores.verde : paleta().inkFraco}
            />
            <Text
              style={[styles.nomeDaAba, aba === TODOS && styles.nomeDaAbaEscolhida]}
              numberOfLines={1}
            >
              Todos
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Uma refeição, ou o dia inteiro na mesma folha. */}
      {mostradas.map(atual => (
        <View key={atual.id} style={styles.cartao}>
          <View style={styles.topoDoCartao}>
            <Ionicons name={iconeDaRefeicao(atual.nome)} size={17} color={paleta().cores.verde} />
            <Text style={styles.nomeDaRefeicao}>{atual.nome}</Text>
            {!!atual.hora && (
              <View style={styles.hora}>
                <Ionicons name="time-outline" size={12} color={paleta().inkSuave} />
                <Text style={styles.textoDaHora}>{atual.hora}</Text>
              </View>
            )}
          </View>

          {!!atual.resumo && <Text style={styles.resumoDaRefeicao}>{atual.resumo}</Text>}

          {atual.itens.length === 0 && <Text style={styles.vazio}>Sem itens nesta refeição.</Text>}

          {atual.itens.map(item => {
            /* A chave leva a REFEIÇÃO junto: em "todos" o mesmo alimento pode
               estar no almoço e no jantar, e o id do item nem sempre é único
               entre refeições -- abrir a troca de um abriria a do outro. */
            const chave = atual.id + ':' + item.id
            const aberta = trocaAberta === chave
            return (
              <View key={item.id} style={styles.item}>
                <View style={styles.linhaDoItem}>
                  {item.aoTocar ? (
                    <Pressable
                      onPress={item.aoTocar}
                      style={({ pressed }) => [styles.tocavel, pressed && { opacity: 0.6 }]}
                      accessibilityRole="button"
                      accessibilityLabel={item.nome + '. Toque para trocar por outro alimento.'}
                    >
                      <Text style={styles.nomeDoItem}>
                        {item.nome}
                        {item.detalhe ? <Text style={styles.detalheDoItem}> — {item.detalhe}</Text> : null}
                      </Text>
                      <Ionicons name="swap-horizontal" size={14} color={paleta().inkFraco} />
                    </Pressable>
                  ) : (
                    <Text style={styles.nomeDoItem}>
                      {item.nome}
                      {item.detalhe ? <Text style={styles.detalheDoItem}> — {item.detalhe}</Text> : null}
                    </Text>
                  )}

                  {item.trocas.length > 0 && (
                    <Pressable
                      onPress={() => setTrocaAberta(aberta ? null : chave)}
                      style={({ pressed }) => [styles.botaoTrocar, pressed && { opacity: 0.8 }]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: aberta }}
                      accessibilityLabel={
                        aberta ? 'Fechar as trocas de ' + item.nome : 'Ver por que trocar ' + item.nome
                      }
                    >
                      <Ionicons name="swap-horizontal" size={13} color={paleta().cores.verde} />
                      <Text style={styles.textoTrocar}>trocar</Text>
                      <Ionicons
                        name={aberta ? 'chevron-up' : 'chevron-down'}
                        size={13}
                        color={paleta().cores.verde}
                      />
                    </Pressable>
                  )}
                </View>

                {aberta && (
                  <View style={styles.trocas}>
                    <Text style={styles.rotuloDasTrocas}>Pode trocar por:</Text>
                    {item.trocas.map((t, i) => (
                      <View key={i} style={styles.troca}>
                        <Ionicons name="checkmark" size={13} color={paleta().cores.verde} />
                        <Text style={styles.nomeDaTroca}>{t.nome}</Text>
                        {!!t.detalhe && <Text style={styles.detalheDaTroca}>{t.detalhe}</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )
          })}
        </View>
      ))}

      {!!rodape && <Text style={styles.rodape}>{rodape}</Text>}
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tudo: { gap: 10 },

    alergias: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: t.cores.atencaoFundo,
      borderRadius: 12,
      padding: 11,
    },
    textoAlergias: { flex: 1, fontFamily: FONTE.normal, fontSize: 12.5, color: t.cores.ink, lineHeight: 18 },
    rotuloAlergias: { fontFamily: FONTE.meia, color: t.cores.gold },

    abas: { gap: 8, paddingVertical: 2, paddingRight: 8 },
    aba: {
      alignItems: 'center',
      gap: 3,
      minWidth: 74,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    abaEscolhida: { backgroundColor: t.cores.verdeMenta, borderColor: t.cores.verde },
    nomeDaAba: { fontFamily: FONTE.normal, fontSize: 11.5, color: t.inkFraco },
    nomeDaAbaEscolhida: { fontFamily: FONTE.meia, color: t.cores.ink },

    cartao: {
      backgroundColor: t.cores.cartao,
      borderWidth: 1,
      borderColor: t.cores.borda,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    topoDoCartao: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
    nomeDaRefeicao: { flex: 1, fontFamily: FONTE.forte, fontSize: 15.5, color: t.cores.ink },
    hora: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: t.cores.trilho,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    textoDaHora: { fontFamily: FONTE.meia, fontSize: 11.5, color: t.inkSuave, fontVariant: ['tabular-nums'] },

    item: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.cores.borda },
    linhaDoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    nomeDoItem: { flex: 1, fontFamily: FONTE.normal, fontSize: 14.5, color: t.cores.ink, lineHeight: 20 },
    tocavel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    resumoDaRefeicao: {
      fontFamily: FONTE.meia,
      fontSize: 12,
      color: t.cores.verde,
      paddingBottom: 4,
      fontVariant: ['tabular-nums'],
    },
    detalheDoItem: { fontFamily: FONTE.meia, color: t.inkSuave },

    botaoTrocar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: t.cores.verdeMenta,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    textoTrocar: { fontFamily: FONTE.meia, fontSize: 12, color: t.cores.verde },

    trocas: {
      gap: 6,
      marginTop: 8,
      backgroundColor: t.cores.verdeMenta,
      borderRadius: 12,
      padding: 10,
    },
    rotuloDasTrocas: { fontFamily: FONTE.meia, fontSize: 11.5, color: t.cores.verde },
    troca: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    nomeDaTroca: { flex: 1, fontFamily: FONTE.normal, fontSize: 13.5, color: t.cores.ink },
    detalheDaTroca: { fontFamily: FONTE.meia, fontSize: 12, color: t.inkSuave, fontVariant: ['tabular-nums'] },

    vazio: { fontFamily: FONTE.normal, fontSize: 13, color: t.inkFraco, paddingVertical: 6 },
    rodape: {
      fontFamily: FONTE.normal,
      fontSize: 12,
      color: t.inkFraco,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 8,
    },
  }),
)
