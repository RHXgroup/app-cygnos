import { falha } from './erros'
import { supabase } from './supabase'

/* O recado que a nutricionista escreveu para ela.
 *
 * ── Por que isto vale mais do que qualquer recurso ────────────────────────
 * Pesquisei os concorrentes. O Foodvisor cobra premium para dar chat com "uma
 * nutricionista"; o Noom vende "coach", que na prática é roteiro. Nenhum deles
 * tem a profissional que a pessoa JÁ CONSULTA.
 *
 * Este app tem, e ela não aparecia na tela que abre todo dia — só como plano,
 * exame e mensagem, todos atrás de um toque. Um recado dela na inicial é o
 * motivo mais forte que existe para abrir o app, e é a única coisa que nenhum
 * concorrente pode copiar.
 *
 * ── LER MARCA COMO LIDO ───────────────────────────────────────────────────
 * Esta é a regra que muda como a função pode ser chamada, e ela vem do lado do
 * servidor: a primeira leitura grava `lido_em`.
 *
 * Isso existe para a NUTRICIONISTA: saber que o recado foi lido é o que faz
 * ela continuar escrevendo. Sem isso ela escreve duas vezes e para.
 *
 * A consequência aqui é dura e precisa ficar escrita: NÃO CHAME ISTO EM
 * PRÉ-CARREGAMENTO. Chamar "para já ter pronto" marcaria como lido um recado
 * que a pessoa nunca viu, e aí o retorno que a nutricionista recebe passa a
 * mentir para ela. Só quando o cartão vai de fato aparecer.
 *
 * ── E o recado não evapora ────────────────────────────────────────────────
 * Quando ela escreve um novo, o anterior vira mensagem na conversa — gatilho no
 * banco, do lado de lá. Então aqui só existe o ATUAL, e não é preciso guardar
 * histórico: ele está na conversa que a paciente já tem.
 *
 * Recado de profissional de saúde que evapora é pior do que recado que ninguém
 * leu. */

export type RecadoDaNutri = {
  texto: string
  criadoEm: string
  /* Nome e foto vêm juntos do servidor, então o cartão não precisa de uma
     segunda consulta para saber quem escreveu. */
  nome: string
  /* Caminho da foto no bucket de avatares, ou nulo. Quem transforma em endereço
     assinado é quem desenha — bucket privado, item 7 do AGENTS.md. */
  foto: string | null
}

/* Devolve o recado, ou NULL.
 *
 * Null cobre tudo o que não é "há recado para mostrar": sem vínculo, sem
 * recado, sem sessão, e também falha de rede. É item 11 do AGENTS.md — isto
 * alimenta um cartão da tela inicial, e um erro aqui não pode derrubá-la nem
 * cobri-la com uma mensagem sobre uma nutricionista que a pessoa talvez nem
 * tenha.
 *
 * Sem recado, o cartão simplesmente não existe. Nada de moldura vazia dizendo
 * "sua nutricionista ainda não escreveu" — isso é cobrança do profissional na
 * cara da paciente, e ela não tem o que fazer com essa informação. */
export async function carregarRecadoDaNutri(): Promise<RecadoDaNutri | null> {
  const { data, error } = await supabase.rpc('app_recado_da_nutri')

  if (error) {
    falha('Não consegui carregar o recado da sua nutricionista.', error)
    return null
  }

  /* O retorno é jsonb, e chega como `unknown`. Um `as` cru deixaria passar o
     dia em que o contrato mudar, e aí o cartão desenharia "undefined" no lugar
     do recado — que é pior do que não desenhar. */
  const r = data as
    | { tem?: boolean; texto?: unknown; criado_em?: unknown; de?: { nome?: unknown; foto?: unknown } }
    | null

  if (!r || r.tem !== true) return null

  const texto = typeof r.texto === 'string' ? r.texto.trim() : ''
  /* Recado em branco não é recado. Se o outro lado deixar passar um, aqui ele
     morre — um cartão vazio com a foto da nutricionista é pior do que nenhum. */
  if (!texto) return null

  return {
    texto,
    criadoEm: typeof r.criado_em === 'string' ? r.criado_em : '',
    nome: typeof r.de?.nome === 'string' && r.de.nome.trim() ? r.de.nome.trim() : 'Sua nutricionista',
    foto: typeof r.de?.foto === 'string' && r.de.foto ? r.de.foto : null,
  }
}

/* O primeiro nome, para o cartão.
 *
 * "Recado de Ana" cabe e soa como gente; "Recado de Ana Carolina Menezes
 * Figueiredo" quebra em duas linhas e soa como cabeçalho de documento. */
export const primeiroNomeDela = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome
