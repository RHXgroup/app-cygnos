import * as ImagePicker from 'expo-image-picker'
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator'
import { rotinaDaIA, type RotinaConvertida, type RotinaDaIA } from './rotinaDaIA'
import { supabase } from './supabase'

/* A IA monta a rotina de treino de quem não tem personal.
 *
 * Existe pelo mesmo motivo da sugestão de plano alimentar: montar do zero é o
 * degrau que faz desistir. Escolher exercício, dia, série e repetição sem saber
 * o que combina com o quê é tela vazia — e a aba de treino do app fica vazia
 * junto. Dizer "quero treinar três vezes por semana, em casa, com halteres" é
 * uma frase.
 *
 * ── O que isto NÃO é ───────────────────────────────────────────────────────
 * Prescrição de treino. A rotina vem, a pessoa lê dia por dia, tira o que não
 * consegue fazer, e SÓ ENTÃO vira rotina no banco. Mesma doutrina da foto do
 * prato, do ditado e do plano: o que a IA produz passa pelos olhos de quem vai
 * executar.
 *
 * ── Por que não grava aqui ─────────────────────────────────────────────────
 * Gravar direto criaria a rotina antes de alguém olhar, e trocar a que já
 * existe. Quem confirma é a tela, chamando `adicionarExercicio` do treino.ts —
 * o mesmo caminho de quem monta na mão.
 *
 * ── A conversão mora em `rotinaDaIA` ───────────────────────────────────────
 * Aqui fica só o que fala com a rede. Lá é código puro, sem import de runtime,
 * e por isso dá para exercitá-lo com JSON de verdade fora do aparelho. */

export type PedidoDeTreino = {
  /* O que a pessoa disse que quer, falado ou escrito. É a entrada principal, e
     a única obrigatória. */
  pedido: string
  dias: number
  minutos: number | null
  onde: string
  experiencia: string
  /* Lesão e limitação. Vai para a função como regra absoluta do prompt — e é o
     campo em que errar tem consequência física, não só de dado errado. */
  limitacoes: string
  idade: number | null
  genero: string | null
  pesoKg: number | null
}

export type ResultadoTreinoIA =
  | { tipo: 'ok'; rotina: RotinaConvertida }
  | { tipo: 'limite'; mensagem: string }
  | { tipo: 'erro'; mensagem: string }

export async function pedirRotina(p: PedidoDeTreino): Promise<ResultadoTreinoIA> {
  let bruto: RotinaDaIA
  try {
    const { data, error } = await supabase.functions.invoke('app-gerar-treino', {
      body: {
        pedido: p.pedido,
        dias: p.dias,
        minutos: p.minutos,
        onde: p.onde,
        experiencia: p.experiencia,
        limitacoes: p.limitacoes,
        idade: p.idade,
        genero: p.genero,
        pesoKg: p.pesoKg,
      },
    })

    if (error) {
      /* O supabase-js embrulha a resposta de erro: sem abrir o context, toda
         falha viraria "FunctionsHttpError" na tela — e a função foi escrita
         justamente para dizer o que aconteceu. Mesmo tratamento do plano, da
         foto do prato e do ditado. */
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      const codigo = corpo?.error as string | undefined

      if (codigo === 'sem_pedido') {
        return {
          tipo: 'erro',
          mensagem:
            String(corpo?.message ?? '') || 'Me diga o que você quer treinar para eu montar a rotina.',
        }
      }
      if (codigo === 'forbidden' || codigo === 'unauthorized') {
        return { tipo: 'erro', mensagem: 'Sua sessão expirou. Entre de novo para pedir a rotina.' }
      }
      /* A função devolve `nao_liberado` quando o recurso 'treino' ainda não
         existe na tabela de limites. Chamar isso de "muitas rotinas em pouco
         tempo" mandaria a pessoa esperar por algo que nunca destrava sozinho. */
      if (codigo === 'nao_liberado') {
        return {
          tipo: 'erro',
          mensagem: String(corpo?.message ?? '') || 'A rotina por IA ainda não foi liberada.',
        }
      }
      /* O limite tem mensagem escrita pela função, e ela diz quanto esperar —
         repor por uma genérica apagaria a única informação acionável. */
      if (codigo === 'limite') {
        return {
          tipo: 'limite',
          mensagem:
            String(corpo?.message ?? '') || 'Muitas rotinas em pouco tempo. Tente de novo mais tarde.',
        }
      }
      if (codigo === 'treino_longo') {
        return { tipo: 'erro', mensagem: 'A rotina ficou grande demais. Tente com menos dias.' }
      }
      return {
        tipo: 'erro',
        mensagem: 'Não consegui montar a rotina agora. Verifique a conexão e tente de novo.',
      }
    }

    bruto = (data?.treino ?? {}) as RotinaDaIA
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui falar com o servidor. Verifique a conexão.' }
  }

  const rotina = rotinaDaIA(bruto)
  if (rotina.exercicios.length === 0) {
    return {
      tipo: 'erro',
      mensagem: 'A resposta não trouxe exercício nenhum. Tente descrever o treino de outro jeito.',
    }
  }
  return { tipo: 'ok', rotina }
}

