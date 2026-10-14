# Título dos links no WhatsApp

O cartão que aparece sobre o link colado na conversa (título em negrito + descrição) mostra do que
o link trata:

| Link | Título | Descrição |
|---|---|---|
| Ficha de anamnese (`?anamnese=` ou `?ficha=`) | `Anamnese - Botox` | La Vie Clinique · Preencha sua ficha de anamnese antes do atendimento. |
| Agendamento (`?agendamento=`) | `Confirmação de agendamento - Limpeza de pele` | `sexta-feira, 16/10 às 14:30 · La Vie Clinique` |
| Orçamento (`?orcamento=`) | `Orçamento - Botox` · `Botox e Peeling` · `Botox e mais 2` | La Vie Clinique · Orçamento nº 2026-0148 |
| Catálogo (QR Code, sem parâmetro) | La Vie Clinique - Indaiatuba (o do `index.html`) | — |

Nunca entram no cartão: nome da paciente, valores, contato, observações. Ele fica à vista na tela
do celular da cliente.

## Por que precisa de um servidor

Quem monta o cartão é o robô do WhatsApp: ele baixa o HTML do link e lê as tags `og:title` e
`og:description` — **não executa JavaScript**. O site é um app de uma página só, então todo link
devolvia o mesmo `index.html`, com o mesmo título. Trocar o título dentro do React não adianta.

Por isso existe o `server.ts` (Express): serve o `dist/` e, nos pedidos que têm um dos parâmetros
acima, reescreve o `<head>` antes de responder.

```
WhatsApp → GET /?anamnese=tpl-botox
         → server.ts → previewDosLinks.ts → Firestore (REST, sem login, só o campo procedimentoNome)
         → linkPreview.ts troca <title>, description, og:title, og:description
```

| Peça | O que faz |
|---|---|
| `src/utils/linkPreview.ts` | Puro: qual link é este, o texto de cada cartão, a troca no HTML. |
| `server/previewDosLinks.ts` | Lê o Firestore pela API REST e guarda o resultado em memória. |
| `server.ts` | Express: arquivos estáticos + a troca do `<head>`. |

Lê só o que as regras do Firestore já abrem à cliente (`anamnesis_templates`, `anamnesis_records`,
`quotes` e `appointment_links` por `get`) e pede só os campos necessários (`mask.fieldPaths`). A ficha
preenchida, com os dados da paciente, não trafega além do nome do procedimento.

## Se algo falhar, o link continua abrindo

- Banco fora do ar, cota esgotada, documento apagado, id inventado: o cartão sai com o título do
  tipo ("Anamnese - La Vie Clinique"), e a página abre normalmente.
- Resultado em cache por 5 minutos (1 minuto quando não achou): um id inventado na URL custa uma
  leitura por minuto, não uma por pedido. O nome de um procedimento renomeado leva até 5 minutos
  para chegar ao cartão.
- Ids fora do padrão (`[A-Za-z0-9_.~-]`, até 200 caracteres) nem chegam ao banco.

## Scripts

```
npm run build   # vite build + empacota o server.ts em server.js
npm start       # node server.js  (porta de PORT, ou 3000)
```

`npm run dev` continua sendo o Vite puro, sem o servidor: lá o título é o do `index.html`.

## Depois de publicar

O WhatsApp **guarda o cartão por link**. Um link que já foi enviado e visto antes mantém o cartão
antigo; links novos saem certos. Para conferir sem mandar mensagem a ninguém:

```
curl -s -A "WhatsApp/2" "https://<site>/?anamnese=<id-do-modelo>" | grep -E "<title>|og:title"
```

Tem de aparecer `Anamnese - <nome do procedimento>`. Se aparecer "La Vie Clinique - Indaiatuba", o
servidor não está rodando na hospedagem (ela está servindo só os arquivos estáticos) — ver
`server.ts` e o script `start`.

## Verificação

```
npx tsc --noEmit
npx tsx scripts/verificar-link-preview.ts
```
