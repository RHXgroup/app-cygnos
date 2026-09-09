/* Os sinais da carteira, do jsonb ate a frase do painel.
 *
 * O que este arquivo protege: a entrada vem do BANCO como jsonb, atravessa a
 * fronteira do TypeScript como `unknown`, e e montada por uma funcao SQL que
 * mora no OUTRO repositorio. Ou seja: o dia em que alguem trocar um campo la,
 * nada aqui vai reclamar em tempo de compilacao -- vai so aparecer errado no
 * celular dela. Estes casos sao a unica rede embaixo disso.
 *
 * Rode com: node --experimental-strip-types src/lib/sinaisDaCarteira.teste.mts */

import {
  ORDEM,
  diasEmPalavras,
  lerTriagem,
  motivoDe,
  porUrgencia,
  resumoDaAtencao,
  virgula,
} from './sinaisDaCarteira.ts'

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

/* Um item como a `aurora_carteira_triagem` monta de verdade. */
const p = (id: number, nome: string, sinais: Record<string, unknown>) => ({
  paciente_id: id,
  nome,
  idade: 34,
  genero: 'F',
  objetivo: 'Emagrecimento',
  usa_app: true,
  ultima_consulta: '2026-07-01',
  sinais,
})

/* == O QUE ATRAVESSA A FRONTEIRA ======================================== */
{
  console.log('\n1. entrada que nao e lista')
  ok('null vira vazio', lerTriagem(null).length === 0)
  ok('objeto vira vazio', lerTriagem({ itens: [] }).length === 0)
  ok('texto vira vazio', lerTriagem('[]').length === 0)
  ok('numero vira vazio', lerTriagem(7).length === 0)
  ok('lista vazia', lerTriagem([]).length === 0)
}

{
  console.log('\n2. item torto sai fora e o resto fica')
  const cru = [
    null,
    'nao sou objeto',
    { paciente_id: 1 },                                    // sem nome
    { nome: 'Sem id', sinais: { sem_retorno: { dias: 90 } } },
    p(2, 'Sem sinal nenhum', {}),                          // a funcao nao devolve
    p(3, 'Sinal vazio', { sem_retorno: {} }),              // sem `dias`
    p(4, 'Boa', { sem_retorno: { dias: 90, ultima_consulta: '2026-06-10' } }),
  ]
  const fora = lerTriagem(cru)
  ok('sobra so a boa', fora.length === 1, String(fora.length))
  ok('e e a certa', fora[0]?.nome === 'Boa')
  ok('com o sinal lido', fora[0]?.sinais.sem_retorno?.dias === 90)
}

{
  console.log('\n3. os cinco sinais')
  const cru = [
    p(1, 'Gestante', { terceiro_trimestre: { semanas: 28, dpp: '2026-12-01' } }),
    p(2, 'Exame', { exame_parado: { quantidade: 2, desde: '2026-08-12' } }),
    p(3, 'Sumida', { app_silencio: { dias: 40, ultimo_registro: '2026-07-30', nunca_registrou: false } }),
    p(4, 'Peso', { peso_subindo: { de: 70, para: 71.2, delta: 1.2 } }),
    p(5, 'Retorno', { sem_retorno: { dias: 62, ultima_consulta: '2026-07-08' } }),
  ]
  const fora = lerTriagem(cru)
  ok('os cinco entram', fora.length === 5, String(fora.length))

  const motivo = (nome: string) => motivoDe(fora.find(x => x.nome === nome)!)
  ok('gestante', motivo('Gestante') === '28 semanas de gestacao'.replace('acao', 'ação'), motivo('Gestante'))
  ok('exame no plural', motivo('Exame') === '2 exames esperando análise', motivo('Exame'))
  ok('sem retorno', motivo('Retorno') === 'sem retorno há 2 meses', motivo('Retorno'))
  ok('sumiu do app', motivo('Sumida') === 'sem registrar no app há 40 dias', motivo('Sumida'))
  ok('peso com virgula', motivo('Peso') === 'peso subiu 1,2 kg', motivo('Peso'))
}

{
  console.log('\n4. exame no singular, e quem nunca registrou')
  const um = lerTriagem([p(1, 'X', { exame_parado: { quantidade: 1, desde: '2026-08-01' } })])
  ok('um exame', motivoDe(um[0]) === 'exame esperando análise', motivoDe(um[0]))

  /* "Nunca registrou" e "parou de registrar" pedem conversas diferentes. */
  const nunca = lerTriagem([
    p(1, 'Y', { app_silencio: { dias: 30, ultimo_registro: null, nunca_registrou: true } }),
  ])
  ok('nunca registrou tem frase propria',
     motivoDe(nunca[0]) === 'instalou o app e nunca registrou', motivoDe(nunca[0]))
}

