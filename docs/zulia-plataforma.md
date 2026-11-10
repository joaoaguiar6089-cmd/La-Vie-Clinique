# Venus JK (antes Zulia) — a plataforma para várias clínicas

O sistema da La Vie Clinique vira um produto vendido para outras clínicas, com o nome **Venus JK —
Plataforma de atendimentos estéticos**. Este documento guarda o que foi decidido com o João (dono da
plataforma) e a arquitetura que sai disso. Toda mudança de rumo deve ser registrada aqui.

**Nome (decidido em 10/11/2026):** a plataforma se chamava Zulia e passou a se chamar **Venus JK**.
O nome muda aos poucos, começando pelo que aparece na tela (tela de login, título da página e links
sem clínica: `MARCA_DA_PLATAFORMA` e `DESCRICAO_DA_PLATAFORMA` em `src/utils/marca.ts`). "Zulia"
continua nos nomes internos, que trocar só traria risco: o projeto `zulia-plataforma` no Firebase
(o id de um projeto não muda), a pasta `zulia/`, o modo `zulia` do `plataforma.json`, as variáveis
`ZULIA_*` e os nomes dos scripts. Neste documento, "Zulia" é a plataforma.

## Ordem do trabalho

1. ~~Correção urgente de segurança no sistema atual~~ — feita (ver `docs/ficha-publica-servidor.md`).
2. ~~Projeto novo no Firebase e o sistema para várias clínicas; a La Vie migra como clínica nº 1~~ — feita (10/11/2026).
3. Cadastro de clínica nova, planos e limites.
4. Cobrança pela InfinitePay.
5. Painel do dono da plataforma.
6. Termos de uso e site instalável no celular. (Os documentos legais foram adiantados em 10/11/2026: ver "Documentos legais".)
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
- **Feito em 10/11/2026**, versão 1.0: ver "Documentos legais", abaixo.

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
| Firestore `(default)`, `southamerica-east1` | Criado (nativo, Standard), com proteção contra exclusão. Regras de `zulia/firestore.rules` publicadas e conferidas em 9/11/2026 |
| Storage `zulia-plataforma.firebasestorage.app`, `southamerica-east1` | Criado e vinculado ao Firebase. Regras de `zulia/storage.rules` publicadas em 9/11/2026; CORS do `cors.json` aplicado |
| Login por e-mail e senha | Ligado, com o Auth já no Identity Platform. Duas etapas (MFA) ainda desligada. `drakaroline-lavie.ai.studio` autorizado em 9/11/2026 |
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
- **Domínios autorizados no login:** `zulia-plataforma.firebaseapp.com`,
  `zulia-plataforma.web.app` e `drakaroline-lavie.ai.studio` (o endereço do AI Studio, posto em
  9/11/2026 com `scripts/configurar-login-zulia.ts`). Quando houver domínio próprio, ele entra na
  lista `DOMINIOS` desse script, e o script roda de novo.
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

### Servidor por clínica
- **Login:** `server/login.ts` confere o token do painel pelo Admin SDK (`verifyIdToken`) e devolve
  `{ uid, clinicaId, papel, dono }` das claims. Na Zulia confere também se o login continua ativo
  (`checkRevoked`). No legado, só a assinatura, como sempre.
- **Caminhos:** `server/clinicas.ts` monta `clinicas/{c}/<coleção>` na Zulia, ou a raiz no legado.
  A ficha pública (`/abrir`, `/salvar`), o cartão do link, a política de privacidade e a leitura
  com credencial passam por ele. A clínica dos pedidos públicos vem do `c` do link; sem `c`, é a
  `CLINICA_DOS_LINKS_ANTIGOS` (`src/utils/clinicas.ts`, vazia até a migração).
- **Cartão do link:** na Zulia, o nome no cartão vem do `public_profile` da clínica.
- **Equipe:** na Zulia não existe `equipeUids` (a claim manda), e o servidor não sincroniza lista.
  `/api/equipe/criar-login`, `/mudar-papel` e `/desativar`: só a admin da mesma clínica. Sempre
  sobra uma admin, conferido no índice `clinicas/{c}.equipe` (`{ uid: papel }`), que só o servidor
  grava. Um e-mail que já é login de outra clínica, ou uma conta criada por fora sem clínica, não
  é reaproveitado. No legado, `createProfessionalLogin` continua como está.
- **Google Agenda:** na Zulia, só clínica com `recursos.googleAgenda: true`, e só com uma conta
  guardada em `clinicas/{c}/clinic_settings/google_agenda`.
