# Mapa corporal da Depilação a Laser — especificação fechada

Sistema de seleção de áreas de aplicação do laser sobre dois manequins (frente e
costas), usado em três lugares: **cadastro** do procedimento, **anamnese** da
paciente e **orçamento**.

Consolida as decisões da sessão de levantamento com o João (7 rodadas).

Status: **aprovado, pronto para implementar** — 2026-09-16.

---

## 0. Princípio que governa tudo

**Procedimento de laser é procedimento normal.** Aparece na lista, no catálogo, no
catálogo em PDF e na busca do orçamento como qualquer outro, com foto própria,
preço próprio e ficha própria. A única coisa que a categoria "Depilação a Laser"
acrescenta é **um passo de seleção de área** no cadastro e **um caminho a mais**
de seleção no orçamento e na anamnese. Nada é substituído; tudo é aditivo.

A categoria é o gatilho — sem marcação manual. Reaproveita `isLaserCategory()`
(`src/utils/templateMatching.ts:51`), que já governa a injeção das 19 perguntas de
segurança do laser na anamnese. Usar a mesma regra nos dois lugares impede o estado
inconsistente de um procedimento com mapa mas sem as perguntas de segurança.

---

## 1. Dados

### 1.1 Área (`LaserArea`)

Vive **dentro do próprio `Procedure`**, em `laserAreas?: LaserArea[]`. Um polígono
simplificado ocupa ~500 bytes; apagar o procedimento apaga a área junto, sem órfãos;
e o app já carrega o catálogo em memória, então o mapa monta sem leitura extra.

```ts
interface LaserArea {
  id: string;
  vista: 'frente' | 'costas';        // uma área nunca atravessa as duas vistas
  formas: number[][];                // 1..n formas; cada uma [x1,y1,x2,y2,...] em 0–1
  botao?: { x: number; y: number };  // posição arrastada à mão; ausente = automática
}
```

- **Coordenadas normalizadas 0–1**, arredondadas para **3 casas decimais** — num
  manequim de 1000px é precisão sub-pixel e corta o peso do polígono pela metade.
- **Caminho simplificado para ~40 pontos** por forma (Douglas–Peucker) no momento
  em que o laço é solto.
- **Multi-forma dentro da mesma vista**: "Axilas" são duas, "Maçã do Rosto" são
  duas. Botão "espelhar" gera o lado oposto automaticamente.
- **Nunca atravessa vistas.** Um procedimento é frente **ou** costas. "Perna
  Completa" é só frente — o manequim elucida a área, não a anatomia completa.

### 1.2 Manequins e padrões da categoria (`ClinicProfile`)

```ts
laserManequimFrenteUrl?: string;
laserManequimCostasUrl?: string;
laserPadroes?: {                   // herdados por toda área nova, ver §1.3
  recoveryTime?: string;
  contraindications?: string;
  idealCandidate?: string;
  benefits?: string[];
  images?: string[];
  quoteDetails?: QuoteItemDetail[];
  assignedDoctorIds?: string[];
};
```

### 1.3 Padrões da categoria: **vivos, com sobrescrita**

O procedimento guarda o campo **só quando ele é editado ali**; vazio = usa o padrão
da categoria, resolvido na leitura. Corrigir uma contraindicação clínica errada em
13 procedimentos é exatamente o tipo de tarefa que não se faz — e texto clínico
desatualizado num catálogo impresso é problema de verdade.

### 1.4 Anamnese (`AnamnesisRecord`)

```ts
areasSolicitadas?: LaserAreaRef[];   // o que a paciente pediu
areasConfirmadas?: LaserAreaRef[];   // o que a profissional tratou; nasce como cópia
// LaserAreaRef = { procedureId: string; nomeCurto: string }
```

**Só IDs e nomes curtos — nunca polígonos.** Dois conjuntos, não um: se a
profissional editar sobre o mesmo campo, some o registro de que a paciente pediu
virilha e saiu só com axila. É o mesmo espírito do `publicoAlvo: 'paciente' |
'medico'` que já existe nas perguntas.

### 1.5 Espelho público `clinic_settings/laser_body_map`

A paciente preenche a anamnese **sem login**, e `procedures` é
`allow read: if request.auth != null` (`firestore.rules:5`). Sem espelho, a página
pública não enxerga as áreas.

