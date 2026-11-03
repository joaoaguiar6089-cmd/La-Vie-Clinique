# Ficha da paciente pelo servidor — configurar e publicar

## Por que existe

Até aqui, a página da ficha de anamnese (aberta pela paciente, sem login) lia e gravava os
cadastros (`patients`) e as fichas (`anamnesis_records`) direto no banco. Para isso funcionar, as
regras do Firestore deixavam essas duas coleções **abertas para qualquer pessoa na internet**:
listar todos os cadastros (nome, CPF, telefone, nascimento), ler todas as fichas, alterar ou
apagar. A confirmação de CPF e nascimento acontecia no navegador, depois de o cadastro inteiro já
ter sido baixado. E qualquer pessoa podia criar uma conta e entrar no painel completo.

Agora:

- a página da paciente fala com o servidor (`/api/ficha-publica`, em `server/fichaPublica.ts`),
  que confere o link, confere CPF e nascimento antes de abrir uma ficha fechada (com limite de
  tentativas) e grava só o que a paciente preenche;
- o painel só abre para quem está na lista de profissionais (`equipeUids`, ver
  `src/utils/equipe.ts`);
- as regras novas fecham `patients` e `anamnesis_records`, deixam `quotes` sem listagem pública e
  fecham as fotos clínicas no Storage.

O servidor precisa de uma **conta de serviço** com acesso ao banco. É o único passo que depende
de você.

## A ordem importa

1. Criar a conta de serviço e colocar a chave nos Secrets do AI Studio.
2. Publicar o app no AI Studio.
3. Conferir o endereço de status (abaixo).
4. **Só então** publicar as regras novas (`npm run publicar-regras`).

Publicar as regras antes do passo 3 dar certo deixaria a ficha da paciente sem abrir, ou a equipe
trancada fora do painel. Publicar o app antes do passo 1 deixa a ficha da paciente sem abrir até a
chave ser configurada.

## 1. Criar a conta de serviço (uma vez só)

1. Abra <https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=database-dra-karoline>
   com a conta Google dona do projeto.
2. Em **Nome da conta de serviço**, escreva `servidor-fichas`. **Criar e continuar**.
3. Em **Selecionar um papel**, digite `Usuário do Cloud Datastore` (em inglês,
   *Cloud Datastore User*) e escolha. É o papel que lê e grava no Firestore — nada além disso.
   **Continuar** → **Concluir**.
4. Na lista, clique em `servidor-fichas@database-dra-karoline.iam.gserviceaccount.com` → aba
   **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON** → **Criar**. Um arquivo
   `.json` é baixado.

Esta chave é diferente da `publicar-regras` e **não** deve ir para o ambiente do Claude: ela lê os
dados das pacientes. Fica só nos Secrets do AI Studio.

## 2. Colocar a chave nos Secrets do AI Studio

Abra o arquivo `.json` no Bloco de Notas. No painel **Secrets** do app no AI Studio, crie dois:

| Nome                   | Valor                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `FIREBASE_ADMIN_EMAIL` | o valor de `"client_email"` (termina em `.iam.gserviceaccount.com`)   |
| `FIREBASE_ADMIN_CHAVE` | o valor de `"private_key"`, de `-----BEGIN` até `END PRIVATE KEY-----\n` |

A chave vai numa linha só, com os `\n` escritos como estão no arquivo. Se as aspas ou a vírgula
vierem junto, não tem problema. Depois **apague o arquivo `.json` do computador**.

(Alternativa: um único Secret `FIREBASE_ADMIN_CREDENCIAL` com o arquivo JSON inteiro.)

## 3. Publicar e conferir

Publique o app no AI Studio e abra:

<https://drakaroline-lavie.ai.studio/api/ficha-publica/status>

O esperado é:

```json
{ "configurado": true, "conectado": true, "equipeSincronizada": true }
```

- `configurado: false` — os Secrets não chegaram ao app. Confira os nomes e publique de novo.
- `conectado: false` — a chave foi lida, mas o Google recusou: confira o papel *Cloud Datastore
  User* da conta e se a chave é dela.
- `equipeSincronizada: false` — espere um minuto e recarregue: o servidor grava a lista de logins
  da equipe ao subir. Se continuar `false`, abra o painel e salve as Configurações uma vez.

## 4. Publicar as regras

Com os três `true`, o Claude publica as regras numa sessão (ou você roda `npm run publicar-regras`,
ver `docs/publicar-regras.md`). Depois, confira:

- uma ficha de anamnese enviada por link abre e salva;
- o painel abre normalmente para a equipe.

## Conferir o código

```bash
npx firebase-tools emulators:exec --only firestore --project demo-verificacao "npx tsx scripts/verificar-ficha-publica.ts"
```

Roda contra o emulador do Firestore, nunca contra o banco da clínica.
