# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

> O projeto está no **SDK 54** (`expo@54.0.37`), não no 57. Ao consultar a
> documentação, use a versão que o projeto realmente usa — corrigir contra a
> documentação de outra versão introduz problema novo. Se a intenção for migrar
> para o 57, isso é uma decisão à parte, não um detalhe de implementação.

**Instalar pacote é `npx expo install`, nunca `npm install`.** Ele consulta o que
a SDK do projeto usa; o npm sozinho pega o mais novo do registro. Já aconteceu:
`expo-audio` declara `expo-asset: "*"` como peer, o npm leu o asterisco e trouxe
`expo-asset@57` — SDK 57 dentro de um projeto SDK 54 —, arrastando junto um
segundo `expo-constants`. No Expo Go passava despercebido; num build de verdade
não passa, porque uma build nativa só aceita uma versão de cada módulo nativo.

`npx expo-doctor` pega isso, e vale rodar depois de mexer em dependência.

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

## 2. O teclado, e a pergunta que vem ANTES de mexer no componente

> **Este item já esteve errado DUAS vezes, e a segunda versão errada durou
> horas e quase entrou num build.** Ela afirmava que "no Expo Go a janela
> encolhe sozinha" e mandava TIRAR o tratamento. Era a sexta teoria de uma
> sequência de seis, escrita antes de alguém medir.
>
> **A medição desmentiu.** Uma foto da tela com o teclado aberto mostrou a barra
> de escrever completamente FORA da tela, abaixo do teclado. Se a janela
> encolhesse, ela estaria visível. Não encolhe.
>
> Fica registrado porque o dano foi real: outra sessão citou esta seção de volta,
> como autoridade, para questionar a correção certa — horas antes de um build de
> produção. **Documento errado não fica parado; ele argumenta.**

**A pergunta primeiro: quem controla o teclado neste momento?**

No **Expo Go** — que é onde este app roda hoje — as configurações de Android do
`app.json` **não valem**: `softwareKeyboardLayoutMode` e `edgeToEdgeEnabled` são
ignorados, e quem manda é o manifesto do próprio Expo Go.

**E ali a janela NÃO encolhe.** Medido no aparelho, não deduzido.

**Num build de verdade isso pode mudar**, porque o `app.json` passa a valer.
Nenhuma tela de teclado deste app foi testada em build — as duas são as
primeiras a reabrir no primeiro APK.

**A conta, com os números medidos:**

```
teclado 306 · área segura 48 · e faltavam exatamente 48
```

`endCoordinates.height` devolve a altura do teclado **sem** a barra de navegação
que fica por baixo dele. **As duas somam.** Quem desviar só pela altura do
teclado fica 48 por baixo — em painel alto isso esconde a borda e ninguém
reclama; em barra baixa some a barra inteira.

**Use `useDesvioDoTeclado(areaSegura, alturaDaTela?)`, de `lib/teclado.ts`.** Ele
já faz a soma e, se receber a altura da tela, detecta o caso em que a janela
encolhe e devolve zero — o que protege o build sem mexer no que funciona hoje.

**Então, ao ver campo escondido:**

1. **Meça antes de teorizar.** Imprima teclado, área segura e deslocamento numa
   faixa na tela e peça uma foto. Uma foto encerrou o que seis deduções não
   encerraram, e cada dedução custou uma rodada de quem estava usando o app.
2. `KeyboardAvoidingView` com `behavior` indefinido no Android não faz nada — e
   dentro de `<Sobreposta>`, que é `absoluteFillObject`, ele erra de qualquer
   jeito. Prefira o deslocamento medido.
3. No iOS use `keyboardWillShow`; no Android só existe `keyboardDidShow`. Isso
   já está dentro de `useAlturaTeclado`.

**A conta é `teclado + área segura`, e as duas SOMAM.**

`endCoordinates.height` devolve a altura do teclado **sem** a barra de navegação
que fica por baixo dele. Medido no aparelho:

```
teclado 306 · área segura 48 · e faltavam exatamente 48
```

Quem desviar só pela altura do teclado fica 48 por baixo. Em painel alto isso
esconde a borda e ninguém reclama; em barra baixa some a barra inteira.

Isto custou SEIS tentativas numa tela só, e o motivo de ter custado tanto vale
mais que a regra: eu trocava o MECANISMO a cada rodada — KeyboardAvoidingView,
margem, âncora absoluta, medir se a janela encolhe — e nunca conferi o NÚMERO.
Uma faixa temporária imprimindo os três valores na tela resolveu numa foto.

**Quando o layout estiver errado e a segunda tentativa falhar, pare de trocar de
mecanismo e imprima os números na tela.** Sai mais barato que a terceira teoria.

