# Notas de recibo de pagamento

Status: **implementado** — 2026-10-15.

A nota de recibo é o documento que a clínica manda à cliente dizendo "recebemos de você tanto, em
tal data, por tal forma, referente a isto". Sai em PDF, com a identidade do orçamento (monograma,
Cormorant, bronze, bloco preto do valor), para enviar pelo WhatsApp.

---

## 1. Onde nasce

| De onde | Como |
| --- | --- |
| **Orçamento pago** (tela de Orçamentos) | O botão principal do cartão, que antes era "Anexar comprovante", agora é **"Criar nota de recibo"**. Com recibo emitido vira "Ver recibo"; outro recibo do mesmo orçamento sai pelo "…" → "Nova nota de recibo". |
| **Marcar pago** | A folha de pagamento pede só a data. "Confirmar e criar nota de recibo" grava o pago e já abre o formulário do recibo com essa data; "Só confirmar o pagamento" não emite nada. |
| **Pagamento sem orçamento** | Link azul **"Novo recibo"** embaixo de "Novo orçamento". O formulário começa pela cliente (nome e CPF). |
| **Página da paciente** | Aba **"Pagamentos"** (botão "Novo recibo", já com ela escolhida) e o menu "Novo" → "Recibo". |
| **Linha do orçamento** (aba Orçamentos da paciente, linha do tempo) | O chip "Anexar comprovante" virou **"Criar nota de recibo"**; com recibo, "Recibo 2026-0007". |

## 2. Formulário (`ReciboFormPanel`, painel lateral)

- **Cliente**: busca no cadastro ou nome avulso (`PatientSearchSelect`) e **CPF**. Escolhida do
  cadastro, o CPF vem junto; digitado aqui para quem tinha cadastro sem CPF, ele é copiado para o
  cadastro.
- **Pagamento**: data (não aceita futuro), valor, forma — **Pix, cartão de débito, cartão de
  crédito, dinheiro** — e, no crédito, **à vista ou parcelado** (2 a 12×, com o valor da parcela).
- Vindo de orçamento: cliente, procedimentos, data do pagamento e a forma principal com o valor
  dela já preenchidos. Se o orçamento aceitava mais de uma forma, pílulas "Como a cliente pagou?"
  trocam forma e valor de uma vez (ex.: Pix com 10% de desconto).
- **Procedimentos**: lista numerada, como a do orçamento — "+ Adicionar procedimento" (busca no
  catálogo) e "+ Item fora do catálogo". Cada linha tem **nome editável**, **sessões** e **valor
  opcional**. O nome livre existe para os protocolos de cada cliente dentro do mesmo procedimento
  ("Harmonização Glútea — Fases 1 e 2", "Harmonização Glútea — Fase 3"). Vindo de orçamento, as
  linhas nascem dos itens dele, com as sessões e **sem valor**: repartir o que entrou entre itens
  com descontos diferentes seria inventar número. Até 8 linhas. Se todos os itens têm valor e a
  soma não bate com o recebido, o formulário avisa (não impede).
- Substituiu os antigos "Referente a" e "Observações". Recibo antigo abre com o "Referente a"
  como a linha 1, e a observação dele continua no PDF.
- **Comprovante** (opcional): foto ou PDF, até 10 MB, em `recibos/<id>/comprovantes/` no Storage.
  Sobe **antes** do recibo ser gravado: se falhar, nada foi emitido e o número não foi gasto.
- Emitido, abre a **prévia** — o próximo passo é mandar para a cliente.

## 3. Dados

- Coleção `receipts`, **só a equipe lê e escreve** (leva CPF; a cliente recebe o PDF, não um link).
- ID `crypto.randomUUID()` gerado no cliente, para o comprovante subir para a pasta certa antes.
- Numeração `AAAA-####` própria em `counters/receipts_<ano>`, na mesma transação da gravação.
- `clinica`: retrato da clínica (nome, tagline, cidade, endereço, contatos e **CNPJ**, novo campo
  em Configurações → Contato). Refeito ao editar o recibo.
