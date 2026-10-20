# Mapa de áreas do procedimento — especificação

Sistema de seleção de áreas sobre fotos do próprio procedimento, usado em três lugares:
**cadastro** do procedimento, **anamnese** da paciente e **orçamento**.

Nasceu como o mapa corporal da depilação a laser (sessão de levantamento com o João, 7 rodadas,
aprovada em 2026-09-16) e virou recurso genérico em 2026-10-20, quando a plataforma passou a ser
preparada para venda a outras clínicas: o que era exclusivo da depilação a laser da La Vie agora é
um checkbox no cadastro de qualquer procedimento.

---

## 0. Princípio que governa tudo

**Um procedimento pode ser vendido por área.** É o checkbox **"Exige seleção de área"**, logo
abaixo do nome no cadastro. Marcado, o próprio procedimento guarda as fotos e as áreas, cada área
com nome e preço próprios — "Depilação a Laser" com Axilas, Buço, Virilha; "Botox" com Testa,
Glabela, Pés de galinha. Nada disso fica nas Configurações: cada clínica, cada procedimento.

O checkbox é o gatilho do mapa — não a categoria. A categoria "Depilação a Laser" continua
governando o que já governava (as perguntas de segurança do laser na anamnese, a ficha única de
laser), e só.

---

## 1. Dados

### 1.1 No `Procedure`

```ts
exigeSelecaoDeArea?: boolean;
vistasDoMapa?: VistaDoMapa[];      // "Frente", "Costas", "Rosto" — nome livre, com "+"
areasDoMapa?: AreaDoProcedimento[];

interface VistaDoMapa { id; nome; fotoFemininaUrl?; fotoMasculinaUrl? }

interface AreaDoProcedimento {
  id; nome; vistaId;
  price; promotionalPrice?; priceNote?; duration?; sessoesInclusas?;
  desenhos: { feminino?: DesenhoDaArea; masculino?: DesenhoDaArea };
}

interface DesenhoDaArea {
  formas: number[][];                // 1..n formas; cada uma [x1,y1,x2,y2,...] em 0–1
  botao?: { x: number; y: number };  // posição arrastada à mão; ausente = automática
}
```

- **As áreas moram dentro do procedimento.** Um polígono simplificado ocupa ~500 bytes; apagar o
  procedimento apaga as áreas junto, sem órfãos; e o app já carrega o catálogo em memória, então
  o mapa monta sem leitura extra.
- **Cada vista tem uma foto de mulher e uma de homem**, e **cada área é desenhada nas duas
  separadamente** — as silhuetas são diferentes. Um botão "copiar do outro sexo" (por área, ou
  "copiar os que faltam" para a vista inteira) dá o ponto de partida.
- **Uma área fica numa vista só.** "Perna Completa" é só frente — a foto elucida a área, não a
  anatomia completa.
- **Multi-forma dentro da mesma vista**: "Axilas" são duas, "Maçã do Rosto" são duas. Botão
  "espelhar" gera o lado oposto automaticamente.
- **Coordenadas normalizadas 0–1**, arredondadas para **3 casas decimais**, e **caminho
  simplificado para ~40 pontos** por forma (Douglas–Peucker) no momento em que o laço é solto.
- **Preço do procedimento**: com áreas, `price` é gravado como o da área mais barata, com
  "a partir de" quando há mais de uma. Catálogo, busca e ordenação seguem lendo `price` sem saber
  de mapa nenhum.

> ⚠️ **`formas` é `number[][]` só em memória.** O Firestore **não aceita array dentro de array**,
> e este projeto tornava isso pior do que um erro: `cleanForFirestore` percorre a estrutura e, ao
> encontrar `[0.44, 0.105]`, trata como objeto e grava `{0: 0.44, 1: 0.105}`. A gravação passava
> sem erro e **o desenho simplesmente não aparecia**.
>
> Por isso cada polígono é gravado como **uma string** `"x1,y1,x2,y2"`, convertida por
> `serializarAreasDoMapa` / `desserializarAreasDoMapa` na fronteira do banco
> (`saveProcedureToDb`, `normalizeProcedureList`, o espelho público). A leitura tolera os três
> formatos que já existiram: string, array numérico cru e o `{0:…, 1:…}` achatado.