O espelho leva **só o necessário**: as 2 URLs dos manequins, e por área o
`procedureId`, o `nomeCurto`, a vista e as formas. **Nunca preço** — é a mesma tela
com dois públicos, e a tabela de preços não pode vazar para a paciente.

Mesmo padrão já usado em `clinic_settings/public_profile`, que existe pelo mesmo
motivo (a página da paciente precisa do nome da clínica mas não pode ver e-mails e
UIDs da equipe).

**Custo de cota:** ~10 KB = **10 write units** por reescrita, de um teto de
20.000/dia. Reescrever a cada "Aplicar" custa ~130 unidades numa sessão de
mapeamento — 0,65% da cota. É barato.

> **Regra travada:** o espelho só é escrito por **ação explícita da equipe**. Nunca
> em `useEffect` de carregamento, nunca de dentro de um `onSnapshot`. Ver a memória
> `firestore-free-tier-database`: 10 KB por abertura do app, vezes dezenas de
> aberturas diárias, vira consumo de fundo real.

### 1.6 Regras

- `firestore.rules`: `match /clinic_settings/laser_body_map` com
  `allow read: if true` / `allow write: if request.auth != null`, **antes** da regra
  geral de `clinic_settings` (as regras se unem por OU).
- `storage.rules`: `match /clinica/laser-manequim/{arquivo}`, leitura pública
  (a paciente vê o manequim sem login), escrita autenticada.
- Os 2 campos novos entram em `scripts/migrar-imagens-para-storage.ts`.

---

## 2. Imagens do manequim

- Duas: **corpo frente** e **corpo costas**, enviadas nas Configurações.
- **Manequins sem sexo**, aproveitados para ambos os gêneros — sem variante por
  gênero e sem condicional de gênero em lugar nenhum.
- **PNG preservado** (fundo transparente, se houver), reduzido para **1400px no
  maior lado**.
- **Cada slot preserva a própria proporção ao ser trocado**, imposta pelo
  `ImageCropperModal` que já existe. É isso que mantém as coordenadas 0–1 válidas:
  trocar a frente por uma imagem de proporção diferente jogaria a virilha na coxa.
  Depois de trocar, abre uma conferência das áreas daquela vista.

  > Frente e costas **não** precisam ter a mesma proporção entre si. As áreas da
  > frente são normalizadas contra a imagem da frente, e as das costas contra a das
  > costas — os dois sistemas de coordenadas são independentes. O primeiro envio de
  > cada slot é livre; só a troca é travada.
- **O fallback base64 do `subirImagemOuManter` é bloqueado para estes dois campos.**
  Um manequim corpo inteiro nítido pesa 400–900 KB, que em base64 vira 530 KB–1,2 MB
  — **530 a 1.200 write units numa tacada**, com o documento carregando esse peso em
  toda regravação do perfil, e risco de estourar o teto de 1 MB do documento. Se o
  Storage recusar, a tela mostra o erro e **não grava nada**.

---

## 3. Cadastro — o modo laser do `ProcedureFormModal`

Categoria = "Depilação a Laser" **libera o esquema**; o resto do formulário continua
o de sempre.

### 3.1 O ciclo

1. Manequim grande, **abas Frente / Costas** (uma vista de cada vez — é o que honra
   "grandes e nítidas"; lado a lado espremeria as duas). A aba inativa mostra
   contador: `Costas · 2`.
2. **Desenha o laço à mão livre** contornando a região; fecha sozinho e vira
   polígono preenchido.
3. Painel abre com os **6 campos essenciais**: nome, preço, preço promocional,
   observação de preço, duração, sessões. Link **"mostrar todos os campos"** expande
   para os 17 do cadastro completo, sem sair do modal.
4. **Aplicar** → grava o procedimento **na hora** (uma escrita por área, mais a
   reescrita do espelho). Painel fecha, a área vira botão no anel.
5. Pronto para o próximo laço. **Em modo laser não existe "Salvar procedimento"** —
   quem grava é o Aplicar; o modal tem só **"Fechar"**.
6. Clicar num botão existente reabre aquela área para editar.

Gravar na hora e não no fim: perder 40 minutos de desenho por uma aba fechada é um
jeito bobo de perder trabalho, e 13 escritas pequenas são irrelevantes na cota.

### 3.2 Faixa "Sem área no mapa"

