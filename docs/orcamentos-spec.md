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
- Status: `rascunho` · `enviado` · `aceito` · `expirado`.
  - `expirado` é **calculado na hora** (comparando `dataValidade` com hoje), nunca
    gravado — sem job agendado.
  - `enviado` é marcado **automaticamente** no primeiro compartilhamento do link,
    e continua editável manualmente na listagem.
  - `aceito` é marcado à mão pela clínica.
- **Depois de "enviado", o orçamento trava.** Qualquer ajuste vira uma
  **substituição**: cria um orçamento novo (cópia do antigo, número novo) e grava no
  antigo `substituidoPor` (id + número), exibido na listagem e na página online do
  link antigo, com link para o novo.
- **Sem status "cancelado" e sem exclusão de orçamentos enviados.** Rascunho pode ser
  excluído.
- Valores em **reais** (`number`), consistente com `Procedure.price` e `formatBRL`.

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
- Profissional responsável: select de `clinic.professionals`.

**Mensagem de abertura**
- Textarea pré-preenchida pelo template configurável
  (`"{primeiroNome}, abaixo está o plano que desenhamos para você. Conte com a gente
  para alcançar sua melhor versão ✨"`), totalmente editável.

**Procedimentos** (repetível, ordenável)
- Seleção com busca no catálogo. O item nasce com categoria, título, valor
  (`promotionalPrice` quando houver, senão `price`), nota de preço e os detalhes
  pré-preenchidos — todos editáveis, cada detalhe removível, com "+ adicionar campo".
- Valor: editável.
- Checkbox **desconto** → digita-se o **novo valor**; o sistema calcula o percentual,
  que é o que aparece no PDF ("desconto de 11%").
- Checkbox **mais de 1 sessão** → campo de quantidade.
- Nota de preço curta: "por aplicação", "pacote fechado", "por sessão".

**Totais**
- Subtotal = soma dos valores finais.
- Checkbox **desconto plano combinado** → percentual digitado, com sugestão de
  2% × nº de procedimentos limitada ao teto configurável. Abatimento visível em
  tempo real.

**Pagamento**
- Forma: Pix · Cartão · Dinheiro.
- Cartão → parcelas de 1× a 12×, **sem juros**: parcela = total ÷ parcelas, exibida
  como `N × R$ x,xx` e rotulada "N× sem juros".
- Checkbox de desconto com percentual.
- Textarea de negociação (entrada, datas combinadas) e campo de observações — ambos
  saem como notas abaixo das formas de pagamento no PDF.

## 5. Regras de cálculo (`src/utils/quoteCalc.ts`)

```
valorFinalItem        = temDesconto ? valorComDesconto : valorTabela
percentualDesconto    = (valorTabela - valorFinalItem) / valorTabela * 100   // exibição
subtotal              = Σ valorFinalItem
descontoCombinadoValor= temDescontoCombinado ? subtotal * pct / 100 : 0
totalBruto            = subtotal - descontoCombinadoValor
```

**Desconto de pagamento — regra híbrida** (é o que faz o design bater):

- forma = **Pix ou dinheiro** com desconto → o desconto entra no total.
  `total = totalBruto - (totalBruto * pct / 100)`
- forma = **cartão** com desconto à vista → o bloco preto mostra o valor no cartão
  (`total = totalBruto`) e o PDF ganha a linha alternativa
  *"Se preferir Pix ou dinheiro à vista — X% de desconto: R$ Y"*.
- `parcela = forma === 'cartao' ? total / parcelas : null`

Arredondar para 2 casas na exibição.

## 6. PDF

Layout da página 1 do design aprovado — **sem** os retângulos bege, que eram apenas
os destaques dos comentários.

Estrutura: cabeçalho (quadrado "LV" + nome da clínica + tagline/cidade | nº do
orçamento, emissão e validade) → hairline → "Preparado para" (nome, contato e, se
houver, data da avaliação) | "Profissional responsável" em coluna separada →
mensagem de abertura → lista de itens (categoria bronze em caixa alta, título em
Cormorant, valor de tabela riscado quando há desconto, sub-linha com
"desconto de X% · N sessões · nota de preço", grade de detalhes `auto-fit`
`minmax(148px, 1fr)`) → rodapé de valores em duas colunas (pagamento à esquerda,
bloco preto de subtotal/desconto combinado/total à direita) → aviso legal +
contatos da clínica.

**Multi-página:**
- Página 1: cabeçalho completo → preparado para + profissional → mensagem → itens
  que couberem.
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

## 9. Ordem de implementação

1. Tipos (`src/types.ts`) + `src/utils/quoteCalc.ts`
2. Detalhes para orçamento no cadastro do procedimento
3. Formulário gerador
4. PDF e algoritmo de paginação
5. Persistência (`quotes`, counters, regras) e listagem
6. Página online

## 10. Fora de escopo

- Firebase Storage / hospedagem do PDF (não existe Storage configurado no projeto;
  imagens hoje são base64 dentro do Firestore).
- Botão de aceite pela cliente na página online.
- Juros no cartão.
- Status "cancelado".

## 11. Pendência anterior a este módulo

`firestore.rules` hoje mantém `patients` e `anamnesis_records` com
`allow read, write: if true`, e os IDs são gerados como `rec-${Date.now()}` /
`pat-${Date.now()}` — previsíveis. Combinado, isso permite enumerar e ler (ou
sobrescrever) dados pessoais de pacientes. Registrado como tarefa separada; **não
faz parte desta implementação**, mas o módulo de orçamentos já nasce fechado
(UUID + escrita autenticada) para não ampliar o problema.
