import { useEffect, useState } from 'react'
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