Os 13 procedimentos de laser que **já existem em produção** (Buço, Queixo, Face
Lateral, Maçã do Rosto, Virilha Completa, Perianal, Linha Alba, Axilas, ½ Perna,
Perna Completa, Peitoral, Tórax, Costas) têm preço e já aparecem em orçamentos, mas
não têm área — logo, não aparecem no manequim, e é fácil desenhar "Axilas" de novo
por engano.

Faixa **"Sem área no mapa (13)"** no modo laser: clicar num nome carrega o
procedimento no painel, e o próximo laço passa a ser dele — preço e tudo preservado.
O mapeamento inicial vira treze ciclos de *clica no nome → desenha → aplica*, sem
redigitar um preço sequer e sem sair da tela.

### 3.3 Casos de borda

| Situação | Comportamento |
|---|---|
| Categoria laser, manequim ainda não enviado | Aviso com atalho para as Configurações; **o formulário normal continua funcionando**. Nunca bloquear cadastro num sistema em produção. |
| Trocar a categoria de um procedimento que tem área | **O desenho se perde**, com aviso. |
| Fechar o modal com laço desenhado e não aplicado | Aviso "você tem uma área desenhada que ainda não foi aplicada". Nunca aplicar sozinho — criaria procedimento sem nome nem preço no catálogo de produção. |
| Mapeamento em tela pequena | **Desktop apenas.** Recado claro no celular ("abra no computador para editar o mapa") em vez de uma versão capenga. Desenhar laço com o dedo em 380px e preencher 6 campos ao lado não existe. |

---

## 4. Seleção — o componente compartilhado

Um componente só, usado pela anamnese e pelo orçamento.

### 4.1 Botões em anel

- Botões distribuídos em **anel elíptico** em volta do manequim, posicionados pelo
  **ângulo do centro de cada área** em relação ao centro da imagem, com **linha guia**
  fina até a área. Sem linha guia, com 6 botões de um lado ninguém sabe qual aponta
  para onde.
- Colisão empurra o vizinho; **posição arrastada à mão** (`LaserArea.botao`) vence a
  automática.
- **Degrada para duas colunas** quando a tela não tem largura para o anel.
- **Rótulo** = título com o prefixo `"Depilação a Laser - "` cortado
  automaticamente. Sem campo de nome curto no cadastro — nomes novos já nascem
  curtos. Nome comprido quebra em duas linhas.
- **Preço no botão só no orçamento**, nunca na anamnese.

### 4.2 Cores — iguais no desktop e no celular

Duas linguagens visuais para a mesma tela confunde, e a paciente pode abrir o link
no computador.

| Estado | Aparência |
|---|---|
| Repouso | **Vermelho marca-texto**, preenchimento translúcido com contorno hachurado. Todas as áreas visíveis o tempo todo. |
| Hover (desktop) | Contorno engrossa. |
| Selecionada | **Rosa.** O botão correspondente também muda de estado. |
| Área alheia, durante a autoria | **Cinza neutro** — para não confundir com a que está sendo editada. |

As áreas são desenhadas de modo a **não se sobrepor** (cuidado tomado na autoria),
então clicar na anatomia resolve sozinho; onde houver encavalamento, vence a menor.
Clicar na anatomia **também seleciona** — no celular é o gesto natural; o botão
continua sendo o caminho garantido.

### 4.3 Celular

- **Botões acima do manequim**, nunca abaixo.
- **Chips compactos em 2 colunas**, cabendo em ~3 linhas, para o manequim entrar
  ainda na primeira tela.
- Tocar num chip **rola até o manequim** e pulsa a área — rede de segurança para
  quem estiver no meio da lista.

---

## 5. Anamnese

### 5.1 Uma ficha, não treze

Hoje `syncLaserAnamnesisTemplates()` (`databaseService.ts:733`) **recria a cada
abertura do app** uma ficha por área, cada uma com as mesmas 19 perguntas de
segurança. Uma cliente que quer axilas + virilha + meia perna recebe 3 links e
responde 3 vezes "você tem diabetes?".

Passa a existir **uma ficha "Depilação a Laser"**, nascida da `tpl-epilacao-laser`
que já está no seed, onde **o mapa é a etapa de escolha das áreas**.

