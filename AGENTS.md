# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

> O projeto está no **SDK 54** (`expo@54.0.36`), não no 57. Ao consultar a
> documentação, use a versão que o projeto realmente usa — corrigir contra a
> documentação de outra versão introduz problema novo. Se a intenção for migrar
> para o 57, isso é uma decisão à parte, não um detalhe de implementação.

---

# Armadilhas conhecidas deste app

Cada item abaixo já custou uma rodada de "o usuário testou, quebrou, achamos a
causa". Estão aqui para a próxima tela nascer certa, e não para ser consertada
depois. **Ao criar tela nova, passe por esta lista antes de dizer que terminou.**

## 1. O voltar do Android não existe de graça

A navegação é feita com `useState`, sem biblioteca de rotas. O Android não
encontra pilha nenhuma para desempilhar e faz a única coisa que sabe: **encerra
o app**.

Toda tela que abre algo POR CIMA de si — painel, folha, busca, menu, confirmação
— precisa do seu próprio `BackHandler`, descascando uma camada por vez:

```tsx
useEffect(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    if (painelAberto) { setPainelAberto(null); return true }
    if (buscaAberta)  { setBuscaAberta(null);  return true }
    return false   // devolve ao nível de cima, que sabe fechar a tela
  })
  return () => sub.remove()
}, [painelAberto, buscaAberta])
```

Quatro regras que vieram de erro real:

- **Registre no filho, não no pai.** O React Native chama os tratadores na ordem
  inversa do registro, então o mais interno decide primeiro — é isso que faz o
  voltar descascar em vez de fechar tudo.
- **`return false` quando não houver nada a fechar**, para o nível de cima
  assumir. Segurar o evento em todos os casos prende a pessoa dentro do app.
- **Se a tela já tem uma saída com pergunta** ("descartar alterações?"), o voltar
  deve passar por ela, e não por `onFechar` direto. Um caminho de saída que pula
  o aviso existe só para quem usa o botão do aparelho — e é justamente quem mais
  o usa.
- **O `App.tsx` tem um voltar central, e ele pode engolir o seu.** A lista
  `deCimaParaBaixo` fecha as sobreposições, e o efeito dela tem lista de
  dependências com o estado de cada uma. Como o React roda os efeitos do FILHO
  antes dos do PAI, abrir uma sobreposição que está naquela lista faz o pai
  registrar por último — e ganhar. Duas saídas:
  - Se a tela **não tem degrau interno**, deixe o central cuidar e não escreva
    tratador nenhum. É o caso da maioria.
  - Se a tela **tem degrau interno** (índice → seção, lista → editor), escreva o
    tratador **sem lista de dependências**. Re-registrar a cada renderização é o
    que o põe na frente do central a partir da primeira re-renderização — que
    sempre acontece, nem que seja na carga dos dados. Explique isso num
    comentário, senão o próximo a ler vai achar que um dos dois é código morto e
    apagar o errado.

  Descoberto em `MeusCadastrosScreen`: quem entrava em "Metas" para conferir uma
  linha era jogado para fora da tela inteira, porque o central só sabia fechar.

## 2. O teclado cobre o campo se ninguém cuidar

O Expo liga **edge-to-edge por padrão** no Android, e com ele **a janela não
encolhe mais** quando o teclado sobe. Duas consequências, e as duas já
morderam:

**Campo em tela comum** — `KeyboardAvoidingView` com `behavior` indefinido no
Android **não faz nada**. Sempre:

```tsx
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
```

**Painel posicionado por absoluto** — ignora o padding do `KeyboardAvoidingView`
e precisa medir a altura do teclado **nos dois sistemas**. Ver `useAlturaTeclado`
em `BuscarAlimentoScreen`. No iOS use `keyboardWillShow`; no Android só existe
`keyboardDidShow`.

## 3. Campo numérico e o separador de milhar

Quem digita dez mil escreve `10.000`, e `Number("10.000")` é **10**.

- **Campo inteiro** (gramas, ml, passos, calorias, kcal): filtre `[^0-9]` e use
  `keyboardType="number-pad"`. O ponto nem chega a ser digitado.
- **Campo decimal** (só sono, hoje): aceite `[^0-9.,]`, troque vírgula por ponto
  na conversão e use `keyboardType="decimal-pad"`.

Nunca ofereça um teclado com separador para um campo que descarta separador.

**E o filtro do `onChangeText` só vale para quem digita.** Todo `setCampo()`
chamado de fora — preencher a partir do banco, de uma sugestão, de outra tela —
entra sem passar por ele. Foi assim que a medida caseira entrou: `porcao_g` é
`numeric(10,2)`, `String(22.5)` virou `"22.5"` num campo que só aceita dígitos,
e o primeiro toque para corrigir fez `soDigitos` transformar isso em `"225"` —
dez vezes o peso, sem erro nenhum na tela.

Ao preencher um campo inteiro por código, **arredonde na hora de preencher**. E
decida o que fazer quando o arredondamento zera: `Math.round(0.4)` é `0`, e um
peso zero é pior do que não preencher.

