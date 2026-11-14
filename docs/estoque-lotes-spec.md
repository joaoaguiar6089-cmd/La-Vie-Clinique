# Estoque com tipos, lotes e compras — especificação

Status: **implementado** — 2026-11-14, com a leitura do pedido por IA.

O estoque passa a saber **quanto há** de cada produto, de que **lote** e com que **validade**. A
quantidade entra pelas compras e sai pelos materiais lançados no relatório do atendimento.

---

## 1. Tipo de produto

- O produto ganha **tipo** (`ProdutoDeEstoque.tipo`), ao lado de nome e marca: "Ácido
  hialurônico" agrupa o Voluma e o Restylane. Texto livre, com sugestões dos tipos já usados; o
  agrupamento ignora acento e maiúscula. Sem tipo = "Sem tipo".
- A aba **Produtos** do Estoque lista os **tipos**, cada um com a quantidade somada (por unidade:
  "5 seringas", "400 U"). Tocar abre o painel do tipo.
- **Painel do tipo**: a quantidade mínima, os produtos do tipo (nome, marca, custo, quanto há de
  cada um — tocar edita) e os **lotes**: produto, marca, data da compra, lote, validade, quanto
  resta e quanto entrou.
- **Mínimo** por tipo (`stock_types`, um documento por tipo, só quando há mínimo). Abaixo dele, o
  card fica em destaque **só no Estoque**. Lote vencido ou vencendo em 30 dias também aparece em
  destaque no card e no painel.

## 2. Lotes

- Coleção `stock_lots`. Cada lote: produto, quantidade que entrou e **saldo**, sempre na **unidade
  de uso** (U, ml, seringa — a compra em caixa já entra multiplicada), custo por unidade desta
  compra, lote, validade, data da compra, fornecedor, pedido.
- **Ajustar** (no painel do tipo): o saldo novo e o motivo (contagem, perda, vencido, outro). O
  ajuste fica guardado no lote (`ajustes`), com o saldo de antes e quem fez.
- **Lote e validade**: corrigir o código ou a data digitados errado.

## 3. Compras

- Aba **Compras**: os pedidos, do mais novo para o mais antigo (`purchase_orders`). Tocar abre o
  pedido: os itens, o lote e a validade de cada um, quanto resta, o anexo.
- **Nova compra**: fornecedor, data, nº da nota, a **foto ou o PDF** (Storage,
  `pedidos/<id>/`, até 10 MB) e os itens. Cada item: o produto do cadastro **ou um novo** (nome,
  marca, tipo, unidade de uso, unidades por embalagem), a quantidade **por unidade ou por
  embalagem** (quando o produto tem embalagem), o valor, o lote e a validade.
- **Colar da planilha** (do Excel/Google Planilhas, com tabulação) ou **abrir um .csv** (`;` ou
  `,`). Colunas do modelo: Produto*, Marca, Tipo, Quantidade*, Unidade, Valor unitário*, Lote,
  Validade. Com a linha de títulos, a ordem tanto faz; sem ela, vale a do modelo. Números com
  vírgula nos centavos; validade em dd/mm/aaaa ou mm/aaaa (vale até o fim do mês). Botões para
  **baixar o modelo** e **copiar o texto** que pede a outra IA para converter o pedido.
- Cada linha lida é **casada com um produto do cadastro** pelo nome (e pela marca); a sugestão
  vem marcada para conferir. Sem parecido, entra como produto novo, já preenchido. "Caixa" num
  produto com embalagem cadastrada entra por embalagem.
- **Registrar**: um lote por item, os produtos novos, e o **custo de cada produto passa a ser o
  desta compra** (a caixa acompanha). Tudo num lote só.
- **Lançar o estoque atual**: o mesmo formulário, sem fornecedor nem nota — o que já está na
  prateleira quando o controle começa.
- Pedido só pode ser **excluído** se nenhum lote dele foi usado nem ajustado.

## 4. Baixa pelo atendimento

- O estoque desce **só pelos materiais lançados no relatório do atendimento** (e pelo Ajustar).
  Venda de produto à cliente não dá baixa.
- `saveMateriaisDoAtendimento` grava numa transação: devolve aos lotes o que o registro anterior
  tinha tirado e tira de novo (`planejarBaixa`). Sai do **lote que vence primeiro**; o lote que a
  linha já tinha, ou que alguém escolheu, vem antes. O estoque não fica negativo.
- Cada material grava **de que lote saiu** (`MaterialUsado.lotes`) — o rastreio de em quem cada
  lote foi usado. No detalhe dos materiais (Financeiro › Painel › Materiais por atendimento) o
  lote aparece e **pode ser trocado**.
- **Só daqui para frente**: só registro novo, ou que já deu baixa (`baixaNoEstoque`), mexe no
  estoque. Corrigir um registro de antes não tira do estoque de hoje.
- Apagar os materiais, o atendimento ou a paciente arquivada **devolve** ao estoque.
- Material digitado à mão, fora do estoque, não tem lote nem dá baixa.

## 5. Leitura do pedido por IA

- No pedido de compra, com a foto ou o PDF anexado, **Ler com IA** manda o arquivo ao servidor
  (`/api/leitura-de-pedido`, `server/leituraDePedido.ts`), que pergunta ao **Gemini** — com a chave
  do servidor, `GEMINI_API_KEY`, que o AI Studio fornece ao app publicado (`API_KEY` também vale).
  A chave nunca vai ao navegador. Só login do painel (na plataforma, com clínica); até 30 leituras
  a cada 10 minutos por login.
- Vai junto a **lista dos produtos cadastrados** (id, nome, marca, tipo, unidade), e o modelo
  devolve, num formato fixo (JSON com esquema): fornecedor, número, data e, por item, nome, marca,
  tipo, quantidade, unidade, valor unitário (ou total), lote, validade e o **id do produto
  reconhecido**. Id que não está na lista é descartado.
- Os itens entram como os da planilha: o reconhecido vem escolhido, o que a IA não reconheceu tenta
  o casamento por nome, e o resto entra como produto novo. Fornecedor, número e data preenchem o que
  estiver em branco. **Nada é gravado** até a pessoa conferir e registrar.
- Sem chave no servidor, o botão avisa que a leitura não está ligada e indica a planilha.
- `GEMINI_MODELO` troca o modelo (padrão `gemini-2.5-flash`); `GEMINI_BASE_URL`, o endereço da API.

## 6. Conferências

- `npx tsx scripts/verificar-lotes.ts` — a compra virando lote, a baixa, a devolução, a validade,
  o resumo por tipo, a planilha e o casamento de nomes.
- `scripts/verificar-regras-zulia.ts` — as coleções e a pasta de anexos novas.
- `npx tsx scripts/verificar-leitura-de-pedido.ts` — o que vai ao modelo, a limpeza da resposta e
  a chamada ao Gemini contra um servidor falso local (sem gastar cota).
