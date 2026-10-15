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

Em [console.cloud.google.com](https://console.cloud.google.com), com o projeto
`database-dra-karoline` selecionado:

1. **Ativar a API.** APIs e serviços → Biblioteca → "Google Calendar API" → Ativar.
2. **Tela de consentimento** (Google Auth Platform):
   - *Branding*: nome do app "La Vie Clinique", e-mail de suporte. Se pedir domínio autorizado,
     adicione `drakaroline-lavie.ai.studio`.
   - *Público*: tipo **Externo**, e clique em **Publicar app** para ficar **Em produção**. No modo
     "Teste" o Google derruba a autorização a cada 7 dias.
   - *Acesso a dados*: adicione o escopo `https://www.googleapis.com/auth/calendar.app.created`.
   - Não é preciso pedir verificação ao Google: com menos de 100 contas o app funciona, só mostra
     o aviso "O Google não verificou este app" na hora de conectar.
3. **Credencial.** Clientes (ou Credenciais) → Criar → ID do cliente OAuth → **Aplicativo da Web**:
   - URI de redirecionamento autorizado:
     `https://drakaroline-lavie.ai.studio/api/google-agenda/retorno`
   - Copie o **ID do cliente** e a **Chave secreta do cliente**.

### 2. Google AI Studio — Secrets

Settings → Secrets, e depois publicar de novo:

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