- `syncLaserAnamnesisTemplates()` **para de recriar** as 13.
- As 13 ficam **ocultas, não apagadas**: fichas já preenchidas apontam para elas por
  `templateId` e deixariam de renderizar. Somem da lista e do
  `ShareAnamnesisLinkModal`, continuam resolvendo para registros antigos.
- `AnamnesisRecord.procedimentoNome` vira o guarda-chuva "Depilação a Laser"; o
  conteúdo real vive em `areasSolicitadas` / `areasConfirmadas`.

### 5.2 Ficha impressa

Sai a **lista** ("Áreas pretendidas: Axilas, Virilha Completa, ½ Perna") **e o
manequim pintado**. O desenho é o que a profissional lê em 2 segundos no
atendimento; a lista é o que se lê num texto.

O manequim sai como **SVG em linha, não imagem rasterizada** — não engorda o
documento nem esbarra no teto de 1 MB do Firestore.

---

## 6. Orçamento

### 6.1 Dois caminhos para o mesmo item

A busca "Adicionar procedimento" continua listando **as 13 áreas normalmente**, e
ganha, **fixa no topo do grupo**, a entrada guarda-chuva **"Depilação a Laser —
selecionar áreas no mapa"**, com cara diferente das demais.

Quem sabe o nome digita e acha; quem está com a paciente na frente escolhendo abre o
mapa. Os dois caminhos levam ao mesmo item.

O mapa abre em **modal que fica aberto** enquanto ela seleciona, com o **total
correndo num rodapé dentro dele** — ela vê a conta subindo a cada área.

### 6.2 Uma linha por área

Selecionar axilas + virilha + ½ perna gera **três `QuoteItem`**, cada um com seu
preço.

### 6.3 Idempotência (só no laser)

Hoje o `ProcedureSearchAdd` permite duplicar de propósito — "o mesmo procedimento
pode entrar duas vezes, por exemplo em regiões diferentes"
(`ProcedureSearchAdd.tsx:12`). **Em laser essa justificativa não existe: a região já
é o procedimento.** Axilas duas vezes é cobrar axilas duas vezes.

Para procedimentos de laser, adicionar é **idempotente**: já está na lista → não
duplica, só acende no mapa. O resto do catálogo continua podendo duplicar como hoje.

Consequência boa: **o mapa e a lista viram o mesmo estado**. Adicionar "Axilas"
digitando já acende a área no manequim, e é o que faz o controle vivo funcionar nos
dois sentidos.

### 6.4 Controle vivo, com trava

Desmarcar no mapa **remove** o item — **exceto** quando ele já foi editado (desconto,
sessões ou detalhes alterados): aí pede confirmação nomeando o que se perde.

### 6.5 Desconto combinado: laser conta como **um**

`sugerirDescontoCombinado()` (`quoteCalc.ts:183`) faz `min(nº de itens × 2%, 10%)`.
Com uma linha por área, selecionar 5 áreas sugeriria **10% — o teto** — sozinho.

Cinco itens num orçamento normal é mesmo um plano combinado (botox + preenchimento +
bioestimulador + fio + skinbooster). **Cinco áreas de laser é uma venda só.**

Todas as áreas de laser contam como **um** procedimento na sugestão: laser + botox =
2 itens, não 6. Mantém a sugestão honesta no orçamento misto e impede que o mapa
empurre sozinho todo orçamento de laser para o teto. Continua editável.

### 6.6 PDF

O manequim com as áreas contratadas sai no PDF, com **interruptor para desligar** —
orçamento de laser com o desenho vende melhor, mas nem toda profissional vai querer.

### 6.7 Ponte com a anamnese

Orçamento para uma paciente que tem ficha de laser preenchida abre com as áreas
**pré-selecionadas**, com aviso discreto ("3 áreas vindas da ficha de 14/03") e tudo
desmarcável. É o momento em que as duas pontas do pedido original viram uma coisa só.

---

## 7. Fora de escopo

- **O catálogo não muda.** Os 13 continuam 13 cards na lista e 13 entradas no
  catálogo em PDF, cada um com sua foto e seu preço — é tabela de preços, e ver
  "Axilas R$ 90" item a item é útil. Mexer no catálogo em PDF de um sistema em
  produção para resolver um problema que ninguém relatou é risco sem retorno.
- **Sem variante por gênero.** Manequins sem sexo servem aos dois.
- **Sem marcação manual de "usa mapa"** — a categoria é o gatilho.
