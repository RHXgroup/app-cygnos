import { useEffect, useState } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import { BarraDaNutri, type AbaDaNutri } from '../components/BarraDaNutri'
import { AgendaDaNutriScreen } from './AgendaDaNutriScreen'
import { AuroraDaNutriScreen } from './AuroraDaNutriScreen'
import { LerCodigoScreen } from './LerCodigoScreen'
import { MaisDaNutriScreen } from './MaisDaNutriScreen'
import { PacientesDaNutriScreen } from './PacientesDaNutriScreen'
import { PainelDaNutriScreen } from './PainelDaNutriScreen'
import { estilosDe } from '../lib/tema'

/* A área dela: as abas, e o que abre por cima delas.
 *
 * ──────────────────── Por que UMA aba montada por vez, e não as quatro ────────────────────
 * O app do paciente monta as quatro de uma vez e nunca desmonta -- é carrossel,
 * não navegação -- e isso custou dois defeitos documentados na armadilha 13: um
 * `useEffect` com `[]` que rodava uma vez por SESSÃO em vez de uma por abertura,
 * e uma aba marcando mensagem como lida estando invisível.
 *
 * Aqui não vale a pena pagar esse preço. As telas dela são de LEITURA de dado
 * que muda do outro lado o tempo todo, então remontar ao voltar é o
 * comportamento certo -- ela quer a agenda de agora, e não a de quando abriu o
 * app. O que se perde é o estado da tela (o mês que ela estava olhando), e isso
 * é menos grave do que ver dado velho sem saber que é velho.
 *
 * ──────────────────── O voltar ────────────────────
 * Registrado aqui e SEM lista de dependências, para ficar na frente do tratador
 * central do App -- que, estando na área logada, só sabe fechar sobreposição do
 * paciente. Armadilha 1. A ordem é a de descascar: primeiro o que está por
 * cima, depois a aba, e só então o app sai. */
export function AreaDaNutri({ onSair }: { onSair: () => void }) {
  const styles = estilos()
  const [aba, setAba] = useState<AbaDaNutri>('hoje')
  const [auroraAberta, setAuroraAberta] = useState(false)
  const [lendoCodigo, setLendoCodigo] = useState(false)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lendoCodigo) {
        setLendoCodigo(false)
        return true
      }
      if (auroraAberta) {
        setAuroraAberta(false)
        return true
      }
      /* De qualquer aba, o voltar leva à inicial antes de sair do app. É o que
         todo mundo espera, e é o degrau que impede o gesto de fechar o app com
         ela no meio da agenda. */
      if (aba !== 'hoje') {
        setAba('hoje')
        return true
      }
      return false
    })
    return () => sub.remove()
  })

  /* As sobreposições vêm ANTES das abas e substituem a tela inteira: as duas
     são gestos de um minuto, e a barra de abas embaixo delas só ofereceria uma
     saída que o próprio cabeçalho já oferece. */
  if (lendoCodigo) {
    return <LerCodigoScreen paraBaseDaNutri onFechar={() => setLendoCodigo(false)} />
  }
  if (auroraAberta) {
    return <AuroraDaNutriScreen onFechar={() => setAuroraAberta(false)} />
  }

  return (
    <View style={styles.tela}>
      <View style={styles.conteudo}>
        {aba === 'hoje' && (
          <PainelDaNutriScreen
            onSair={onSair}
            onVerAgenda={() => setAba('agenda')}
            onLerCodigo={() => setLendoCodigo(true)}
          />
        )}
        {aba === 'agenda' && <AgendaDaNutriScreen />}
        {aba === 'pacientes' && <PacientesDaNutriScreen />}
        {aba === 'mais' && (
          <MaisDaNutriScreen onSair={onSair} onLerCodigo={() => setLendoCodigo(true)} />
        )}
      </View>

      <BarraDaNutri ativa={aba} onTrocar={setAba} onAurora={() => setAuroraAberta(true)} />
    </View>
  )
}

const estilos = estilosDe(t =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: t.cores.fundo },
    conteudo: { flex: 1 },
  }),
)
