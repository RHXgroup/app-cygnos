import { useEffect, useState } from 'react'
import { useRef } from 'react'
import { BackHandler, PanResponder, StyleSheet, View } from 'react-native'
import { BarraDaNutri, type AbaDaNutri } from '../components/BarraDaNutri'
import { AgendaDaNutriScreen } from './AgendaDaNutriScreen'
import { AuroraDaNutriScreen } from './AuroraDaNutriScreen'
import { FotoDoPratoDaNutriScreen } from './FotoDoPratoDaNutriScreen'
import { LerCodigoScreen } from './LerCodigoScreen'
import { MaisDaNutriScreen } from './MaisDaNutriScreen'
import { PacientesDaNutriScreen } from './PacientesDaNutriScreen'
import { PainelDaNutriScreen } from './PainelDaNutriScreen'
import { estilosDe } from '../lib/tema'
import { abaDoDeslize } from '../lib/deslizarEntreAbas'

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
  const [fotografando, setFotografando] = useState(false)

  /* ──────────────────── DESLIZAR ENTRE AS ABAS ────────────────────
   *
   * Pedido dele depois de usar: "raspo o lado com o dedo no do paciente e ele
   * vai navegando entre os menus; aqui não vai, tem que clicar".
   *
   * `PanResponder` e não um carrossel. O app do paciente monta as quatro abas
   * ao mesmo tempo dentro de um ScrollView horizontal, e isso custou os dois
   * defeitos da armadilha 13 -- `useEffect` com `[]` rodando uma vez por SESSÃO
   * e aba invisível marcando mensagem como lida. Esta área monta UMA por vez de
   * propósito, e o gesto não pode desfazer essa decisão: ele só troca qual
   * está montada.
   *
   * ── CAPTURA, e não bolha. Eu tinha escrito o contrário, e não funcionava ──
   *
   * A primeira versão usava `onMoveShouldSetPanResponder` (fase de bolha), com
   * o argumento de que assim as faixas horizontais -- os chips de Pacientes --
   * continuariam rolando. O argumento estava certo e a premissa errada: em
   * bolha o pai só é consultado se os filhos RECUSAREM, e cada aba é um
   * `ScrollView` que ocupa a tela inteira e agarra o toque assim que ele se
   * move. O pai nunca era perguntado, e o gesto simplesmente não existia.
   *
   * Eu commitei isso como pronto sem ter deslizado num aparelho. `tsc` limpo e
   * 307 casos verdes não dizem nada sobre quem ganha o toque -- essa parte só
   * o dedo responde.
   *
   * Com `Capture` o pai decide ANTES dos filhos, e por isso os limiares deixam
   * de ser conforto e viram a única proteção: 60px e o dobro de horizontal
   * sobre vertical. Rolagem comum passa longe dos dois.
   *
   * `useRef` porque `PanResponder.create` guarda as funções que recebeu: um
   * responder recriado a cada renderização deixa o gesto em curso apontando
   * para o `aba` de duas renderizações atrás. */
  const abaAgora = useRef<AbaDaNutri>('hoje')
  abaAgora.current = aba

  const gesto = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => abaDoDeslize(abaAgora.current, g.dx, g.dy) !== null,
      onPanResponderRelease: (_e, g) => {
        const destino = abaDoDeslize(abaAgora.current, g.dx, g.dy)
        if (destino) setAba(destino)
      },
    }),
  ).current

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fotografando) {
        setFotografando(false)
        return true
      }
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
  if (fotografando) {
    return <FotoDoPratoDaNutriScreen onFechar={() => setFotografando(false)} />
  }
  if (auroraAberta) {
    return <AuroraDaNutriScreen onFechar={() => setAuroraAberta(false)} />
  }

  return (
    <View style={styles.tela}>
      <View style={styles.conteudo} {...gesto.panHandlers}>
        {aba === 'hoje' && (
          <PainelDaNutriScreen
            onSair={onSair}
            onLerCodigo={() => setLendoCodigo(true)}
          />
        )}
        {aba === 'agenda' && <AgendaDaNutriScreen />}
        {aba === 'pacientes' && <PacientesDaNutriScreen />}
        {aba === 'mais' && (
          <MaisDaNutriScreen
            onSair={onSair}
            onLerCodigo={() => setLendoCodigo(true)}
            onFotoDoPrato={() => setFotografando(true)}
          />
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