/* ── A ficha da academia, por foto ─────────────────────────────────────────*/

/* Muita academia monta o treino no aplicativo DELA, e a pessoa não consegue
 * exportar aquilo para lugar nenhum. O que ela consegue é tirar um print da
 * tela, ou fotografar a ficha de papel pendurada no aparelho.
 *
 * Sem isto, quem já tem treino montado por um profissional teria de redigitar
 * exercício por exercício aqui — e não vai. Digitar sete dias de ficha é
 * exatamente o degrau que faz alguém abandonar a aba de treino.
 *
 * ── A resolução, e por que 1600 e não 1024 ────────────────────────────────
 * A foto do prato usa 1024, e ali sobra: o modelo precisa reconhecer comida,
 * que ocupa a imagem inteira. Aqui ele precisa LER LETRA — nome de exercício em
 * tabela apertada, muitas vezes print de tela de celular. A 1024 a linha
 * "3x12" some, e o que some vira exercício sem série.
 *
 * ── O que ela NÃO faz ─────────────────────────────────────────────────────
 * Gravar. Devolve a rotina no mesmo formato da rotina gerada, passa pelo mesmo
 * `rotinaDaIA` — que já tem teste — e a pessoa confere dia por dia antes de
 * virar rotina. */
const LADO_MAIOR_FICHA = 1600

export async function lerFichaDaFoto(
  origem: 'galeria' | 'camera',
): Promise<ResultadoTreinoIA | { tipo: 'cancelado' }> {
  const { granted } =
    origem === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!granted) {
    return {
      tipo: 'erro',
      mensagem:
        origem === 'camera'
          ? 'Preciso de acesso à câmera. Você pode liberar nos ajustes do aparelho.'
          : 'Preciso de acesso às suas fotos. Você pode liberar nos ajustes do aparelho.',
    }
  }

  const escolha =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 1,
          /* Tela cheia, e não o padrão: apresentação em folha por cima de outra
             é o que fazia a promise da câmera nunca resolver. */
          presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 1,
        })

  if (escolha.canceled || !escolha.assets?.[0]) return { tipo: 'cancelado' }

  let base64: string
  try {
    /* Só a largura: passar as duas dimensões esticaria uma ficha retangular
       para um quadrado, e letra deformada é letra que não se lê. */
    const reduzida = await manipulateAsync(
      escolha.assets[0].uri,
      [{ resize: { width: LADO_MAIOR_FICHA } }],
      { compress: 0.85, format: SaveFormat.JPEG, base64: true },
    )
    if (!reduzida.base64) {
      return { tipo: 'erro', mensagem: 'Não consegui preparar a foto. Tente de novo.' }
    }
    base64 = reduzida.base64
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui preparar a foto. Tente de novo.' }
  }

  let bruto: RotinaDaIA
  try {
    const { data, error } = await supabase.functions.invoke('app-ler-treino-foto', {
      body: { imageBase64: base64, mimeType: 'image/jpeg' },
    })

    if (error) {
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      const codigo = corpo?.error as string | undefined
      if (codigo === 'forbidden' || codigo === 'unauthorized') {
        return { tipo: 'erro', mensagem: 'Sua sessão expirou. Entre de novo para importar a ficha.' }
      }
      if (codigo === 'nao_liberado') {
        return {
          tipo: 'erro',
          mensagem: String(corpo?.message ?? '') || 'A leitura de ficha ainda não foi liberada.',
        }
      }
      if (codigo === 'limite') {
        return {
          tipo: 'limite',
          mensagem:
            String(corpo?.message ?? '') || 'Muitas fichas em pouco tempo. Tente de novo mais tarde.',
        }
      }
      return {
        tipo: 'erro',
        mensagem: 'Não consegui ler a ficha agora. Verifique a conexão e tente de novo.',
      }
    }

    bruto = (data?.treino ?? {}) as RotinaDaIA
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui falar com o servidor. Verifique a conexão.' }
  }

  const rotina = rotinaDaIA(bruto)
  if (rotina.exercicios.length === 0) {
    return {
      tipo: 'erro',
      /* A mensagem diz o que FAZER, e não só que deu errado. Foto de ficha
         falha por motivo físico — reflexo, foco, corte —, e todos têm conserto
         na segunda tentativa. */
      mensagem:
        'Não consegui ler exercício nenhum nessa foto. Tente de novo com a ficha bem enquadrada e sem reflexo.',
    }
  }
  return { tipo: 'ok', rotina }
}