### 1.2 Fotos

- **PNG preservado** (fundo transparente, se houver), reduzido para **1400px no maior lado**, no
  Storage em `procedimentos/{id}/mapa` (leitura pública: a paciente vê a foto sem login).
- **Trocar uma foto que já tem desenho trava a proporção da atual**, imposta pelo
  `ImageCropperModal`. É isso que mantém as coordenadas 0–1 válidas: outra proporção jogaria a
  virilha na coxa. Sem desenho, o envio é livre. Tirar a foto apaga os desenhos dela (com aviso).
- **Sem fallback base64** (`subirFotosDoMapa`). Uma foto de corpo inteiro nítida pesa 400–900 KB,
  que em base64 vira 530 KB–1,2 MB — com duas por vista, o documento estoura o teto de 1 MB. Se o
  Storage recusar, a tela mostra o erro e **não grava nada**.

### 1.3 Anamnese (`AnamnesisRecord`)

```ts
areasSolicitadas?: LaserAreaRef[];   // o que a paciente pediu
areasConfirmadas?: LaserAreaRef[];   // o que a profissional tratou
// LaserAreaRef = { procedureId: string; areaId?: string; nomeCurto: string }
```

**Só IDs e nomes — nunca polígonos.** Dois conjuntos, não um: se a profissional editar sobre o
mesmo campo, some o registro de que a paciente pediu virilha e saiu só com axila.

`chaveDaRef(ref) = ref.areaId ?? ref.procedureId` — ver §1.6.

### 1.4 Orçamento

- `QuoteItem.areaId`: cada área escolhida vira um item, "Depilação a Laser — Axilas", com o preço,
  as sessões e a duração da área.
- `Quote.sexoDoMapa`: qual foto sai no PDF. Ausente = mulher.

### 1.5 Espelho público `clinic_settings/laser_body_map`

A paciente preenche a anamnese **sem login**, e `procedures` exige login. O espelho leva **um
mapa por procedimento com áreas** (`EspelhoDosMapas.mapas`): `procedureId`, título, categoria,
vistas e, por área, `id`, nome, vista e desenhos. **Nunca preço** — é a mesma tela com dois
públicos.

O ID do documento ficou o de quando só a depilação a laser tinha mapa: é o que `firestore.rules`
já libera para leitura pública, sem precisar publicar regras.

> **Regra travada:** o espelho só é escrito por **ação explícita da equipe** (salvar, arquivar ou
> excluir um procedimento com mapa). Nunca em `useEffect` de carregamento, nunca de dentro de um
> `onSnapshot`. Ver a memória `firestore-free-tier-database`.

### 1.6 Conversão do modelo antigo

Antes, **cada área de laser era um procedimento** ("Depilação a Laser - Axilas"), e os dois
manequins (sem sexo) e os "padrões da categoria" ficavam nas Configurações. Essa seção saiu das
Configurações; os campos (`laserManequim*`, `laserPadroes`, `Procedure.laserAreas`) ficam no banco
como **legado só de leitura**.

No cadastro, com "Exige seleção de área" marcado e procedimentos de laser antigos no catálogo,
aparece **"Trazer as N áreas"** (`converterProcedimentosEmAreas`):

- Cada procedimento antigo vira uma área **com o mesmo ID**. Fichas e orçamentos antigos guardam
  esse ID como `procedureId` — e é por ele que continuam achando a área, sem migrar documento
  nenhum.
- O manequim antigo vira a foto de mulher **e** de homem das vistas "Frente"/"Costas", e o desenho
  vai para os dois sexos. Preço, promocional, observação, duração e sessões vêm junto.
- Os padrões da categoria viram a descrição, contraindicações, recuperação e candidato ideal do
  procedimento (num cadastro novo substituem os exemplos; num existente, só preenchem o vazio).
- Ao salvar, os antigos são **arquivados** (`arquivado: true`), não apagados: somem de toda lista
  (`normalizeProcedureList`), mas continuam no banco.

---

## 2. Cadastro — o mapa no `ProcedureFormModal`

