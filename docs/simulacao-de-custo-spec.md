# Simulação de custo — especificação

Status: **implementado** — 2026-11-12.

A simulação de custo responde "quanto deste procedimento vai embora em material?". É a conta que a
profissional faz antes de acertar a parte dela com a clínica: tira do valor do procedimento o custo
dos produtos. Funciona como o custo de material do orçamento, mas sozinha, sem orçamento, sem link
e sem cliente obrigatória — e o PDF mostra tudo, inclusive o custo de cada material.

---

## 1. Onde fica e quem vê

- Aba **"Simulação de custo"** no **Financeiro**, ao lado de **"Painel"**.
- O item **Financeiro** do menu (lateral e "Mais" do celular) aparece para **toda a equipe**:
  - a **administradora** abre no Painel de sempre e troca de aba;
  - a **profissional** entra direto na simulação, sem abas — faturamento, margem e o resto do painel
    continuam só das administradoras.
- **Cada profissional vê só as simulações que ela criou.** A administradora vê as de todas, com o
  nome de quem fez no cartão ("por Carla Souza · …").
- A simulação é **de quem a criou** (`criadoPorUid`). A administradora que edita a de outra pessoa
  não a toma para si. Não há campo para escolher a profissional.

## 2. O formulário (`SimulacaoFormPanel`, painel lateral)

- **Cliente** — opcional; do cadastro ou digitada (`PatientSearchSelect`). Só sai no cabeçalho do
  PDF. A simulação **não** aparece na página da paciente.
- **Procedimentos** — um ou vários:
  - **"+ Adicionar procedimento"** busca no catálogo. O procedimento chega com as sessões do cadastro
    (`sessoesInclusas`) e os materiais do **consumo padrão × sessões**, com os preços de hoje;
  - **"+ Procedimento fora do catálogo"** entra só com o nome;
  - cada um tem **Sessões** e o botão **"Recalcular pelo consumo padrão × N sessões"**;
  - todo procedimento precisa de nome para salvar.
- **Materiais** de cada procedimento — o mesmo `EditorDeMateriais` do atendimento e do orçamento:
  produto do estoque ou **outro material** digitado (nome, unidade, quantidade, custo e valor para a
  cliente), com a caixinha **"Cadastrar este material no estoque ao salvar"**.
- O cabeçalho preto mostra o **custo dos materiais** e o **valor repassado à cliente**, e o rodapé
  da página repete por procedimento e no total.
- Salvou: abre a **prévia** do PDF.

Contas: as de `utils/estoque.ts` (custo da linha = quantidade × custo por unidade, em centavos).
Só materiais — **sem** valor cobrado, margem ou percentual da clínica.

## 3. Lista

- Data, cliente (ou "Sem cliente"), procedimentos e o custo total. Tocar abre o PDF.
- "…": **Ver PDF**, **Editar**, **Duplicar** (abre o formulário com a mesma cliente e os mesmos
  materiais, sem gravar) e **Excluir** (com confirmação).
- Busca por cliente ou procedimento a partir de seis simulações.
- **Sem número**: é conta interna, identificada pela data, pela cliente e pelos procedimentos.

## 4. PDF (`SimulacaoPrintable`)

- Mesma identidade do orçamento e do recibo (monograma, serifa, bronze, bloco preto do total).
- Cabeçalho: clínica, "Simulação de custo", data (e "Atualizada em", se editada).
- Cliente, quem fez e o **custo total dos materiais** no bloco preto, com o repassado embaixo.
- Por procedimento, uma tabela: **material · quantidade · custo/un. · custo · cliente/un. ·
  cliente**, e o total do procedimento. Material de fora do estoque leva a marca "fora do estoque".
- Resumo no fim: o custo de cada procedimento, o valor repassado e o custo total.
- **Paginação medida, por linha**: um procedimento com muitos materiais continua na folha seguinte
  com o nome repetido e "(continuação)". A medição mora no `body` (fora da prévia, que encolhe a
  folha com `scale` no celular).
- Arquivo: `Simulação de custo - <cliente ou procedimento> - <dd-mm-aaaa>.pdf`.
- **Baixar PDF** e **Compartilhar** (folha do aparelho no celular; no computador, baixa). Não há
  "Enviar à cliente": o documento é interno.

## 5. Dados e regras

- Coleção **`cost_simulations`**, uma simulação por documento (`SimulacaoDeCusto` em `types.ts`):
  cliente, procedimentos com materiais (preço congelado), totais, `criadoPorUid`, `criadoPorNome`,
  `createdAt`, `updatedAt`.
- **Zulia** (`zulia/firestore.rules`): lê e apaga a dona ou a admin; cria só no próprio nome; edita a
  dona ou a admin, sem trocar a dona. A profissional lista com `where('criadoPorUid', '==', uid)` —
  o filtro que a regra consegue conferir; a admin lista tudo.
- **La Vie, modo legado** (`firestore.rules`): só da equipe. Lá a administradora mora no perfil, não
  no login, então o "cada uma vê só as suas" é da tela.
- Nenhum material sai do estoque: o estoque não tem saldo.

## 6. Conferências

- `npx tsx scripts/verificar-simulacao-de-custo.ts` — contas, gravação, quem vê o quê, documento
  torto e paginação.
- `scripts/verificar-regras-zulia.ts` — seção "simulação de custo" (dona, admin, outra clínica).
