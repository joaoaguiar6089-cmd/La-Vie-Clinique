# Modais: o que é painel, o que é folha, o que continua diálogo

Levantamento feito ao converter os formulários longos (setembro de 2026). A regra é uma só:

> **Um diálogo centralizado é bom para uma pergunta.** Para um formulário ele é o pior dos dois
> mundos — no celular abre numa caixa menor que a tela, com conteúdo rolando dentro de um
> retângulo que também rola; no desktop cobre o meio da tela e esconde a lista de onde a pessoa
> veio.

Três destinos, e o que decide é o **tamanho do conteúdo**, não a importância dele.

## Painel — `components/common/SidePanel.tsx`

Tela cheia no celular, painel de 560px encostado à direita no desktop (760px na variante
`larga`). Cabeçalho fixo, rodapé de ações fixo, corpo rolando entre os dois. Fecha por Esc, X,
véu e botão voltar do Android — e, se o formulário foi mexido, **pergunta antes**.

| Componente | Largura | Por que é painel |
| --- | --- | --- |
| `ProcedureFormModal` | larga no laser, padrão fora dele | ~1.500 linhas; no modo laser ainda tem manequim ao lado dos campos |
| `AnamnesisFormFillModal` | larga | ficha clínica inteira, com fotos e mapa corporal |
| `AttendanceFormModal` | padrão | data, hora, procedimento, plano, profissional, observações |
| `QuoteFormModal` | larga | cada procedimento é uma linha com valor, desconto e sessões |
| `FichaFillModal` | larga | avaliação e acompanhamento: perguntas da ficha mais duas imagens anotáveis |
| `EmissaoDeAvaliacao` | padrão | paciente, procedimento, data e profissional da avaliação emitida |

## Página

`ClinicSettingsModal` deixou de ser modal. Eram 700 linhas de formulário dentro de uma caixa de
672px com rolagem própria, sobre um véu preto. Virou a tela `settings`, com índice de seções no
topo (identidade, equipe, contato, catálogo, agenda, mapa do laser) e âncoras.

## Folha — `components/common/BottomSheet.tsx` e variantes

Sobe do rodapé no celular; no desktop continua centralizada. É para escolha rápida e para
confirmação: a caixa centralizada nasce longe do polegar, e no celular o botão de confirmar
acaba no meio da tela, onde a mão não chega sem trocar a pegada do aparelho.

- `ConfirmDialog` — toda confirmação e todo aviso do sistema (ver abaixo)
- Os sheets de **Criar** e **Mais** da barra de navegação inferior
- `AgendaDetalheModal`, `NewPatientModal`, `QuoteShareModal`, `ShareAnamnesisLinkModal`

## Continua diálogo centralizado

Sem mudança, porque não são formulário nem escolha: são **superfície de trabalho** ou
**documento**, e os dois querem o máximo de área em qualquer tamanho de tela.

`ImageCropperModal`, `PhotoAnnotationEditor`, `LaserAreasManagerModal`, `LaserQuoteMapModal`,
`ProcedureDetailModal`, `ShareExportModal`, `QuotePreviewModal`, `ProcedureMultiSelect`,
`ProcedureTemplatesManager`, `GeneralQuestionsManager`, `FichasModeloManager`,
`OrientationImageCard`, e os componentes de impressão (`Printable*`, `BlankAnamnesisSheet`),
que são a folha A4 na tela.

## `window.confirm` e `window.alert`

Não existem mais no projeto. A caixa nativa é suprimida em contexto embutido (iframe sem
`allow-modals`, webview, PWA) — e quando isso acontece ela **responde sozinha**, sem mostrar
nada: ou a ação nunca roda, ou roda sem perguntar. Nenhum dos dois serve para uma exclusão.

- Pergunta → `ConfirmDialog` com `ConfirmRequest`
- Aviso de uma informação só → `aviso(titulo, mensagem, tom)`, que é o mesmo diálogo com um
  botão só
- "Descartar as alterações?" → `pedidoDeDescarte`, com texto único para os cinco formulários:
  cinco versões da mesma pergunta é como se ensina a equipe a não ler o aviso
