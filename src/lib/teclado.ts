import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/* Quanto o teclado está ocupando da tela, em pixels. Zero quando está fechado.
 *
 * ── Por que isto existe ────────────────────────────────────────────────────
 * O Expo liga edge-to-edge por padrão no Android, e com ele **a janela não
 * encolhe mais** quando o teclado sobe. Quem posiciona por absoluto, ou precisa
 * decidir se ainda há barra de gestos para desviar, tem que medir.
 *
 * Os dois sistemas deslocam. Antes só o iOS o fazia, porque o Android encolhia
 * a janela inteira e somar a altura empurraria duas vezes. Essa premissa caiu.
 *
 * Nasceu dentro do BuscarAlimentoScreen e saiu de lá quando a segunda tela
 * precisou da mesma conta. Duas cópias da mesma medida divergem no dia em que
 * uma delas for corrigida — ver a armadilha 5 do AGENTS.md. */
export function useAlturaTeclado(): number {
  const [altura, setAltura] = useState(0)

  useEffect(() => {
    /* Will* no iOS acompanha a animação do teclado; o Android só emite Did*, e
       lá o conteúdo salta depois que ela termina — feio, mas visível, que é o
       oposto do que acontecia antes. */
    const ehIOS = Platform.OS === 'ios'

    const aoAbrir = Keyboard.addListener(ehIOS ? 'keyboardWillShow' : 'keyboardDidShow', e =>
      setAltura(e.endCoordinates.height),
    )
    const aoFechar = Keyboard.addListener(ehIOS ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setAltura(0),
    )

    return () => {
      aoAbrir.remove()
      aoFechar.remove()
    }
  }, [])

  return altura
}

/* O deslocamento que a tela precisa para não ficar atrás do teclado.
 *
 * ── A conta, medida no aparelho ────────────────────────────────────────────
 * `endCoordinates.height` devolve a altura do teclado SEM a barra de navegação
 * que fica por baixo dele. Medido: teclado 306, barra 48, e faltavam
 * exatamente 48. As duas SOMAM.
 *
 * ── E a janela pode encolher, dependendo de onde o app roda ────────────────
 * No Expo Go a janela NÃO encolhe — as configurações de Android do app.json são
 * ignoradas lá, e quem manda é o manifesto do próprio Expo Go. Num build de
 * verdade o app.json passa a valer, e o Android pode encolher a janela sozinho.
 *
 * Se encolher, somar de novo empurra o campo para o meio da tela. Era esse o
 * defeito que apareceu na primeira das seis tentativas neste app, e ele voltaria
 * calado no primeiro APK — em produção, na mão de quem baixou.
 *
 * Por isso `alturaDaTela` é opcional e a correção é conservadora: sem ela, ou
 * antes da primeira medida, o comportamento é EXATAMENTE o que está testado
 * hoje. Ela só muda alguma coisa quando prova que a janela encolheu. */
export function useDesvioDoTeclado(areaSegura: number, alturaDaTela?: number): number {
  const alturaTeclado = useAlturaTeclado()
  const semTeclado = useRef(0)

  /* A referência é a altura com o teclado FECHADO. Guardar a de agora com ele
     aberto faria a comparação sempre dizer "não encolheu". */
  if (alturaTeclado === 0 && alturaDaTela) semTeclado.current = alturaDaTela

  if (alturaTeclado === 0) return areaSegura

  /* Encolheu de verdade? Só conta se a diferença for da ordem do teclado — uma
     folga de 40 evita que arredondamento ou uma barra que apareceu sejam lidos
     como encolhimento. */
  const encolheu =
    !!alturaDaTela &&
    semTeclado.current > 0 &&
    semTeclado.current - alturaDaTela > alturaTeclado - 40

  return encolheu ? 0 : alturaTeclado + areaSegura
}

/* O respiro de baixo que a tela precisa AGORA.
 *
 * Com o teclado fechado, é a área segura — a barra de gestos do Android ou a
 * faixa do iPhone. Com o teclado aberto, é zero: o teclado já cobre a barra, e
 * somar os dois abre um vão do tamanho de um dedo entre o campo e o teclado.
 *
 * Errar isso nos dois sentidos já aconteceu neste app: sem a área segura, o
 * campo de escrever da conversa ficava POR BAIXO da barra de gestos e não dava
 * para tocar nele. */
export function useRespiroDeBaixo(areaSegura: number): number {
  return useAlturaTeclado() > 0 ? 0 : areaSegura
}
