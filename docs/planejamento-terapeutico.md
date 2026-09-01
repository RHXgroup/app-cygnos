# Planejamento terapêutico: o modelo existe, a ponte não

**Estudo completo, com evidência e mercado:**
https://claude.ai/code/artifact/cdc0a477-6212-4c2a-ba5b-9ad6c17cd990

Este arquivo é o resumo para quem trabalha no repositório. Levantado em
31/08/2026 a pedido do Helton, com o lado do consultório levantado pela sessão
`nutriviet-ca`, que leu o esquema completo.

---

## A conclusão

O sistema da nutricionista **já tem** um modelo de terapia alimentar infantil, e
ele está alinhado com a literatura. **Nada disso chega ao app.**

O app tem 37 RPCs e nenhuma toca planejamento terapêutico. O único caminho dela
para o paciente continua sendo plano alimentar recortado, recado, receitas e
questionário pré-consulta.

## O que existe do lado dela

```
planos_terapeuticos      → objetivos_terapeuticos → atividades_terapeuticas
registros_exposicao      (o diário)
responsaveis_paciente    (o cuidador, com autoridade_legal)
antropometria_crianca    (separada da de adulto)
preparacoes_alimento     (textura, umidade, formato, temperatura, método)
```

**A escalada de aceitação**, em `registros_exposicao`:

```
recusou → tolerar → interagir → cheirar → tocar → provar → comer
```

Mais sete marcos booleanos (`visualizou`, `tocou`, `cheirou`, `levou_a_boca`,
`mordeu`, `mastigou`, `engoliu`), uma escada fina de **32 passos** em
`passos_alcancados`, `reacao_emocional` (positiva/neutra/negativa/agitada) e
`ambiente` (consultorio/casa/**escola**).

**A atividade já nasce para a casa:** `ambiente` tem padrão `casa` e
`responsavel` tem padrão `familia`.

**E já existe um alerta de reação emocional**, que dispara quando 2 das últimas 3
exposições foram negativas ou agitadas.

## Por que isso importa para quem for construir

Quatro achados da literatura, e o quarto é o que restringe o desenho:

1. **Exposição repetida** é o mecanismo — não convencimento nem recompensa.
2. **O platô é entre 4 e 6 exposições**, não 15. Insistir além disso gera tédio.
3. **A frequência quase não importa** (2×/semana, 1×/semana, quinzenal — nenhuma
   superior). Não há motivo para o app cobrar ritmo.
4. **Exposição com emoção negativa REFORÇA a rejeição.** Um app que produz culpa
   na mãe produz pressão na criança, e a pressão produz mais recusa.

**O que NÃO construir**, direto do achado 4: sequência de dias seguidos,
notificação cobrando a oferta do dia, meta numérica de alimentos aceitos, e
comparação com outras crianças. E o alerta de reação emocional dela tem de ser
preservado, nunca contornado.

## O mercado

Existem apps para a mãe — **Food Hopper**, **Pitaya**, e o acadêmico **Fussy
Eating Rescue**. Todos avulsos, sem profissional no circuito. As plataformas
clínicas (Nutrium, Practice Better, Dietbox, WebDiet) têm app de paciente, mas
nenhuma faz terapia alimentar infantil.

A crítica que a própria área faz aos primeiros é que "não substituem
acompanhamento profissional". É exatamente a posição que o Cygnos já ocupa sem
construir nada: **o plano tem autora, e a autora vê o resultado.**

## A proposta, em ordem

1. **A mãe vê o plano** — leitura pura, uma função nova, nenhuma escrita.
   Mostrando o que é **estruturado** (alimento-alvo, texturas, preparações,
   degrau), e **não** o texto livre: `objetivo_principal` e
   `criterio_evolucao` são escritos por profissional para profissional, e
   viram jargão na tela da mãe. O texto livre fica como nota clínica.
2. **A mãe registra a exposição** — a escalada em sete botões, um toque e meio.
   Na quinta oferta do mesmo alimento, o app **não cobra a sexta**.
3. **O resumo da semana, por alimento-alvo** — quantas ofertas, até que degrau,
   e como foi a reação. A lógica dela exige 3 registros para medir evolução.

## O que ainda não está decidido

- **Como uma conta do app vira "mãe de"**. Do lado dela `responsaveis_paciente`
  resolve; do lado de cá, o app assume uma conta por pessoa e o vínculo é
  conta↔nutricionista. É decisão de produto, e vem antes de qualquer tela.
- O registro da mãe entra no prontuário com o mesmo peso que o dela, ou marcado
  como relato da família para ela confirmar?
- Idade mínima e a política de Famílias do Google. Hoje declaramos que o app não
  é dirigido a crianças, e é verdade — quem usa é a mãe. Tem de continuar sendo:
  nada de tela feita para a criança tocar.

**Nada aqui foi construído.** É levantamento para decisão.