/* == A ORDEM E DE URGENCIA, NAO DE NOME ================================= */
{
  console.log('\n5. urgencia')
  const fora = lerTriagem([
    p(1, 'Zilda', { peso_subindo: { de: 70, para: 70.3, delta: 0.3 } }),
    p(2, 'Ana', { app_silencio: { dias: 30, ultimo_registro: null, nunca_registrou: false } }),
    p(3, 'Carla', { terceiro_trimestre: { semanas: 28, dpp: null } }),
    p(4, 'Bruno', { exame_parado: { quantidade: 1, desde: '2026-08-01' } }),
  ])
  const nomes = porUrgencia(fora).map(x => x.nome).join(',')
  ok('gestante primeiro, peso por ultimo', nomes === 'Carla,Bruno,Ana,Zilda', nomes)

  /* Dentro do mesmo sinal, alfabetica. */
  const mesmoSinal = lerTriagem([
    p(1, 'Zilda', { sem_retorno: { dias: 90, ultima_consulta: '2026-06-01' } }),
    p(2, 'Ana', { sem_retorno: { dias: 70, ultima_consulta: '2026-06-20' } }),
  ])
  ok('empate desempata por nome',
     porUrgencia(mesmoSinal).map(x => x.nome).join(',') === 'Ana,Zilda')

  ok('a ordem tem os cinco', ORDEM.length === 5)
  ok('e o peso e o ultimo', ORDEM[4] === 'peso_subindo')
}

/* == QUEM TEM DOIS SINAIS CONTA UMA VEZ ================================= */
{
  console.log('\n6. dois sinais na mesma pessoa')
  const fora = lerTriagem([
    p(1, 'Dupla', {
      sem_retorno: { dias: 90, ultima_consulta: '2026-06-01' },
      peso_subindo: { de: 70, para: 71, delta: 1 },
    }),
  ])
  const r = resumoDaAtencao(fora)
  ok('uma pessoa, um paciente', r.total === 1, String(r.total))
  /* Somar os sinais faria "1 paciente" virar "2 avisos", e os dois numeros na
     mesma tela nao fechariam. */
  ok('e conta so pelo mais urgente', r.porSinal === '1 sem retorno', r.porSinal)
  ok('o motivo e o mais urgente', motivoDe(fora[0]).startsWith('sem retorno'))
}

/* == A FRASE DO PAINEL ================================================== */
{
  console.log('\n7. o resumo')
  const vazio = resumoDaAtencao([])
  ok('ninguem: frase vazia', vazio.frase === '' && vazio.total === 0)
  ok('e sem quebra', vazio.porSinal === '')

  const um = resumoDaAtencao(lerTriagem([
    p(1, 'A', { sem_retorno: { dias: 90, ultima_consulta: '2026-06-01' } }),
  ]))
  ok('singular', um.frase === '1 paciente pede atenção', um.frase)

  const varios = resumoDaAtencao(lerTriagem([
    p(1, 'A', { sem_retorno: { dias: 90, ultima_consulta: '2026-06-01' } }),
    p(2, 'B', { sem_retorno: { dias: 70, ultima_consulta: '2026-06-20' } }),
    p(3, 'C', { exame_parado: { quantidade: 1, desde: '2026-08-01' } }),
  ]))
  ok('plural', varios.frase === '3 pacientes pedem atenção', varios.frase)
  /* Na ordem da urgencia, e nao na da quantidade: o exame vem antes mesmo
     sendo um so. */
  ok('quebra na ordem de urgencia',
     varios.porSinal === '1 exame parado · 2 sem retorno', varios.porSinal)

  /* Nenhuma frase pode dizer que esta tudo bem: o app so ve os cinco sinais
     que ele calcula, e "nada pede atencao" afirmaria sobre o resto. */
  ok('nao inventa tranquilidade',
     ![vazio.frase, um.frase, varios.frase].some(f => /tudo (bem|certo)|nada pede|tranquil/i.test(f)))
}

/* == OS NUMEROS EM PALAVRAS ============================================= */
{
  console.log('\n8. dias')
  ok('um dia', diasEmPalavras(1) === '1 dia')
  ok('poucos dias', diasEmPalavras(45) === '45 dias')
  /* Acima de dois meses o numero exato para de significar. */
  ok('59 ainda e dia', diasEmPalavras(59) === '59 dias')
  ok('60 vira mes', diasEmPalavras(60) === '2 meses', diasEmPalavras(60))
  ok('meio ano', diasEmPalavras(200) === '6 meses', diasEmPalavras(200))
  ok('um ano', diasEmPalavras(400) === '1 ano', diasEmPalavras(400))
  ok('dois anos', diasEmPalavras(800) === '2 anos', diasEmPalavras(800))
  ok('negativo nao vira frase torta', diasEmPalavras(-5) === 'algum tempo')
  ok('NaN tambem nao', diasEmPalavras(Number.NaN) === 'algum tempo')
}

{
  console.log('\n9. virgula')
  ok('uma casa', virgula(1.24) === '1,2', virgula(1.24))
  ok('arredonda', virgula(1.26) === '1,3', virgula(1.26))
  ok('redondo nao ganha casa', virgula(2) === '2', virgula(2))
  ok('meio quilo', virgula(0.5) === '0,5')
  ok('NaN vira zero', virgula(Number.NaN) === '0')
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
