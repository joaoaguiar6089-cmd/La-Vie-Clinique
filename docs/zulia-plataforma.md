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

## Projeto no Firebase: `zulia-plataforma`

Projeto nº `1031812147083`, nome "Zulia". A configuração do app web fica em
`zulia-firebase-config.json`, no mesmo formato do `firebase-applet-config.json` da La Vie (que
continua apontando para o `database-dra-karoline` até a migração).

| Item | Situação |
| --- | --- |
| Plano Blaze | Ativo (conta de faturamento vinculada) |
| APIs | Firestore, Identity Toolkit, Firebase Storage, Firebase Rules e Cloud Billing ativas |
| Firestore `(default)` | **Refazer** — criado pelo console em `nam5` (EUA), vazio. Apagar e recriar em `southamerica-east1`; regras fechadas já publicadas |
| Storage `zulia-plataforma.firebasestorage.app`, `southamerica-east1` | Criado e vinculado ao Firebase, com regras fechadas (`allow read, write: if false`) |
| Login por e-mail e senha | Ligado, com o Auth já no Identity Platform. Duas etapas (MFA) ainda desligada |
| App web "Zulia Web" | Registrado: `1:1031812147083:web:b164181d211d1d68a4718e` |

- **Regras fechadas até existirem as regras multi-clínica.** O `firestore.rules` e o
  `storage.rules` deste repositório são os da La Vie (coleções na raiz) e **não** devem ser
  publicados no projeto da Zulia.
- **O Auth está no Identity Platform** (decisão do João; o upgrade não tem volta). É o que libera
  a verificação em duas etapas exigida para o login do dono e as *blocking functions*. Para
  logins com e-mail e senha, é gratuito até 50 mil usuários ativos por mês.
- **Domínios autorizados no login:** por enquanto só `zulia-plataforma.firebaseapp.com` e
  `zulia-plataforma.web.app`. O endereço em que o site for publicado precisa entrar na lista.
- **A região do Firestore não muda depois de criado.** Por isso o banco tem de estar em
  `southamerica-east1` antes de receber qualquer dado: as fichas são dados de saúde, e ficar no
  Brasil evita declarar transferência internacional (LGPD), além de deixar o painel mais rápido.
- **Conta de serviço temporária** `claude-configuracao@zulia-plataforma.iam.gserviceaccount.com`
  (papel Editor), usada para esta configuração. **Apagar a chave dela antes de migrar os dados
  das pacientes.**

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
- Criar clínica, criar login de profissional e mudar plano passam pelo servidor (Admin SDK).

### Links das pacientes
- Os links passam a levar a clínica (`c=<clinicaId>`). Links antigos da La Vie, sem `c`, abrem
  na clínica da La Vie.

### Limites
- Contadores de uso no documento da clínica, conferidos nas regras do Firestore junto com cada
  criação e exclusão (o contador sobe na mesma gravação em que o documento nasce). Assim o
  limite vale mesmo para quem tentar burlar a tela.
