import { confirmarAcao, type AcaoPendente, type RespostaDaAurora } from './auroraDaNutri'
import { apagarAviso, avisosPendentes, criarAviso } from './avisosDaNutri'
import { falha } from './erros'
import { ehDoAparelho } from './ferramentasDoAparelho'
import { supabase } from './supabase'

/* O que a Aurora manda fazer e que só o APARELHO consegue fazer.
 *
 * ──────────────────── Por que esta bifurcação existe ────────────────────
 * Toda ferramenta que grava é uma função do banco, e isso é o que faz a RLS ser
 * a fronteira nos dois lados -- o site e o app chamam a mesma coisa e recebem o
 * mesmo recorte.
 *
 * Um lembrete local não cabe nesse molde. A notificação é agendada pelo sistema
 * operacional do telefone, e nenhum servidor alcança isso: push exigiria
 * development build (o Expo Go não recebe push no Android desde o SDK 53), um
 * token por aparelho e um serviço para disparar. O banco não tem como tocar um
 * alarme no bolso dela.
 *
 * Então a ferramenta para no cartão de confirmação como qualquer escrita -- a
 * conferência antes de gravar continua valendo, e é ela que impede a Aurora de
 * agendar sozinha um aviso que ninguém pediu -- e quem executa depois do sim é
 * este arquivo.
 *
 * ──────────────────── Por que num arquivo próprio ────────────────────
 * Duas razões, e as duas importam.
 *
 * A primeira é de fronteira: `confirmarAcao` fala com o servidor, e é bom que
 * continue sendo só isso. Um `if` no meio dela transformaria a função que
 * "manda executar" numa que "às vezes executa" -- e o próximo a ler não teria
 * como saber, olhando a chamada, se aquilo saiu do telefone ou não.
 *
 * A segunda é de convivência: `auroraDaNutri.ts` está sendo mexido por outra
 * sessão neste momento. Encostar nele agora misturaria o trabalho dos dois num
 * commit só, que é exatamente o que já aconteceu uma vez aqui e não precisa
 * acontecer de novo.
 *
 * ──────────────────── A lista NÃO mora aqui ────────────────────
 * Ela mora em `ferramentasDoAparelho`, que não importa nada de runtime e por
 * isso pode ser conferida no Node contra o registro do outro repositório. Este
 * arquivo só pergunta.
 */

/**
 * Executa a ação confirmada -- aqui, se for do aparelho; no servidor, se não.
 *
 * É esta função que a tela chama, e não `confirmarAcao` direto. O ponto único
 * é o que garante que uma ferramenta local nova não precise de um `if` novo na
 * tela.
 */
export async function executarAcaoConfirmada(acao: AcaoPendente): Promise<RespostaDaAurora> {
  if (!ehDoAparelho(acao.ferramenta)) return confirmarAcao(acao)

  if (acao.ferramenta === 'criar_aviso') return await medindo(acao, avisar)
  if (acao.ferramenta === 'apagar_aviso') return await medindo(acao, desmarcar)

  /* Está na lista e não tem caminho: é erro de programação, não da pessoa. A
     frase diz que nada aconteceu, porque é o que importa para quem acabou de
     tocar em Confirmar. */
  return { tipo: 'erro', mensagem: 'Não consegui fazer isso aqui. Nada foi criado.' }
}

/* ──────────────────── O DESFECHO VOLTA PARA A MEDIÇÃO ────────────────────
 *
 * A medição da Aurora mora no servidor, e ação do aparelho nunca passa por lá --
 * então ela nascia invisível. Achado lendo a tabela com ele: `criar_aviso`
 * aparecia com SEIS chamadas e ZERO confirmações, o que se lê como "ela pede e
 * desiste". Era o contrário: ela confirmava, o lembrete tocava, e ninguém
 * contava.
 *
 * Números que mentem são piores do que números que faltam, porque a decisão
 * seguinte é tomada em cima deles -- eu quase escrevi ferramenta nova achando
 * que o cartão do lembrete tinha um problema de confiança.
 *
 * `aurora_medir` é chamada direto daqui: ela é `security definer`, resolve a
 * carteira sozinha e está liberada para quem tem sessão. Sem texto nenhum -- a
 * tabela não guarda frase, e `mandou_pro_computador` é falso por construção,
 * porque a ação ACONTECEU aqui.
 *
 * E medir NÃO pode atrapalhar: a resposta da ação é devolvida antes, e a falha
 * na medição vira linha de console. Um lembrete que não é criado porque a
 * medição caiu seria trocar o fim pelo meio. */
async function medindo(
  acao: AcaoPendente,
  executar: (a: AcaoPendente) => Promise<RespostaDaAurora>,
): Promise<RespostaDaAurora> {
  const r = await executar(acao)

  void supabase
    .rpc('aurora_medir', {
      p_onde: 'app',
      p_ferramenta: acao.ferramenta,
      /* 'erro' e não 'recusou' quando falha. `recusou` quer dizer que ELA disse
         não, e falha de execução não é recusa dela -- ver o comentário igual no
         `medir` da função do servidor, que tinha essa mesma troca e foi
         corrigido junto. */
      p_desfecho: r.tipo === 'ok' ? 'confirmou' : 'erro',
      p_voltas: 0,
      p_mandou_pro_computador: false,
    })
    .then(({ error }) => {
      if (error) falha('Não consegui medir a ação do aparelho.', error)
    })

  return r
}

/* Tirar um lembrete que ela mesma (ou a Aurora) marcou.
 *
 * A ESCOLHA acontece aqui, e não no modelo: o texto dos lembretes não sai do
 * aparelho (ver `avisosParaAAurora` e a cláusula 5 do contrato de dados), então
 * a Aurora manda as PALAVRAS que ela usou e quem procura é este código.
 *
 * Com mais de um parecido, NÃO apaga nenhum: apagar o lembrete errado é perder
 * silenciosamente uma coisa que ela pediu para não esquecer, e o certo é
 * devolver a escolha para ela. */
async function desmarcar(acao: AcaoPendente): Promise<RespostaDaAurora> {
  const procura = typeof acao.argumentos.procura === 'string' ? acao.argumentos.procura : ''
  const alvo = semAcento(procura)
  if (!alvo) return { tipo: 'erro', mensagem: 'Não entendi qual lembrete apagar. Nada foi apagado.' }

  const lista = await avisosPendentes()
  const achados = lista.filter(a => {
    const texto = semAcento(a.texto)
    /* Por palavra, e não pela frase inteira: ela diz "o da Suelen" e o lembrete
       diz "Falar com a Suelen amanhã". Palavra de duas letras fica de fora --
       "de", "da", "o" casariam com tudo. */
    const palavras = alvo.split(/[^a-z0-9]+/).filter(p => p.length > 2)
    if (palavras.length === 0) return false
    return palavras.some(p => texto.includes(p))
  })

  if (achados.length === 0) {
    return {
      tipo: 'erro',
      mensagem: 'Não achei nenhum lembrete com isso. Nada foi apagado — os seus lembretes estão em Mais.',
    }
  }
  if (achados.length > 1) {
    return {
      tipo: 'erro',
      mensagem:
        'Tenho ' + achados.length + ' lembretes parecidos e não quis apagar o errado. ' +
        'Apague pela tela Mais, ou me diga de um jeito mais específico.',
    }
  }

  await apagarAviso(achados[0].id)
  return { tipo: 'ok', texto: 'Lembrete apagado: ' + achados[0].texto }
}

/* Minúsculas e sem acento, dos dois lados da comparação: ela dita "Suelen" e o
   lembrete pode ter "suelen"; "laboratório" e "laboratorio" são a mesma
   palavra para quem procura. */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

async function avisar(acao: AcaoPendente): Promise<RespostaDaAurora> {
  const texto = typeof acao.argumentos.texto === 'string' ? acao.argumentos.texto : ''
  const cru = acao.argumentos.data_hora

  /* O modelo devolve `2026-09-10T15:00:00`, SEM fuso. Aqui isso é o certo, e é
     o contrário do que vale no servidor: um texto sem fuso é lido pelo
     JavaScript do aparelho como hora LOCAL -- que é o relógio dela, que é
     exatamente o que um lembrete precisa seguir.
     (No banco o mesmo texto vira UTC numa coluna `timestamptz`, e foi assim que
     uma consulta já foi gravada três horas antes do que o cartão dizia. Os dois
     comportamentos são certos nos seus lugares, e é por isso que o fuso não é
     aplicado duas vezes: `comFuso` roda no caminho do servidor, e este não é
     o caminho do servidor.) */
  const quando = typeof cru === 'string' ? new Date(cru) : new Date(Number.NaN)
  if (Number.isNaN(quando.getTime())) {
    return { tipo: 'erro', mensagem: 'Não entendi a hora do aviso. Nada foi criado.' }
  }

  /* 'aurora': foi ela quem pediu, e a lista diz isso na linha do aviso. */
  const r = await criarAviso(texto, quando, 'aurora')

  if (r.tipo === 'ok') {
    /* A frase confirma o INSTANTE, e não só "pronto". Ela pediu "me lembra às
       9" e pode ter recebido amanhã de manhã; sem dizer, ela só descobre não
       sendo avisada hoje. */
    const hhmm =
      String(quando.getHours()).padStart(2, '0') + ':' +
      String(quando.getMinutes()).padStart(2, '0')
    const hoje = new Date()
    const mesmoDia =
      quando.getFullYear() === hoje.getFullYear() &&
      quando.getMonth() === hoje.getMonth() &&
      quando.getDate() === hoje.getDate()
    const dia = mesmoDia
      ? 'hoje'
      : String(quando.getDate()).padStart(2, '0') + '/' +
        String(quando.getMonth() + 1).padStart(2, '0')
    return { tipo: 'ok', texto: `Combinado. Eu te aviso ${dia} às ${hhmm}.` }
  }

  if (r.tipo === 'sem_permissao') {
    return {
      tipo: 'erro',
      mensagem:
        /* Aponta para Mais, e não para "as configurações do telefone".
           Em Mais o botão LEVA até a página certa -- e "vá nas
           configurações" era a frase que ele achou difícil demais, com
           razão: são cinco toques numa árvore que cada fabricante organiza de
           um jeito. */
        'As notificações estão desligadas, então não criei nada. Toque em ' +
        'Mais › Notificações para ligar, e me peça de novo.',
    }
  }

  return { tipo: 'erro', mensagem: r.mensagem }
}