**Em build de verdade isto pode mudar**, porque aí o `app.json` passa a valer e o
edge-to-edge entra. No dia do primeiro build, esta é uma das telas para reabrir.

**A pendência que estava anotada aqui foi resolvida**, e do jeito contrário do
que eu supunha: `BuscarAlimentoScreen` não subia DEMAIS, subia de MENOS — os
mesmos 48 da barra de navegação. Ninguém tinha reclamado porque o painel é alto e
o que sumia era a borda, não o campo. Corrigido junto com a conversa, e as duas
telas continuam sendo as primeiras a reabrir no primeiro build.

**E as duas ficaram desiguais depois disso, o que é a armadilha 5 outra vez.** A
conversa passou a usar `useDesvioDoTeclado`; buscar alimento manteve a conta
escrita à mão. A conta à mão está certa no Expo Go e ERRADA num build: lá o
`android:windowSoftInputMode` sai `adjustResize`, a janela encolhe sozinha, e
somar de novo empurra o painel 354 para cima do que já estava resolvido. Hoje as
duas medem a raiz no `onLayout` e perguntam ao mesmo lugar. **A altura tem de vir
do `onLayout`**, e não de `useWindowDimensions`, que não encolhe junto.

A decisão mora em `lib/desvioDoTeclado.ts`, separada do hook, e o motivo do corte
vale para qualquer código escrito para um build que ainda não existe: **aquele
ramo nunca rodou**. No Expo Go a janela não encolhe, então o tratamento do
encolhimento ia estrear em produção. Fora do aparelho ele roda com os números que
foram medidos NO aparelho — 306, 48, e os 354 que a foto mostrou faltando —, e é
o mais perto de testar um build que dá para chegar antes de ter um.

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

**A exceção**: quando o BANCO escreve a mensagem para alguém ler (um `RAISE` em
português, como "Esse horário não está mais disponível."), repassar é melhor do
que traduzir — quem sabe por que recusou é quem recusou. Acontece em pedir
consulta, mandar mensagem e pedir vínculo.

**Mas a exceção tinha o caminho largo demais, e isso custou uma passada de
teste.** `error.message` não é só o `RAISE`: a MESMA chamada devolve "Network
request failed", "permission denied for function" e "JWT expired". Esses iam
para a tela em inglês — exatamente o que o `falha()` existe para impedir.

Use `mensagemDoBanco(error, 'a nossa frase')` de `lib/erros.ts`. Ele repassa o
texto do banco só quando ele TEM CARA de frase escrita para gente (português,
sem jargão de banco) e cai na nossa frase no resto. A decisão é pela cara do
texto, e não pelo `errcode`: o `RAISE` chega como P0001 num caso e 23514 noutro,
e depender disso quebraria calado no dia em que alguém trocasse o `using
errcode`.

**Nenhum `error.message` cru deve chegar à tela.** Não conte quantos existem
aqui — a contagem envelhece e convence quem lê. Rode:

```bash
grep -rn "error.message" src/lib | grep -v "falha(\|mensagemDoBanco"
```

O que sobrar é comentário ou é regressão. E prefira `falha()` mesmo quando
ninguém vai ler a frase, porque o console é a outra metade do trabalho.

## 13. As quatro abas existem todas ao mesmo tempo

O carrossel do `App.tsx` monta Início, Relatórios, Mensagens e Mais **de uma
vez**, no primeiro instante, e nunca desmonta nenhuma. Trocar de aba é rolagem
lateral, não navegação.

Duas consequências, e as duas já produziram defeito:

- **`useEffect` com `[]` roda UMA vez por sessão do app**, e não uma vez por
  abertura da aba. O `MaisScreen` tinha um `reagendarSeLigados` para corrigir o
  horário do lembrete quando o plano mudava, com comentário e tudo — e ele
  quase nunca rodava. Quem mudasse o almoço das 12:30 para as 13h continuava
  sendo avisado às 12:30 até fechar o app. Toda aba que depende de algo que
  muda precisa do contador correspondente na lista de dependências; é para isso
  que os `versaoX` do `App` existem.

- **Estar montada não é estar na frente.** A aba Mensagens ficava recebendo o
  realtime e marcando tudo como lido com a pessoa parada na tela inicial — o
  que apagava o ponto de "mensagem nova" antes de ele aparecer. O que depende
  de a pessoa estar VENDO a tela precisa de um booleano vindo do App
  (`visivel={aba === 'mensagens'}`), porque o ciclo de vida do componente não
  sabe a diferença.

O outro lado disso é uma vantagem, e vale usar: uma inscrição de realtime
registrada numa aba montada permanentemente vale para o app inteiro. É assim
que o ponto de mensagem acende na hora, sem esperar a próxima leitura.

## 14. `revoke` que roda com sucesso e não fecha nada

