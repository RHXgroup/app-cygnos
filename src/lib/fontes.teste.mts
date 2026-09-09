/* Os nomes de `FONTE` batem com os que o `useFonts` registra?
 *
 * Este teste existe porque o erro dele NAO da erro. `fontFamily` com um nome
 * que ninguem registrou nao levanta nada no React Native: desenha a fonte do
 * sistema e segue. Ou seja, o sintoma de errar uma letra aqui e a tela ficar
 * exatamente como estava antes da mudanca -- que e o mesmo sintoma de "o Expo
 * Go abriu o pacote guardado" e o de "o conserto nao funcionou".
 *
 * Le o ARQUIVO como texto, e nao importa o modulo: `FONTES_PARA_CARREGAR` usa
 * `require` de .ttf, que so existe dentro do Metro. No Node isso estoura.
 */

import { existsSync, readFileSync } from 'node:fs'

const fonte = readFileSync(new URL('./fontes.ts', import.meta.url), 'utf8')

let passou = 0
const falhas: string[] = []

function ok(nome: string, condicao: boolean) {
  if (condicao) passou++
  else falhas.push(nome)
}

/* Os valores de `FONTE`: o que as telas escrevem em `fontFamily`. */
const bloco = (de: string) => {
  const i = fonte.indexOf(de)
  if (i < 0) return ''
  const fim = fonte.indexOf('\n}', i)
  return fonte.slice(i, fim < 0 ? fonte.length : fim)
}

const usados = [...bloco('export const FONTE = {').matchAll(/'(Archivo_[A-Za-z0-9]+)'/g)].map(m => m[1])
const registrados = [...bloco('export const FONTES_PARA_CARREGAR = {').matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map(m => m[1])
/* O CAMINHO INTEIRO, e nao so o nome do arquivo dentro dele.
 *
 * A primeira versao disto pegava so o `Archivo_400Regular` do fim do caminho e
 * conferia contra a chave. Passava com folga -- e o caminho estava errado: os
 * .ttf do pacote nao ficam na raiz, ficam em `400Regular/Archivo_400Regular.ttf`.
 *
 * O Metro nao resolveu, o pacote inteiro parou de montar, e o app nao abria.
 * Ou seja: este teste existia exatamente para esta classe de erro, passou, e o
 * erro derrubou tudo mesmo assim. Conferir NOME nao e conferir CAMINHO. */
const caminhos = [...bloco('export const FONTES_PARA_CARREGAR = {').matchAll(/require\('([^']+)'\)/g)].map(m => m[1])
const arquivos = caminhos.map(c => (/\/([A-Za-z0-9_]+)\.ttf$/.exec(c) ?? [])[1] ?? '')

/* O teste conferindo a si mesmo, antes de conferir qualquer coisa. Se a regex
   parar de casar -- alguem troca aspas simples por duplas, ou reformata o
   arquivo --, ele passaria com tres listas vazias e passaria para sempre. */
ok('achei os nomes usados', usados.length >= 5)
ok('achei os nomes registrados', registrados.length >= 5)
ok('achei os arquivos', arquivos.length >= 5)
ok('achei os caminhos', caminhos.length >= 5)

/* O QUE FALTAVA: o arquivo existe MESMO, no disco.
   Sem isto, um caminho errado passa no teste e derruba o Metro. */
for (const c of caminhos) {
  const noDisco = new URL('../../node_modules/' + c, import.meta.url)
  ok(`o arquivo de ${c} existe em node_modules`, existsSync(noDisco))
}

for (const u of usados) {
  ok(`${u} esta registrado no useFonts`, registrados.includes(u))
}

/* A chave e o NOME DA FAMILIA; o caminho e so onde o arquivo mora. Trocar um
   sem o outro registra a familia certa apontando para o desenho errado -- e a
   tela fica com um peso que ninguem pediu, sem erro nenhum. */
for (let i = 0; i < registrados.length; i++) {
  ok(`${registrados[i]} aponta para o proprio arquivo`, registrados[i] === arquivos[i])
}

ok('nenhum peso registrado sem uso', registrados.every(r => usados.includes(r)))

console.log(`${passou} passaram, ${falhas.length} falharam`)
if (falhas.length) {
  for (const f of falhas) console.log('  FALHOU: ' + f)
  process.exit(1)
}
