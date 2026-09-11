import { useEffect, useMemo, useState } from 'react'
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { PlanoCompleto } from '../lib/plano'
import { listaDeCompras, quantoComprar, type ItemDeCompra } from '../lib/listaDeCompras'
import { gruposDosAlimentos } from '../lib/alimentos'
import { estilosDe, paleta } from '../lib/tema'

/* A lista de compras do plano.
 *
 * Derivada, e não guardada: o plano diz o que comer, e a lista é a mesma
 * informação vista da porta do mercado. Uma lista gravada envelheceria em
 * silêncio no dia em que o plano mudasse, e a pessoa compraria o cardápio do
 * mês passado.
 *
 * O que é marcado, por outro lado, é estado da ida ao mercado, não do plano —
 * por isso mora só aqui, na memória da tela. Fechar e voltar recomeça a
 * conferência, que é o certo: a lista serve para uma compra, não para sempre. */
export function ListaDeComprasScreen({
  plano,
  onFechar,
}: {
  plano: PlanoCompleto
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const [pegos, setPegos] = useState<Set<string>>(new Set())

  /* O corredor de cada alimento. Comeca vazio e chega depois: a lista aparece
     na hora, e a separacao por secao entra quando a leitura voltar. Lista
     inteira sem secao e util; espera com tela em branco, nao. */
  const [grupos, setGrupos] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    let vivo = true
    const ids = plano.refeicoes.flatMap(r => [
      ...r.itens.map(i => i.alimentoId),
      ...r.itens.flatMap(i => i.variacoes.map(v => v.alimentoId)),
    ]).filter((n): n is number => n !== null)

    void gruposDosAlimentos(ids).then(m => {
      if (vivo) setGrupos(m)
    })
    return () => {
      vivo = false
    }
  }, [plano])

  /* Recalcular a cada render custaria o plano inteiro a cada toque de item. */
  const itens = useMemo(
    () => listaDeCompras(plano, id => (id === null ? null : grupos.get(id) ?? null)),
    [plano, grupos],
  )

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFechar()
      return true
    })
    return () => sub.remove()
  }, [onFechar])

  function alternar(chave: string) {
    setPegos(atuais => {
      const novo = new Set(atuais)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  }

  const principais = itens.filter(i => !i.soAlternativa)

  /* Agrupa preservando a ordem que a lib ja deu: ela vem por corredor, e
     reordenar aqui criaria uma segunda opiniao sobre a mesma coisa. */
  const porSecao: { secao: string; itens: ItemDeCompra[] }[] = []
  for (const item of principais) {
    const ultima = porSecao[porSecao.length - 1]
    if (ultima && ultima.secao === item.secao) ultima.itens.push(item)
    else porSecao.push({ secao: item.secao, itens: [item] })
  }
  const alternativas = itens.filter(i => i.soAlternativa)
  const faltam = itens.length - pegos.size

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onFechar}
          style={styles.botaoVoltar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <Text style={styles.tituloTela}>Lista de compras</Text>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.conteudo, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitulo} numberOfLines={2}>
          Do plano "{plano.nome}"
        </Text>

        {itens.length === 0 ? (
          <Text style={styles.vazio}>
            Este plano ainda não tem alimentos. Adicione as refeições e a lista aparece aqui,
            montada sozinha.
          </Text>
        ) : (
          <>
            {/* O que falta, e não o que já foi: no mercado a pergunta é sempre
                "ainda preciso de quê". */}
            <View style={styles.placar}>
              <Text style={styles.numeroPlacar}>{faltam}</Text>
              <Text style={styles.rotuloPlacar}>
                {faltam === 1 ? 'item para pegar' : 'itens para pegar'}
                {pegos.size > 0 && ` · ${pegos.size} no carrinho`}
              </Text>
            </View>

            {/* Por SECAO do mercado, e nao numa lista so: a lista ja vem na
                ordem do corredor, e o titulo e o que faz a pessoa perceber
                isso -- sem ele, a ordem parece aleatoria e ela le tudo de novo
                em cada corredor. Alimento sem grupo conhecido cai em "Outros",
                no fim, e continua na lista: item sem corredor e item que ela
                precisa comprar do mesmo jeito. */}
            {porSecao.map(({ secao, itens: daSecao }) => (
              <View key={secao}>
                <Text style={styles.tituloDaSecao}>{secao}</Text>
                {daSecao.map(item => (
                  <LinhaDeCompra
                    key={item.chave}
                    item={item}
                    pego={pegos.has(item.chave)}
                    onAlternar={() => alternar(item.chave)}
                  />
                ))}
              </View>
            ))}

            {alternativas.length > 0 && (
              <>
                {/* As variações do plano: "arroz OU macarrão". Comprar depende
                    da escolha do dia, então elas ficam separadas em vez de
                    misturadas com o que é certo. */}
                <Text style={styles.tituloSecao}>Alternativas do plano</Text>
                <Text style={styles.explicacaoSecao}>
                  Aparecem como opção no lugar de outro alimento. Compre conforme o que você
                  pretende comer.
                </Text>

                {alternativas.map(item => (
                  <LinhaDeCompra
                    key={item.chave}
                    item={item}
                    pego={pegos.has(item.chave)}
                    onAlternar={() => alternar(item.chave)}
                  />
                ))}
              </>
            )}

            <Text style={styles.rodape}>
              As quantidades somam o que o plano pede em um dia. Para a semana, multiplique
              pelos dias em que ele se repete.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function LinhaDeCompra({
  item,
  pego,
  onAlternar,
}: {
  item: ItemDeCompra
  pego: boolean
  onAlternar: () => void
}) {
  const styles = estilos()
  /* Peso quando há; a forma como foi dita quando não há. "2 unidades" é mais
     útil na prateleira do que um peso que ninguém informou.

     A conta é da SEMANA inteira, e quem a escreve é : 40 g de
     aveia num plano de cinco dias são 200 g no mercado, e é justamente essa
     multiplicação que ninguém faz de cabeça no corredor. */
  const quantidade = quantoComprar(item)

  return (
    <Pressable
      onPress={onAlternar}
      style={({ pressed }) => [styles.linha, pressed && styles.linhaPressionada]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: pego }}
      accessibilityLabel={`${item.nome}, ${quantidade}`}
    >
      <View style={[styles.caixa, pego && styles.caixaMarcada]}>
        {pego && <Ionicons name="checkmark" size={15} color={paleta().cores.sobreLimao} />}
      </View>

      <View style={styles.textoLinha}>
        <Text style={[styles.nome, pego && styles.textoPego]} numberOfLines={1}>
          {item.nome}
        </Text>
        <Text style={[styles.detalhe, pego && styles.textoPego]} numberOfLines={1}>
          {quantidade}
          {item.refeicoes > 1 && ` · em ${item.refeicoes} refeições`}
          {item.marca ? ` · ${item.marca}` : ''}
        </Text>
      </View>
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
    paddingBottom: 8,
  },
  botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTela: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: t.cores.ink },

  conteudo: { paddingHorizontal: 20, paddingTop: 4, gap: 8 },
  subtitulo: { fontSize: 13, color: t.inkSuave, marginBottom: 6 },

  placar: {
    backgroundColor: t.cores.cartao,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  numeroPlacar: { fontSize: 30, fontWeight: '800', color: t.cores.limao, letterSpacing: -0.8 },
  rotuloPlacar: { fontSize: 13, color: t.inkMedio, marginTop: 2 },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.cores.cartao,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.cores.borda,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  linhaPressionada: { opacity: 0.7 },

  caixa: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: t.cores.trilho,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixaMarcada: { backgroundColor: t.cores.limao, borderColor: t.cores.limao },

  textoLinha: { flex: 1 },
  nome: { fontSize: 15, fontWeight: '700', color: t.cores.ink },
  detalhe: { fontSize: 12.5, color: t.inkSuave, marginTop: 1 },
  /* Riscado e apagado: some do caminho sem sumir da lista, para quem quiser
     conferir o que já pegou. */
  textoPego: { textDecorationLine: 'line-through', color: t.inkFraco },

  /* O corredor do mercado. Menor e mais fraco que o titulo das alternativas:
     e uma divisoria de leitura, nao um assunto novo -- se competir com o nome
     dos itens, a lista vira indice em vez de lista. */
  tituloDaSecao: {
    fontSize: 11,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6,
  },
  tituloSecao: {
    fontSize: 12,
    fontWeight: '700',
    color: t.inkFraco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 18,
  },
  explicacaoSecao: { fontSize: 12.5, color: t.inkSuave, marginBottom: 4 },

  vazio: { fontSize: 14, color: t.inkSuave, lineHeight: 21, paddingVertical: 12 },
  rodape: { fontSize: 12.5, color: t.inkFraco, lineHeight: 19, marginTop: 16 },
  }),
)
