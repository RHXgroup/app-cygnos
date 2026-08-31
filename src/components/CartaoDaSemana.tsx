import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { carregarConsumoPeriodo } from '../lib/consumo'
import { RASCUNHO_SEMANA, semanaJaVista, marcarSemanaVista } from '../lib/semanaVista'
import { semanaDaPessoa, type Linha } from '../lib/semanaDaPessoa'
import { dataISO } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'
import type { DiaAgua } from '../lib/agua'
import type { RegistroPeso } from '../lib/peso'
import type { Sessao } from '../lib/treino'

/* O que a sua semana rendeu.
 *
 * ── Por que cartão, e não aba ─────────────────────────────────────────────
 * Aba se precisa lembrar de visitar, e por isso é esquecida — o Relatórios já
 * tinha provado isso quando saiu da barra. Cartão é EVENTO: aparece na tela
 * inicial, é lido, e some até a semana seguinte. Lugar a pessoa esquece; evento
 * ela encontra.
 *
 * ── E some de verdade ─────────────────────────────────────────────────────
 * Depois de fechado, não volta naquela semana. Um cartão que reaparece todo dia
 * vira o banner que a pessoa aprende a fechar sem ler — e aí ele deixou de
 * funcionar justamente na semana em que tinha algo bom a dizer.
 *
 * ── E não aparece quando não há o que dizer ───────────────────────────────
 * Semana sem dado nenhum não gera cartão. "0 treinos, 0 dias de água" não é
 * devolução: é cobrança, e cobrança é o que faz alguém fechar o app. */

const ICONE: Record<Linha['chave'], keyof typeof Ionicons.glyphMap> = {
  treino: 'barbell-outline',
  peso: 'speedometer-outline',
  calorias: 'flame-outline',
  agua: 'water-outline',
  constancia: 'checkmark-done-outline',
}

export function CartaoDaSemana({
  contaId,
  sessoes,
  pesos,
  aguaDaSemana,
  metaDeAguaMl,
  metaDeCalorias,
}: {
  contaId: string
  sessoes: Sessao[]
  pesos: RegistroPeso[]
  aguaDaSemana: DiaAgua[]
  metaDeAguaMl: number | null
  metaDeCalorias: number | null
}) {
  const styles = estilos()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [fechado, setFechado] = useState(false)

  useEffect(() => {
    let vivo = true
    const hoje = dataISO(new Date())

    void semanaJaVista(hoje).then(async vista => {
      if (!vivo || vista) return

      /* O consumo da semana é a ÚNICA ida à rede deste cartão, e ela só
         acontece quando ele vai mesmo aparecer — o resto já está em memória na
         tela inicial. Numa semana, isso é uma consulta a mais. */
      const de = dataISO(new Date(Date.now() - 6 * 86400000))
      const c = await carregarConsumoPeriodo(contaId, de, hoje)
      if (!vivo) return

      /* Uma linha por DIA, somando as calorias do dia. O consumo vem item a
         item, e a média que interessa é por dia, não por alimento. */
      const porDia = new Map<string, number | null>()
      if (c.tipo === 'ok') {
        for (const i of c.itens) {
          if (i.calorias === null) continue
          porDia.set(i.data, (porDia.get(i.data) ?? 0) + i.calorias)
        }
      }

      const r = semanaDaPessoa({
        hoje,
        sessoes: sessoes.map(s => ({ data: s.data, duracaoMin: s.duracaoMin })),
        pesos: pesos.map(p => ({ data: p.data, kg: p.kg })),
        consumo: [...porDia].map(([data, calorias]) => ({ data, calorias })),
        agua: aguaDaSemana.map(a => ({ data: a.data, ml: a.ml })),
        metaDeAguaMl,
        metaDeCalorias,
      })
      if (!r.vazia) setLinhas(r.linhas)
    })

    return () => {
      vivo = false
    }
    /* Só na montagem: o cartão é da semana, e recalculá-lo a cada copo de água
       o faria piscar durante o uso normal do app. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId])

  if (!linhas || fechado) return null

  return (
    <View style={styles.cartao}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>A sua semana</Text>
        <Pressable
          onPress={() => {
            setFechado(true)
            void marcarSemanaVista(dataISO(new Date()))
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Fechar o resumo da semana"
        >
          <Ionicons name="close" size={19} color={paleta().inkFraco} />
        </Pressable>
      </View>

      {linhas.map(l => (
        <View key={l.chave} style={styles.linha}>
          <Ionicons
            name={ICONE[l.chave]}
            size={17}
            color={l.bom ? paleta().cores.verde : paleta().inkMedio}
          />
          <Text style={[styles.texto, l.bom && styles.textoBom]}>{l.texto}</Text>
        </View>
      ))}
    </View>
  )
}

export { RASCUNHO_SEMANA }

const estilos = estilosDe(t =>
  StyleSheet.create({
    cartao: {
      marginHorizontal: 20,
      marginBottom: 14,
      backgroundColor: t.cores.cartao,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.cores.verde,
      padding: 16,
      gap: 10,
    },
    topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titulo: { fontSize: 16, fontWeight: '800', color: t.cores.ink, letterSpacing: -0.3 },
    linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    texto: { flex: 1, fontSize: 13.5, color: t.inkMedio, lineHeight: 20 },
    textoBom: { color: t.cores.ink, fontWeight: '600' },
  }),
)