- **Credencial do servidor da Zulia:** Secrets `ZULIA_ADMIN_EMAIL` e `ZULIA_ADMIN_CHAVE` (ou
  `ZULIA_ADMIN_CREDENCIAL`). São nomes separados dos `FIREBASE_ADMIN_*` da La Vie, para que virar o
  `plataforma.json` (ou desvirar) não dependa de trocar valor de Secret. A conta precisa dos papéis
  **Usuário do Cloud Datastore** e **Administrador do Firebase Authentication** no
  `zulia-plataforma`.

### Painel por clínica
- **Entrada:** na Zulia, o painel lê as claims do login (`lerAcessoDaPlataforma`) antes de
  qualquer assinatura e chama `definirClinicaAtual(clinicaId)`. Login sem claim de clínica vê a
  tela de acesso negado. Quem é admin vem da claim `papel` (no legado, do perfil). Ao sair, a
  página recarrega, para nada da clínica anterior ficar na memória da aba.
- **Caches:** as chaves das assinaturas compartilhadas e do `localStorage` (`aura_bronze_*`,
  `lavie:*`, `lavie.*`) levam a clínica (`chaveLocal`, em `src/lib/estadoDaClinica.ts`). Antes do
  login nada é lido, para o cache antigo da La Vie no mesmo endereço não aparecer para outra
  clínica.
- **Links:** `buildPublicLink` acrescenta `c=<clinicaAtual()>`. As páginas da ficha, do
  orçamento e do agendamento definem a clínica pelo `c` (ou pela `CLINICA_DOS_LINKS_ANTIGOS`)
  antes de ler, e a ficha manda o `c` ao servidor.
- **Equipe:** na Zulia, Configurações → Equipe cria login, muda papel e desativa pelas rotas
  `/api/equipe`. Mudou o papel do próprio login, o painel pede um token novo na hora.
- **Sementes:** clínica nova recebe as fichas padrão e os 2 procedimentos de exemplo
  (`src/data/exemplosZulia.ts`). Nunca o perfil, o catálogo, as pacientes ou as fichas de exemplo
  da La Vie; "Restaurar demonstração" não aparece; a foto padrão da Dra. Karoline só no legado.
- **Marca:** `src/utils/marca.ts`. No legado, "La Vie Clinique" como sempre; na Zulia, o nome do
  perfil da clínica (fichas impressas, recibos, nomes de arquivo, página da paciente, orçamento).
  A tela de login e o `index.html` (plugin no `vite.config.ts`) mostram a marca da plataforma
  (`MARCA_DA_PLATAFORMA`, hoje "Venus JK").
- **Google Agenda:** sem `recursos.googleAgenda`, a seção mostra "em breve".

### Criar uma clínica pelo script (para testes, cortesias e casos especiais)

    npm run criar-clinica -- --nome "Clínica Alfa" --email dona@alfa.com.br --admin "Dra. Ana Souza"

Opções: `--plano completo`, `--cortesia` (completo sem pagar), `--google-agenda` (liga o
recurso), `--id <id>` (só para testes e para a La Vie na migração), `--sem-convite`, `--emulador`.
O script, com o Admin SDK (credencial `ZULIA_CLIENT_EMAIL`/`ZULIA_PRIVATE_KEY`):
1. gera o id aleatório (6 caracteres, sem os que se confundem) e confere que está livre;
2. grava `clinicas/{id}` com nome, plano, cortesia, situação, dona, datas, `recursos` e o índice da
   equipe;
3. cria o login da admin (ou reaproveita um login dela sem clínica; recusa o de outra clínica e o
   do dono) e grava as claims `clinicaId` e `papel: 'admin'`;
4. grava `main_profile` e `public_profile` mínimos, com o nome e a admin na equipe;
5. manda o e-mail de definir a senha (o convite).

As sementes (fichas padrão e os 2 procedimentos de exemplo) entram no primeiro login dela.
`scripts/verificar-ponta-a-ponta-zulia.ts` cria duas clínicas, entra no painel com cada uma pelo
navegador, cria um login de profissional pela tela, abre e responde os links da paciente e
confere que uma clínica não vê a outra.

