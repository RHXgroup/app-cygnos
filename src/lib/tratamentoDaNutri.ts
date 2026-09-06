/* Como o app se refere à profissional que acompanha esta pessoa.
 *
 * ── O relato ──────────────────────────────────────────────────────────────
 * "meu nutri é homem e pra mim no meu app aparece sua nutri no feminino".
 *
 * Eram 55 frases no feminino fixo — "a sua nutricionista", "avise ela com
 * antecedência", "o que ela registrar aparece aqui" —, escritas assim porque
 * quem escreveu tinha uma nutricionista mulher na cabeça. E não havia como
 * consertar nenhuma: o dado não existia no banco.
 *
 * Agora existe: `perfil_nutricionista.tratamento`, 'ela' ou 'ele', respondido
 * por ela mesma (migração 20260906100000, do outro repositório).
 *
 * ── Por que é um valor de módulo, e não um parâmetro ──────────────────────
 * Porque as 55 frases moram em 25 arquivos, e a maioria é `lib/` que não tem
 * nem nunca vai ter a profissional em mãos: `agenda.ts` monta o texto de uma
 * consulta, `montarAvisos.ts` monta um aviso, `permissoes.ts` explica o que a
 * câmera faz. Passar a palavra por parâmetro obrigaria a carregar a
 * nutricionista em cada um desses caminhos só para escolher entre "a" e "o".
 *
 * É o mesmo desenho de `paleta()` em `tema.ts`, e pela mesma razão: uma coisa
 * que vale para o app inteiro, lida na hora de desenhar.
 *
 * ── Guardado no aparelho, e por quê ───────────────────────────────────────
 * Sem isso, a PRIMEIRA tela de cada abertura sairia no feminino e se corrigiria
 * quando o catálogo respondesse — um pisca-pisca de gênero na cara de quem
 * relatou o problema. Guardado, ele já nasce certo; a rede só confirma.
 *
 * ── E o desconhecido continua existindo ───────────────────────────────────
 * Nulo é "ainda não disse", e cai no feminino. Não é descuido: é o que já
 * estava no ar, e trocar o padrão para o masculino só mudaria de quem é o erro.
 * Na prática ele quase não acontece — o catálogo esconde quem não tem nome, e
 * quem tem nome recebeu um palpite na migração. */

export type Tratamento = 'ela' | 'ele'

/* O padrão é o feminino porque é o que já estava no ar: trocar para
   masculino só mudaria de quem é o erro. */
let atual: Tratamento = 'ela'

/* ── E POR QUE ESTE ARQUIVO NÃO IMPORTA NADA ──────────────
 * Porque `montarAvisos` e `objetivos` usam estas palavras, e os dois têm
 * teste de verdade. Um `import` de AsyncStorage aqui arrastaria o React Native
 * inteiro para dentro do `node --experimental-strip-types`, e os dois testes
 * parariam de rodar — item 16 do AGENTS.md.
 *
 * Então quem guarda no aparelho é um arquivo separado, `tratamentoGuardado`,
 * que se apresenta aqui em vez de ser importado daqui. Se ninguém se
 * apresentar, tudo continua funcionando: a resposta só deixa de sobreviver ao
 * fechamento do app. */
let guardar: ((t: Tratamento) => void) | null = null

export function ondeGuardar(f: (t: Tratamento) => void): void {
  guardar = f
}

/* Chamado por quem carrega a nutricionista do banco — o catálogo e o recado.
 *
 * Aceita nulo e o IGNORA, em vez de voltar ao padrão: uma consulta que não
 * trouxe o campo (rede ruim, função antiga) não é motivo para desfazer o que já
 * se sabia. Só uma resposta de verdade troca a resposta. */
export function definirTratamento(t: string | null | undefined): void {
  if (t !== 'ela' && t !== 'ele') return
  if (t === atual) return
  atual = t
  guardar?.(t)
}

/* Só para os testes: eles precisam exercitar os dois lados sem AsyncStorage. */
export function tratamento(): Tratamento {
  return atual
}

/* ── As palavras ───────────────────────────────────────────────────────────
 *
 * Funções, e não um objeto pronto, porque elas são lidas na hora de desenhar —
 * um objeto montado uma vez guardaria o valor de antes da resposta do banco.
 *
 * O nome de cada uma é a palavra no FEMININO, que é como as frases estão
 * escritas hoje. Assim a substituição em cada string é uma troca visível:
 * `'a sua nutricionista'` vira `` `${aSua()} nutricionista` ``, e quem lê o
 * diff enxerga o que era. */

const ele = () => atual === 'ele'

/** 'a' / 'o' */
export const a = () => (ele() ? 'o' : 'a')
/** 'A' / 'O' */
export const A = () => (ele() ? 'O' : 'A')
/** 'sua' / 'seu' */
export const sua = () => (ele() ? 'seu' : 'sua')
/** 'Sua' / 'Seu' */
export const Sua = () => (ele() ? 'Seu' : 'Sua')
/** 'a sua' / 'o seu' */
export const aSua = () => (ele() ? 'o seu' : 'a sua')
/** 'A sua' / 'O seu' */
export const ASua = () => (ele() ? 'O seu' : 'A sua')
/** 'da sua' / 'do seu' */
export const daSua = () => (ele() ? 'do seu' : 'da sua')
/** 'à sua' / 'ao seu' */
export const aCrase = () => (ele() ? 'ao seu' : `${String.fromCharCode(0xe0)} sua`)
/** 'Minha' / 'Meu' */
export const Minha = () => (ele() ? 'Meu' : 'Minha')
/** 'Nenhuma' / 'Nenhum' */
export const Nenhuma = () => (ele() ? 'Nenhum' : 'Nenhuma')
/** 'minha' / 'meu' */
export const minha = () => (ele() ? 'meu' : 'minha')
/** 'uma' / 'um' */
export const uma = () => (ele() ? 'um' : 'uma')
/** 'outra' / 'outro' */
export const outra = () => (ele() ? 'outro' : 'outra')
/** 'outras' / 'outros' */
export const outras = () => (ele() ? 'outros' : 'outras')
/** 'ela' / 'ele' */
export const elaPronome = () => (ele() ? 'ele' : 'ela')
/** 'Ela' / 'Ele' */
export const ElaPronome = () => (ele() ? 'Ele' : 'Ela')
/** 'dela' / 'dele' */
export const dela = () => (ele() ? 'dele' : 'dela')
/** 'vinculada' / 'vinculado' */
export const vinculada = () => (ele() ? 'vinculado' : 'vinculada')

/* Os dois inteiros, porque aparecem tantas vezes que escrever
   `${aSua()} nutricionista` em cada lugar seria repetir a mesma junção
   cinquenta vezes. */
/** 'a sua nutricionista' / 'o seu nutricionista' */
export const aSuaNutri = () => `${aSua()} nutricionista`
/** 'A sua nutricionista' / 'O seu nutricionista' */
export const ASuaNutri = () => `${ASua()} nutricionista`
/** 'sua nutricionista' / 'seu nutricionista' */
export const suaNutri = () => `${sua()} nutricionista`
/** 'Sua nutricionista' / 'Seu nutricionista' */
export const SuaNutri = () => `${Sua()} nutricionista`
