# Módulo de Orçamentos — especificação fechada

Documento de referência para a implementação do gerador de orçamentos da La Vie.
Consolida o design aprovado (`Orcamento La Vie.pdf`, página 1), os comentários do
João (página 2 do mesmo arquivo) e as decisões tomadas na sessão de levantamento.

Status: **aprovado, pronto para implementar** — 2026-09-08.

---

## 1. Navegação e acesso

- Novo item **"Orçamentos"** no menu lateral (`Navbar.tsx`, array `railItems`) e no
  menu mobile (hoje são botões fixos, não geram do array — precisa de um terceiro).
- `currentView` em `App.tsx` passa a aceitar `'quotes'`; o render é um ternário hoje
  e vira uma cadeia condicional.
- **Todas as profissionais veem todos os orçamentos** (sem escopo por autor). A
  secretaria precisa achar o orçamento de qualquer cliente para dar seguimento.
- O painel oferece: listar, filtrar por cliente, criar, editar rascunho, duplicar,
  substituir, baixar PDF e copiar/enviar link.

## 2. Dados e ciclo de vida

- Coleção `quotes` no Firestore, seguindo o padrão de `databaseService.ts`.
- **ID do documento = `crypto.randomUUID()`.** O link público não pode ser
  adivinhável — leitura liberada, **escrita somente autenticada**.
- Numeração `AAAA-####` via `runTransaction` sobre `counters/quotes_<ano>`,
  reiniciando a cada ano. O número é **gerado no primeiro salvamento**, não ao abrir
  o formulário: abrir e desistir não queima número. É imutável depois de gerado.
- Status: `rascunho` · `enviado` · `aceito` · `expirado` · `cancelado`.
  - `expirado` é **calculado na hora** (comparando `dataValidade` com hoje), nunca
    gravado — sem job agendado.
  - `enviado` é marcado **automaticamente** no primeiro compartilhamento do link,
    e continua editável manualmente na listagem.
  - `aceito` é marcado à mão pela clínica.
  - `cancelado` é o "excluir" de um orçamento já enviado.
- **Depois de "enviado", o orçamento trava.** Qualquer ajuste vira uma
  **substituição**: cria um orçamento novo (cópia do antigo, número novo) e grava no
  antigo `substituidoPor` (id + número), exibido na listagem e na página online do
  link antigo, com link para o novo.
- **Excluir depende de já ter saído da clínica**: rascunho é apagado de verdade
  (nunca foi enviado a ninguém); um orçamento já enviado vira `cancelado`, porque o
  link que a paciente tem no WhatsApp precisa continuar existindo para avisar que
  aquele orçamento não vale mais. Cancelado perde as ações de substituir e aceitar,
  e a página pública abre com uma tarja preta de cancelamento acima de tudo.
- Um orçamento **cancelado pode ser excluído em definitivo** depois — aí o link
  passa a mostrar "orçamento não encontrado", o que a confirmação avisa antes.
- Toda confirmação usa o `ConfirmDialog` (`src/components/ConfirmDialog.tsx`), nunca
  `window.confirm`: a caixa nativa é suprimida em contextos embutidos (iframe sem
  `allow-modals`, webviews, PWA) e devolve um valor sozinha sem mostrar nada — foi
  medido retornando `false` em 1ms aqui, e passando direto em outro navegador. Ou a
  exclusão nunca acontecia, ou acontecia sem perguntar.
- Valores em **reais** (`number`), consistente com `Procedure.price` e `formatBRL`.
- O documento guarda um **retrato dos dados da clínica** (`Quote.clinica`) gravado na
  emissão: nome, tagline, cidade, telefone, e-mail, Instagram e o aviso legal. Existe
  por dois motivos — a página pública não tem login e as regras não deixam ela ler
  `clinic_settings` (que contém e-mails e UIDs de acesso das profissionais); e um
  orçamento já enviado deve preservar o contato que a paciente recebeu.

## 3. Cadastro do procedimento (`ProcedureFormModal`)

