/* Os sete objetivos que o paciente escolhe.
 *
 * O que importa aqui e o que ja custou defeito noutros lugares: valor vindo do
 * banco nao pode derrubar a tela (armadilha 10), e o que ja estava gravado nao
 * pode virar "sem foco" da noite para o dia.
 *
 * Rode com: node --experimental-strip-types src/lib/objetivos.teste.mts */

import {
  OBJETIVOS,
  nomeDoObjetivo,
  objetivoDe,
  sentidoDoObjetivo,
} from './objetivos.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, extra = '') {
  if (condicao) {
    passou++
    console.log('  ok    ' + nome)
  } else {
    falhou++
    console.log('  FALHOU ' + nome + (extra ? '  -> ' + extra : ''))
  }
}

/* == SAO ONZE, E OS DOZE PERIGOSOS FICAM FORA ========================== */
{
  ok('sao onze', OBJETIVOS.length === 11, String(OBJETIVOS.length))

  /* Estes doze NAO podem entrar, e cada um por um motivo proprio:
     - doenca_renal restringe proteina para 0,80 g/kg, e marcar por engano
       causa dano real;
     - gestacao, lactacao e bariatrica mudam por trimestre ou fase, com
       suplementacao e laboratorio;
     - tireoide, esteatose e sop se calibram por exame de sangue;
     - compulsao_alimentar tem conduta articulada com psicologia, e o proprio
       texto do sistema diz que peso nao e o alvo primario;
     - seletividade, neurodesenvolvimento e pediatrico sao sobre um FILHO;
     - sarcopenia e achado clinico, nao escolha.

     Este caso e a unica defesa automatica contra alguem acrescentar um deles
     "porque o sistema tem". */
  const proibidos = [
    'gestacao', 'lactacao', 'doenca_renal', 'bariatrica', 'sop', 'tireoide',
    'esteatose_hepatica', 'sarcopenia', 'ganho_peso_pediatrico',
    'seletividade_alimentar', 'compulsao_alimentar',
    'transtornos_neurodesenvolvimento',
  ]
  const invadiu = OBJETIVOS.filter(o => proibidos.includes(o.chave)).map(o => o.chave)
  ok('nenhum dos doze perigosos entrou', invadiu.length === 0, invadiu.join(', '))
}

/* == OS QUATRO DE CONDICAO ============================================== */
{
  // A pessoa JA SABE que tem: marcar nao e se diagnosticar.
  const daSaude = ['controle_glicemico', 'cardiovascular', 'menopausa', 'saude_intestinal']
  for (const chave of daSaude) {
    const o = OBJETIVOS.find(x => x.chave === chave)
    ok(chave + ' esta na lista', !!o)
    ok(chave + ' pede acompanhamento', o?.pedeAcompanhamento === true)
  }

  ok(
    'sao exatamente quatro que pedem acompanhamento',
    OBJETIVOS.filter(o => o.pedeAcompanhamento).length === 4,
  )

  // Os sete de direcao de vida NAO podem pedir acompanhamento -- a frase
  // apareceria para quem so quer emagrecer, e viraria ruido.
  ok(
    'emagrecimento nao pede acompanhamento',
    OBJETIVOS.find(o => o.chave === 'emagrecimento')?.pedeAcompanhamento === undefined,
  )

  // O ajuste dos quatro e BRANDO. Foi o argumento para deixa-los entrar; se um
  // dia alguem apertar um deles, este caso reprova.
  const bruscos = OBJETIVOS.filter(o => o.pedeAcompanhamento && Math.abs(o.ajustePct) > 10)
  ok('nenhum deles ajusta mais que 10%', bruscos.length === 0, bruscos.map(o => o.chave).join(', '))

  // E nenhum deles restringe proteina: e o que separa estes quatro do
  // doenca_renal, que ficou de fora justamente por causa disso.
  const restritivos = OBJETIVOS.filter(o => o.pedeAcompanhamento && o.proteinaGkg < 1.2)
  ok('nenhum deles restringe proteina', restritivos.length === 0, restritivos.map(o => o.chave).join(', '))
}