## 4. Nada nasce vazio e vira o que vale

Conjuntos com um registro ativo — metas, planos, cálculos — têm gatilho no banco
que faz o novo nascer ativo e **desligar o anterior**. Uma tela de "criar novo"
que nasce em branco, portanto, **apaga na prática** o que estava valendo, sem
avisar.

Ao abrir um "novo", **parta do que já vale** e deixe a pessoa editar por cima.
`CalculoEnergeticoScreen` e `MetasScreen` já fazem assim.

## 5. Antes de escrever função nova, procure a antiga

O bug da meta de água era uma função obsoleta que sobreviveu à sua substituta,
e a tela continuou importando a errada por meses. Antes de criar
`salvarXPTO`, rode:

```bash
grep -rn "salvarXPTO\|xpto" src/lib
```

E ao substituir uma função, **apague a antiga na mesma alteração**. Duas
implementações do mesmo assunto sempre divergem, e ninguém descobre por qual das
duas a tela passa.

## 6. Null é resposta, zero é mentira

A base não tem todo nutriente de todo alimento. Um `0` no lugar do desconhecido
soma como se fosse verdade e produz um total errado que ninguém questiona.
Mantenha `null` e faça a tela dizer "—" ou "sem caloria".

## 7. Imagem do Storage: URL pública é um endereço que não existe

Os buckets são **privados**. `getPublicUrl` não pergunta nada a ninguém: ele
concatena uma string e devolve um endereço com cara de válido, que o servidor
recusa com `Bucket not found`. A foto de perfil de todo mundo ficou meses assim,
e **sem erro nenhum** — do ponto de vista do app estava tudo certo até a imagem
simplesmente não aparecer.

```ts
// errado, e falha em silêncio
supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

// certo
const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
```

Duas consequências que vêm junto:

- **Assinar é `async`.** O endereço deixa de ser calculado no meio do render e
  vira estado, refeito quando o caminho muda. Ver `PerfilScreen`.
- **Endereço assinado VENCE.** Uma hora, no caso das fotos. Tela que carrega uma
  vez e fica aberta mostra foto quebrada depois do almoço — ver o item 9.

E **toda `<Image>` remota precisa de `onError`**. Sem ele, a imagem que falha não
desenha nada e sobra um buraco do tamanho dela, que se lê como app quebrado —
pior do que nunca ter tido foto. Guarde **qual** endereço falhou, e não um
booleano, para que um endereço novo entre tentando de novo:

```tsx
const [falhou, setFalhou] = useState<string | null>(null)
{url && url !== falhou
  ? <Image source={{ uri: url }} onError={() => setFalhou(url)} />
  : <Iniciais />}
```

## 8. O que muda do lado da nutricionista nunca chega sozinho

Vínculo, consulta aceita, plano publicado: tudo isso acontece **no sistema dela**,
e nada avisa o aparelho. Não há realtime em lugar nenhum do app.

O caso que custou a rodada: o paciente dita o código, ela vincula ali na frente
dele, ele volta ao app — e a tela continua dizendo que ele não tem nutricionista.
Só fechando e abrindo o app resolvia. **E ninguém fecha app.**

Toda tela que mostra dado vindo do sistema precisa de:

```tsx
useEffect(() => {
  const sub = AppState.addEventListener('change', e => {
    if (e === 'active') setVersao(v => v + 1)   // relê
  })
  return () => sub.remove()
}, [])
```

Mais o `RefreshControl`, **inclusive na ramificação de erro** — é justamente ali
que puxar para tentar de novo é o gesto óbvio, e mais de uma tela prometia
"tente de novo" por escrito sem ter o controle que atende ao gesto.

Ao ligar a releitura, **não pisque**: o indicador de carregando só vale para a
primeira carga. Trocar o conteúdo por um spinner a cada volta do segundo plano
paga um susto por uma leitura que quase sempre não muda nada.

## 9. Erro que não se limpa no sucesso

Enquanto a tela carregava uma vez só, escrever o erro e nunca apagá-lo era
inofensivo. Assim que ela passa a reler sozinha, vira defeito: a leitura seguinte
dá certo e o conteúdo fica escondido atrás de uma mensagem vencida.

```ts
if (r.tipo === 'erro') setErro(r.mensagem)
else { setErro(null); setDados(r.dados) }   // o else limpa
```

O contrário também morde: em `AgendarConsultaScreen`, o tratamento da recusa
recarregava a tela, e a recarga começava zerando o erro — a explicação do banco
("Esse horário não está mais disponível") era apagada no mesmo instante em que
aparecia. Quem recarrega depois de falhar precisa dizer para **não** limpar.

## 10. Valor que vem do banco não indexa um `Record` direto