- Vínculo com orçamento por `quoteId` + `quoteNumero`. Um orçamento pode ter vários recibos
  (entrada e restante). O recibo de um orçamento da paciente aparece na página dela mesmo que quem
  pagou tenha sido outra pessoa.
- Editar mantém número e emissão. Excluir apaga o documento e o comprovante; o número não volta.
- **Desfazer o pagamento** de um orçamento exclui também os recibos dele (a confirmação diz quais).

## 4. PDF

- `PaginasDoRecibo` (`components/recibos/ReciboPrintable.tsx`), no desenho aprovado em
  2026-10-15 (modelo "Recibo La Vie Clinique com tabela"): faixa preta no alto → cabeçalho
  (monograma; o nome da clínica partido no travessão — "La Vie Clinique" grande, "Clínica de
  Estética Facial e Corporal" em caixa alta —; tagline • cidade; "Recibo Nº", emissão) →
  "Recebido de" + nome + CPF ao lado do bloco preto arredondado do valor, com o extenso →
  "Declaramos o recebimento de …, CPF …, da importância de R$ … (por extenso), referente a:" →
  **tabela** (Item / procedimento · Qtd. · Valor, linhas alternadas, "—" sem valor, **Total
  recebido**) → "O presente recibo comprova o pagamento descrito acima, dando plena quitação do
  valor recebido." → grade de data, forma, condição, orçamento e comprovante → selo "PAGO" com o
  local e a data por extenso e o nome da clínica (e CNPJ) → monograma apagado → rodapé.
  Margens laterais de 20 mm (o orçamento usa 14). O comprovante entra como páginas seguintes,
  uma por folha (PDF até 6).
- **A folha se mede**: se o conteúdo passa da altura do A4 (muitos itens com nome longo), ela
  aperta a tabela e os espaços (nível 1) e, se precisar, o nome, o valor e a frase (nível 2).
  Sem isso a assinatura e o rodapé sairiam cortados do PDF.
- Métrica e paleta em `components/documentos/estiloA4.ts`, compartilhadas com o orçamento.
- **Orçamento completo com recibo**: a prévia do orçamento pago (`QuotePreviewModal`) traz, depois
  das páginas dele, as notas de recibo e os comprovantes delas, com a numeração "N/total" contínua.
  Só no painel — a página pública do orçamento não lê `receipts`.
- Sem `tabular-nums` nem `font-feature-settings` e com hífen inseparável nos números em sans: o
  html2canvas abria vãos ("789- 01") que a tela não mostrava. Pelo mesmo motivo os números em
  Cormorant ficam com os algarismos de texto da fonte — o html2canvas ignora o `lnum`.

## 5. Envio (`ReciboPreviewModal`)

- **"Enviar à cliente"**: no celular abre o compartilhamento do aparelho com o PDF anexado (escolhe
  o WhatsApp e a conversa). Se o navegador recusar por ter passado tempo demais desde o toque
  (gerar o PDF leva segundos), aparece "Enviar agora", com o arquivo já pronto.
- Onde não há compartilhamento de arquivo (computador): o PDF é baixado e aparece o botão da
  conversa da cliente no WhatsApp, com a mensagem pronta, para anexar o arquivo.
- **"Baixar PDF"**: `Nome da cliente - Recibo 2026-0007.pdf`.

## 6. Regras a publicar

`firestore.rules` (coleção `receipts`) e `storage.rules` (`recibos/`) mudaram. Sem publicar, a
aba Recibos mostra o aviso de permissão e o envio do comprovante falha com a mensagem do caminho:

```
firebase deploy --only firestore:rules,storage
```

ou, com a conta de serviço configurada (ver `docs/publicar-regras.md`), `npm run publicar-regras`.

## 7. Fora de escopo

- O **faturamento** (Financeiro, tela Hoje) continua somando os orçamentos pagos pelo total deles.
  Recibo avulso não entra no faturamento, e um recibo com valor diferente do total do orçamento não
  corrige o número do mês.
- Página pública do recibo por link: o recibo vai à cliente em PDF.
- O comprovante anexado direto ao orçamento (o fluxo antigo) continua visível, trocável e no PDF do
  orçamento; comprovante novo só entra pela nota de recibo.
