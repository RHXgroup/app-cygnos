import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { desvioDoTeclado } from './desvioDoTeclado'

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
 * hoje. Ela só muda alguma coisa quando prova que a janela encolheu.
 *
 * A decisão em si mora em lib/desvioDoTeclado.ts, que não importa nada de
 * runtime e por isso pode ser exercitada no Node com os números medidos no
 * aparelho. Aqui fica só o que precisa do React: medir e lembrar. */
export function useDesvioDoTeclado(areaSegura: number, alturaDaTela?: number): number {
  const alturaTeclado = useAlturaTeclado()
  const semTeclado = useRef(0)

  /* A referência é a altura com o teclado FECHADO. Guardar a de agora com ele
     aberto faria a comparação sempre dizer "não encolheu". */
  if (alturaTeclado === 0 && alturaDaTela) semTeclado.current = alturaDaTela

  return desvioDoTeclado({
    areaSegura,
    alturaTeclado,
    alturaSemTeclado: semTeclado.current,
    alturaAgora: alturaDaTela,
  })
}

/* Aqui morava `useRespiroDeBaixo`, e ele foi APAGADO de propósito.
 *
 * Ele devolvia zero com o teclado aberto, partindo de que o teclado já cobria a
 * barra de gestos. A medição desmentiu: as duas SOMAM, e foi por isso que a
 * conversa passou a usar `useDesvioDoTeclado`. Só que o antigo ficou aqui, sem
 * chamador nenhum, por várias sessões.
 *
 * Duas funções sobre o mesmo assunto, uma delas errada, esperando alguém
 * importar a de cima — é a armadilha 5 do AGENTS.md, que manda apagar a antiga
 * na MESMA alteração em que a substituta entra. Ficou registrado porque quem a
 * deixou para trás foi quem cita a armadilha.
 *
 * Achado por `npm run orfaos`, e não por leitura. */
