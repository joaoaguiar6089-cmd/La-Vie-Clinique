import { AnamnesisTemplate, Procedure } from '../types';

/**
 * Nomes iguais escritos de formas diferentes ("Botox (Toxina Botulínica)" x "botox – toxina
 * botulinica") precisam casar, senão um procedimento do catálogo que já tem ficha aparece como
 * se não tivesse. Compara sem acento, sem caixa e sem pontuação.
 */
export const chaveDeNome = (nome?: string | null): string =>
  // Tolera nome ausente porque o dado vem do Firestore, onde um campo pode simplesmente não
  // existir — uma ficha antiga, um documento gravado pela metade. Antes isto lançava
  // `Cannot read properties of undefined (reading 'normalize')` em pleno render, e uma única
  // ficha sem nome apagava a tela inteira.
  (nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * O cruzamento entre catálogo e fichas-modelo é usado em dois lugares que precisam concordar: o
 * gerenciador de fichas (que lista "procedimentos sem ficha") e o card do catálogo (que desabilita
 * o botão "Anamnese" quando não há ficha). Divergir aqui significaria um botão travado num
 * procedimento que o outro lado jura ter ficha — por isso a regra mora num lugar só.
 */
export const criarIndiceDeProcedimentos = (catalogProcedures: Procedure[]) => {
  const porId = new Map<string, Procedure>(catalogProcedures.map((p) => [p.id, p]));
  const porNome = new Map<string, Procedure>(
    catalogProcedures.map((p) => [chaveDeNome(p.title), p])
  );
  return { porId, porNome };
};

/**
 * Três estados para `procedimentoId`: um ID (vínculo explícito), `''` (desvinculado de propósito)
 * e `undefined` (ficha antiga, anterior ao campo — aí o nome é a única pista).
 */
export const procedimentoDoTemplate = (
  tpl: AnamnesisTemplate,
  indice: ReturnType<typeof criarIndiceDeProcedimentos>
): Procedure | undefined => {
  if (tpl.procedimentoId === '') return undefined;
  if (tpl.procedimentoId) {
    const porId = indice.porId.get(tpl.procedimentoId);
    if (porId) return porId;
    // ID órfão (procedimento removido do catálogo): ainda vale tentar pelo nome.
  }
  return indice.porNome.get(chaveDeNome(tpl.procedimentoNome));
};

/**
 * Detecta se uma categoria de procedimento corresponde à depilação/epilação a laser
 * (Facial, Íntima ou Corporal).
 */
export const isLaserCategory = (category?: string): boolean => {
  if (!category) return false;
  const normalizada = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (
    normalizada.includes('depilacao a laser') ||
    normalizada.includes('epilacao a laser') ||
    normalizada === 'depilacao a laser - facial' ||
    normalizada === 'depilacao a laser - intima' ||
    normalizada === 'depilacao a laser - corporal'
  );
};

/**
 * A ficha única de depilação a laser, escolhida entre as candidatas de laser.
 *
 * A depilação a laser tem **uma** ficha para as treze regiões: as 19 perguntas de segurança são
 * idênticas em todas, e a região é escolhida no manequim dentro da ficha. O que muda de buço para
 * axila é o preço — isso é assunto do catálogo, não da anamnese.
 *
 * A preferência vai para a ficha que não está amarrada a um procedimento específico: uma ficha com
 * `procedimentoId` é, por definição, de uma área só.
 */
/**
 * Esta ficha-modelo é de depilação a laser? — o gatilho do mapa corporal na anamnese.
 *
 * Olha três coisas, e não só a categoria, porque a ficha guarda-chuva nasceu no seed com a
 * categoria **"Laser & Alta Tecnologia"**, que `isLaserCategory` (desenhada para "Depilação a
 * Laser") não reconhece. Uma migração renomeia a categoria, mas depender dela significaria o
 * manequim não aparecer em nenhuma máquina onde ela não tenha rodado — e já foi assim duas vezes.
 */
export const ehTemplateDeLaser = (tpl?: AnamnesisTemplate | null): boolean =>
  !!tpl &&
  (isLaserCategory(tpl.categoria) ||
    tpl.id === 'tpl-epilacao-laser' ||
    chaveDeNome(tpl.procedimentoNome).includes('laser'));

export const fichaUnicaDeLaser = (
  templates: AnamnesisTemplate[]
): AnamnesisTemplate | undefined => {
  const candidatas = templates.filter((t) => t && !t.oculta && ehTemplateDeLaser(t));
  if (candidatas.length === 0) return undefined;

  return (
    candidatas.find((t) => t.id === 'tpl-epilacao-laser') ||
    candidatas.find((t) => chaveDeNome(t.procedimentoNome) === 'depilacao a laser') ||
    candidatas.find((t) => !t.procedimentoId) ||
    candidatas[0]
  );
};

/**
 * Fichas oferecidas para escolher e gerenciar: sem as ocultas e com **uma só** de laser.
 *
 * A regra é aplicada aqui, na exibição, e não apenas pela migração que marca `oculta` no banco. A
 * migração roda uma vez por navegador e depende de acertar o ID de cada ficha — se ela não rodar,
 * falhar ou não reconhecer um ID, as treze fichas por área voltam a aparecer no seletor. Filtrar
 * por regra torna o resultado o mesmo em qualquer máquina, tenha a migração rodado ou não.
 */
export const fichasParaEscolher = (templates: AnamnesisTemplate[]): AnamnesisTemplate[] => {
  const unica = fichaUnicaDeLaser(templates || []);
  return (templates || []).filter((t) => {
    if (!t || t.oculta) return false;
    if (!ehTemplateDeLaser(t)) return true;
    return t.id === unica?.id;
  });
};

/** Mapa procedimentoId -> ficha-modelo, para o catálogo saber quem já tem anamnese configurada. */
export const mapearTemplatesPorProcedimento = (
  templates: AnamnesisTemplate[],
  catalogProcedures: Procedure[]
): Map<string, AnamnesisTemplate> => {
  const indice = criarIndiceDeProcedimentos(catalogProcedures);
  const mapa = new Map<string, AnamnesisTemplate>();

  /**
   * As fichas que o resto do app pode oferecer — mesma regra do seletor, para as duas telas nunca
   * discordarem sobre qual ficha existe.
   *
   * Sem isto, o vínculo por `procedimentoId` mandava "Buço" para `tpl-laser-buco`; como as telas de
   * preenchimento só recebem as visíveis, o modal não achava a ficha pedida e abria a primeira da
   * lista — uma ficha de outro procedimento, sem relação nenhuma com o que foi clicado.
   */
  const visiveis = fichasParaEscolher(templates);
  const fichaDeLaser = fichaUnicaDeLaser(templates);

  // 1. Laser primeiro, e por categoria: é uma ficha para todas as áreas.
  if (fichaDeLaser) {
    catalogProcedures.forEach((proc) => {
      if (isLaserCategory(proc.category)) mapa.set(proc.id, fichaDeLaser);
    });
  }

  // 2. Vínculo direto por ID ou nome, para o resto do catálogo
  visiveis.forEach((tpl) => {
    const proc = procedimentoDoTemplate(tpl, indice);
    if (proc && !mapa.has(proc.id)) mapa.set(proc.id, tpl);
  });

  return mapa;
};