O Supabase concede EXECUTE de função a **`PUBLIC`** por padrão, e `anon` herda
dessa concessão. Isso faz as duas formas óbvias falharem, cada uma de um jeito:

```sql
revoke all on function public.f() from public;  -- não bloqueia o anon
revoke all on function public.f() from anon;    -- não tira o que veio do PUBLIC
```

**As duas rodam com "Success" e a porta continua aberta.** Aconteceu duas vezes
no mesmo dia, uma em cada direção.

O que fecha, com a assinatura e tirando dos dois:

```sql
revoke all on function public.f(text) from public, anon;
grant execute on function public.f(text) to authenticated;
```

**A assinatura importa** quando a função tem argumento: sem ela, o Postgres
recusa se houver mais de uma com o mesmo nome — e mudar a assinatura de uma
função sem `drop` da anterior deixa **duas**, o que faz o PostgREST recusar as
duas por ambiguidade (`PGRST203`). Ver a armadilha 5: ao substituir, apague a
antiga na mesma alteração.

E **conferir não é opcional**, porque a única evidência que o editor SQL dá é o
"Success" que apareceu nas duas tentativas erradas. `npm run contrato` chama toda
função que o app usa com a chave pública e separa "existe e barrada" de "existe
e executa sem sessão".

## 15. Ler corpo de função do banco corrompe acento no caminho

`pg_get_functiondef` devolve o corpo com os acentos estragados quando a resposta
passa pelo caminho JSON — e o estrago VOLTA GRAVADO se alguém colar aquilo de
volta. Uma função do sistema já perdeu 12 comentários assim, num round-trip
anterior, e ninguém viu até alguém reler o corpo com atenção.

O transporte que não corrompe:

```sql
select encode(convert_to(pg_get_functiondef(oid), 'UTF8'), 'base64')
```

e decodificar do outro lado. Vale sempre que for LER corpo de função para
reescrever — que é justamente quando o dano se torna permanente.

**Para procurar dano já feito**, o sinal é `Ã` seguido de minúscula:

```bash
grep -rlP "Ã[a-zç]" --include=*.ts --include=*.tsx --include=*.sql .
```

`Ã` sozinho não serve como sinal: ele aparece legitimamente em "NÃO" maiúsculo.
E o que sobra ainda tem falso positivo — uma classe de caracteres de regex
listando acentos (`[a-zA-ZçáéíóúâêôãõÁÉÍÓÚÂÊÔÃÕÇ]`) casa e está correta. Olhe a
linha antes de consertar.

Rodado nos dois repositórios em 31/08/2026: **nenhum dano**, só aquele falso
positivo em `lib/interpretador.ts`.

## 16. Antes de dar por pronto

- `npx tsc --noEmit` — o principal, e por muito tempo o único.
- `npm run contrato` — confere que toda RPC que o app chama existe no banco com
  a assinatura exata, e lista as que executam sem sessão. Precisa de rede, e por
  isso fica fora do `npm test`.
- `npm run orfaos` — lista o que `src/lib` exporta e ninguém chama. **Órfão não
  é erro**: exportar só para o teste é legítimo, e função nova esperando a tela
  também. A saída é lista para olhar, não reprovação.

  Existe porque **"o objeto existe" e "o caminho passa por ele" são duas
  conferências**, e a segunda é a que pega defeito. Num dia só apareceram três
  do mesmo formato: um canal de notificação criado e nunca posto no `trigger`
  (a confirmação de água tocava e vibrava, que era exatamente o que o canal MIN
  existia para evitar), uma busca de refeição no plano que nunca casava, e um
  `useRespiroDeBaixo` que perdeu o chamador e ficou meses esperando alguém
  importar a versão errada. Nos três o código rodava e nada falhava.

  E ele **confere a si mesmo** antes de imprimir, o que não é zelo: as duas
  primeiras versões deste script rodaram com sucesso sem conferir nada. Uma
  tinha `\b` comido pelo heredoc do shell, virando um caractere de backspace, e
  acusou os 400 exportados. A outra varria só `src/` e esquecia o `App.tsx`, que
  mora na raiz e é o maior consumidor de lib do projeto — acusou de órfão o
  ouvinte do botão de água e o do tema. Se `supabase` aparecer na lista, o
  quebrado é o script.

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
- Se mexeu numa das quatro abas, confira as dependências do efeito: elas montam
  uma vez só, e `[]` ali quer dizer "uma vez por sessão do app".

## Gerar o .aab para a Play Store

```bash
npx eas-cli login          # uma vez; abre o navegador, nao pede senha no terminal
npx eas-cli build --platform android --profile production
```

