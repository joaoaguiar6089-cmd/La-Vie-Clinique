# Conector do Claude

A equipe da clínica pode agendar conversando com o Claude: "agenda a Jessica para Harmonização
Glútea, Fase 1, sexta às 14h com a Dra. Karoline". O Claude confere a agenda, grava o agendamento
**no painel** (aparece na agenda e vai para o Google Agenda da profissional) e devolve o **link de
confirmação** da cliente, com a mensagem pronta para o WhatsApp — o mesmo link do botão "Copiar
link de confirmação".

É um servidor MCP no próprio site, em `https://drakaroline-lavie.ai.studio/api/mcp`, com login
pelo login do painel.

## Como conectar (uma vez, por pessoa)

1. Publicar o site pelo AI Studio (a partir da `main`).
2. No Claude: **Customize → Connectors → + Add → Add custom connector**.
   - Nome: "Agenda da clínica" (ou o que quiser).
   - URL: `https://drakaroline-lavie.ai.studio/api/mcp`
   - Login (OAuth client): pode deixar o padrão, **"Use Claude's published identity"**. "Register
     automatically" também funciona.
3. **Connect**. Abre a tela de login do painel: entrar com um login **da equipe da clínica** e
   tocar em **Permitir** em "Conectar o Claude à agenda?". Volta para o Claude, já conectado.
   Se a sessão do painel naquele navegador for antiga, ele pede para entrar de novo antes (o
   Permitir exige senha digitada nos últimos 15 minutos).
4. A conexão vale até **90 dias**; depois, o Claude pede para conectar de novo.

**Quem pode conectar:** qualquer login da equipe (admin ou profissional), e o Claude enxerga só a
clínica desse login. O login do dono da plataforma **não** conecta: ele não acessa dados das
clínicas (a plataforma é operadora dos dados). Para usar o conector, o dono precisa de um login na
equipe da clínica (Configurações → Equipe).

## O que o Claude pode fazer

| Ferramenta | O que faz |
|---|---|
| `ver_opcoes_de_agendamento` | Profissionais, procedimentos (focos/fases e duração), salas, expediente, data e hora de agora. |
| `buscar_pacientes` | Pelo nome (sem acento, em qualquer ordem) ou por 4+ dígitos do telefone. Até 10. |
| `cadastrar_paciente` | Nome e telefone com DDD. Se já há alguém com o mesmo telefone ou nome, não cadastra e mostra quem é. |
| `ver_agenda` | Atendimentos e horários livres de 1 a 14 dias, da clínica ou de uma profissional. |
| `criar_agendamento` | Grava a visita e devolve o link de confirmação, a mensagem e o atalho do WhatsApp. |
| `gerar_link_de_confirmacao` | O link de um agendamento que já existe (inclusive feito no painel). |

**Não faz:** remarcar, cancelar, excluir, marcar presença ou falta, nem vincular a plano de
sessões. Isso continua no painel.

## Regras do agendamento (as mesmas do painel)

Tudo em `server/conectorClaudeAgenda.ts`, usando as funções puras do painel (`utils/agenda.ts`,
`utils/visitas.ts`, `utils/agendamentoLink.ts`).

- **Uma visita, um atendimento por procedimento**, em sequência, com o mesmo `grupoId` e o mesmo
  link — como o formulário faz com "Harmonização + Botox".
- **Sala ocupada impede.** Profissional ocupada, fora do expediente, no almoço ou fora das
  profissionais do procedimento **pedem confirmação**: nada é gravado, o Claude conta o aviso e só
  grava se a pessoa disser que quer assim (`confirmar_avisos`).
- **Horário que já passou é recusado.** "Hoje" e "agora" são os de Brasília
  (`agoraNaClinica`) — o servidor roda em UTC, e as funções do painel usam o fuso da tela.
- **Ids só do que existe:** paciente, profissional, procedimento, foco e sala são conferidos.
- **O link nasce com o agendamento** (`appointment_links/{token}`, a mesma cópia enxuta do
  painel, sem observação, telefone ou id da paciente). Endereço com `c=<clínica>`, como o
  `buildPublicLink`.
- **Cadastro novo conta no plano** (`uso.clientes`), na mesma gravação, e respeita o limite do
  gratuito.
- **Google Agenda:** o servidor envia na hora para o calendário da profissional
  (`salvarEventosPeloServidor`, em `server/googleAgenda.ts`) e grava a marca `googleAgenda` no
  atendimento, para o painel não reenviar. Se falhar (profissional sem Google conectado,
  autorização vencida), o agendamento fica gravado e o painel envia quando abrir.

## Login (OAuth 2.1)

`server/conectorClaudeLogin.ts`. O Claude exige OAuth para conector com login.

