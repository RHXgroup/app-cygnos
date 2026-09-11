import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { carregarDiasDoPaciente } from '../lib/sequenciaDoPaciente'
import {
  adesaoDoPaciente,
  destaqueDaAdesao,
  fraseDaAdesao,
  type AdesaoDoPaciente,
} from '../lib/adesaoDoPaciente'
import { dataISO } from '../lib/formatar'
import { estilosDe, paleta } from '../lib/tema'

/* A constância do paciente no app, numa linha -- para a ficha, do lado dela.
 *
 * ── Um componente que se basta ────────────────────────────────────────────
 * Recebe só o id e faz a própria leitura. Quem encaixa na ficha não precisa
 * saber de onde vem o número nem como ele é contado: é uma linha, e ela não
 * pode arrastar estado para a tela que a hospeda.
 *
 * ── O que ele NÃO mostra ──────────────────────────────────────────────────
 * Carregando: nada. Falhou: nada. É uma linha de complemento numa ficha cheia
 * de coisa mais importante, e um giro ou um aviso de erro no meio dela pesaria
 * mais do que a informação que ele traria. Item 11: quem alimenta um pedaço da
 * tela não derruba nem cobre a tela.
 *
 * "Não usa o aplicativo", ao contrário, APARECE: não é falha, é informação --
 * e é o que evita a nutricionista perguntar "você registrou esta semana?" a
 * quem nunca instalou o app. */
export function ConstanciaDoPaciente({ pacienteId }: { pacienteId: number }) {
  const styles = estilos()
  const [adesao, setAdesao] = useState<AdesaoDoPaciente | null>(null)

  useEffect(() => {
    let vivo = true
    setAdesao(null)
    void carregarDiasDoPaciente(pacienteId).then(r => {
      if (!vivo || r === null) return
      /* O dia do APARELHO, e não o de Greenwich: `toISOString` corta em UTC,
         e depois das 21h o "hoje" viraria amanhã -- o defeito que a tela de
         contar o plano tinha até ontem. */
      setAdesao(adesaoDoPaciente(r.temApp ? r.dias : null, dataISO(new Date())))
    })
    return () => {
      vivo = false
    }
  }, [pacienteId])

  if (!adesao) return null

  const destaque = destaqueDaAdesao(adesao)
  const cor =
    destaque === 'bom' ? paleta().cores.verde
    : destaque === 'atencao' ? paleta().cores.gold
    : paleta().inkFraco

  return (
    <View style={styles.linha} accessibilityRole="text">
      <Ionicons
        name={
          adesao.tipo === 'em_dia' ? 'flame-outline'
          : adesao.tipo === 'parou' ? 'pause-circle-outline'
          : 'phone-portrait-outline'
        }
        size={16}
        color={cor}
      />
      <Text style={[styles.texto, destaque !== null && { color: cor, fontWeight: '700' }]}>
        {fraseDaAdesao(adesao)}
        {/* O próximo marco só quando a sequência é boa o bastante para virar
            assunto: "faltam 9 para os 30" é o elogio pronto para ela usar. */}
        {adesao.tipo === 'em_dia' && destaque === 'bom' && adesao.proximoMarco !== null
          ? ' Faltam ' + (adesao.proximoMarco - adesao.dias) + ' para os ' + adesao.proximoMarco + '.'
          : ''}
      </Text>
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    texto: { flex: 1, fontSize: 13.5, lineHeight: 19, color: t.inkSuave },
  }),
)
