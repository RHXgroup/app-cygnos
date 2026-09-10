/* A linha embaixo do nome, na lista de conversas dela.
 *
 * Os três defeitos que este arquivo existe para travar já aconteceram do lado
 * do site: o "." do áudio aparecendo como mensagem, a resposta dela parecendo
 * pergunta pendente, e "há 1 horas".
 *
 * Rode com: node --experimental-strip-types src/lib/previaDaConversa.teste.mts */

let passou = 0
const falhas: string[] = []
function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

import {
  previaDaConversa,
  desdeQuando,
  horaDaMensagem,
  legendaDoBalao,
} from './previaDaConversa.ts'

const c = (
  ultima: string | null,
  ultimaDe: string | null = 'paciente',
  ultimaAnexoTipo: string | null = null,
) => ({ ultima, ultimaDe, ultimaEm: '2026-09-10T12:00:00Z', ultimaAnexoTipo })

// ──── O TEXTO COMUM ────
ok('texto do paciente sai cru', previaDaConversa(c('Bom dia!')) === 'Bom dia!')
ok('texto dela ganha o "Você:"', previaDaConversa(c('Bom dia!', 'nutricionista')) === 'Você: Bom dia!')
ok('espaço em volta é aparado', previaDaConversa(c('  oi  ')) === 'oi')

// ──── O PONTO DO ÁUDIO ────
/* O defeito original: a paciente grava um áudio, o app manda "." como legenda,
   e ao lado do nome dela aparecia um ponto solto. */
ok('áudio vira "Áudio"', previaDaConversa(c('.', 'paciente', 'audio')) === 'Áudio')
ok('foto vira "Foto"', previaDaConversa(c('.', 'paciente', 'foto')) === 'Foto')
ok('o anexo dela também leva o "Você:"',
  previaDaConversa(c('.', 'nutricionista', 'foto')) === 'Você: Foto')
/* O TIPO ganha da legenda, e isto é alinhamento com o site, não preguiça.
   `previa()` de `dashboard/mensagens` escreve "Foto" mesmo havendo legenda; as
   duas listas mostram a MESMA linha do mesmo banco, e divergência aí vira
   "no computador aparece outra coisa" -- que ninguém consegue diagnosticar.
   A legenda inteira aparece ao abrir, que é a um toque de distância. */
ok('foto com legenda ainda diz Foto',
  previaDaConversa(c('olha o almoço', 'paciente', 'foto')) === 'Foto')
ok('áudio com legenda ainda diz Áudio',
  previaDaConversa(c('ouve isso', 'paciente', 'audio')) === 'Áudio')
/* Um ponto que a pessoa DIGITOU, sem anexo nenhum, é o que ela escreveu. */
ok('ponto sem anexo continua sendo o texto', previaDaConversa(c('.')) === '.')
/* E um tipo que esta tela ainda não sabe desenhar não pode virar um ponto. */
ok('anexo de tipo novo vira "Anexo"', previaDaConversa(c('.', 'paciente', 'video')) === 'Anexo')

// ──── CONVERSA VAZIA ────
/* `nutri_conversas` traz TODO vínculo, inclusive quem nunca trocou mensagem --
   é o que deixa ela começar a conversa. Esses vêm com tudo nulo. */
ok('conversa sem mensagem devolve vazio', previaDaConversa(c(null, null)) === '')
ok('texto vazio devolve vazio', previaDaConversa(c('   ')) === '')
ok('nada de "undefined" na saída',
  !/undefined|null|NaN/.test(previaDaConversa({ ultima: null, ultimaDe: null, ultimaEm: null })))

// ──── "de" DESCONHECIDO ────
/* Se a coluna ganhar um terceiro valor, o pior caso é ficar sem o "Você:" --
   nunca "undefined: ". Armadilha 10. */
ok('"de" desconhecido não vira prefixo torto', previaDaConversa(c('oi', 'recepcao')) === 'oi')

// ──── desdeQuando ────
const AGORA = new Date('2026-09-10T12:00:00Z').getTime()
const atras = (min: number) => new Date(AGORA - min * 60000).toISOString()

ok('menos de um minuto é "agora"', desdeQuando(atras(0.4), AGORA) === 'agora')
ok('12 minutos', desdeQuando(atras(12), AGORA) === 'há 12 min')
ok('59 minutos ainda é minuto', desdeQuando(atras(59), AGORA) === 'há 59 min')
/* O singular, que é o defeito clássico desta função. */
ok('uma hora é "hora", não "horas"', desdeQuando(atras(60), AGORA) === 'há 1 hora')
ok('três horas', desdeQuando(atras(180), AGORA) === 'há 3 horas')
ok('23 horas ainda é hora', desdeQuando(atras(23 * 60), AGORA) === 'há 23 horas')
ok('um dia é "dia"', desdeQuando(atras(24 * 60), AGORA) === 'há 1 dia')
ok('dois dias', desdeQuando(atras(48 * 60), AGORA) === 'há 2 dias')
ok('29 dias ainda é dia', desdeQuando(atras(29 * 24 * 60), AGORA) === 'há 29 dias')
ok('um mês é "mês"', desdeQuando(atras(30 * 24 * 60), AGORA) === 'há 1 mês')
ok('dois meses é "meses"', desdeQuando(atras(75 * 24 * 60), AGORA) === 'há 2 meses')

/* O relógio do aparelho atrasado faria a mensagem que acabou de chegar dizer
   "há -1 min". */
ok('mensagem do futuro vira "agora"', desdeQuando(atras(-5), AGORA) === 'agora')
ok('nulo devolve vazio', desdeQuando(null, AGORA) === '')
ok('data ilegível devolve vazio', desdeQuando('nao e data', AGORA) === '')
ok('nada de NaN em nenhum caso',
  ![atras(1), atras(90), atras(3000), atras(90000), 'x', ''].some(
    v => /NaN|undefined/.test(desdeQuando(v, AGORA)),
  ))

// ──── horaDaMensagem ────
{
  const h = horaDaMensagem('2026-09-10T12:00:00Z')
  ok('a hora sai com dois pontos', /^\d{2}:\d{2}$/.test(h))
}
ok('hora de data ilegível é vazia', horaDaMensagem('nao e data') === '')
ok('hora de nulo é vazia', horaDaMensagem(null) === '')

// ──── legendaDoBalao ────
/* Tem de concordar com a prévia: a lista dizer "Áudio" e o balão mostrar um
   ponto seria a mesma regra escrita duas vezes e divergindo. */
ok('o ponto do áudio some do balão', legendaDoBalao('.', 'audio') === '')
ok('vazio com anexo continua vazio', legendaDoBalao('', 'foto') === '')
ok('legenda de verdade fica', legendaDoBalao('olha o almoço', 'foto') === 'olha o almoço')
ok('ponto SEM anexo fica', legendaDoBalao('.', null) === '.')
ok('texto normal sem anexo fica', legendaDoBalao('oi', null) === 'oi')
ok('nulo devolve vazio', legendaDoBalao(null, null) === '')

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