- Nova seção **"Detalhes para orçamento"**: lista livre de pares título + resposta
  (produto/marca, unidades estimadas, duração do efeito, anestesia, intervalo,
  resultado visível, retoque incluso…), com adicionar, editar e excluir.
- Os quatro campos que já existem continuam onde estão (alimentam o catálogo
  público) e entram **mesclados** como detalhes ao montar o orçamento:
  - `duration` → "Tempo em clínica"
  - `sessionsRecommended` → "Sessões"
  - `recoveryTime` → "Recuperação"
  - `areasTreated` → "Áreas tratadas" (join com ", ")

## 4. Formulário gerador (`QuoteFormModal`)

Modal com seções empilhadas, no padrão de `ProcedureFormModal` /
`ClinicSettingsModal` (`glass-card`, `glass-input`). **Tudo reativo — sem botão
"calcular".**

**Identificação**
- Número: automático, somente leitura.
- Emissão: hoje. Validade: emissão + prazo padrão configurável (30 dias), editável.
- Paciente: busca com filtro por digitação sobre o cadastro (`Patient`), preenchendo
  nome e contato; permite paciente avulso digitado na hora.
- Checkbox "Já teve avaliação" → revela campo de data; a data só aparece no PDF se o
  checkbox estiver marcado.
- **Sem "responsável pelo orçamento"**: esse campo foi removido. A única profissional
  que existe no orçamento é a de cada procedimento (seção seguinte) — nem sempre é a
  mesma pessoa que faz tudo, então não fazia sentido ter uma "responsável geral".

**Mensagem de abertura**
- Textarea pré-preenchida pelo template configurável
  (`"{primeiroNome}, abaixo está o plano que desenhamos para você. Conte com a gente
  para alcançar sua melhor versão ✨"`), totalmente editável.

**Procedimentos** (repetível, ordenável)
- Dois botões lado a lado abaixo da lista: **"+ Adicionar procedimento"** (abre a
  busca no catálogo) e **"+ Procedimento fora do catálogo"** (item em branco).
- O item nasce com categoria, título, valor (`promotionalPrice` quando houver, senão
  `price`) e os detalhes pré-preenchidos — todos editáveis, cada detalhe removível,
  com "+ adicionar campo".
- **Profissional por procedimento**: cada item tem a sua, porque nem sempre é a mesma
  pessoa que realiza tudo. Vem da atribuição do próprio procedimento no catálogo
  (`assignedDoctorIds`); sem atribuição, o item nasce sem profissional e quem emite
  escolhe na hora, item a item — não existe mais um padrão herdado do orçamento.
- Valor: editável.
- Checkbox **desconto** → digita-se o **novo valor**; o sistema calcula o percentual,
  que é o que aparece no PDF ("desconto de 11%").
- Checkbox **mais de 1 sessão** → campo de quantidade.
- **Sem nota de preço.** A linha abaixo do valor mostra apenas o desconto e, quando
  houver, a quantidade de sessões.

**Totais**
- Subtotal = soma dos valores finais.
- Checkbox **desconto plano combinado** → percentual digitado, com sugestão de
  2% × nº de procedimentos limitada ao teto configurável. Abatimento visível em
  tempo real.

**Pagamento — uma ou mais formas aceitas**
- Lista repetível de formas de pagamento, no mesmo padrão dos procedimentos: cada
  linha tem forma (Pix/Cartão/Dinheiro), desconto opcional e — se for cartão —
  parcelas e o limite de parcelas sem juros. Botão **"+ Adicionar forma de
  pagamento"**; sempre ao menos uma.
- **A primeira da lista é a principal**: o valor dela é o que aparece no bloco preto
  do total. As demais entram como alternativas logo abaixo — o mesmo padrão do
  design original ("se preferir Pix à vista"), agora generalizado para N formas em
  vez de só duas fixas.
- **Cartão parcelado com limite de parcelas sem juros**: cada forma "cartão" tem um
  campo "sem juros até quantas parcelas" (padrão: até 12×, ou seja todas). Quando o
  número de parcelas escolhido passa desse limite, o formulário, o PDF e a página
  pública mostram o aviso "sem juros até Nx" — o valor da parcela continua nominal
  (`valor ÷ parcelas`), porque sem a taxa da operadora não há como calcular o valor
  real com juros; é só um aviso de que a partir dali pode entrar juros da maquininha.
