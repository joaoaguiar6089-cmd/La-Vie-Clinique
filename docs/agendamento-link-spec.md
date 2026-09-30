# Link do agendamento

A equipe gera, a partir de um agendamento, um link secreto que a cliente abre no celular, sem login.
A página mostra o card do procedimento (foto, nome, data, hora, profissional, local, orientações) e
deixa a cliente **confirmar presença**, **avisar que não vai** ou **pedir outro horário**.

```
Agenda → agendamento → "Compartilhar link com a cliente"   (AgendamentoShareModal)
        → https://<site>/?agendamento=<token>               (PublicAppointmentEntry + AppointmentCard)
```

## Como funciona

A página pública não pode ler `attendances`, `procedures` nem `patients` (as regras exigem login).
Então a equipe grava uma **cópia enxuta** do agendamento em `appointment_links/{token}` — o mesmo
padrão do espelho público do perfil da clínica — e a mantém em dia.

| Peça | Onde | O que faz |
|---|---|---|
| Token | `Attendance.linkToken` | `crypto.randomUUID()`. É o segredo: o id do atendimento (`atd-<timestamp>`) é adivinhável. |
| Cópia pública | `appointment_links/{token}` | Só o que a cliente precisa ver. Sem observações, preço, id ou contato da paciente. |
| Resposta | `resposta`, `respostaPendente`, `respondidoEm` | **Única** escrita permitida a quem não tem login. |
| Aplicação | `aplicarRespostaDoLink` (chamada em `App.tsx`) | O painel, quando aberto, copia a resposta para o atendimento e zera `respostaPendente`. |

O link é criado (ou a cópia renovada) **quando a equipe abre "Compartilhar"**, nunca automaticamente:
agendamento que não é compartilhado não custa cota do banco.

## O que cada resposta faz

| Resposta da cliente | No atendimento | Na agenda |
|---|---|---|
| Confirmar presença | `confirmadoEm` = instante em que ela respondeu | Cartão verde "Confirmado" |
| Não vou poder ir | `avisoAusenciaEm` | Cartão "Cliente não vai". **Só sinaliza** — o status não muda. O botão **Faltou** some (ela avisou); ficam Remarcar e Excluir. |
| Preciso alterar (data + hora + recado) | `pedidoRemarcacao` | Cartão "Pediu alteração" e faixa **Respostas das clientes**: **Aprovar** remarca de verdade (`remarcarAtendimento`, o novo já nasce confirmado) ou **Recusar**. |

As três respostas se excluem — a última vale (`efeitoDaResposta`). Mudar a data ou a hora do
agendamento pela equipe zera as respostas: elas eram sobre o horário antigo.

Aprovar confere a agenda: **sala ocupada impede** (`conflitosDeSala`), **profissional ocupada só avisa**
(`conflitosDe`) e pedido com data que já passou é recusado no diálogo.

## Manter a cópia em dia

Cada gravação de um atendimento que tem `linkToken` atualiza o link (`sincronizarLinkDoAtendimento`):
data, hora, profissional, título e `situacao` (`ativo` / `remarcado` / `encerrado`).

- `remarcado` é estado final: o token passa para o agendamento novo (`remarcarAtendimento`), e o
  registro antigo o perde.
- Excluir o agendamento apaga o link.
- A sincronização **nunca lança**: o link é um espelho e o atendimento já foi gravado. Se falhar,
  a página fica desatualizada — nunca a agenda.

## Segurança (`firestore.rules`)

- `get` é público e vale por id; **`list` é só da equipe**, para ninguém enumerar tokens.
- Sem login só se pode `update`, com o agendamento `ativo`, e só os campos `resposta`,
  `respostaPendente` e `respondidoEm`. O `tipo` tem de estar na lista, data e hora no formato certo,
  recado até 300 caracteres.
- Foto e logo só entram na cópia se forem `http(s)`. Imagem em base64 (fallback de quando o envio
  ao Storage falha) estouraria o limite de 1 MB do documento.

## Depois de publicar o código

1. **Publicar as regras do Firestore** — sem isso a página pública cai no `if false` do fim do
   arquivo e não abre, e "Compartilhar" mostra o aviso de regras não publicadas:

   ```
   firebase deploy --only firestore:rules
   ```

2. Publicar o site pelo Google AI Studio (a partir da `main`).
3. Conferir o **Endereço público do sistema** (Configurações) — o link herda esse endereço, e o
   endereço de desenvolvimento do AI Studio pede login para a cliente (`AvisoLinkFechado` avisa).

## Fora do escopo

- Envio automático de WhatsApp e notificação push para a equipe: não há backend. A equipe vê as
  respostas ao abrir o painel.
- Horários livres para a cliente escolher: ela digita data e hora, e a equipe valida ao aprovar.
- `{link}` no modelo automático de confirmação (`ClinicSettingsModal`).

## Verificação

```
npx tsc --noEmit
npx tsx scripts/verificar-agendamento-link.ts
```

O script confere o que vaza (ou não) para a página pública, o efeito de cada resposta, a
validação do pedido de horário e o que a equipe precisa resolver.
