# Zulia — a plataforma para várias clínicas

O sistema da La Vie Clinique vira um produto vendido para outras clínicas, com o nome **Zulia**.
Este documento guarda o que foi decidido com o João (dono da plataforma) e a arquitetura que sai
disso. Toda mudança de rumo deve ser registrada aqui.

## Ordem do trabalho

1. ~~Correção urgente de segurança no sistema atual~~ — feita (ver `docs/ficha-publica-servidor.md`).
2. Projeto novo no Firebase e o sistema para várias clínicas; a La Vie migra como clínica nº 1.
3. Cadastro de clínica nova, planos e limites.
4. Cobrança pela InfinitePay.
5. Painel do dono da plataforma.
6. Termos de uso e site instalável no celular.
7. Apps nas lojas (Android e iPhone).

## Decisões

### Estrutura
- **Projeto novo no Firebase**, só da plataforma, mais um projeto de testes. A La Vie é migrada
  como clínica nº 1, com **cortesia permanente** (não paga).
- **Um login pertence a uma clínica só.** Quem trabalha em duas clínicas usa um e-mail em cada.
- **Na migração, a equipe da La Vie mantém as senhas** (os logins são copiados com as senhas).
- **Cada clínica se cadastra sozinha:** e-mail confirmado, nome da clínica, e já entra no
  plano gratuito.
- **Tipos de login dentro da clínica: os de hoje** — admin (a dona: tudo, inclusive equipe,
  plano e pagamento) e profissional (o dia a dia).
- **Endereço:** decidir o domínio próprio quando o nome estiver registrado. Até lá, segue
  publicando pelo AI Studio (que só dá endereços `.ai.studio`). Domínio próprio exige publicar
  pelo Google Cloud do projeto.

### Planos
- **Gratuito, para sempre:** todos os módulos, até **2 procedimentos**, **5 clientes** e **1 login**.
- **Completo:** tudo ilimitado. Assinatura **mensal** ou **anual com desconto**. O preço é
  configurado no painel do dono.
- **No limite de clientes**, o painel não gera link de ficha para cliente nova e mostra o
  upgrade. Se um link antigo chegar mesmo assim, o servidor recusa com uma mensagem gentil.
  Clientes que já existem continuam preenchendo normalmente.
- **Cliente arquivada continua contando no limite.** Só excluir de vez libera a vaga.

### Quando a clínica volta para o gratuito
- **Tudo fica somente leitura até a dona escolher** os 2 procedimentos e as 5 clientes que
  continuam com uso normal. A escolha fica **fixa até assinar de novo**.
