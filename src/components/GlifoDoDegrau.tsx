import Svg, { Circle, Path } from 'react-native-svg'
import type { Degrau } from '../lib/escadaDaAceitacao'

/* O desenho de cada degrau da escada.
 *
 * ── Por que desenho, e não número ─────────────────────────────────────────
 * A mãe vira o celular para o filho ver em que fase ele está. Uma criança de
 * cinco anos não lê "degrau 5 de 7" — ela reconhece um nariz, uma mão, uma
 * boca. O ícone é o que torna a escada mostrável.
 *
 * ── E por que os SENTIDOS ─────────────────────────────────────────────────
 * Os degraus são a ordem real em que uma criança se aproxima de um alimento
 * novo: chegar perto, mexer, cheirar, tocar, provar, comer. Cada um acrescenta
 * um sentido. Desenhar o sentido é desenhar o que de fato aconteceu, e é por
 * isso que a sequência se lê sem legenda.
 *
 * A recusa é a exceção, e de propósito: ela não é um sentido — é o rosto
 * virando. Nada de X, nada de proibido, nada de vermelho. Ver a armadilha
 * central em lib/escadaDaAceitacao.ts: recusar é o degrau 1, não um erro.
 *
 * ── Ionicons não serve aqui ───────────────────────────────────────────────
 * O resto do app usa Ionicons, e seria mais barato. Mas não há nariz nem boca
 * lá, e substituir por "sparkles" e "happy" perderia exatamente o que faz a
 * criança entender sozinha. Estes oito traços são o custo de a escada ser
 * legível para quem não lê. */

/* Traço, e não preenchimento: o mesmo desenho serve grande no cartão e pequeno
   na trilha, e forma cheia vira mancha nos tamanhos pequenos. */
const TRACO = 1.9

export function GlifoDoDegrau({
  sentido,
  cor,
  tamanho = 24,
}: {
  sentido: Degrau['sentido']
  cor: string
  tamanho?: number
}) {
  const comum = {
    stroke: cor,
    strokeWidth: TRACO,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }

  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      {sentido === 'virouORosto' && (
        /* Uma seta que se afasta. Não é um X e não é um "proibido": o alimento
           apareceu e a criança se afastou dele, o que é uma informação, não uma
           infração. */
        <>
          <Path d="M15.5 4.5 8 12l7.5 7.5" {...comum} />
          <Path d="M19.5 12H8.4" {...comum} />
        </>
      )}

      {sentido === 'perto' && (
        /* O prato, à distância que a criança tolerou. */
        <>
          <Circle cx="12" cy="12.5" r="7.6" {...comum} />
          <Circle cx="12" cy="12.5" r="3.1" {...comum} />
        </>
      )}

      {sentido === 'mao' && (
        /* A mão inteira: mexer, empurrar com o garfo, ajudar a servir. */
        <Path
          d="M8 12V5.5a1.6 1.6 0 0 1 3.2 0V11m0-1V4.6a1.6 1.6 0 0 1 3.2 0V11m0-.6V6.4a1.6 1.6 0 0 1 3.2 0V14c0 4-2.6 7-6.4 7S5 18.4 5 15.4v-2a1.6 1.6 0 0 1 3-.8"
          {...comum}
        />
      )}

      {sentido === 'cheiro' && (
        /* Perfil com o nariz, e o sopro saindo. */
        <>
          <Path d="M12 3.4v7.4c0 1.4.7 2 1.6 2.8.9.8.6 2.2-.7 2.2H12" {...comum} />
          <Path d="M8.6 17.6c1 1.4 4.8 1.4 5.8 0" {...comum} />
        </>
      )}

      {sentido === 'toque' && (
        /* Um dedo encostando — a ponta do dedo é onde este degrau começa. */
        <>
          <Path d="M12 3.6v9" {...comum} />
          <Path d="M9 8.6v4" {...comum} />
          <Path d="M15 8.6v4" {...comum} />
          <Path d="M6 12.6c0 4.2 2.7 7.4 6 7.4s6-3.2 6-7.4" {...comum} />
        </>
      )}

      {sentido === 'boca' && (
        /* Lábios com a língua: lambeu, mordeu — mesmo tendo cuspido depois.
           Provar não é engolir, e o desenho não pode sugerir que foi. */
        <>
          <Path d="M4.6 9.6h14.8" {...comum} />
          <Path d="M6.1 9.6c0 3 2.6 5.4 5.9 5.4s5.9-2.4 5.9-5.4" {...comum} />
          <Path d="M10.6 14.7c0 2.3.6 4.3 1.4 4.3s1.4-2 1.4-4.3" {...comum} />
        </>
      )}

      {sentido === 'bocaCheia' && (
        /* Comeu. É o único degrau que conta como consumo, e o único desenho
           fechado — os outros são gestos, este é o fim do caminho. */
        <>
          <Path d="M4 11.6c2.4-3 5-4.5 8-4.5s5.6 1.5 8 4.5c-2.4 3.4-5 5.1-8 5.1s-5.6-1.7-8-5.1Z" {...comum} />
          <Path d="M4.4 11.6h15.2" {...comum} />
        </>
      )}
    </Svg>
  )
}
