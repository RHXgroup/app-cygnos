import { useEffect, useState } from 'react'
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import Svg, { Circle, Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EscadaDaAceitacao } from '../components/EscadaDaAceitacao'
import { GlifoDoDegrau } from '../components/GlifoDoDegrau'
import {
  REACOES,
  apoioDoRegistro,
  convitePraCrianca,
  fraseDoRegistro,
  comArtigo,
  proximoDegrau,
  resumoDoAlimento,
  type ChaveReacao,
  type Degrau,
  type Registro,
} from '../lib/escadaDaAceitacao'
import { coresDaEscada } from '../lib/coresDaEscada'
import { dataISO } from '../lib/formatar'
import { acentoEfetivo, estilosDe, paleta } from '../lib/tema'

/* Como foi com este alimento hoje.
 *
 * ── A tela inteira cabe em um toque e meio ────────────────────────────────
 * Quem responde está de pé, no fim de uma refeição, com uma mão livre e uma
 * criança para tirar da cadeira. Um campo de texto aqui é onde alguém fecha o
 * app e não volta — por isso não há nenhum, e a reação é pulável.
 *
 * ── Três passos, e o terceiro é o que importa ─────────────────────────────
 *   1. o degrau      obrigatório, é o dado
 *   2. a reação      opcional, mas é o que a nutricionista mais usa
 *   3. o que aconteceu, mais o botão de MOSTRAR AO FILHO
 *
 * O terceiro passo é o pedido do Helton: a mãe vira o celular e a criança vê em
 * que fase está. Por isso ele não é um recibo — é uma tela em si.
 *
 * ── E nada aqui pode devolver derrota ─────────────────────────────────────
 * Exposição com emoção negativa REFORÇA a rejeição, então uma tela que faça a
 * mãe se sentir mal produz pressão na criança e piora o quadro. As frases vêm
 * de `lib/escadaDaAceitacao.ts`, que tem um teste varrendo todas atrás de
 * culpa. Aqui não se escreve texto novo. */

type Passo = 'degrau' | 'reacao' | 'feito' | 'filho'