### Testar sem tocar em projeto nenhum
Os emuladores do Firebase (precisam de Java) rodam Auth, Firestore e Storage na máquina. Com eles,
o painel e o servidor falam só com a máquina: `VITE_EMULADORES=1` no build, e no Node as variáveis
que o `firebase emulators:exec` define. Nunca no ar.

    # regras da Zulia (isolamento entre clínicas)
    npx -y firebase-tools@15 emulators:exec --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-regras-zulia.ts --emulador"
    # servidor no modo Zulia
    PLATAFORMA=zulia npx -y firebase-tools@15 emulators:exec --only auth,firestore --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-servidor-zulia.ts"
    # painel no legado, num navegador (config com as regras da raiz e o banco (default))
    VITE_EMULADORES=1 npm run build
    npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage --config <config do legado> --project demo-zulia "npx tsx scripts/verificar-ponta-a-ponta-legado.ts"
    # painel no modo Zulia, num navegador (criar-clinica, sementes, equipe, links, isolamento)
    VITE_PLATAFORMA=zulia VITE_EMULADORES=1 npm run build
    PLATAFORMA=zulia npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-ponta-a-ponta-zulia.ts"
    # cadastro sozinho de clínica (mesmo build do anterior)
    PLATAFORMA=zulia npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-cadastro-zulia.ts"

Depois, `npm run build` sem as variáveis.

O mesmo ponta a ponta roda contra o `zulia-plataforma` de verdade, **só enquanto ele não tem dados
de pacientes** (depois, contra o projeto de testes). Os logins de teste usam e-mails `.invalid` e
são apagados com as clínicas deles no começo e no fim:

    VITE_PLATAFORMA=zulia npm run build
    PLATAFORMA=zulia npx tsx scripts/verificar-ponta-a-ponta-zulia.ts --projeto-real

### Links das pacientes
- Os links passam a levar a clínica (`c=<clinicaId>`). Links antigos da La Vie, sem `c`, abrem
  na clínica da La Vie.

### Limites
- Contadores de uso no documento da clínica, conferidos nas regras do Firestore junto com cada
  criação e exclusão (o contador sobe na mesma gravação em que o documento nasce). Assim o
  limite vale mesmo para quem tentar burlar a tela.

## Etapa 3: cadastro de clínica nova, planos e limites

Começada em 10/11/2026, logo depois da migração. Cada fase é um PR mesclado na `main`.

| Fase | O que entra | Situação |
| --- | --- | --- |
| 1 | Cadastro sozinho: criar conta, confirmar o e-mail e criar a clínica no plano gratuito | Feita; testada nos emuladores (`scripts/verificar-cadastro-zulia.ts`) |
| 2 | Limites do plano gratuito (2 procedimentos, 5 clientes, 1 login): contadores no documento da clínica, conferidos nas regras; o servidor recusa ficha de cliente nova acima do limite | Feita (11/2026); testada nos emuladores |
| 3 | Tela do plano nas Configurações: o uso, o que cada plano inclui e o "Assinar" (que leva à cobrança da etapa 4) | Feita (11/2026); testada nos emuladores |

### Limites do plano gratuito (fase 2)
- **Números:** `LIMITES_DO_GRATUITO` em `src/utils/planos.ts` (5 clientes, 2 procedimentos, 1 login),
  repetidos em `zulia/firestore.rules` (`criacaoContada(..., 5)` e `(..., 2)`). Plano desconhecido
  vale como gratuito.
- **Contadores:** `clinicas/{c}.uso.clientes` e `.uso.procedimentos` contam os cadastros que existem
  (arquivada conta; só excluir de vez libera). Sobem ou descem em 1 **no mesmo lote** em que o
  cadastro nasce ou some, com `uso.ultimoCliente`/`uso.ultimoProcedimento` dizendo qual.
- **Regras:** a equipe só grava no documento da clínica um desses contadores, e só se o cadastro
  apontado nasceu (+1) ou sumiu (-1) naquela gravação; plano, recursos e o resto continuam só do
  servidor. No gratuito, criar cliente ou procedimento sem o contador, ou além do limite, é
  recusado. No completo, o contador é mantido mas não exigido (um caminho esquecido não trava quem
  paga).
- **Painel** (`src/services/databaseService.ts`): `gravarCadastroContado` e `excluirCadastroContado`
  em `savePatient`, `deletePatient`, `saveProcedureToDb` (confere a vaga antes de subir as fotos),
  `deleteProcedureFromDb`, arquivo (cadastro que nasce no arquivo conta; tirar e excluir descontam)
  e as sementes (os 2 exemplos contam). Sem vaga, `ErroDeLimiteDoPlano` com a frase de
  `mensagemDoLimite`. O link de ficha sem paciente escolhida (cliente nova) não é gerado no limite.