```
Claude → POST /api/mcp (sem acesso) → 401 + WWW-Authenticate (onde se autorizar)
       → /.well-known/oauth-protected-resource/api/mcp → /.well-known/oauth-authorization-server
       → identidade publicada (client_id = documento em claude.ai) ou POST /api/claude/oauth/registrar
       → GET /api/claude/oauth/autorizar (PKCE S256) → <site>/?autorizar-claude=<pedido>
Painel → login de sempre → "Conectar o Claude à agenda?" (AutorizarClaudeView)
       → POST /api/claude/oauth/decidir (login do painel) → volta ao Claude com o código
Claude → POST /api/claude/oauth/token → acesso (1 h) + renovação (60 dias, trocada a cada uso)
```

- **Só o Claude:** o código só volta para `https://claude.ai/api/mcp/auth_callback` ou
  `https://claude.com/api/mcp/auth_callback`, exatos (e `http://localhost`, em qualquer porta,
  para o Claude Code e ferramentas de teste). A identidade publicada só é aceita pelos dois
  documentos do Claude (`https://claude.ai/oauth/mcp-oauth-client-metadata` e
  `…/claude-code-client-metadata`), e a tela de Permitir mostra "identidade verificada" só nesses.
  O registro dinâmico é aberto; sem essas listas, um link de "conectar" mandado para alguém da
  clínica entregaria a agenda a um site qualquer com um toque em Permitir.
- **Permitir exige login recente** (`auth_time` do token do painel, até 15 min): uma sessão
  esquecida aberta na recepção não basta para alguém conectar o próprio Claude.
- **No máximo 90 dias** por autorização, renovando ou não (`AUTORIZACAO_VALE_MS`).
- **Segredos só pelo hash** (`conector_claude_tokens`, SHA-256). Código de uso único: usado duas
  vezes, derruba tudo o que nasceu dele. Renovação trocada a cada uso; a mesma renovação de novo
  **dentro de 1 minuto** (duas renovações ao mesmo tempo, ou repetição de um pedido cuja resposta
  se perdeu) ganha outro par, e depois disso derruba a família inteira.
- **Fora do ar não é "não":** se o banco, o Authentication ou o documento do Claude não respondem,
  o conector responde 503 / `temporarily_unavailable` e não gasta nem revoga nada — um soluço não
  desconecta ninguém.
- **Cada chamada confere o login:** ativo no Authentication, com a mesma claim `clinicaId` e sem
  sessões encerradas depois da autorização (guardado por 5 minutos). Desativar o login na Equipe,
  trocar a senha ou encerrar as sessões dele corta o Claude em até 5 minutos.
- **Desconectar:** remover o conector no Claude. A renovação para de ser usada e vence em 60 dias;
  para cortar na hora, troque a senha do login (ou apague os documentos da família em
  `conector_claude_tokens`).
- **Registro de acesso** (Marco Civil, art. 15): a autorização e o uso (no máximo um a cada 10
  min por login) entram em `registros_de_acesso`, como o painel.

Limites abertos por hora (por IP e no total, por instância): 20/60 registros de app e 60/600
pedidos de autorização. App registrado que não troca um código em 24 h some na faxina, que também
apaga pedidos e segredos vencidos (roda em parte dos pedidos de `/autorizar` e `/token`).

Coleções novas, na raiz: `conector_claude_clientes`, `conector_claude_pedidos`,
`conector_claude_tokens`. A regra final do Firestore (`match /{document=**} … if false`) já as
fecha para o navegador; só o servidor (Admin SDK) as lê. Nenhuma regra nova, nenhum índice novo
(as consultas são por um campo só).

## Configuração

Nada novo nos Secrets: o conector usa a credencial do servidor que já existe
(`ZULIA_ADMIN_EMAIL`/`ZULIA_ADMIN_CHAVE`) e, para o Google Agenda, as chaves de sempre.

O endereço público do OAuth (emissor e `resource`) é o `ENDERECO_DO_SITE`
(`src/utils/publicLinks.ts`) — nunca o do pedido, porque o `resource` tem de ser exatamente o
endereço digitado no Claude. Para outro endereço (domínio próprio, teste local), a variável
`ENDERECO_DO_CONECTOR`. Depois de publicar, conferir:

    curl https://drakaroline-lavie.ai.studio/.well-known/oauth-protected-resource/api/mcp

O `resource` tem de ser `https://drakaroline-lavie.ai.studio/api/mcp`.

**LGPD:** com o conector, nome e telefone das pacientes passam pelo Claude (Anthropic) quando a
equipe o usa. Vale citar isso na Política de Privacidade e no Acordo de Tratamento de Dados.

## Verificação

```
npx tsc --noEmit
npx tsx scripts/verificar-conector-claude.ts
```

O script sobe o servidor de verdade numa porta local, com o banco e o armazém do login na memória,
e passa pelo fluxo inteiro: descoberta, registro, identidade publicada (inclusive Claude Code),
autorização no painel (com login recente), troca do código, as seis ferramentas, isolamento entre
clínicas, limite do plano, renovação (inclusive duas ao mesmo tempo), Authentication fora do ar,
revogação, login desativado, senha trocada e o limite de 90 dias. As versões do Firestore
(`bancoDaClinicaNoFirestore`, `armazemNoFirestore`) não passam por ele: sem emulador neste
ambiente, foram conferidas por leitura contra o que o painel grava.