- Checkbox **"Exige seleção de área"** logo abaixo do nome. Marcado, o painel alarga
  (`largura="mapa"`, 1180px) e abre o `MapaDeAreasEditor`:
  1. **Fotos** — as vistas, cada uma com nome editável e os dois espaços (Mulher / Homem);
     "+ Adicionar vista". A primeira nasce "Frente".
  2. **Áreas e valores** — abas das vistas, alternador Mulher/Homem, a foto grande com as outras
     áreas em cinza. Contornar uma região abre o painel da área: nome, valor, promocional,
     observação de preço, duração e "Mais de 1 sessão". "Concluir área" põe na lista; clicar numa
     área (na lista ou no botão do anel) reabre. Interruptor **"Arrastar botões"** e "voltar à
     posição automática", por sexo.
- **Nada grava na hora**: vistas e áreas são estado do formulário e vão no "Salvar" do
  procedimento, que é um documento só. O painel lateral já pergunta antes de fechar com alteração;
  salvar com uma área aberta e não concluída é barrado.
- Com mapa, somem do formulário o valor, o promocional, o "a partir de" e as sessões do pacote —
  são de cada área. Desmarcar o checkbox avisa que as áreas saem ao salvar (marcar de novo as
  mantém).
- **Desenho só no desktop** (janela ≥ 1000px). No celular, fotos funcionam, e as áreas aparecem em
  lista com o recado "abra no computador para desenhar".

---

## 3. Seleção — o componente compartilhado

Um componente só, usado pela anamnese e pelo orçamento.

### 3.1 Botões em anel

- Botões distribuídos em **anel elíptico** em volta da foto, posicionados pelo
  **ângulo do centro de cada área** em relação ao centro da imagem, com **linha guia**
  fina até a área. Sem linha guia, com 6 botões de um lado ninguém sabe qual aponta
  para onde.
- Colisão empurra o vizinho; **posição arrastada à mão** (`DesenhoDaArea.botao`, uma por
  sexo) vence a automática.
- **Degrada para duas colunas** quando a tela não tem largura para o anel.
- **Rótulo** = o nome da área ("Axilas"). Nome comprido quebra em duas linhas.
- **Preço no botão só no orçamento**, nunca na anamnese.

### 3.2 Cores — iguais no desktop e no celular

Duas linguagens visuais para a mesma tela confunde, e a paciente pode abrir o link
no computador.

| Estado | Aparência |
|---|---|
| Repouso | **Vermelho marca-texto**, preenchimento translúcido com contorno hachurado. Todas as áreas visíveis o tempo todo. |
| Hover (desktop) | Contorno engrossa. |
| Selecionada | **Verde.** O botão correspondente também muda de estado. |
| Área alheia, durante a autoria | **Cinza neutro** — para não confundir com a que está sendo editada. |

As áreas são desenhadas de modo a **não se sobrepor** (cuidado tomado na autoria),
então clicar na anatomia resolve sozinho; onde houver encavalamento, vence a menor.
Clicar na anatomia **também seleciona** — no celular é o gesto natural; o botão
continua sendo o caminho garantido.

### 3.3 Celular

- **Botões acima da foto**, nunca abaixo.
- **Chips compactos em 2 colunas**, cabendo em ~3 linhas, para a foto entrar
  ainda na primeira tela.
- Tocar num chip **rola até a foto** e pulsa a área — rede de segurança para
  quem estiver no meio da lista.

### 3.4 Mulher ou homem

- A foto e o desenho são os do **gênero da paciente** (`Patient.genero`,
  `AnamnesisRecord.pacienteGenero`). Sem gênero informado, aparece o alternador
  **Mulher / Homem**; no orçamento ele aparece sempre, e a escolha vai gravada em
  `Quote.sexoDoMapa`.
- Se a clínica só preparou um dos dois, cai no que existe (`sexoComDesenho`) — um mapa vazio
  não ajuda ninguém a escolher.
- Abas só para a vista que tem foto **e** área desenhada naquele sexo.

---

## 4. Anamnese

