# Google Agenda

Cada profissional conecta a conta Google dela, e os agendamentos dela passam a aparecer no Google
Agenda, num calendário próprio chamado **"La Vie Clinique"**.

- **Mão única.** A agenda do painel é a oficial. O que muda no painel vai para o Google (criar,
  mudar horário, trocar de profissional, confirmar, remarcar, excluir). O que for mudado no Google
  não volta para o painel e é sobrescrito na próxima mudança daquele agendamento.
- **Só o calendário "La Vie Clinique".** A permissão pedida (`calendar.app.created`) deixa o
  sistema criar esse calendário e mexer só nele. Os compromissos pessoais da profissional ficam
  fora do alcance.
- **O que aparece no evento:** nome da paciente, procedimento, horário, endereço da clínica, ✓
  quando a paciente confirmou e "(faltou)" quando faltou. Observações, telefone e ficha ficam no
  painel.
- **Ao conectar**, vão para o Google os agendamentos de hoje em diante. O passado não é enviado.

## Configuração (uma vez só)

### 1. Google Cloud — projeto `database-dra-karoline`

Tudo em [console.cloud.google.com](https://console.cloud.google.com), entrando com a conta Google
dona do projeto do Firebase. No seletor de projeto, no alto da tela, escolha
**database-dra-karoline**. Os links abaixo já abrem no projeto certo.

**1.1. Ativar a API do Google Agenda.**
[Abrir a Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=database-dra-karoline)
→ **Ativar**.

**1.2. Tela de consentimento** (menu ☰ → *Google Auth Platform*, ou
[este link](https://console.cloud.google.com/auth/overview?project=database-dra-karoline)).
Se aparecer **Primeiros passos** (*Get started*), preencha o assistente: nome do app
"La Vie Clinique", e-mail de suporte, público **Externo**, e-mail de contato, aceite a política →
**Criar**. Depois, no menu da esquerda:

- **Branding** — sem estes dois links o Google não libera o "Publicar app":
  - *Página inicial do aplicativo:* `https://drakaroline-lavie.ai.studio`
  - *Link da Política de Privacidade:* `https://drakaroline-lavie.ai.studio/privacidade` (página
    servida pelo `server/privacidade.ts`; só existe depois de publicar o site).
  - *Termos de Serviço:* pode ficar em branco.
  - *Domínios autorizados:* `drakaroline-lavie.ai.studio`.
  - **Salvar.**
- **Público-alvo** (*Audience*): em "Status de publicação", clique em **Publicar app** e confirme.
  Tem de ficar **Em produção**: no modo "Teste" o Google derruba a autorização a cada 7 dias.
- **Acesso a dados** (*Data access*): **Adicionar ou remover escopos** → cole
  `https://www.googleapis.com/auth/calendar.app.created` em "Adicionar escopos manualmente" →
  **Adicionar à tabela** → **Atualizar** → **Salvar**.
- Não é preciso pedir verificação ao Google: com menos de 100 contas o app funciona, só mostra o
  aviso "O Google não verificou este app" na hora de conectar.

**1.3. Criar a credencial** — é ela que gera os dois valores que vão para o AI Studio.
Menu da esquerda → **Clientes** (*Clients*) → **+ Criar cliente**
([link direto](https://console.cloud.google.com/auth/clients/create?project=database-dra-karoline)):

- **Tipo de aplicativo:** Aplicativo da Web.
- **Nome:** "Google Agenda do painel" (só para reconhecer depois).
- **Origens JavaScript autorizadas:** deixar em branco.
- **URIs de redirecionamento autorizados:** **+ Adicionar URI** →
  `https://drakaroline-lavie.ai.studio/api/google-agenda/retorno` (exatamente assim, sem barra no
  fim).
- **Criar.**

Abre a janela **"Cliente OAuth criado"** com:

- **ID do cliente** — termina em `.apps.googleusercontent.com`;
- **Chave secreta do cliente** — começa com `GOCSPX-`.

> **A chave secreta só aparece nessa janela.** Copie as duas antes de fechar (ou clique em
> **Baixar JSON**). Se fechar sem copiar: Clientes → clique no cliente → **Adicionar chave
> secreta**, e use a nova.

Na lista de Clientes pode existir um *"Web client (auto created by Google Service)"*: é o do
Firebase. Não use esse — use o que você acabou de criar.

O Google avisa que mudanças no cliente podem levar de 5 minutos a algumas horas para valer.

### 2. Google AI Studio — Secrets

No app dentro do AI Studio: **Settings** (engrenagem) → **Secrets** → adicionar os dois abaixo,
com os nomes escritos exatamente assim, e depois **publicar de novo**:

| Nome | Valor |
|---|---|
| `GOOGLE_AGENDA_CLIENT_ID` | o ID do cliente (termina em `.apps.googleusercontent.com`) |
| `GOOGLE_AGENDA_CLIENT_SECRET` | a chave secreta do cliente |

A chave secreta também cifra a autorização de cada profissional guardada no banco. Se ela for
trocada, as profissionais precisam reconectar.

### 3. Conectar cada profissional

No **site publicado** (`drakaroline-lavie.ai.studio`), logada: Configurações → Agenda → Google
Agenda → **Conectar** ao lado do nome. Na janela do Google, entrar com a conta Google da
profissional (o e-mail de login dela já vem sugerido). No aviso "O Google não verificou este app",
tocar em **Avançado** → **Acessar La Vie Clinique** e deixar marcada a permissão da agenda.

Depois de conectar, a sincronização funciona de qualquer lugar onde o painel estiver aberto,
inclusive dentro do AI Studio.

## Quando não conecta

Antes de tudo, veja se o servidor tem as duas chaves:

```
curl https://drakaroline-lavie.ai.studio/api/google-agenda/status
```

`{"configurado":false}` = falta `GOOGLE_AGENDA_CLIENT_ID` ou `GOOGLE_AGENDA_CLIENT_SECRET` nos
Secrets, ou o app não foi publicado depois de salvá-los.

| O que aparece no painel | O que é | O que fazer |
|---|---|---|
| **a chave secreta que o servidor tem não é a deste ID de cliente** (`invalid_client`) | A tela do Google apareceu e devolveu o código, então o ID e o endereço de retorno estão certos — quem não bate é a chave secreta | Ver abaixo |
| **o código do Google venceu ou já tinha sido usado** (`invalid_grant`) | A janela ficou aberta tempo demais | Conectar de novo |
| **a permissão do Google Agenda não foi marcada** | A caixa da agenda foi desmarcada na tela do Google | Conectar de novo deixando a caixa marcada |
| **o Google não entregou a autorização permanente** | Raro; o Google não devolveu o *refresh token* | Conectar de novo |
| **a integração ainda não foi configurada no servidor** | `/status` responde `configurado:false` | Secrets + publicar |
| Nada acontece e a janela fica na tela | A janela não é do site publicado | Conectar **pelo site**, não pelo painel dentro do AI Studio |

### `invalid_client`: o ID e a chave são de clientes diferentes

É o engano mais fácil de cometer, porque a tela de consentimento aparece normalmente — o ID está
certo, só a chave que não. As três causas, em ordem de frequência:

1. **A chave é de outro cliente OAuth.** Na lista de *Clientes* existe o
   *"Web client (auto created by Google Service)"*, criado sozinho pelo Firebase. Pegar a chave
   dele e o ID do nosso dá exatamente este erro.
2. **A chave foi trocada no Google** depois de copiada (ou o cliente foi recriado e só o ID foi
   atualizado nos Secrets).
3. **O app não foi publicado de novo** depois de salvar a chave. Secret novo só chega ao servidor
   na publicação — até lá ele continua usando o valor antigo, e `/status` responde
   `configurado:true` do mesmo jeito.

Como resolver sem adivinhar: em *Clientes*, abra o cliente cujo **URI de redirecionamento** é
`https://drakaroline-lavie.ai.studio/api/google-agenda/retorno` — é esse, e só esse, que o
sistema usa. Confira se o **ID do cliente** dele é igual ao `GOOGLE_AGENDA_CLIENT_ID` dos
Secrets. Nesse mesmo cliente, **Adicionar chave secreta**, copie a nova (`GOCSPX-…`), salve em
`GOOGLE_AGENDA_CLIENT_SECRET` e **publique o app**. Depois, conectar de novo.

> Trocar a chave secreta invalida as autorizações já guardadas no banco (é ela que as cifra), e
> as profissionais conectadas precisam reconectar. Se ninguém está conectado ainda, não há perda.

## Como funciona

```
Painel (qualquer tela muda um atendimento)
  → useSincronizacaoGoogleAgenda compara cada atendimento com a marca `googleAgenda` dele
  → POST /api/google-agenda/sincronizar   (login do painel no cabeçalho)
  → server/googleAgenda.ts abre a autorização cifrada e fala com a Google Calendar API
  → o painel grava a marca nova no atendimento
```

| Peça | O que faz |
|---|---|
| `src/utils/googleAgenda.ts` | Puro: o texto do evento, o id do evento, o que enviar. |
| `src/hooks/useSincronizacaoGoogleAgenda.ts` | Roda no painel aberto e envia a diferença. |
| `src/services/googleAgenda.ts` | Contas no banco, janela de autorização, chamadas ao servidor. |
| `server/googleAgenda.ts` | Rotas `/api/google-agenda/*`: autorização, cifra e Calendar API. |
| `src/components/agenda/GoogleAgendaConexoes.tsx` | O bloco nas Configurações. |

- **Onde fica a conta:** `clinic_settings/google_agenda`, mapa `contas`, por id da profissional.
  A autorização é guardada cifrada (AES-256-GCM, chave derivada da chave secreta do cliente). Só
  o servidor do site consegue abri-la. Nenhuma regra nova do Firestore foi necessária.
- **Quem envia:** o painel aberto, como já acontece com as respostas das pacientes pelo link.
  Mudança feita com o painel fechado não existe: toda mudança na agenda passa pelo painel.
- **Sem duplicar:** o id do evento no Google é derivado do id do atendimento. Dois painéis abertos
  enviando a mesma mudança escrevem no mesmo evento.
- **Falhas:** cada envio que falha tenta de novo sozinho (2 min, 4 min… até 1 h). Servidor fora do
  ar: pausa de 10 min. Autorização recusada pelo Google (acesso removido, senha trocada,
  calendário "La Vie Clinique" apagado): a conta fica marcada "Precisa reconectar" nas
  Configurações e nada daquela profissional é enviado até ela reconectar. Reconectando na mesma
  conta Google, o mesmo calendário é reaproveitado.
- **Desconectar** revoga a autorização no Google e para os envios. O calendário "La Vie Clinique"
  continua na conta dela e pode ser apagado por lá.

## Verificação

```
npx tsx scripts/verificar-google-agenda.ts
```
