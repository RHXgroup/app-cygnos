/* O primeiro dia: o que o app diz antes de a pessoa ter feito qualquer coisa.
 *
 * Rode com: node --experimental-strip-types src/lib/primeirosDias.teste.mts */

import { passoInicial, type Entrada } from './primeirosDias.ts'

let passaram = 0
let falharam = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passaram++
    console.log('  ok    ' + nome)
  } else {
    falharam++
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''))
  }
}

const base = (mudanca: Partial<Entrada> = {}): Entrada => ({
  diasComRegistro: [],
  hoje: '2026-09-01',
  hora: 22,
  temMeta: false,
  kcalSugerida: null,
  ...mudanca,
})

/* ────────────────────────────────────────────────────────────────────────── */
console.log('\nO caso que motivou tudo: instalou as dez da noite')

{
  /* Antes, este era o momento em que o app dizia "Voce ainda nao anotou nada
     hoje" -- uma cobranca trinta segundos depois de instalar, por um dia que a
     pessoa passou sem ter o app. */
  const p = passoInicial(base())
  ok('nao cobra, pede o peso', p?.chave === 'peso')
  ok('e diz o que o peso destrava', (p?.texto ?? '').includes('proteína'))
  ok('leva para a tela de peso', p?.destino === 'peso')
  ok('nao usa a palavra "ainda"', !(p?.texto ?? '').includes('ainda não'))
}

console.log('\nCom peso, o app entrega antes de pedir')

{
  const p = passoInicial(base({ kcalSugerida: 2137 }))
  ok('mostra o numero calculado', p?.chave === 'meta')
  ok('e o numero aparece no titulo, antes do toque', (p?.titulo ?? '').includes('2.137'))
  ok('formatado em pt-BR', (p?.titulo ?? '').includes('.') && !(p?.titulo ?? '').includes('2137'))
  ok('leva para as metas', p?.destino === 'metas')
}

{
  /* Arredonda, e nao escreve casa decimal numa meta de caloria. */
  const p = passoInicial(base({ kcalSugerida: 1999.6 }))
  ok('arredonda o numero', (p?.titulo ?? '').includes('2.000'))
}

console.log('\nCom meta, o convite cabe na hora')

const comMeta = (hora: number) => passoInicial(base({ kcalSugerida: 2000, temMeta: true, hora }))

{
  ok('as 8h convida para o cafe', (comMeta(8)?.titulo ?? '').includes('café da manhã'))
  ok('as 11h, o lanche da manha', (comMeta(11)?.titulo ?? '').includes('lanche da manhã'))
  ok('as 13h, o almoco', (comMeta(13)?.titulo ?? '').includes('almoço'))
  ok('as 16h, o lanche da tarde', (comMeta(16)?.titulo ?? '').includes('lanche da tarde'))
  ok('as 20h, o jantar', (comMeta(20)?.titulo ?? '').includes('jantar'))
  ok('as 23h, a ceia', (comMeta(23)?.titulo ?? '').includes('ceia'))
  ok('e nunca convida para o cafe a noite', !(comMeta(23)?.titulo ?? '').includes('café'))
  ok('leva para o contador', comMeta(20)?.destino === 'contador')
}

{
  /* A escada e a MESMA de `refeicaoPelaHora` em consumo.ts. Se divergirem, o
     convite diz "jantar" e a tela abre em "lanche da tarde". */
  ok('a virada do almoco e as 12h', (comMeta(12)?.titulo ?? '').includes('almoço'))
  ok('e 11h59 ainda e lanche da manha', (comMeta(11)?.titulo ?? '').includes('lanche'))
  ok('a virada do jantar e as 18h', (comMeta(18)?.titulo ?? '').includes('jantar'))
  ok('a virada da ceia e as 22h', (comMeta(22)?.titulo ?? '').includes('ceia'))
}

console.log('\nDepois de anotar, o app diz o que vem — e so o que tem data')

{
  const p = passoInicial(
    base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: ['2026-09-01'] }),
  )
  ok('reconhece o primeiro dia', p?.chave === 'amanha')
  ok('e fala de amanha, nao de "em breve"', (p?.texto ?? '').includes('Amanhã'))
  ok('sem promessa vaga', !(p?.texto ?? '').toLowerCase().includes('em breve'))
}

{
  const p = passoInicial(
    base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: ['2026-08-31', '2026-09-01'] }),
  )
  ok('no segundo dia ainda aparece', p?.chave === 'amanha')
  ok('e o titulo muda', p?.titulo === 'Dois dias anotados')
  ok('nao promete amanha de novo', !(p?.texto ?? '').toLowerCase().includes('amanhã'))
  ok('e nao diz "o primeiro dia" no segundo', !(p?.titulo ?? '').includes('primeiro'))
}