- **Servidor:** a ficha pública de cliente nova confere a vaga e sobe o contador numa transação;
  sem vaga, `409 limite-de-clientes` ("A clínica não está recebendo fichas de clientes novas no
  momento..."), e nada é gravado. Quem já é cliente continua preenchendo. `/api/equipe/criar-login`
  recusa além do limite de logins (`403 limite-do-plano`; no gratuito, o único login é o da admin).
  `criarClinica` começa com `uso: { clientes: 0, procedimentos: 0 }`.
- **Recontar:** `npx tsx scripts/recontar-uso.ts [--conferir] [--id <c>]` conta com `count()` (sem ler
  o conteúdo dos cadastros) e acerta os contadores. Rodar quando uma clínica mudar de plano.
- **Ordem ao publicar mudanças nos limites:** regras primeiro, recontar, depois o app. O app novo
  com as regras antigas recusaria o contador.
- **Falta (etapa 4):** o somente leitura quando a clínica volta para o gratuito acima dos limites.

### Meu plano (fase 3)
- Seção **Plano** no topo das Configurações, só na plataforma e só para a admin
  (`src/components/plano/MeuPlano.tsx`): o plano atual (e "cortesia"), o uso contra os limites
  (clientes, procedimentos e logins, com barra âmbar perto e vermelha cheia — menos o login do
  gratuito, que é sempre 1 de 1), o que cada plano inclui e o link para os Termos.
- **Assinar:** até a cobrança pela InfinitePay (etapa 4), "Quero assinar o plano completo" abre um
  e-mail pronto para `PRESTADOR.email`, com o nome da clínica. O plano é liberado à mão: mudar
  `clinicas/{c}.plano` para `completo` (pelo console ou script) e rodar `recontar-uso`.
- O uso vem de `usePlanoDaClinica` (`src/services/planoDaClinica.ts`), que acompanha `clinicas/{c}`:
  plano, cortesia, contadores e o número de logins do índice da equipe.

### Cadastro sozinho (fase 1)
- **Tela de login:** "Sua clínica ainda não usa a Venus JK? Criar conta da clínica". O endereço com
  `?cadastro` abre direto o formulário, para mandar por link.
- **Formulário:** nome da clínica, nome da pessoa, e-mail e senha (pelo menos 8 caracteres). O login
  nasce no navegador (`createUserWithEmailAndPassword`) e recebe o e-mail de confirmação, com o
  botão de voltar ao site.
- **Login sem clínica** (`ConcluirCadastroView`, no lugar da tela de acesso negado):
  1. "Confirme seu e-mail": confere sozinho quando a pessoa volta para a aba, ou pelo "Já confirmei";
     reenviar no máximo a cada 30 segundos;
  2. "Crie sua clínica": o nome vem preenchido do formulário (se for o mesmo navegador);
     `POST /api/cadastro/clinica` cria a clínica e o painel abre. As sementes entram nesse primeiro
     login.
  A tela lembra: quem é da equipe de uma clínica não cria outra; pede o acesso à admin.
- **Servidor** (`server/cadastro.ts`): só com e-mail confirmado (claim `email_verified`), login
  sem clínica e que não seja o dono; nome de 2 a 80 letras, limpo; 10 pedidos por hora por
  endereço; um pedido por login de cada vez. A clínica nasce com `plano: 'gratuito'`, sem cortesia,
  sem Google Agenda, `criadaPor: 'cadastro'`. A criação é a mesma do `criar-clinica`
  (`server/clinicasNovas.ts`).
- **Fechar o cadastro:** `CADASTRO_ABERTO = false` em `src/utils/cadastro.ts` tira o link da tela e
  faz o servidor recusar clínica nova.
- **E-mails do login em português:** `auth.languageCode = 'pt-BR'` no painel e idioma padrão
  `pt-BR` no Authentication do `zulia-plataforma` (posto em 10/11/2026).
- **Falta (João):** o nome que aparece nos e-mails do login (`%APP_NAME%`) é o "nome voltado ao
  público" do projeto, ainda "Zulia". Console do Firebase → Configurações do projeto → Geral →
  Nome voltado ao público → "Venus JK".
- **Aceite no formulário:** feito (ver "Documentos legais").

## Documentos legais

Escritos em 10/11/2026 (versão 1.0) a partir do que o sistema faz, para revisão de um advogado
antes de vender o plano completo.

| Documento | Página | Texto |
| --- | --- | --- |
| Termos de Uso (contrato com a clínica) | `/termos` | `public/legal/termos-de-uso.md` |
| Política de Privacidade da plataforma (a Venus JK como controladora: conta, equipe, pagamentos, acessos) | `/politica-de-privacidade` | `public/legal/politica-de-privacidade.md` |
| Acordo de Tratamento de Dados (Anexo I dos Termos; a Venus JK como operadora dos dados das pacientes, arts. 37 a 40 da LGPD) | `/tratamento-de-dados` | `public/legal/acordo-de-tratamento-de-dados.md` |
| Aviso de Privacidade da clínica para as pacientes (modelo preenchido com o perfil público da clínica; é também a página que o Google exige para o Google Agenda) | `/privacidade?c=<clinicaId>` | `public/legal/aviso-da-clinica.md` |

- **Páginas:** HTML do servidor (`server/documentosLegais.ts`), sem JavaScript. O Markdown aceito é
  o pouco que os textos usam: títulos, parágrafos, listas com um nível de recuo, tabelas, negrito,
  código e links. Os `{{marcadores}}` vêm de `src/utils/documentosLegais.ts`.
- **Dados da empresa** (`PRESTADOR` em `src/utils/documentosLegais.ts`): razão social, CNPJ,
  endereço, e-mail, encarregado e foro. Vazio aparece como "[a preencher: ...]" destacado.
  Preenchidos em 11/2026: **KAROLINE DA R. FERREIRA**, CNPJ **49.464.212/0001-19** (da notificação
  da Receita Federal), Rua Araguaia, 208, apto. 42C, Vila Almeida, Indaiatuba/SP, CEP 13330-660,
  `enfesteta.karoline@gmail.com` (contato e encarregado: Karoline da R. Ferreira), foro de
  Indaiatuba/SP. **Atenção:** na Receita, o município do CNPJ ainda aparece como Tefé/AM. O endereço
  dos documentos deve ser o do cadastro do CNPJ: atualizar o CNPJ para Indaiatuba (ou trocar o
  endereço aqui). Conferir também com o contador se o CNPJ tem a atividade (CNAE) de software por
  assinatura, para emitir a nota fiscal das assinaturas.
- **Versão e aceite:** `VERSAO_DOS_DOCUMENTOS` e `VIGENCIA_DOS_DOCUMENTOS`. No cadastro, a caixa de
  aceite é obrigatória e o servidor recusa sem a versão em vigor (`aceite-pendente`). O aceite fica
  em `clinicas/{c}.aceites.termos` (versão, data, uid, e-mail, IP). A admin de uma clínica sem o
  aceite da versão em vigor (as de antes dos documentos, como a La Vie, e todas quando a versão
  mudar) vê o pedido no painel (`AceiteDosDocumentosModal`), com "Agora não" até o painel abrir de
  novo; aceita por `POST /api/cadastro/aceite`. Mudou o texto de forma relevante: suba a versão.
- **Links:** rodapé da tela de login (Termos e Política) e, na ficha da paciente, "aviso de
  privacidade" da clínica do link.
- **Leitura dentro do painel:** no cadastro e no pedido de aceite, os links abrem o texto por cima
  da tela (`LeitorDeDocumento`), lido de `/legal/*.md` e transformado com o mesmo código das páginas
  (`src/utils/markdownLegal.ts`). Motivo: na prévia do AI Studio só existe a parte visual do site;
  `/termos` abria o próprio painel e o aceite (`/api/...`) dava erro. Lá, o aceite agora explica:
  "Abra o painel pelo endereço do site (não pela prévia de edição)". **Aceite e cadastro só funcionam
  no endereço publicado.**
- **O que os textos prometem e ainda precisa ficar verdadeiro** (antes de vender, ou ajustar o texto):
  - registros de acesso guardados por **6 meses** (art. 15 do Marco Civil): configurar a retenção
    dos registros do Cloud Logging do projeto em que o site roda (o padrão é 30 dias);
  - **verificação em duas etapas** nas contas Google com acesso aos projetos (dito no Anexo de
    segurança do Acordo);
  - **cópia dos dados da clínica** em planilha ou JSON mais os arquivos, em até 30 dias: adaptar o
    `scripts/exportar-banco.ts` para `clinicas/{c}` (o `migrar-la-vie.ts` já sabe ler tudo);
  - **eliminação** 90 dias depois do encerramento: hoje é à mão (`recursiveDelete` da clínica, os
    arquivos de `clinicas/{c}/` e os logins);
  - **cobrança pela InfinitePay**, nota fiscal e avisos de vencimento: etapa 4;
  - **limites do plano gratuito**: etapa 3, fase 2.
- **Para o advogado olhar com atenção:** limitação de responsabilidade (14.2) e se o CDC se aplica
  às clínicas; foro; prazo de 48 horas para avisar incidente ao controlador; transferência
  internacional (art. 33) com os fornecedores do Google; arrependimento de 7 dias; reembolso
  proporcional nos casos dos itens 12.2 e 16.2.

## Etapa 2: várias clínicas e a migração da La Vie

Plano aprovado pelo João em 8/11/2026. Cada fase é um PR mesclado na `main`. **Até a fase 6, a
La Vie no ar (modo legado) não sente nenhuma mudança.**

| Fase | O que entra | Situação |
| --- | --- | --- |
| 1 | `plataforma.json` escolhe o projeto (`legado` ou `zulia`) para o painel, o servidor e os scripts | Feita |
| 2 | Regras multi-clínica em `zulia/` e o teste de isolamento `scripts/verificar-regras-zulia.ts` | Feita; publicada no `zulia-plataforma` e passando lá e nos emuladores (9/11/2026) |
| 3 | Servidor por clínica: login pela claim, caminhos `clinicas/{c}/...`, rotas `/api/equipe` | Feita; testada nos emuladores (`scripts/verificar-servidor-zulia.ts`) |
| 4 | Painel e páginas das pacientes por clínica: entrada pela claim, links com `c=`, sementes e marca | Feita; testada de ponta a ponta nos emuladores, no modo Zulia e no legado |
| 5 | `scripts/criar-clinica.ts`, até existir o cadastro da etapa 3 | Feita; testada de ponta a ponta nos emuladores e no `zulia-plataforma` (9/11/2026) |
| 6 | `scripts/migrar-la-vie.ts`, ensaio, e a migração no dia combinado com o João | **Feita em 10/11/2026.** A La Vie é a clínica `u9JYfN` do `zulia-plataforma`, e o `plataforma.json` virou para `zulia` |

### A chave do projeto (`plataforma.json`)
- `plataforma.json` na raiz diz qual projeto o código usa: `{ "modo": "legado" }` (a La Vie de
  hoje, `firebase-applet-config.json`) ou `{ "modo": "zulia" }` (`zulia-firebase-config.json`).
  Fica num arquivo versionado porque não está confirmado que o build do AI Studio enxerga
  variáveis de ambiente. **Está em `zulia` desde 10/11/2026** (a migração).
- Ninguém importa o JSON de um projeto direto: o painel, o servidor e os scripts pedem a
  configuração a `src/lib/projetoFirebase.ts` (`firebaseConfig`, `modoPlataforma`, `ehZulia`).
- Para desenvolvimento e scripts: `VITE_PLATAFORMA=zulia` no Vite (configuração `zulia-dev` do
  `.claude/launch.json`) e `PLATAFORMA=zulia` no Node. **Desde a migração, o `zulia-plataforma` é
  produção, com as pacientes da La Vie:** o `vite dev` sem `VITE_EMULADORES=1` grava nele. Teste nos
  emuladores, ou no projeto de testes `venus-jk-testes` quando os scripts estiverem ligados a ele.
- Os scripts que só fazem sentido no projeto antigo (`exportar-banco`, `importar-banco`,
  `migrar-imagens-para-storage`, `bootstrap-first-admin`) apontam sempre para ele.
- `scripts/verificar-plataforma.ts` confere o arquivo e a escolha.

## Migração da La Vie (fase 6)

### O que está pronto
- `scripts/migrar-la-vie.ts`:
  - `--ensaio --id ensaio-...`: só dados, sem logins;
  - `--aplicar --id <id>`: dados, arquivos, logins e o documento da clínica;
  - `--conferir`: compara origem e destino;
  - `--apagar-ensaio`.

  Os detalhes estão no topo do arquivo. Pontos principais:
  - Firestore lido com `listCollections()` (com subcoleções), preservando ids e tipos;
  - URLs de download do bucket antigo reescritas em qualquer campo, com o mesmo token;
  - arquivos copiados para `clinicas/{id}/...` com o mesmo `firebaseStorageDownloadTokens`;
  - logins importados com os mesmos uids e senhas (scrypt), com as claims. O `papel` vem de `professionals[].isAdmin`; contas fora da equipe ficam de fora; o dono (`--dono`) entra só com `donoDaPlataforma`;
  - rodar de novo com o mesmo id regrava o mesmo conteúdo.
- `scripts/verificar-migracao-la-vie.ts`: testa o script nos emuladores com uma "La Vie de mentira" (`demo-lavie`, banco `banco-novo`). Cobre coleções, subcoleção, documento fantasma, datas, URLs em vários campos e formatos, arquivos com token e logins. Roda ensaio → conferir → apagar e depois aplicar → conferir → aplicar de novo. **36 ok.** As senhas não são conferidas no emulador (ele não guarda hash scrypt); no dia, a conferência é a Karoline entrar com a senha de sempre.
- `scripts/configurar-bucket-zulia.ts`: aplica o `cors.json` (o mesmo do bucket da La Vie) no bucket da Zulia. Sem ele, os PDFs saem sem as fotos.
- **Id reservado para a La Vie: `u9JYfN`.** Vai em `--id` e em `CLINICA_DOS_LINKS_ANTIGOS`.
- Índices: todas as consultas do painel e do servidor usam um campo só, e os índices automáticos bastam. Nenhum índice composto a copiar.

### Antes do dia
A credencial `ZULIA_*` fica no ambiente "Lá Vie Environment" do Claude; as sessões abertas no
ambiente "Default" não a têm.

1. ~~Regras da Zulia publicadas e `verificar-regras-zulia.ts` no `zulia-plataforma`~~ — feito em 9/11/2026, tudo certo.
2. ~~CORS do bucket (`configurar-bucket-zulia.ts`)~~ — feito em 9/11/2026.
3. ~~`drakaroline-lavie.ai.studio` nos domínios autorizados do login da Zulia~~ — feito em 9/11/2026 (`scripts/configurar-login-zulia.ts`).
4. ~~Ponta a ponta no `zulia-plataforma` de verdade~~ — feito em 9/11/2026:
   - `verificar-ponta-a-ponta-zulia.ts --projeto-real`: duas clínicas, painel do build no modo Zulia servido localmente, sementes, login de profissional pela tela, links de ficha, orçamento e agendamento, isolamento. Tudo certo;
   - `criar-clinica` pela linha de comando, com `--sem-convite`;
   - tudo apagado depois: o `zulia-plataforma` ficou com 0 clínicas, 0 logins e 0 arquivos.
5. **João:** cria o projeto de testes separado (roteiro abaixo) e combina a janela.

### Projeto de testes
Para os testes, depois da migração, não rodarem no mesmo projeto das clínicas de verdade. O João cria;
o Claude liga os scripts a ele (um terceiro arquivo de configuração, como o `zulia-firebase-config.json`)
quando receber a configuração do app web.

1. Firebase → Adicionar projeto: "Zulia Testes" (id sugerido `zulia-testes`), sem Google Analytics.
2. Plano Blaze, com a mesma conta de faturamento (o Storage de projeto novo exige). Custo esperado: perto de zero.
3. Firestore: banco `(default)`, Standard, `southamerica-east1`, modo de produção.
4. Storage: `southamerica-east1`.
5. Authentication: ligar e-mail e senha.
6. Registrar um app web ("Zulia Testes Web") e mandar a configuração (`firebaseConfig`) no chat. Ela não é segredo: é a mesma que vai no site.
7. IAM do projeto de testes: dar a `claude-configuracao@zulia-plataforma.iam.gserviceaccount.com` o papel **Editor**. É a mesma conta, então não há chave nova para criar nem guardar; e o projeto de testes nunca terá dados de pacientes.

### Dia da migração (só com o João) — feito em 10/11/2026
Como foi: o João deu o papel de Administrador do Firebase Authentication já de saída (o de leitor não
traz o hash das senhas). Ensaio `ensaio-1110` sem diferenças e apagado; `--aplicar --id u9JYfN`
copiou 191 documentos em 20 coleções, 150 arquivos e o único login da equipe (a admin), com a
senha; `--conferir` sem diferenças, de novo depois do segundo `--aplicar`. O login de teste do
ambiente do Claude (`LAVIE_TESTE_*`, o mesmo login) entrou no `zulia-plataforma` com a senha de
sempre. O build de produção, servido localmente, abriu o painel em 9 abas sem erro de permissão, o
link antigo sem `c=` e as fotos pela URL reescrita. Não havia login do João no projeto da La Vie,
então nenhum login de dono foi criado (fica para o painel do dono, etapa 5).

Publicado pelo João no mesmo dia. Na primeira publicação, o `/status` respondeu `configurado: false`
(os Secrets `ZULIA_ADMIN_*` não chegaram ao app); o João acertou os Secrets e publicou de novo. No ar,
conferido: `/status` com `{ configurado, conectado, modo: 'zulia', linksAntigos: true }`; o login da
admin entra com a senha de sempre, e o painel abre sem erro; o link antigo de ficha, sem `c=`, abre
na La Vie com o cartão certo; as fotos abrem pelo bucket novo.

1. **João:** dá à conta `claude-configuracao@zulia-plataforma.iam.gserviceaccount.com`, no projeto `database-dra-karoline`, os papéis **Leitor do Cloud Datastore**, **Leitor de objetos do Storage** e **Leitor do Firebase Authentication**. Se o script avisar que os logins vieram sem hash de senha, troca o último por **Administrador do Firebase Authentication** durante a janela.
2. Avisar a equipe para não usar o painel.
3. **Claude:** primeiro contato com os dados reais:
   - ensaio: `--ensaio --id ensaio-<data>`, depois `--conferir --ensaio` e `--apagar-ensaio`;
   - migração: `--aplicar --id u9JYfN --dono <e-mail do João>`;
   - conferência: `--conferir --id u9JYfN`, sem diferenças.
4. Regras da Zulia publicadas e conferidas (feito em 9/11/2026; confirmar com `npm run publicar-regras -- --projeto zulia --conferir`).
5. Domínio autorizado (feito em 9/11/2026; confirmar com `npx tsx scripts/configurar-login-zulia.ts --conferir`).
6. **João:** cria a conta do servidor da Zulia (ex.: `servidor-zulia`) no `zulia-plataforma`.
   - Papéis: **Usuário do Cloud Datastore** e **Administrador do Firebase Authentication**.
   - Gera a chave JSON e põe nos Secrets do AI Studio como `ZULIA_ADMIN_EMAIL` e `ZULIA_ADMIN_CHAVE`. A chave nunca vai para o chat.
   - Deixa os `FIREBASE_ADMIN_*` da La Vie onde estão: são a volta, se precisar.
7. **Claude:**
   - roda `--aplicar` de novo, para pegar o que as pacientes mandaram durante a janela, e `--conferir`;
   - faz o commit que vira o `plataforma.json` para `zulia` e preenche `CLINICA_DOS_LINKS_ANTIGOS = 'u9JYfN'`, e mescla na `main`.
8. **João:** publica pelo AI Studio.
9. Conferir:
   - `/api/ficha-publica/status` responde `{ configurado, conectado, modo: 'zulia', linksAntigos: true }`;
   - a Karoline entra com a senha de sempre;
   - um link antigo (sem `c=`) e um novo abrem;
   - uma foto antiga abre pela URL reescrita.

**Se der errado depois de publicar:** virar o `plataforma.json` de volta para `legado` e publicar. O projeto antigo continua com os dados. O que for gravado na Zulia nesse meio-tempo precisaria voltar à mão.

### Depois
1. **João** tira os três papéis da conta do Claude no projeto da La Vie (Leitor do Cloud Datastore,
   Leitor de objetos do Storage e Administrador do Firebase Authentication).
2. Os papéis do Claude no `zulia-plataforma` trocam Editor e Proprietário do Cloud Datastore por
   papéis que gerenciam sem ler dados:
   - **Administrador de regras do Firebase** (publicar `zulia/*.rules`);
   - **Administrador de índices do Cloud Datastore**;
   - **Consumidor do Service Usage**.

   O que precisar ler dados (ou mexer na configuração do login ou do bucket, como
   `configurar-login-zulia.ts` e `configurar-bucket-zulia.ts`) o João libera por um tempo. O Claude
   confere o resultado com `testIamPermissions` (nenhuma permissão `datastore.entities.*`,
   `storage.objects.*` ou `firebaseauth.users.*`).
3. **Tirar do ambiente do Claude o `LAVIE_TESTE_EMAIL` e o `LAVIE_TESTE_SENHA`:** é o login da admin
   da La Vie (o único da clínica), que dá acesso ao painel com todas as pacientes. Os testes passam a
   usar logins de clínicas de teste no `venus-jk-testes`.
4. Depois de uma semana sem precisar voltar atrás, as regras do projeto antigo viram somente
   leitura, como cópia de segurança. O Claude prepara e publica com a chave de publicar regras da La
   Vie. Antes disso não: voltar para o `legado` precisa do projeto antigo gravável.
5. Ligar os scripts de teste ao projeto `venus-jk-testes` (configuração do app web já recebida:
   `1:634656418024:web:9648e332fc3b388225c15d`; a conta do Claude já é Editor lá).