/* ── Adaptar um exercício à limitação da pessoa ────────────────────────────*/

export type Alternativa = { nome: string; porque: string }

export type ResultadoAdaptacao =
  | { tipo: 'ok'; alternativas: Alternativa[]; aviso: string | null }
  | { tipo: 'sem_limitacao'; mensagem: string }
  | { tipo: 'limite'; mensagem: string }
  | { tipo: 'erro'; mensagem: string }

/* Pede alternativas para um exercício que a limitação dela não permite.
 *
 * Quem tem problema no ombro precisa adaptar TODO exercício que carrega o
 * ombro. A rotina montada por IA já respeita isso; a ficha importada da ACADEMIA
 * não sabe de nada — ela foi montada para uma pessoa média.
 *
 * A limitação NÃO vai daqui: a função a lê do banco. Ela é a regra de segurança
 * desta chamada, e mandá-la do cliente deixaria o chamador escolher a própria
 * regra — um corpo sem o campo viraria "sem limitação nenhuma", que é
 * exatamente a resposta perigosa. */
export async function adaptarExercicio(
  exercicio: string,
  observacao: string | null,
  onde: string,
): Promise<ResultadoAdaptacao> {
  try {
    const { data, error } = await supabase.functions.invoke('app-adaptar-exercicio', {
      body: { exercicio, observacao, onde },
    })

    if (error) {
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      const codigo = corpo?.error as string | undefined

      if (codigo === 'sem_limitacao') {
        return {
          tipo: 'sem_limitacao',
          mensagem:
            String(corpo?.message ?? '') ||
            'Me conte primeiro qual é a sua limitação, para eu saber o que evitar.',
        }
      }
      if (codigo === 'forbidden' || codigo === 'unauthorized') {
        return { tipo: 'erro', mensagem: 'Sua sessão expirou. Entre de novo.' }
      }
      if (codigo === 'nao_liberado') {
        return {
          tipo: 'erro',
          mensagem: String(corpo?.message ?? '') || 'Adaptar exercício ainda não foi liberado.',
        }
      }
      if (codigo === 'limite') {
        return {
          tipo: 'limite',
          mensagem: String(corpo?.message ?? '') || 'Muitas adaptações em pouco tempo.',
        }
      }
      return { tipo: 'erro', mensagem: 'Não consegui adaptar agora. Verifique a conexão.' }
    }

    const bruto = (data?.adaptacao ?? {}) as {
      alternativas?: unknown
      aviso?: unknown
    }

    /* A validação é a mesma doutrina do resto: o que não dá para ler é
       DESCARTADO, e o que sobra é o que a tela mostra. Uma alternativa sem nome
       viraria linha em branco que a pessoa tocaria sem saber no quê. */
    const lista = Array.isArray(bruto.alternativas) ? bruto.alternativas : []
    const alternativas: Alternativa[] = []
    for (const a of lista.slice(0, 3)) {
      const item = a as { nome?: unknown; porque?: unknown }
      const nome = typeof item?.nome === 'string' ? item.nome.trim().slice(0, 60) : ''
      if (nome.length < 2) continue
      alternativas.push({
        nome,
        porque: typeof item?.porque === 'string' ? item.porque.trim().slice(0, 200) : '',
      })
    }

    const aviso = typeof bruto.aviso === 'string' && bruto.aviso.trim()
      ? bruto.aviso.trim().slice(0, 300)
      : null

    /* Sem alternativa E sem aviso é resposta vazia, e mostrar "nenhuma opção"
       sem dizer por quê deixa a pessoa sem saber se o app falhou ou se o caso
       dela não tem saída. */
    if (alternativas.length === 0 && aviso === null) {
      return {
        tipo: 'erro',
        mensagem: 'Não consegui pensar em alternativa para esse. Tente descrever melhor a sua limitação.',
      }
    }

    return { tipo: 'ok', alternativas, aviso }
  } catch {
    return { tipo: 'erro', mensagem: 'Não consegui falar com o servidor. Verifique a conexão.' }
  }
}