console.log('\nE some sozinho')

{
  const tres = ['2026-08-30', '2026-08-31', '2026-09-01']
  ok(
    'com tres dias de registro, some',
    passoInicial(base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: tres })) === null,
  )
}

{
  const muitos = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-09-01']
  ok(
    'e nao volta para quem usa ha semanas',
    passoInicial(base({ diasComRegistro: muitos })) === null,
  )
}

{
  /* Some pelos dias de USO, e nao pelos dias corridos desde a instalacao: quem
     instalou em marco e voltou em setembro nao e um usuario experiente. */
  const espalhados = ['2026-03-01', '2026-09-01']
  const p = passoInicial(base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: espalhados }))
  ok('dois dias espalhados no ano ainda contam como dois', p?.chave === 'amanha')
}

console.log('\nO que chega torto')

{
  ok('data de hoje invalida devolve nulo', passoInicial(base({ hoje: '2026-13-45' })) === null)
  ok('texto no lugar da data tambem', passoInicial(base({ hoje: 'hoje' })) === null)
  ok('data vazia tambem', passoInicial(base({ hoje: '' })) === null)
}

{
  /* Data que passa no formato e nao existe no calendario: o JavaScript escorrega
     para marco, e ela entraria na contagem como um dia que nunca houve. */
  const inventadas = ['2026-02-31', '2026-04-31', '2026-06-31']
  const p = passoInicial(base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: inventadas }))
  ok('dia que nao existe no calendario nao conta', p?.chave === 'anotar')
}

{
  /* O FUTURO nao conta. Sem isso, um fuso adiantado no aparelho apagaria o
     cartao de quem ainda nao usou o app nenhum dia. */
  const futuras = ['2026-09-05', '2026-09-06', '2026-09-07']
  const p = passoInicial(base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: futuras }))
  ok('dia no futuro nao conta como uso', p?.chave === 'anotar')
}

{
  const repetidas = ['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01']
  const p = passoInicial(base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: repetidas }))
  ok('o mesmo dia repetido conta uma vez', p?.chave === 'amanha')
}

{
  /* `null` era o unico "nao deu para calcular" previsto, e NaN atravessava: o
     titulo saia "A sua meta seria NaN kcal por dia", com botao embaixo. */
  ok('NaN cai no pedido de peso', passoInicial(base({ kcalSugerida: NaN }))?.chave === 'peso')
  ok('Infinity tambem', passoInicial(base({ kcalSugerida: Infinity }))?.chave === 'peso')
  ok('zero tambem', passoInicial(base({ kcalSugerida: 0 }))?.chave === 'peso')
  ok('negativo tambem', passoInicial(base({ kcalSugerida: -2000 }))?.chave === 'peso')
  for (const lixo of [NaN, Infinity, -Infinity, 0, -1]) {
    const t = passoInicial(base({ kcalSugerida: lixo }))?.titulo ?? ''
    ok('nunca escreve ' + String(lixo) + ' no titulo', !t.includes(String(lixo)))
  }
}

{
  /* Toda saida precisa ter as quatro partes: um cartao sem botao e um cartao
     que a pessoa le e nao sabe o que fazer com ele. */
  const casos: Entrada[] = [
    base(),
    base({ kcalSugerida: 2000 }),
    base({ kcalSugerida: 2000, temMeta: true }),
    base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: ['2026-09-01'] }),
  ]
  let inteiros = 0
  for (const c of casos) {
    const p = passoInicial(c)
    if (p && p.titulo.length > 0 && p.texto.length > 0 && p.botao.length > 0 && p.destino !== null)
      inteiros++
  }
  ok('todo passo tem titulo, texto, botao e destino', inteiros === casos.length)
}

{
  /* Nada aqui pode soar como cobranca. E o motivo do arquivo existir. */
  const proibidas = ['você não', 'voce nao', 'está devendo', 'esqueceu', 'falhou', 'atrasad']
  const casos: Entrada[] = [
    base(),
    base({ kcalSugerida: 2000 }),
    base({ kcalSugerida: 2000, temMeta: true }),
    base({ kcalSugerida: 2000, temMeta: true, diasComRegistro: ['2026-09-01'] }),
  ]
  let limpos = 0
  for (const c of casos) {
    const p = passoInicial(c)
    const tudo = ((p?.titulo ?? '') + ' ' + (p?.texto ?? '')).toLowerCase()
    if (!proibidas.some(x => tudo.includes(x))) limpos++
  }
  ok('nenhuma frase cobra', limpos === casos.length)
}

console.log(`\n${passaram} passaram, ${falharam} falharam`)
if (falharam > 0) process.exit(1)