### 4.1 Uma ficha, não treze

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
- **O seletor filtra por regra, não pela marca no banco.** `fichasParaEscolher()`
  descarta as ocultas *e* mantém uma só ficha de laser, decidindo pelo conteúdo: uma
  ficha de laser amarrada a um `procedimentoId`, ou com a região no nome
  ("Depilação a Laser - ½ Perna"), é de uma área só.

  A marca `oculta` depende de uma migração que roda **uma vez por navegador** e que,
  na primeira versão, reconhecia só os 13 IDs do seed (`tpl-laser-*`) — fichas criadas
  pela própria equipe nascem com `tpl-<timestamp>` e escapavam, voltando a aparecer no
  seletor. Filtrar por regra dá o mesmo resultado em qualquer máquina, tenha a
  migração rodado, falhado ou nunca começado.
- `AnamnesisRecord.procedimentoNome` vira o guarda-chuva "Depilação a Laser"; o
  conteúdo real vive em `areasSolicitadas` / `areasConfirmadas`.

### 4.2 Qual mapa a ficha mostra

`mapaDoTemplate(ficha, mapas)`: o do procedimento vinculado à ficha (`procedimentoId`); para a
ficha única de laser, que nasceu sem vínculo, o do procedimento de categoria laser que tem mapa.
A etapa "Quais áreas você quer tratar?" aparece quando a ficha tem mapa — e também na ficha de
laser sem mapa ainda, para dizer que as áreas ficam para o atendimento.

### 4.3 Ficha em branco (para imprimir e assinalar à caneta)

A folha em branco sai com **todas as vistas** do procedimento, com todas as áreas
desenhadas e **nenhuma marcada** — é o ponto: quem imprime assinala. A barra
"Incluir na folha" escolhe a foto de mulher ou de homem.

Duas decisões que só fazem sentido no papel:

- **As áreas são numeradas, com legenda ao lado.** Na tela o nome chega pelo botão do
  anel ou pelo toque; impresso não há botão nem toque, e sem número quem olha vê uma
  mancha hachurada sem saber se é linha alba ou tórax. A numeração é contínua entre as
  duas vistas, para a legenda ser uma lista só — com duas sequências começando em 1,
  um "3" no papel seria ambíguo.
- **O número vai em cada forma, não no centro da área.** O centro da área é ponderado
  entre as formas: numa região simétrica (axilas, ½ perna, maçã do rosto) ele cai
  exatamente **entre** as duas manchas, sobre o corpo nu — o número flutuava no
  esterno e nenhuma axila ficava marcada. Repetir o mesmo número nas duas é o que diz
  que elas são a mesma área.

A legenda traz quadradinho de marcar, então dá para assinalar no desenho, na lista ou
nos dois. O bloco tem interruptor próprio em "Incluir na folha".

### 4.4 Ficha impressa (preenchida)

Sai a **lista** ("Áreas pretendidas: Axilas, Virilha Completa, ½ Perna") **e a
foto pintada**, no gênero da paciente. O mapa é achado pela primeira área registrada
(`mapaDaArea`) — inclusive numa ficha de antes da conversão. O desenho é o que a
profissional lê em 2 segundos no atendimento; a lista é o que se lê num texto.

O desenho sai como **SVG em linha, não imagem rasterizada** — não engorda o
documento nem esbarra no teto de 1 MB do Firestore.

---

## 5. Orçamento

### 5.1 Dois caminhos para o mesmo item

Na busca "Adicionar procedimento", o procedimento com mapa tem cara própria —
**"selecionar áreas no mapa"** — e abre o mapa dele em vez de virar linha. Digitando,
as áreas cujo nome casa com o termo aparecem embaixo dele e entram direto.

Quem sabe o nome digita e acha; quem está com a paciente na frente escolhendo abre o
mapa. Os dois caminhos levam ao mesmo item.

O mapa abre em **modal que fica aberto** enquanto ela seleciona, com o **total
correndo num rodapé dentro dele** — ela vê a conta subindo a cada área.

### 5.2 Uma linha por área

Selecionar axilas + virilha + ½ perna gera **três `QuoteItem`**, cada um com seu
preço (`montarItemDaArea`: "Depilação a Laser — Axilas", com `areaId`).

### 5.3 Idempotência (só nas áreas)

