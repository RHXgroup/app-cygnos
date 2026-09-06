/* As respostas de anamnese viram linhas de tela.
 *
 * Os formatos aqui foram LIDOS do banco, com os valores que estao gravados
 * hoje -- nao inventados. Foi assim que o segundo defeito apareceu: a multipla
 * escolha guarda lista de TEXTOS, e o app tratava toda lista como lista de
 * objetos.
 *
 * Rode com: node --experimental-strip-types src/lib/respostaDaAnamnese.teste.mts */

import { SEM_RESPOSTA, linhasDaResposta, textoDaResposta } from './respostaDaAnamnese.ts'

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

/* == O QUE ESTAVA NA TELA DA PACIENTE ================================== */
{
  // Fotografado no aparelho. As duas linhas abaixo sao o que ela lia.
  const bristol = { tipo: 'Tipo 3 — Como salsicha, com rachaduras na superfície (normal)' }
  const t1 = textoDaResposta(bristol)
  ok('bristol nao mostra JSON', !t1.includes('{') && !t1.includes('"'), t1)
  ok('bristol diz o tipo', t1.includes('Tipo 3'), t1)
  ok('bristol rotula a chave', t1.startsWith('Tipo:'), t1)

  const sinais = {
    Boca: ['Normal'],
    Pele: ['Normal'],
    Unha: ['Quebradiça / fina'],
    Cabelo: ['Queda acentuada'],
  }
  const l2 = linhasDaResposta(sinais)
  ok('sinais viram quatro linhas', l2.length === 4, String(l2.length))
  ok('sem JSON em nenhuma', l2.every(l => !l.includes('{') && !l.includes('"')), l2.join(' | '))
  ok('e cada uma nomeia a parte do corpo', l2[0] === 'Boca: Normal', l2[0])
  ok('inclusive a que tem achado', l2.includes('Unha: Quebradiça / fina'), l2.join(' | '))
}

/* == O DEFEITO QUE NINGUEM TINHA VISTO ================================= */
{
  // O app fazia Object.entries(linha) em cada item da lista, supondo lista de
  // OBJETOS. Com lista de TEXTOS isso devolve [['0','G'],['1','a']…] -- a
  // resposta aparecia uma letra por linha.
  const multipla = ['Gases', 'Inchaço/distensão', 'Alternância diarreia/constipação']
  const l = linhasDaResposta(multipla)
  ok('multipla escolha da uma linha por item', l.length === 3, String(l.length))
  ok('e nao uma letra por linha', l[0] === 'Gases', l[0])
  ok('acento inteiro', l[1] === 'Inchaço/distensão', l[1])
}

/* == GRUPO REPETIVEL, que ja funcionava e nao pode quebrar ============= */
{
  const exercicios = [
    { 'Tipo de exercício': 'Musculação', 'Horário preferido': '19h30-20h30' },
    { 'Tipo de exercício': 'Caminhada', 'Horário preferido': '08:00' },
  ]
  const l = linhasDaResposta(exercicios)
  ok('uma linha por entrada', l.length === 2, String(l.length))
  ok('com os dois campos juntos', l[0].includes('Musculação') && l[0].includes('19h30'), l[0])
  ok('separados por ponto', l[0].includes(' · '), l[0])

  // Campo vazio dentro da entrada nao vira "Horario: " pendurado.
  const comVazio = [{ 'Tipo de exercício': 'Academia', 'Horário preferido': '' }]
  ok('campo vazio some', linhasDaResposta(comVazio)[0] === 'Tipo de exercício: Academia', linhasDaResposta(comVazio)[0])
}

/* == OS SIMPLES ======================================================== */
{
  ok('texto', textoDaResposta('Sim, todo dia') === 'Sim, todo dia')
  ok('numero', textoDaResposta(3) === '3')
  ok('zero NAO vira traco', textoDaResposta(0) === '0', textoDaResposta(0))
  ok('booleano verdadeiro', textoDaResposta(true) === 'Sim')
  ok('booleano falso', textoDaResposta(false) === 'Não')
  // Armadilha 6 ao contrario: aqui o "nao respondeu" tem de aparecer, e nao
  // sumir -- a paciente precisa ver que a pergunta existiu.
  ok('nulo vira traco', textoDaResposta(null) === SEM_RESPOSTA)
  ok('vazio vira traco', textoDaResposta('') === SEM_RESPOSTA)
  ok('so espaco vira traco', textoDaResposta('   ') === SEM_RESPOSTA)
  ok('lista vazia vira traco', textoDaResposta([]) === SEM_RESPOSTA)
  ok('objeto vazio vira traco', textoDaResposta({}) === SEM_RESPOSTA)
}

/* == NADA, EM HIPOTESE NENHUMA, VIRA JSON ============================== */
{
  // A regra que este arquivo existe para garantir. Formatos que o sistema nao
  // produz hoje, mas pode produzir amanha -- e a paciente nao pode ler chave
  // entre aspas por causa disso.
  const estranhos: unknown[] = [
    { a: { b: { c: 'fundo' } } },
    [{ x: ['um', 'dois'] }],
    { lista: [1, 2, 3] },
    [[1, 2], ['a']],
    { vazio: null, cheio: 'valor' },
  ]
  for (const e of estranhos) {
    const t = textoDaResposta(e)
    ok('sem chave e sem colchete: ' + JSON.stringify(e).slice(0, 28),
      !t.includes('{') && !t.includes('[') && !t.includes('"'), t)
  }
}

/* == CHAVE NUMERICA NAO VIRA ROTULO ==================================== */
{
  // {"0": "Normal"} sai de um array que virou objeto no caminho. Escrever a
  // chave daria "0: Normal", que nao quer dizer nada.
  ok('indice nao vira rotulo', textoDaResposta({ 0: 'Normal', 1: 'Seco' }) === 'Normal · Seco',
    textoDaResposta({ 0: 'Normal', 1: 'Seco' }))
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
