/* O ditado que ouve pelo próprio celular -- a parte que decide.
 *
 * Os dois defeitos mais visíveis de um ditado ao vivo são a frase repetida e a
 * frase que some quando a pessoa respira. Os dois nascem em `juntarFalas`, e é
 * por isso que ela tem mais casos do que as outras.
 *
 * Rode com: node --experimental-strip-types src/lib/escutaDoDitado.teste.mts */

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

import {
  juntarFalas,
  desfechoDoErro,
  temPortugues,
  PALAVRAS_DA_NUTRI,
} from './escutaDoDitado.ts'

// ──── juntarFalas: o reconhecedor que manda só o trecho aberto ────
ok('nada ainda', juntarFalas([], '') === '')
ok('o primeiro parcial aparece sozinho', juntarFalas([], 'marca um') === 'marca um')
ok('o parcial cresce', juntarFalas([], 'marca um lembrete') === 'marca um lembrete')
ok('o trecho fechado fica quando o próximo começa',
  juntarFalas(['marca um lembrete'], 'pras oito') === 'marca um lembrete pras oito')
ok('dois trechos fechados e um aberto',
  juntarFalas(['marca um lembrete', 'pras oito'], 'da noite') ===
    'marca um lembrete pras oito da noite')

/* O defeito da frase que SOME: ela respira, o trecho fecha, e por um instante o
   parcial do trecho novo chega vazio. O texto não pode piscar para vazio. */
ok('parcial vazio depois de uma pausa não apaga o que foi dito',
  juntarFalas(['marca um lembrete'], '') === 'marca um lembrete')

// ──── juntarFalas: o reconhecedor que repete TUDO no parcial ────
/* O defeito da frase REPETIDA: este reconhecedor devolve no parcial o texto
   desde o começo. Somar daria "marca um lembrete marca um lembrete pras oito". */
ok('o parcial que já contém o fechado não duplica',
  juntarFalas(['marca um lembrete'], 'marca um lembrete pras oito') ===
    'marca um lembrete pras oito')
ok('mesmo com pontuação que o fechado não tinha',
  juntarFalas(['marca um lembrete'], 'Marca um lembrete, pras oito.') ===
    'Marca um lembrete, pras oito.')
ok('mesmo com caixa diferente',
  juntarFalas(['avisa a ana'], 'Avisa a Ana que eu vou atrasar') ===
    'Avisa a Ana que eu vou atrasar')

// ──── juntarFalas: entrada torta ────
ok('trechos vazios no meio somem', juntarFalas(['', 'oi', '  '], 'tudo bem') === 'oi tudo bem')
ok('espaço em volta é aparado', juntarFalas(['  oi  '], '  tudo  ') === 'oi tudo')
// @ts-expect-error entrada torta de propósito
ok('parcial nulo não quebra', juntarFalas(['oi'], null) === 'oi')
ok('nada de "undefined" na saída',
  // @ts-expect-error entrada torta de propósito
  !/undefined|null/.test(juntarFalas([], undefined) + juntarFalas(['a'], 'b')))

// ──── desfechoDoErro ────
ok('não falou nada é silêncio', desfechoDoErro('no-speech').tipo === 'silencio')
ok('ficou calado demais é silêncio', desfechoDoErro('speech-timeout').tipo === 'silencio')

/* Os três que querem dizer "este celular não ouve sozinho" -- e voltam para o
   servidor próprio, nunca para o Google. */
ok('português não instalado cai na reserva', desfechoDoErro('language-not-supported').tipo === 'reserva')
ok('serviço indisponível cai na reserva', desfechoDoErro('service-not-allowed').tipo === 'reserva')
/* Com a rede proibida de propósito, 'network' só aparece se o celular TENTOU
   usar a rede. É o caso de voltar para o servidor próprio, e não de dizer
   "verifique a conexão" para quem está com internet boa. */
ok('rede cai na reserva, e não em "verifique a conexão"', desfechoDoErro('network').tipo === 'reserva')

ok('ela mesma cancelou', desfechoDoErro('aborted').tipo === 'parou')

{
  const r = desfechoDoErro('not-allowed')
  ok('sem permissão é erro com frase', r.tipo === 'erro')
  ok('a frase diz o que fazer', r.tipo === 'erro' && /configura/i.test(r.mensagem))
}
{
  const r = desfechoDoErro('busy')
  ok('microfone ocupado é erro com frase', r.tipo === 'erro' && /ocupado/i.test(r.mensagem))
}

/* Código novo que a biblioteca passe a mandar não pode derrubar a barra. */
{
  const r = desfechoDoErro('um-codigo-que-ainda-nao-existe')
  ok('código desconhecido vira erro genérico', r.tipo === 'erro')
  ok('e a frase é de gente', r.tipo === 'erro' && r.mensagem.length > 10 && !/undefined/.test(r.mensagem))
}
ok('nulo não quebra', desfechoDoErro(null).tipo === 'erro')
ok('indefinido não quebra', desfechoDoErro(undefined).tipo === 'erro')

/* Nenhuma frase pode vazar o código em inglês para a tela. */
{
  const codigos = ['no-speech', 'language-not-supported', 'not-allowed', 'busy', 'audio-capture', 'unknown', 'client']
  const vazou = codigos.some(c => {
    const r = desfechoDoErro(c)
    return r.tipo === 'erro' && /no-speech|not-allowed|audio-capture|unknown|client/i.test(r.mensagem)
  })
  ok('nenhuma frase mostra o código cru', !vazou)
}

// ──── temPortugues ────
ok('pt-BR', temPortugues(['en-US', 'pt-BR']))
ok('pt_BR com sublinhado', temPortugues(['pt_BR']))
ok('caixa baixa', temPortugues(['pt-br']))
ok('só pt', temPortugues(['pt']))
/* Português de Portugal transcreve pior o sotaque, mas transcreve -- e é
   melhor do que 20 segundos de servidor. */
ok('pt-PT também serve', temPortugues(['pt-PT']))
ok('sem português', !temPortugues(['en-US', 'es-ES']))
/* "pt" no MEIO de outro código não é português. */
ok('não confunde com outro idioma que tenha "pt"', !temPortugues(['ptx-XX', 'opt-in']))
ok('lista vazia', !temPortugues([]))
ok('nulo', !temPortugues(null))
ok('não é lista', !temPortugues('pt-BR'))

// ──── PALAVRAS_DA_NUTRI ────
ok('tem Cygnos, que não está em dicionário nenhum', PALAVRAS_DA_NUTRI.includes('Cygnos'))
ok('tem Aurora', PALAVRAS_DA_NUTRI.includes('Aurora'))
/* Os verbos que o ditado errou de verdade ("atrasar" virou "trazer", "avisa"
   virou "diz") vivem aqui como verbo de comando -- "avisa" e "recado". */
ok('tem os verbos do recado', PALAVRAS_DA_NUTRI.includes('avisa') && PALAVRAS_DA_NUTRI.includes('recado'))
ok('nenhuma palavra vazia', PALAVRAS_DA_NUTRI.every(p => p.trim().length > 0))
ok('sem repetição', new Set(PALAVRAS_DA_NUTRI).size === PALAVRAS_DA_NUTRI.length)

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
