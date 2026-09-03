import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { estilosDe, paleta } from '../lib/tema'

const DIAMETRO = 170
const ESPESSURA = 14
const RAIO = (DIAMETRO - ESPESSURA) / 2
const VOLTA = 2 * Math.PI * RAIO

/* Quantas calorias cada grama de macro carrega. Fatores de Atwater, os mesmos
   que a tabela nutricional usa. */
const KCAL_POR_GRAMA = { proteinas: 4, carboidratos: 4, gorduras: 9 } as const

export type FatiasDoAnel = {
  proteinas: number | null
  carboidratos: number | null
  gorduras: number | null
}

/* O anel do dia: quanto da meta já foi comido, repartido por macro.
 *
 * Três arcos e não um: um arco só responde "quanto comi", e essa resposta a
 * pessoa já tem no número do meio. Repartido, ele responde DE ONDE vieram as
 * calorias, que é a pergunta que muda o próximo prato.
 *
 * O que sobrar de caloria sem macro identificado não vira arco. Preferir o
 * buraco a inventar cor: item lançado sem macro na tabela é comum, e pintá-lo
 * como se fosse carboidrato seria afirmar algo que ninguém mediu. */
export function AnelCalorias({
  fatias,
  meta,
  children,
}: {
  fatias: FatiasDoAnel
  /* Meta de calorias do dia. Sem ela não há círculo a completar, e o anel
     desenha só o trilho. */
  meta: number | null
  children: ReactNode
}) {
  const styles = estilos()
  const kcal = {
    proteinas: (fatias.proteinas ?? 0) * KCAL_POR_GRAMA.proteinas,
    carboidratos: (fatias.carboidratos ?? 0) * KCAL_POR_GRAMA.carboidratos,
    gorduras: (fatias.gorduras ?? 0) * KCAL_POR_GRAMA.gorduras,
  }

  const total = meta && meta > 0 ? meta : null

  /* Cada arco começa onde o anterior parou. O acumulado para no círculo
     inteiro: passando da meta, o anel fica cheio em vez de dar uma segunda
     volta por cima de si mesmo. */
  let inicio = 0
  const arcos = (['carboidratos', 'proteinas', 'gorduras'] as const)
    .map(macro => {
      if (total === null) return null
      const fracao = Math.min(kcal[macro] / total, Math.max(1 - inicio, 0))
      if (fracao <= 0) return null
      const arco = { macro, inicio, fracao }
      inicio += fracao
      return arco
    })
    .filter(a => a !== null)

  return (
    <View style={styles.bloco}>
      <Svg width={DIAMETRO} height={DIAMETRO}>
        <Circle
          cx={DIAMETRO / 2}
          cy={DIAMETRO / 2}
          r={RAIO}
          stroke={paleta().cores.trilho}
          strokeWidth={ESPESSURA}
          fill="none"
        />

        {arcos.map(a => (
          <Circle
            key={a.macro}
            cx={DIAMETRO / 2}
            cy={DIAMETRO / 2}
            r={RAIO}
            stroke={paleta().coresMacro[a.macro]}
            strokeWidth={ESPESSURA}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${VOLTA * a.fracao} ${VOLTA}`}
            /* Deslocamento negativo empurra o arco para a frente na volta.
               É o que encaixa um segmento depois do outro. */
            strokeDashoffset={-VOLTA * a.inicio}
            /* O círculo do SVG começa às 3 horas. Girar -90° põe o início no
               topo, que é onde o olho espera que um progresso comece. */
            transform={`rotate(-90 ${DIAMETRO / 2} ${DIAMETRO / 2})`}
          />
        ))}
      </Svg>

      <View style={styles.centro} pointerEvents="none">
        {children}
      </View>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
  bloco: { width: DIAMETRO, height: DIAMETRO, alignItems: 'center', justifyContent: 'center' },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  }),
)