- **Só a dona continua entrando.** Os outros logins ficam suspensos ("o plano da clínica não
  inclui equipe"), sem ser apagados.
- **Os links das pacientes continuam funcionando** (confirmação de agendamento, por exemplo). A
  clínica vê a resposta, mas só mexe se assinar ou escolher aquela cliente.

### Cobrança
- **InfinitePay, com um link a cada ciclo.** A API da InfinitePay não faz cobrança recorrente:
  a plataforma gera o link de pagamento a cada mês ou ano, envia, e libera o plano sozinha quando
  a clínica paga. O aviso (webhook) da InfinitePay não é assinado — todo pagamento é conferido
  com a consulta de pagamento da API antes de liberar.
- **Avisos:** e-mail e faixa no topo do painel ("sua assinatura vence em 3 dias").
- **Não pagou:** 7 dias de aviso, com tudo funcionando, antes de cair para o gratuito.
- **Cancelamento do anual:** usa até o fim do período pago, sem devolução. Devolução integral só
  nos 7 primeiros dias da assinatura.
- **Nota fiscal:** emitida por fora pelo João ou pelo contador. O painel do dono lista os
  pagamentos do mês para isso.
- O João tem **CNPJ há mais de 6 meses**.

### Painel do dono da plataforma
- Login do João (`joaoaguiar6089@gmail.com`), com **verificação em duas etapas obrigatória**.
- Lista de clínicas: plano, uso (clientes, procedimentos, fotos e espaço), último acesso e
  totais gerais.
- Ações: mudar plano, dar cortesia, suspender e reativar.
- **Sem "entrar como suporte"** no lançamento: o suporte é por vídeo ou compartilhando a tela.

### LGPD e documentos
- A clínica é a **controladora** dos dados das pacientes; a Zulia é a **operadora**.
- **Termos de Uso, Política de Privacidade e contrato de tratamento de dados:** o Claude escreve
  o rascunho a partir do que o sistema realmente faz, e um advogado revisa antes de vender. A
  clínica aceita no cadastro.
- **Saída da plataforma:** a clínica pede pelo suporte; o João entrega uma cópia dos dados (o
  script de exportação adaptado) e a conta é apagada.

### Celular
- **Site instalável já no lançamento** (ícone na tela inicial, tela cheia).
- **Apps nas lojas depois**, com **botão de assinar que abre o pagamento fora do app**. No
  Brasil, a Apple cobra 15% sobre compras por link externo (acordo com o CADE, dez/2025). As
  regras do Google Play para link externo serão conferidas quando os apps forem feitos.

### A La Vie na plataforma (decidido em 8/11/2026)
- **A La Vie é uma clínica cliente da Zulia**, com o plano completo vitalício (cortesia
  permanente). O login da Dra. Karoline (`enfesteta.karoline@gmail.com`) é a **admin dessa
  clínica**, não dona da plataforma. O dono continua sendo o login do João.
- **Mesmo endereço:** o app atual do AI Studio vira a Zulia na migração. Todas as clínicas usam
  `drakaroline-lavie.ai.studio` até existir domínio próprio. Os links antigos, sem `c=`, abrem na
  clínica da La Vie.
- **Id da clínica:** código aleatório (ex.: `c=k3P9xq`), que nunca muda — nem quando a clínica
  muda de nome.
- **Clínica nova começa com** as fichas padrão (perguntas gerais e fichas de anamnese, avaliação e
  acompanhamento) e **2 procedimentos genéricos de exemplo**, sem fotos nem textos da La Vie.
  Nenhuma paciente de exemplo. Os 2 exemplos ocupam as vagas do plano gratuito até a clínica
  apagá-los.
- **Testes das regras no próprio `zulia-plataforma`**, enquanto ele está vazio. As clínicas de
  teste são apagadas antes da migração. O projeto de testes separado é criado (pelo João) antes
  da migração.
- **Migração com acesso temporário do Claude:** durante a janela da migração, o João dá à conta
  `claude-configuracao@zulia-plataforma` papéis **de leitura** no projeto da La Vie
  (`database-dra-karoline`) e os tira logo depois.
- **Google Agenda:** só a La Vie usa até haver domínio próprio e o app ser verificado no Google.
  Nas outras clínicas, o botão aparece como "em breve" (`clinicas/{c}.recursos.googleAgenda`).

## Projeto no Firebase: `zulia-plataforma`

Projeto nº `1031812147083`, nome "Zulia". A configuração do app web fica em
`zulia-firebase-config.json`, no mesmo formato do `firebase-applet-config.json` da La Vie (que
continua apontando para o `database-dra-karoline` até a migração).

| Item | Situação |
| --- | --- |
| Plano Blaze | Ativo (conta de faturamento vinculada) |
| APIs | Firestore, Identity Toolkit, Firebase Storage, Firebase Rules, Cloud Billing e IAM ativas |
| Firestore `(default)`, `southamerica-east1` | Criado (nativo, Standard), com proteção contra exclusão e regras fechadas (`allow read, write: if false`) |
| Storage `zulia-plataforma.firebasestorage.app`, `southamerica-east1` | Criado e vinculado ao Firebase, com regras fechadas (`allow read, write: if false`) |
| Login por e-mail e senha | Ligado, com o Auth já no Identity Platform. Duas etapas (MFA) ainda desligada |
| App web "Zulia Web" | Registrado: `1:1031812147083:web:b164181d211d1d68a4718e` |

- **As regras da Zulia moram em `zulia/`** (`zulia/firestore.rules` e `zulia/storage.rules`) e
  são publicadas com `npm run publicar-regras -- --projeto zulia`. O `firestore.rules` e o
  `storage.rules` da raiz são os da La Vie (coleções na raiz) e **nunca** são publicados no
  projeto da Zulia.
- **O `storage.rules` da raiz tem uma correção que não está no ar:** a paciente sem login só
  envia foto *nova* em `anamnese/fotos-pacientes/` e não troca uma que já existe (PR #68).
  Decisão do João em 8/11/2026: fica para a migração, quando a La Vie passa a usar
  `zulia/storage.rules`, que já tem a correção. Atenção: `npm run publicar-regras` publica o
  `firestore.rules` e o `storage.rules` juntos, então qualquer publicação das regras da La Vie
  antes disso leva essa correção junto (o que não quebra nada para a paciente nem para a equipe).
- **O Auth está no Identity Platform** (decisão do João; o upgrade não tem volta). É o que libera
  a verificação em duas etapas exigida para o login do dono e as *blocking functions*. Para
  logins com e-mail e senha, é gratuito até 50 mil usuários ativos por mês.
- **Domínios autorizados no login:** por enquanto só `zulia-plataforma.firebaseapp.com` e
  `zulia-plataforma.web.app`. O endereço em que o site for publicado precisa entrar na lista.
- **A região do Firestore não muda depois de criado.** Por isso o banco tem de estar em
  `southamerica-east1` antes de receber qualquer dado: as fichas são dados de saúde, e ficar no
  Brasil evita declarar transferência internacional (LGPD), além de deixar o painel mais rápido.

### Acesso do Claude

Decidido com o João: o Claude tem acesso amplo ao projeto da Zulia até o fim do trabalho, **sem
poder ler os dados das pacientes depois que eles existirem**.

- **Conta:** `claude-configuracao@zulia-plataforma.iam.gserviceaccount.com`, com a chave nas
  variáveis `ZULIA_CLIENT_EMAIL` e `ZULIA_PRIVATE_KEY` do ambiente do Claude. A única chave criada
  é a que começa com `f78efaf5`; a `32c6b227`, que aparece na lista pública de certificados, é
  interna do Google (`SYSTEM_MANAGED`) e não se apaga.
- **Até a migração** (projeto sem dados de pacientes): papéis **Editor** e **Proprietário do
  Cloud Datastore**. O Editor já lê e grava tudo no banco e no Storage; o segundo papel só
  acrescenta criar e apagar bancos.
- **Na migração, antes de entrar qualquer dado de paciente:** os dois papéis saem e entram papéis
  que **gerenciam sem ler dados** (regras, índices, configuração do login, APIs, hospedagem). O
  Claude monta a lista exata nessa hora. Quando um ajuste precisar ler dados, o João libera um
  papel por um tempo e tira depois.
- **Nunca:** papel de Proprietário do projeto (com ele, uma chave vazada apagaria o projeto ou
  tiraria o João do controle), permissões (IAM) e faturamento. Isso fica com o João.
- **Projeto da La Vie (`database-dra-karoline`):** o Claude continua só publicando regras. A
  chave do servidor (`servidor-fichas`) fica só nos Secrets do AI Studio e nunca vai para o
  ambiente do Claude. **Exceção combinada:** na janela da migração, a conta do Claude recebe
  papéis de leitura nesse projeto (Firestore, Storage e Authentication), e o João os tira logo
  depois.

## Arquitetura multi-clínica

### Dados
- Cada clínica tem um documento `clinicas/{clinicaId}` (nome, plano, situação, uso, dona, datas)
  e **todas as coleções de hoje passam a morar dentro dele**: `clinicas/{clinicaId}/patients`,
  `clinicas/{clinicaId}/anamnesis_records`, `clinicas/{clinicaId}/quotes` e assim por diante.
- O painel nunca monta caminho na mão: `colecao(nome)` e `documento(nome, id)`, em
  `src/lib/clinicaAtual.ts`, apontam para dentro da clínica do login. **Sem clínica definida**
  (o projeto atual da La Vie, antes da migração), apontam para a raiz, como sempre — por isso o
  código novo entra na `main` sem mudar nada no sistema que está no ar.
- Fotos no Storage: `clinicas/{clinicaId}/...`, com os mesmos subcaminhos de hoje.

### Login e permissões
- O login carrega, em *custom claims* gravadas pelo servidor, a clínica (`clinicaId`) e o
  papel (`admin` ou `profissional`). As regras do Firestore **e do Storage** conferem a clínica
  pela claim — sem leitura extra de documento, e funcionando no Storage, que não consulta o banco.
- O dono da plataforma tem a claim `donoDaPlataforma`.
- As regras (`zulia/firestore.rules`, `zulia/storage.rules`) conferem só a claim (`daClinica(c)`,
  `adminDa(c)`, `dono()`), **sem `get()` de perfil**. O documento `clinicas/{c}` é lido pelos
  membros e pelo dono, e **ninguém grava nele pelo navegador**. O dono **não** lê as coleções de
  dentro da clínica (a Zulia é operadora dos dados). As leituras públicas e a resposta anônima ao
  link do agendamento são as mesmas da La Vie. `scripts/verificar-regras-zulia.ts` confere o
  isolamento entrando com cada tipo de login.
- Criar clínica, criar login de profissional e mudar plano passam pelo servidor (Admin SDK).

### Links das pacientes
- Os links passam a levar a clínica (`c=<clinicaId>`). Links antigos da La Vie, sem `c`, abrem
  na clínica da La Vie.

### Limites
- Contadores de uso no documento da clínica, conferidos nas regras do Firestore junto com cada
  criação e exclusão (o contador sobe na mesma gravação em que o documento nasce). Assim o
  limite vale mesmo para quem tentar burlar a tela.

## Etapa 2: várias clínicas e a migração da La Vie

Plano aprovado pelo João em 8/11/2026. Cada fase é um PR mesclado na `main`. **Até a fase 6, a
La Vie no ar (modo legado) não sente nenhuma mudança.**

| Fase | O que entra | Situação |
| --- | --- | --- |
| 1 | `plataforma.json` escolhe o projeto (`legado` ou `zulia`) para o painel, o servidor e os scripts | Feita |
| 2 | Regras multi-clínica em `zulia/` e o teste de isolamento `scripts/verificar-regras-zulia.ts` | Feita; passa nos emuladores. Falta publicar no `zulia-plataforma` e rodar lá |
| 3 | Servidor por clínica: login pela claim, caminhos `clinicas/{c}/...`, rotas `/api/equipe` | A fazer |
| 4 | Painel e páginas das pacientes por clínica: entrada pela claim, links com `c=`, sementes e marca | A fazer |
| 5 | `scripts/criar-clinica.ts`, até existir o cadastro da etapa 3 | A fazer |
| 6 | `scripts/migrar-la-vie.ts`, ensaio, e a migração no dia combinado com o João | A fazer |

### A chave do projeto (`plataforma.json`)
- `plataforma.json` na raiz diz qual projeto o código usa: `{ "modo": "legado" }` (a La Vie de
  hoje, `firebase-applet-config.json`) ou `{ "modo": "zulia" }` (`zulia-firebase-config.json`).
  Fica num arquivo versionado porque não está confirmado que o build do AI Studio enxerga
  variáveis de ambiente. **Vira para `zulia` só no dia da migração.**
- Ninguém importa o JSON de um projeto direto: o painel, o servidor e os scripts pedem a
  configuração a `src/lib/projetoFirebase.ts` (`firebaseConfig`, `modoPlataforma`, `ehZulia`).
- Para desenvolvimento e scripts: `VITE_PLATAFORMA=zulia` no Vite (configuração `zulia-dev` do
  `.claude/launch.json`) e `PLATAFORMA=zulia` no Node. **No modo `legado`, o `vite dev` grava no
  Firestore de produção da La Vie:** teste o painel só no modo `zulia`.
- Os scripts que só fazem sentido no projeto antigo (`exportar-banco`, `importar-banco`,
  `migrar-imagens-para-storage`, `bootstrap-first-admin`) apontam sempre para ele.
- `scripts/verificar-plataforma.ts` confere o arquivo e a escolha.
