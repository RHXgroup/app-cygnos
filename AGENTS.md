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

Três regras que vieram de erro real:

- **Registre no filho, não no pai.** O React Native chama os tratadores na ordem
  inversa do registro, então o mais interno decide primeiro — é isso que faz o
  voltar descascar em vez de fechar tudo.
- **`return false` quando não houver nada a fechar**, para o nível de cima
  assumir. Segurar o evento em todos os casos prende a pessoa dentro do app.
- **Se a tela já tem uma saída com pergunta** ("descartar alterações?"), o voltar
  deve passar por ela, e não por `onFechar` direto. Um caminho de saída que pula
  o aviso existe só para quem usa o botão do aparelho — e é justamente quem mais
  o usa.

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

## 7. Antes de dar por pronto

- `npx tsc --noEmit` — a suíte de testes deste projeto é esta.
- Se mexeu em campo numérico, teste a conversão com valores reais (`10.000`,
  `7,5`, vazio).
- Se criou tela com camadas, teste o voltar em cada uma.
- Se criou campo, abra o teclado e veja se o campo continua visível.

## Como rodar

```bash
npx expo start --lan
```

Sem variável de ambiente. `set VAR=valor && comando` no `cmd` do Windows inclui
o espaço antes do `&&` no valor, e o Expo cai para `localhost`.

Ao diagnosticar o endereço, peça o manifest **pelo IP da rede**, não por
`127.0.0.1`: a URL do bundle espelha o cabeçalho `Host` da requisição, então
consultar por localhost devolve localhost — e isso não é bug.