O perfil `production` do `eas.json` ja produz `app-bundle`, o `versionCode` sobe
sozinho (`autoIncrement`), e a chave de assinatura mora na conta do EAS e bate
com o certificado de upload do Play. **Nunca responda "sim" a "Generate a new
Android Keystore?"** — gerar outra faz o Play recusar o arquivo com "assinado
com a chave errada".

### O EAS resolve o commit na hora de EMPACOTAR, nao na hora da chamada

Isto nao esta escrito na documentacao deles e custou uma conclusao errada aqui.
Entre `eas build` sair do teclado e o upload comecar passam segundos ou minutos;
o commit que vai para o build e o HEAD **desse** instante.

Aconteceu nos dois sentidos no mesmo dia: um build disparado esperando o commit
A saiu com o B, que outra sessao commitou no meio — por sorte, o resultado
certo. Podia ter sido o contrario.

**Confira o HEAD no instante de disparar, e confira de novo depois** com
`eas build:list --limit 1`, que mostra o commit que de fato entrou. Para saber
se um commit especifico esta dentro, pergunte ao grafo em vez de deduzir:

```bash
git merge-base --is-ancestor <commit> <commit-do-build> && echo dentro
```

### Antes de disparar

`npx eas-cli env:list production` — as duas variaveis do Supabase precisam
existir NO EAS. O `.env` local nao sobe (esta no `.gitignore`), e elas sao
embutidas no pacote em tempo de build: faltando, o `.aab` compila normal e o app
morre na primeira tela, sem erro de compilacao nenhum.

### O que PARA de acontecer no build, e nao e defeito novo

Tres comportamentos que o Expo Go impoe e que somem no APK. Ja foram
diagnosticados como bug do app uma vez; se sumirem, esta certo:

- a caixa em ingles pedindo permissao de notificacao (era do Expo Go, que
  compartilha uma permissao entre projetos);
- a sessao se perder quando outro app se atualiza (o armazenamento passa a ser
  do app, e nao do Expo Go);
- os interruptores de lembrete aparecerem desmarcados, pelo mesmo motivo.

E o contrario tambem vale: **nenhuma tela de teclado deste app rodou em build**,
so no Expo Go. Conversa e buscar alimento sao as duas primeiras a reabrir no
primeiro APK — por isso o primeiro envio vai para o teste FECHADO, e nao para
producao.

## Como rodar

```bash
npx expo start --lan
```

Sem variável de ambiente. `set VAR=valor && comando` no `cmd` do Windows inclui
o espaço antes do `&&` no valor, e o Expo cai para `localhost`.

Ao diagnosticar o endereço, peça o manifest **pelo IP da rede**, não por
`127.0.0.1`: a URL do bundle espelha o cabeçalho `Host` da requisição, então
consultar por localhost devolve localhost — e isso não é bug.

### Quando o QR sai com `127.0.0.1` e o celular não conecta

`--lan` **não garante** o IP da rede. O Expo descobre qual placa usar
procurando o **gateway IPv4**; nesta máquina o roteador entrega gateway só em
IPv6 (`fe80::…`), a busca falha e ele cai para `localhost` — de forma
intermitente, o que é pior, porque às vezes funciona e a pessoa acha que
consertou. `127.0.0.1` no aparelho é o próprio aparelho, e não há o que
conectar.

Não adianta trocar de flag. Diga o IP na mão, em **duas linhas separadas**:

```bat
set "REACT_NATIVE_PACKAGER_HOSTNAME=192.168.15.51"
npx expo start --lan
```

As aspas não são enfeite: são elas que impedem o espaço de entrar no valor,
que é a armadilha do parágrafo acima.

E a saída de emergência, que não depende de descoberta nenhuma: no Expo Go,
"Enter URL manually" e digitar `exp://<IP>:8081`. Se o aparelho já falou com o
servidor alguma vez, a rede está boa e só o endereço do QR está errado.

**`--offline` não serve para isso.** Ele recusa `--lan` na mesma linha
("Specify at most one of"), e sozinho **força localhost** — é o contrário do
que se quer. Custou uma rodada aqui.

### Depois de mexer em muitos arquivos de uma vez

Trocar um import em dezenas de arquivos invalida o cache do Metro inteiro, e o
primeiro empacotamento seguinte leva perto de um minuto (1052 módulos, ~9 MB no
modo de desenvolvimento). Isso é normal e acontece **uma vez**: o pedido
seguinte do mesmo pacote volta em menos de meio segundo.

Duas coisas que fazem parecer travamento e são autoinfligidas:

- **Não peça o bundle em paralelo** (`curl` no `/index.ts.bundle`) enquanto
  alguém espera o aparelho carregar. É um segundo empacotamento completo
  disputando a mesma CPU, e dobra a espera que você está tentando diagnosticar.
- **Apague o `dist/`** depois de rodar `expo export`. São ~5 MB de cópia do app
  dentro da pasta que o Metro observa.
