# Publicar as regras do Firebase sem o firebase-tools

`npm run publicar-regras` publica `firestore.rules` (no banco do `firebase-applet-config.json`)
e `storage.rules` pela API de regras do Firebase, com uma **conta de serviço**. Serve para quem
não tem o firebase-tools instalado — e para o Claude publicar sozinho, numa sessão na nuvem.

- `npm run publicar-regras -- --conferir` só mostra o que está publicado, sem mudar nada.
- O Google valida a sintaxe antes de publicar: regra com erro não vai ao ar.

## Configurar (uma vez só)

**1. Criar a conta de serviço** — a "conta robô" que vai publicar.

1. Abra <https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=database-dra-karoline>
   com a conta Google dona do projeto (a mesma do console do Firebase).
2. Em **Nome da conta de serviço**, escreva `publicar-regras`. O ID se preenche sozinho igual.
3. **Criar e continuar**.
4. Em **Selecionar um papel**, digite `Administrador de regras do Firebase` (em inglês,
   *Firebase Rules Admin*) e escolha. **Continuar** → **Concluir**.

O papel só mexe nas regras: não lê nem altera os dados das pacientes, os arquivos do Storage ou o
resto do projeto. Mas quem tem a chave pode trocar as regras — por isso ela só fica guardada no
ambiente.

**2. Gerar a chave.**

1. Na lista, clique em `publicar-regras@database-dra-karoline.iam.gserviceaccount.com`.
2. Aba **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON** → **Criar**.
   Um arquivo `.json` é baixado.

**3. Guardar a chave no ambiente** — nunca no chat, no WhatsApp ou no repositório.

1. Abra o arquivo baixado no Bloco de Notas e ache a linha `"private_key": "-----BEGIN PRIVATE KEY-----\n…`.
2. Copie o valor dela inteiro: de `-----BEGIN PRIVATE KEY-----` até `-----END PRIVATE KEY-----\n`.
   Se as aspas ou a vírgula vierem junto, não tem problema.
3. Nas configurações do ambiente do Claude (nome do ambiente no topo da sessão → **Editar**),
   em **Variáveis de ambiente**, acrescente uma linha `FIREBASE_PRIVATE_KEY=` com a chave colada
   logo depois do `=`, tudo na mesma linha. Salve.
4. Apague o arquivo `.json` do computador.

A variável vale para as sessões abertas depois de salvar.

Conta de serviço com outro nome: acrescente também `FIREBASE_CLIENT_EMAIL=<e-mail dela>`. Também
dá para usar `FIREBASE_SERVICE_ACCOUNT` com o JSON inteiro numa linha só.