- Textarea de negociação (entrada, datas combinadas) e campo de observações — ambos
  saem como notas abaixo das formas de pagamento no PDF, aplicando-se ao orçamento
  inteiro, não a uma forma específica.

## 5. Regras de cálculo (`src/utils/quoteCalc.ts`)

```
valorFinalItem        = temDesconto ? valorComDesconto : valorTabela
percentualDesconto    = (valorTabela - valorFinalItem) / valorTabela * 100   // exibição
subtotal              = Σ valorFinalItem
descontoCombinadoValor= temDescontoCombinado ? subtotal * pct / 100 : 0
totalBruto            = subtotal - descontoCombinadoValor
```

**Pagamento — uma linha por forma aceita** (generaliza a regra híbrida original,
que valia só para "cartão principal + Pix alternativo"):

```
para cada opção de pagamento:
  descontoValor = temDesconto ? totalBruto * pct / 100 : 0
  valorFinal    = totalBruto - descontoValor
  parcelas      = forma === 'cartao' ? parcelas escolhidas : 1
  parcela       = parcelas > 1 ? valorFinal / parcelas : null
  parcelasComJurosAPartir =
    forma === 'cartao' && parcelas > parcelasSemJuros ? parcelasSemJuros + 1 : null

total = opcoesPagamento[0].valorFinal   // a primeira da lista é a principal
```

A primeira opção dá o número do bloco preto; as demais aparecem como linhas
alternativas logo abaixo, cada uma com seu próprio valor e (se cartão) o aviso de
"sem juros até Nx" quando as parcelas escolhidas passam do limite. Arredondar para
2 casas na exibição.

## 6. PDF

Layout da página 1 do design aprovado — **sem** os retângulos bege, que eram apenas
os destaques dos comentários.

Estrutura: cabeçalho (quadrado "LV" + nome da clínica + tagline/cidade | nº do
orçamento, emissão e validade) → hairline → "Preparado para" (nome, contato e, se
houver, data da avaliação), em largura inteira → mensagem de abertura → lista de
itens (categoria bronze em caixa alta, título em Cormorant, "com {profissional}" em
9,5px logo abaixo, valor de tabela riscado quando há desconto, sub-linha com
"desconto de X% · N sessões", grade de detalhes `auto-fit`
`minmax(148px, 1fr)`) → rodapé de valores em duas colunas (pagamento à esquerda,
bloco preto de subtotal/desconto combinado/total à direita) → aviso legal +
contatos da clínica.

**Multi-página:**
- Página 1: cabeçalho completo → preparado para → mensagem → itens que couberem.
- Páginas seguintes: **cabeçalho reduzido** (nº do orçamento + nome da cliente) →
  itens restantes.
- **Um item nunca é dividido** entre páginas: não coube inteiro, desce inteiro.
- **Pagamento + totais + rodapé legal andam juntos**, sempre na última página; se não
  couberem com o último item, geram página nova.
- Numeração "1/3" no canto inferior de todas as páginas.
- A distribuição é feita por **medição real de altura no DOM** (render escondido,
  mede, monta as páginas) — nunca por estimativa.

**Detalhes finos:**
- A contagem de sessões só aparece **quando for mais de 1**.
- O rótulo "A partir de" (`isStartingPrice`) do catálogo é **ignorado** no orçamento —
  aqui o valor é firme.

**Exportação:** caminho já existente — `exportElementAsPDF` de
`src/utils/exportHelpers.ts`, branch de múltiplas páginas via divs `data-pdf-page`
com largura fixa de 794px (A4 @ 96dpi), fundo `#F9F8F6`.

O botão não baixa direto: abre uma **prévia** em tamanho real (`QuotePreviewModal`)
com "Baixar PDF" dentro, para quem emite conferir antes de enviar. Na hora de
exportar, a escala da prévia volta a 1 — html2canvas mede o elemento como ele está
e capturaria distorcido um `transform: scale`. O arquivo sai como
`Nome da cliente-2026-0148.pdf`.