export function RegistrarExposicaoScreen({
  alimento,
  preparacao,
  nomeDaCrianca,
  registros,
  onRegistrar,
  onFechar,
}: {
  alimento: string
  /* "cozida em cubos". Aparece embaixo do nome, porque a criança que aceita
     cenoura cozida pode recusar a crua — e o objetivo aponta a preparação. */
  preparacao: string | null
  /* Primeiro nome, para o botão dizer "Mostrar ao Téo" em vez de "ao seu
     filho". Vazio quando não se sabe, e aí a frase muda. */
  nomeDaCrianca: string
  /* O histórico deste alimento, para o resumo. Vem de fora: esta tela não
     fala com o banco. */
  registros: Registro[]
  onRegistrar: (r: { degrau: Degrau; reacao: ChaveReacao | null }) => void
  onFechar: () => void
}) {
  const styles = estilos()
  const { top, bottom } = useSafeAreaInsets()
  const cores = coresDaEscada(acentoEfetivo(), paleta().cores.fundo)

  const [passo, setPasso] = useState<Passo>('degrau')
  const [degrau, setDegrau] = useState<Degrau | null>(null)
  const [reacao, setReacao] = useState<ChaveReacao | null>(null)

  /* O resumo COM o registro de agora incluído — é o que a mãe acabou de fazer,
     e contá-lo só depois de salvar mostraria um número atrasado na própria tela
     que o produziu. */
  const resumo = resumoDoAlimento(
    degrau
      ? [...registros, { data: dataISO(new Date()), aceitacao: degrau.chave, reacao: reacao ?? null }]
      : registros,
  )

  /* O voltar do Android, descascando um passo por vez.
   *
   * SEM lista de dependências, de propósito. O App.tsx tem um voltar central
   * cuja lista `deCimaParaBaixo` inclui as sobreposições, e o React roda os
   * efeitos do FILHO antes dos do PAI — então um efeito com dependências aqui
   * seria registrado ANTES do central e perderia para ele. Re-registrar a cada
   * renderização põe este na frente a partir da primeira re-renderização, que
   * sempre acontece. Ver a armadilha 1 do AGENTS.md.
   *
   * Sem isto, quem estivesse escolhendo a reação e apertasse voltar sairia da
   * tela inteira, perdendo o degrau que acabou de marcar. */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (passo === 'filho') {
        setPasso('feito')
        return true
      }
      if (passo === 'feito') return true /* já registrou; sair é pelo botão */
      if (passo === 'reacao') {
        setPasso('degrau')
        return true
      }
      return false
    })
    return () => sub.remove()
  })

  function escolherDegrau(d: Degrau) {
    setDegrau(d)
    setPasso('reacao')
  }

  function concluir(r: ChaveReacao | null) {
    if (!degrau) return
    setReacao(r)
    onRegistrar({ degrau, reacao: r })
    setPasso('feito')
  }

  const titulo =
    passo === 'degrau'
      ? `Como foi com ${comArtigo(alimento)}?`
      : passo === 'reacao'
        ? 'E como ele ficou?'
        : 'Anotado'

  return (
    <View style={[styles.tela, { paddingTop: top + 8 }]}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={passo === 'reacao' ? () => setPasso('degrau') : onFechar}
          style={styles.botaoVoltar}
          accessibilityRole="button"
          accessibilityLabel={passo === 'reacao' ? 'Voltar aos degraus' : 'Fechar'}
        >
          <Ionicons name="chevron-back" size={22} color={paleta().cores.ink} />
        </Pressable>
        <View style={styles.tituloBloco}>
          <Text style={styles.titulo} numberOfLines={2}>
            {titulo}
          </Text>
          {passo === 'degrau' && !!preparacao && (
            <Text style={styles.preparacao}>{preparacao}</Text>
          )}
        </View>
        <View style={styles.botaoVoltar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.corpo, { paddingBottom: bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {passo === 'degrau' && (
          <EscadaDaAceitacao modo="escolher" atual={resumo.atual} onEscolher={escolherDegrau} />
        )}

        {passo === 'reacao' && (
          <>
            <Text style={styles.explica}>
              Isto é opcional — mas é o que a sua nutricionista mais usa.
            </Text>
            <View style={styles.reacoes}>
              {REACOES.map(r => (
                <Pressable
                  key={r.chave}
                  onPress={() => concluir(r.chave)}
                  style={({ pressed }) => [styles.reacao, pressed && styles.reacaoPressionada]}
                  accessibilityRole="button"
                  accessibilityLabel={r.paraMae}
                >
                  <Rosto chave={r.chave} cor={paleta().cores.ink} />
                  <Text style={styles.nomeReacao}>{r.paraMae}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => concluir(null)}
              style={styles.pular}
              accessibilityRole="button"
              accessibilityLabel="Pular a reação e salvar"
            >
              <Text style={styles.textoPular}>Pular esta parte</Text>
            </Pressable>
          </>
        )}

        {passo === 'feito' && degrau && (
          <View style={styles.feito}>
            <View
              style={[styles.seloGrande, { backgroundColor: cores[degrau.altura - 1].leve }]}
            >
              <GlifoDoDegrau
                sentido={degrau.sentido}
                cor={cores[degrau.altura - 1].traco}
                tamanho={34}
              />
            </View>

            <Text style={styles.frase}>{fraseDoRegistro(degrau, resumo)}</Text>
            <Text style={styles.apoio}>{apoioDoRegistro(degrau, resumo)}</Text>

            <View style={styles.trilhaBloco}>
              <EscadaDaAceitacao modo="mostrar" atual={degrau} />
            </View>

            <Pressable
              onPress={() => setPasso('filho')}
              style={({ pressed }) => [styles.mostrar, pressed && styles.mostrarPressionado]}
              accessibilityRole="button"
              accessibilityLabel={
                nomeDaCrianca ? `Mostrar a ${nomeDaCrianca}` : 'Mostrar à criança'
              }
            >
              <Ionicons name="phone-portrait-outline" size={17} color={paleta().cores.branco} />
              <Text style={styles.textoMostrar}>
                {nomeDaCrianca ? `Mostrar a ${nomeDaCrianca}` : 'Mostrar à criança'}
              </Text>
            </Pressable>

            <Pressable onPress={onFechar} style={styles.pular} accessibilityRole="button">
              <Text style={styles.textoPular}>Fechar</Text>
            </Pressable>
          </View>
        )}

        {passo === 'filho' && degrau && (
          <TelaDoFilho
            degrau={degrau}
            alimento={alimento}
            styles={styles}
            onVoltar={() => setPasso('feito')}
          />
        )}
      </ScrollView>
    </View>
  )
}

/* A tela que a mãe vira para o filho.
 *
 * Grande, sem número, sem porcentagem, sem placar. A criança lê o que ELA fez e
 * vê que existe um degrau adiante — é isso que transforma a escada em desafio
 * em vez de prova.
 *
 * E ela não toca em nada: o app continua sendo da mãe. Mostrar é diferente de
 * endereçar, e essa distinção é o que mantém o app fora da política de Famílias
 * do Google — ver docs/planejamento-terapeutico.md. */
function TelaDoFilho({
  degrau,
  alimento,
  styles,
  onVoltar,
}: {
  degrau: Degrau
  alimento: string
  styles: ReturnType<typeof estilos>
  onVoltar: () => void
}) {
  const proximo = proximoDegrau(degrau)

  return (
    <View style={styles.filho}>
      <Text style={styles.filhoAlimento}>{alimento}</Text>

      <EscadaDaAceitacao modo="mostrar" atual={degrau} />

      <Text style={styles.filhoConvite}>{convitePraCrianca(degrau)}</Text>

      {/* O próximo degrau aparece apagado, e some no topo: quem chegou em
          "comi" não tem próximo, e inventar um transformaria a chegada em mais
          uma cobrança. */}
      {!!proximo && (
        <View style={styles.filhoProximo}>
          <GlifoDoDegrau sentido={proximo.sentido} cor={paleta().inkFraco} tamanho={26} />
        </View>
      )}

      <Pressable onPress={onVoltar} style={styles.pular} accessibilityRole="button">
        <Text style={styles.textoPular}>Voltar</Text>
      </Pressable>
    </View>
  )
}

/* Os três rostos. Desenhados aqui, e não em componente próprio, porque só esta
   tela os usa — e um componente com um chamador só é indireção sem ganho. */
function Rosto({ chave, cor }: { chave: ChaveReacao; cor: string }) {
  const boca =
    chave === 'tranquilo'
      ? 'M8 14.5c1 1.4 2.4 2.1 4 2.1s3-.7 4-2.1'
      : chave === 'indiferente'
        ? 'M8.4 15h7.2'
        : 'M8 16.4c1-1.4 2.4-2.1 4-2.1s3 .7 4 2.1'

  return (
    <View style={{ width: 44, height: 44 }}>
      <GlifoRosto boca={boca} cor={cor} />
    </View>
  )
}

function GlifoRosto({ boca, cor }: { boca: string; cor: string }) {
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.2" stroke={cor} strokeWidth={1.7} fill="none" />
      <Circle cx="9" cy="10" r="0.95" fill={cor} />
      <Circle cx="15" cy="10" r="0.95" fill={cor} />
      <Path d={boca} stroke={cor} strokeWidth={1.7} strokeLinecap="round" fill="none" />
    </Svg>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },

    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 10,
      gap: 6,
    },
    botaoVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    tituloBloco: { flex: 1 },
    titulo: { fontSize: 19, fontWeight: '600', color: t.cores.ink, lineHeight: 24 },
    preparacao: { fontSize: 13, color: t.inkFraco, marginTop: 1 },

    corpo: { paddingHorizontal: 16, paddingTop: 6 },

    explica: { fontSize: 13.5, color: t.inkFraco, marginBottom: 16, lineHeight: 19 },

    reacoes: { flexDirection: 'row', gap: 10 },
    reacao: {
      flex: 1,
      alignItems: 'center',
      gap: 9,
      paddingVertical: 18,
      borderRadius: 18,
      backgroundColor: t.cores.superficie,
    },
    reacaoPressionada: { backgroundColor: t.cores.trilho },
    nomeReacao: { fontSize: 13.5, fontWeight: '500', color: t.cores.ink, textAlign: 'center' },

    pular: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 18 },
    textoPular: { fontSize: 14, color: t.inkFraco },

    feito: { alignItems: 'center', paddingTop: 8 },
    seloGrande: {
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    frase: {
      fontSize: 21,
      fontWeight: '600',
      color: t.cores.ink,
      textAlign: 'center',
      lineHeight: 27,
    },
    apoio: {
      fontSize: 14,
      lineHeight: 20,
      color: t.inkMedio,
      textAlign: 'center',
      marginTop: 9,
      paddingHorizontal: 6,
    },
    trilhaBloco: { alignSelf: 'stretch', marginTop: 26 },

    mostrar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'stretch',
      height: 52,
      borderRadius: 16,
      backgroundColor: t.cores.verde,
      marginTop: 26,
    },
    mostrarPressionado: { opacity: 0.85 },
    textoMostrar: { fontSize: 15.5, fontWeight: '600', color: t.cores.branco },

    filho: { alignItems: 'center', paddingTop: 14, alignSelf: 'stretch' },
    filhoAlimento: {
      fontSize: 15,
      color: t.inkFraco,
      marginBottom: 22,
      textTransform: 'lowercase',
    },
    filhoConvite: {
      fontSize: 17,
      color: t.inkMedio,
      textAlign: 'center',
      marginTop: 22,
      lineHeight: 24,
    },
    filhoProximo: { marginTop: 14, opacity: 0.55 },
  }),
)
