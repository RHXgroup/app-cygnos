import AsyncStorage from '@react-native-async-storage/async-storage'
import { carregarMinhasConsultas, consultaLegivel, type MinhaConsulta } from './agenda'
import { carregarCatalogo } from './nutricionista'
import { carregarPlanoDaNutri } from './planoDaNutri'
import { contarNaoLidas } from './mensagens'
import { marcaDe, montarAvisos, type Aviso, type Marca, type Retrato } from './montarAvisos'

/* A BUSCA dos avisos do sino: o que fala com a rede e com o armazém do
   aparelho. Quem decide o que vira aviso é montarAvisos.ts, que não importa
   nada de runtime justamente para poder ser exercitado fora do aparelho.

   Os tipos e a decisão são reexportados aqui embaixo para as telas continuarem
   importando de um lugar só. */

const CHAVE = 'avisos:marca:v1'

async function lerMarca(): Promise<Marca | null> {
  try {
    const cru = await AsyncStorage.getItem(CHAVE)
    if (!cru) return null
    const m = JSON.parse(cru) as Marca
    /* Formato torto é tratado como primeira visita, e não como erro: o pior que
       acontece é a pessoa não ver um aviso que já era antigo. */
    return m && typeof m === 'object' && m.consultas ? m : null
  } catch {
    return null
  }
}

export async function guardarMarca(marca: Marca): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(marca))
  } catch {
    /* Não conseguir guardar significa repetir avisos na próxima abertura.
       Chato, e muito melhor do que derrubar a tela por causa disso. */
  }
}

export type Avisos = {
  lista: Aviso[]
  /* O retrato de AGORA. A tela guarda isto quando a pessoa olha — e não antes:
     carregar não é ver. */
  marca: Marca
}

/* A busca. Junta o que está no servidor, escreve as datas e entrega à decisão. */
export async function carregarAvisos(): Promise<Avisos> {
  /* Cada uma falha para o seu lado. Um aviso a menos é melhor do que uma tela
     de erro no lugar de todos. */
  const [consultas, catalogo, plano, naoLidas, marca] = await Promise.all([
    carregarMinhasConsultas().catch(() => [] as MinhaConsulta[]),
    carregarCatalogo().catch(() => null),
    carregarPlanoDaNutri().catch(() => null),
    contarNaoLidas(),
    lerMarca(),
  ])

  const vinculada = catalogo?.tipo === 'ok' ? catalogo.catalogo.vinculada : null

  const agora: Retrato = {
    consultas: consultas.map(c => ({
      id: c.id,
      status: c.status,
      quando: consultaLegivel(c.dataHora),
    })),
    nutricionista: vinculada ? { id: vinculada.id, nome: vinculada.nome } : null,
    planoId: plano?.id ?? null,
    mensagensNaoLidas: naoLidas,
  }

  return { lista: montarAvisos(agora, marca), marca: marcaDe(agora) }
}

/* As telas importam tudo daqui, e não de dois lugares: a divisão entre buscar e
   decidir é assunto de quem mexe na lib, e não de quem desenha a tela. */
export { montarAvisos, quantosNovos, marcaDe } from './montarAvisos'
export type { Aviso, Marca, Retrato } from './montarAvisos'
