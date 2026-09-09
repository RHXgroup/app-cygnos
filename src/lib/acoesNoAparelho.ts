import { confirmarAcao, type AcaoPendente, type RespostaDaAurora } from './auroraDaNutri'
import { criarAviso } from './avisosDaNutri'
import { ehDoAparelho } from './ferramentasDoAparelho'

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

  if (acao.ferramenta === 'criar_aviso') return await avisar(acao)

  /* Está na lista e não tem caminho: é erro de programação, não da pessoa. A
     frase diz que nada aconteceu, porque é o que importa para quem acabou de
     tocar em Confirmar. */
  return { tipo: 'erro', mensagem: 'Não consegui fazer isso aqui. Nada foi criado.' }
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

  const r = await criarAviso(texto, quando)

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
        'O aparelho não deixou avisar, então não criei nada. Ligue as ' +
        'notificações do Cygnos nas configurações do telefone e me peça de novo.',
    }
  }

  return { tipo: 'erro', mensagem: r.mensagem }
}