`ESTADO_DA_CONSULTA[status]` devolve `undefined` para qualquer palavra fora das
três conhecidas, e a linha seguinte lê `.titulo` dele — a tela inteira morre por
causa de um valor novo numa coluna. E esse dia tem hora marcada: no momento em
que a nutricionista puder recusar do lado dela, a recusa chega aqui como um
status que o app nunca viu.

Sempre uma função com genérico de reserva, nunca o índice cru:

```ts
export const estadoDaConsulta = (s: string): Estado =>
  ESTADO_DA_CONSULTA[s as StatusConsulta] ?? DESCONHECIDO
```

E o texto do genérico deve **admitir que o app não sabe**, nunca chutar
significado. Inventar "confirmada" para um estado desconhecido faz alguém
aparecer no consultório num dia em que não era esperado.

## 11. Função de apoio de UI não pode rejeitar

Ida à rede **rejeita** quando não há sinal, em vez de devolver `{ error }`. Uma
rejeição não tratada sobe até quem só chamou a função dentro de um `.then` — e aí
uma foto derruba a tela inteira: sem sinal, o catálogo ficava sem nutricionista
nenhuma por causa de uma imagem.

Função que existe para alimentar a tela devolve `null` e engole a falha. Quem
decide o que fazer com a ausência é a tela, que já sabe desenhar as iniciais.

## 12. Erro de banco não é texto para o paciente

O Supabase devolve o texto do Postgres, e ele vinha parar na tela: "duplicate key
value violates unique constraint", "Network request failed", "permission denied
for function". Inglês, de programador, e sem dizer o que fazer — para alguém que
só queria anotar um copo de água ou marcar uma consulta.

Use `falha()` de `lib/erros.ts`: a frase que a pessoa lê fica no lugar da
chamada, e o texto cru vai para o console.

```ts
if (error) return { tipo: 'erro', mensagem: falha('Não consegui registrar o copo agora.', error) }
```

Os dois lados importam. Engolir o erro em silêncio já custou uma sessão inteira
de investigação aqui — ver o comentário do carregamento em `NutricionistasScreen`.

**A exceção**, e é uma só: quando o BANCO escreve a mensagem para alguém ler (um
`RAISE` em português, como "Esse horário não está mais disponível."), repassar é
melhor do que traduzir. Está em `lib/agenda.ts`, na hora de pedir consulta, e é o
único lugar.

Nem toda lib já foi convertida. Ao mexer numa que ainda devolve `error.message`
cru, converta-a de passagem.

## 13. Antes de dar por pronto

- `npx tsc --noEmit` — o principal, e por muito tempo o único.
- `npm test` — todos os `.teste.mts` de uma vez. Um só:
  `node --experimental-strip-types src/lib/<arquivo>.teste.mts`.

  **Não conte os testes aqui.** Esta linha já disse "hoje só um, com 52 casos"
  por tempo demais, com sete arquivos no repositório — e uma contagem errada num
  documento de instruções é pior do que contagem nenhuma, porque quem lê acredita
  e não vai conferir. O comando encontra o que existe.

  Lógica pura dá para testar de verdade neste projeto, e vale a pena onde o
  dado vem de fora e chega torto: JSON de IA, texto que a pessoa escreveu,
  resposta de API, status de uma coluna. O truque é o arquivo testado não
  importar NADA de runtime — só `import type`, que some na compilação — porque
  qualquer import que puxe o Supabase ou o React Native arrasta o aparelho
  inteiro junto e o Node não roda.

  Foi por isso que `sugestaoParaPlano` nasceu separado de `planoIA`, e por isso
  `montarAvisos` foi separado de `avisos`: lá fica o que fala com a rede, aqui o
  que decide, e é o que decide que erra. Quando uma lib tiver decisão que valha
  a pena exercitar, esse é o corte a fazer — e vale fazê-lo na mesma alteração,
  porque depois ninguém volta.

  Os `.teste.mts` ficam FORA do `tsc` (ver `exclude` no tsconfig): o Node exige
  a extensão `.ts` no import e o `tsc` a recusa sem `allowImportingTsExtensions`.
  Quem confere esses arquivos é a execução deles.
- Se mexeu em campo numérico, teste a conversão com valores reais (`10.000`,
  `7,5`, vazio).
- Se criou tela com camadas, teste o voltar em cada uma.
- Se criou campo, abra o teclado e veja se o campo continua visível.
- Se a tela mostra imagem remota, veja o que aparece quando ela **não** carrega.
- Se a tela mostra dado do sistema, mande o app para o segundo plano, mude o
  dado do outro lado, e volte.
- Se a tela mostra erro, veja se o que aparece é frase de gente ou do Postgres.

## Como rodar

```bash
npx expo start --lan
```

Sem variável de ambiente. `set VAR=valor && comando` no `cmd` do Windows inclui
o espaço antes do `&&` no valor, e o Expo cai para `localhost`.

Ao diagnosticar o endereço, peça o manifest **pelo IP da rede**, não por
`127.0.0.1`: a URL do bundle espelha o cabeçalho `Host` da requisição, então
consultar por localhost devolve localhost — e isso não é bug.