/* == CADA UM ESTA COMPLETO ============================================== */
{
  const semNome = OBJETIVOS.filter(o => !o.nome.trim())
  const semResumo = OBJETIVOS.filter(o => !o.resumo.trim())
  const semIcone = OBJETIVOS.filter(o => !o.icone.trim())
  ok('todos tem nome', semNome.length === 0)
  ok('todos tem resumo', semResumo.length === 0)
  // Uma lista com seis icones e um sem e a primeira coisa que se nota.
  ok('todos tem icone', semIcone.length === 0, semIcone.map(o => o.chave).join(', '))

  const chaves = OBJETIVOS.map(o => o.chave)
  ok('nenhuma chave repetida', new Set(chaves).size === chaves.length)

  // Resumo curto: ele mora embaixo do nome, numa linha. Passando disso, quebra
  // em duas e a lista de sete vira rolagem.
  const longos = OBJETIVOS.filter(o => o.resumo.length > 60)
  ok('resumos cabem numa linha', longos.length === 0, longos.map(o => o.chave).join(', '))
}

/* == O QUE JA ESTAVA GRAVADO CONTINUA VALENDO ========================== */
{
  // Apagar os tres antigos faria todo mundo aparecer "sem foco definido" da
  // noite para o dia.
  ok('perda vira emagrecimento', objetivoDe('perda')?.chave === 'emagrecimento')
  ok('manter vira manutencao', objetivoDe('manter')?.chave === 'manutencao')
  ok('ganho vira ganho_peso', objetivoDe('ganho')?.chave === 'ganho_peso')

  ok('e o nome sai certo para o antigo', nomeDoObjetivo('perda') === 'Perder gordura', nomeDoObjetivo('perda'))
  ok('o sentido do antigo tambem', sentidoDoObjetivo('perda') === 'perder')
}

/* == VALOR DE FORA NAO DERRUBA, E NAO CHUTA ============================ */
{
  // Armadilha 10: a nutricionista define `gestacao` do lado dela, e isso chega
  // aqui como uma palavra que o app nunca viu.
  ok('chave desconhecida devolve null', objetivoDe('doenca_renal') === null)
  ok('e nao chuta um dos onze', nomeDoObjetivo('doenca_renal') !== 'Perder gordura')
  ok(
    'o texto admite que o app nao sabe',
    nomeDoObjetivo('doenca_renal').includes('nutricionista'),
    nomeDoObjetivo('doenca_renal'),
  )
  ok('sem sentido para o desconhecido', sentidoDoObjetivo('doenca_renal') === null)

  ok('null nao quebra', objetivoDe(null) === null)
  ok('undefined nao quebra', objetivoDe(undefined) === null)
  ok('string vazia nao quebra', objetivoDe('') === null)
  ok('sem foco tem frase propria', nomeDoObjetivo(null) === 'sem foco definido')
}

/* == O SENTIDO DE CADA UM =============================================== */
{
  ok('emagrecimento perde', sentidoDoObjetivo('emagrecimento') === 'perder')
  ok('hipertrofia ganha', sentidoDoObjetivo('hipertrofia') === 'ganhar')
  ok('ganho_peso ganha', sentidoDoObjetivo('ganho_peso') === 'ganhar')
  ok('manutencao mantem', sentidoDoObjetivo('manutencao') === 'manter')

  // Os dois que enganam: recomposicao e reeducacao trabalham PERTO da
  // manutencao. Chamar reeducacao de "perder" seria o app inventando uma meta
  // que ninguem pediu.
  ok('recomposicao mantem', sentidoDoObjetivo('recomposicao') === 'manter')
  ok('reeducacao mantem', sentidoDoObjetivo('reeducacao_alimentar') === 'manter')

  const sentidos = new Set(OBJETIVOS.map(o => o.sentido))
  ok('os tres sentidos aparecem', sentidos.size === 3, [...sentidos].join(', '))
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