## 7. Página online

- URL: `?orcamento=<id>` no mesmo domínio, detectada em `App.tsx` **antes** de
  qualquer autenticação — mesmo padrão de `?anamnese=` / `?ficha=`.
- **Responsiva, mobile-first**, com o mesmo conteúdo do PDF (não é o A4 encolhido).
- Botão **"Falar com a clínica"**: abre o WhatsApp da clínica com o número do
  orçamento e o link colados na mensagem, para a secretária ou profissional
  identificar de imediato. **Não escreve nada no banco** — nenhuma escrita não
  autenticada é aberta.
- Botão de **baixar PDF** (a profissional imprime na clínica ou anexa manualmente no
  WhatsApp quando quiser).
- Validade vencida → tarja no topo ("Validade expirada em DD/MM/AAAA — fale com a
  clínica para revalidar"), com os valores ainda visíveis.
- Substituído → aviso com link para o orçamento novo.

## 8. Configurações (`ClinicSettingsModal`)

Quatro parâmetros, com os valores do design como padrão:

1. Percentual por procedimento do desconto combinado (2%) e seu teto (10%).
2. Prazo padrão de validade (30 dias).
3. Texto do aviso legal do rodapé.
4. Template da mensagem de abertura.

## 9. Arquivos do módulo

| arquivo | papel |
| --- | --- |
| `src/utils/quoteCalc.ts` | regras de cálculo, status derivado, defaults |
| `src/utils/quoteFactory.ts` | montagem de itens, detalhes e retrato da clínica |
| `src/components/quotes/QuoteFormModal.tsx` | formulário gerador |
| `src/components/quotes/QuoteItemEditor.tsx` | edição de um procedimento do orçamento |
| `src/components/quotes/QuotePaymentOptionEditor.tsx` | edição de uma forma de pagamento |
| `src/components/ConfirmDialog.tsx` | confirmação de ações destrutivas (não é `window.confirm` — ver seção 2) |
| `src/components/quotes/PatientSearchSelect.tsx` | busca de paciente |
| `src/components/quotes/ProcedureSearchAdd.tsx` | busca no catálogo para adicionar |
| `src/components/quotes/QuotePrintable.tsx` | páginas A4 + paginação medida |
| `src/components/quotes/QuotePreviewModal.tsx` | prévia e download do PDF |
| `src/components/quotes/QuoteShareModal.tsx` | link, WhatsApp e marcação de enviado |
| `src/components/quotes/QuotesPanel.tsx` | listagem, filtros e ações |
| `src/components/quotes/PublicQuoteEntry.tsx` | página da cliente (`?orcamento=`) |

## 10. Fora de escopo

- Firebase Storage / hospedagem do PDF (não existe Storage configurado no projeto;
  imagens hoje são base64 dentro do Firestore).
- Botão de aceite pela cliente na página online.
- **Cálculo real de juros no cartão**: o sistema sabe até qual parcela é sem juros e
  avisa quando a escolha passa desse limite, mas o valor da parcela continua nominal
  (`valor ÷ parcelas`) — calcular o valor real com juros exigiria a taxa da operadora,
  que o app não tem.

Implementado além do previsto originalmente: status **cancelado** (era "fora de
escopo" na versão inicial desta spec — ver seção 2), e **múltiplas formas de
pagamento por orçamento** (a versão inicial previa uma só).

## 11. Pendência anterior a este módulo

`firestore.rules` hoje mantém `patients` e `anamnesis_records` com
`allow read, write: if true`, e os IDs são gerados como `rec-${Date.now()}` /
`pat-${Date.now()}` — previsíveis. Combinado, isso permite enumerar e ler (ou
sobrescrever) dados pessoais de pacientes. Registrado como tarefa separada; **não
faz parte desta implementação**, mas o módulo de orçamentos já nasce fechado
(UUID + escrita autenticada) para não ampliar o problema.