O `ProcedureSearchAdd` permite duplicar de propósito — "o mesmo procedimento pode
entrar duas vezes, por exemplo em regiões diferentes". **Numa área essa
justificativa não existe: a região já é o item.** Axilas duas vezes é cobrar axilas
duas vezes.

Adicionar uma área é **idempotente** (`addArea`): já está na lista → não duplica, só
acende no mapa. O resto do catálogo continua podendo duplicar como sempre.

Consequência boa: **o mapa e a lista viram o mesmo estado**. Adicionar "Axilas"
digitando já acende a área no mapa, e é o que faz o controle vivo funcionar nos dois
sentidos.

### 5.4 Controle vivo, com trava

Desmarcar no mapa **remove** o item — **exceto** quando ele já foi editado (desconto,
sessões diferentes das da área, ou cálculo por consumo): aí pede confirmação nomeando o
que se perde. As sessões que o item herdou da área não contam como edição.

### 5.5 Desconto combinado: as áreas de um procedimento contam como **uma**

`sugerirDescontoCombinado()` faz `min(nº de itens × 2%, 10%)`. Com uma linha por
área, selecionar 5 áreas sugeriria **10% — o teto** — sozinho.

Cinco itens num orçamento normal é mesmo um plano combinado (botox + preenchimento +
bioestimulador + fio + skinbooster). **Cinco áreas de laser é uma venda só.**

As áreas de um mesmo procedimento contam como **um** na sugestão
(`contarProcedimentosParaDesconto`): laser + botox = 2 itens, não 6. Itens de laser de
antes da conversão (sem `areaId`) seguem contando juntos como um. Continua editável.

### 5.6 PDF

A foto com as áreas contratadas sai no PDF — **uma página por procedimento**, com o
título dele e as vistas que têm área contratada, na foto de `Quote.sexoDoMapa` — com
**interruptor para desligar**: orçamento com o desenho vende melhor, mas nem toda
profissional vai querer.

Duas decisões de implementação, ambas tomadas para não pôr em risco o que já roda:

- **É uma página própria, anexada no fim**, e não um bloco no meio do documento. O
  `paginar()` de `QuotePrintable` distribui blocos de altura medida entre as páginas
  e é o que segura o layout aprovado; enfiar ali um bloco de altura variável
  arriscaria a paginação de **todo** orçamento da clínica, inclusive os que não têm
  área nenhuma. Como página anexa, o pior caso é uma folha a mais.
- **O mapa não é copiado para dentro do orçamento.** Só o interruptor
  (`Quote.mostrarMapaCorporal`, um booleano) fica gravado; os polígonos chegam por
  prop na hora de imprimir — do catálogo no painel, do espelho público na página da
  paciente. Copiar ~10 KB de mapa para cada orçamento emitido custaria dez write
  units por documento para guardar N vezes a mesma coisa.

  A consequência aceita é que redesenhar uma área muda o desenho de orçamentos
  antigos. Para anatomia isso é inofensivo — ao contrário do preço e do contato da
  clínica, que continuam congelados em `quote.clinica` justamente por não serem.

### 5.7 Ponte com a anamnese

Orçamento para uma paciente que tem ficha com áreas preenchida abre com as áreas
**pré-selecionadas**, com aviso discreto ("3 áreas vindas da ficha de 14/03") e tudo
desmarcável — a foto do mapa já no gênero da ficha. É o momento em que as duas pontas
do pedido original viram uma coisa só.

---

## 6. Catálogo

O procedimento com áreas é **um card**, com "a partir de" a área mais em conta. A tabela
**"Áreas e valores"** (`ListaDeAreasEValores`) aparece no detalhe, no cartão e no catálogo em
PDF — onde ocupa o lugar dos benefícios, que não cabem junto no card de altura fixa.

---

## 7. Fora de escopo

- **Editar o desenho no celular.** Desenhar laço com o dedo em 380px e preencher os campos ao
  lado não existe; no celular o cadastro mostra a lista e pede o computador.
- **Ajustar o contorno ponto a ponto.** O laço se desfaz ("Desfazer", "Limpar") e se refaz;
  arrastar vértices de um polígono pronto é outra ferramenta, para quando alguém sentir falta.
