import {
  AnamnesisQuestion,
  AnamnesisRecord,
  AnamnesisTemplate,
  Attendance,
  EvaluationTemplate,
  Procedure,
} from '../types';
import {
  chaveDeNome,
  ehTemplateDeLaser,
  fichaUnicaDeLaser,
  fichasParaEscolher,
  isLaserCategory,
} from './templateMatching';
import { paraArray } from './firestoreShapes';
import { ehRealizado, hojeISO } from './attendances';

/**
 * As regras da ficha de avaliação: quando ela abre, qual ficha-modelo vale para cada atendimento,
 * e o que uma avaliação preenchida passa a travar na anamnese.
 *
 * Mora fora dos componentes porque quatro telas precisam concordar sobre isso — a linha do
 * atendimento, a fila de pendentes, o formulário de preenchimento e o formulário público da
 * paciente. Discordar aqui significaria um selo de "avaliada" numa visita cuja ficha não abre.
 */

// ==========================================
// QUANDO A AVALIAÇÃO ABRE
// ==========================================

/**
 * O atendimento aconteceu? — a trava que libera o formulário para a profissional.
 *
 * São **dois** eixos, e não só a data. A data resolve o óbvio (não se avalia o que ainda não
 * aconteceu), mas o corte é `<= hoje` e não `< hoje`: a recepção lança a visita no mesmo dia em
 * que ela acontece, e exigir data estritamente anterior obrigaria a profissional a esperar até
 * amanhã para escrever o que viu hoje — justamente quando ela lembra.
 *
 * O segundo eixo é o desfecho. Um agendamento marcado `faltou` ou `remarcado` tem data passada e
 * atendimento nenhum: pela data sozinha ele abriria ficha de avaliação de uma visita que não
 * existiu.
 */
export const avaliacaoLiberada = (a: Attendance): boolean =>
  !!a.data && a.data <= hojeISO() && ehRealizado(a);

/**
 * A ficha continua à vista mesmo com a data no futuro, uma vez que exista conteúdo.
 *
 * `avaliacaoLiberada` governa a **abertura** de avaliação nova. Se alguém corrigir a data de uma
 * visita já avaliada para a semana que vem, esconder o que já está gravado faria o dado sumir
 * sem ninguém perceber que sumiu — e o caminho de uma data digitada errado é corrigi-la, não
 * fazer o documento clínico desaparecer.
 */
export const avaliacaoVisivel = (a: Attendance): boolean =>
  !!a.avaliacaoPreenchidaEm || avaliacaoLiberada(a);

/** Aconteceu, está liberado e ninguém preencheu — o trabalho pendente. */
export const avaliacaoPendente = (a: Attendance): boolean =>
  avaliacaoLiberada(a) && !a.avaliacaoPreenchidaEm;

/**
 * Quantos dias para trás a fila de pendentes enxerga.
 *
 * Existe porque, sem janela, a fila nasce no dia 1 com todo atendimento já lançado na história da
 * clínica — centenas de linhas que ninguém vai preencher, e um contador no menu que mente desde o
 * primeiro minuto. A alternativa seria cortar pela data de lançamento da funcionalidade, um número
 * mágico que não quer dizer nada daqui a seis meses; a janela móvel continua fazendo sentido
 * sozinha, e a tela oferece alargar.
 */
export const JANELA_PENDENTES_DIAS = 30;

export const diasAtras = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Atendimentos que aconteceram e ainda não têm avaliação, do mais recente para o mais antigo.
 *
 * `janelaDias` indefinido = sem corte, que é o que o filtro "ver tudo" da tela usa.
 */
export const filaDePendentes = (
  atendimentos: Attendance[],
  janelaDias: number | undefined = JANELA_PENDENTES_DIAS
): Attendance[] => {
  const corte = janelaDias === undefined ? undefined : diasAtras(janelaDias);
  return (atendimentos || [])
    .filter((a) => avaliacaoPendente(a) && (!corte || a.data >= corte))
    .sort((x, y) => (y.data || '').localeCompare(x.data || ''));
};

// ==========================================
// QUAL FICHA-MODELO VALE
// ==========================================

/** Categoria sem acento e sem caixa, para o vínculo por categoria não depender de digitação. */
const chaveDeCategoria = (c?: string): string => chaveDeNome(c);

/**
 * O procedimento do catálogo por trás de um atendimento.
 *
 * O ID é opcional e o nome é texto livre: o atendimento de procedimento digitado à mão não tem
 * vínculo nenhum com o catálogo, e é por isso que o nome normalizado é a segunda tentativa —
 * mesma escada de `procedimentoDoTemplate`.
 */
export const procedimentoDoAtendimento = (
  alvo: { procedureId?: string; procedimentoNome: string },
  catalogo: Procedure[]
): Procedure | undefined => {
  if (alvo.procedureId) {
    const porId = (catalogo || []).find((p) => p.id === alvo.procedureId);
    if (porId) return porId;
    // ID órfão (procedimento saiu do catálogo): ainda vale tentar pelo nome.
  }
  const chave = chaveDeNome(alvo.procedimentoNome);
  return (catalogo || []).find((p) => chaveDeNome(p.title) === chave);
};

/**
 * A ficha de avaliação de um atendimento — **específica primeiro, categoria depois**.
 *
 * A ordem é o contrário de `mapearTemplatesPorProcedimento`, onde o laser resolve por categoria
 * antes do vínculo direto. Lá está certo: as treze fichas por área estavam sendo aposentadas de
 * propósito, e o vínculo direto sobrevivente apontava para a ficha errada. Aqui é o oposto — quem
 * se deu ao trabalho de criar ficha para uma área só quis sobrepor a da categoria, e a regra
 * geral perder para a exceção é o que torna a exceção possível.
 *
 * Devolve `undefined` quando não há ficha: a tela mostra observações e um atalho para cadastrar,
 * nunca um vazio sem saída.
 */
export const fichaDeAvaliacaoPara = (
  alvo: { procedureId?: string; procedimentoNome: string },
  fichas: EvaluationTemplate[],
  catalogo: Procedure[]
): EvaluationTemplate | undefined => {
  const lista = fichas || [];
  const proc = procedimentoDoAtendimento(alvo, catalogo);

  const idAlvo = proc?.id || alvo.procedureId;
  if (idAlvo) {
    const especifica = lista.find((f) => (f.procedureIds || []).includes(idAlvo));
    if (especifica) return especifica;
  }

  const catAlvo = chaveDeCategoria(proc?.category);
  if (catAlvo) {
    const porCategoria = lista.find((f) =>
      (f.categorias || []).some((c) => chaveDeCategoria(c) === catAlvo)
    );
    if (porCategoria) return porCategoria;
  }

  return undefined;
};

/**
 * As perguntas de uma avaliação, na ordem em que saem na tela: primeiro as gerais (valem para
 * toda avaliação, venham de onde vier o procedimento), depois as da ficha específica.
 *
 * As gerais aparecem mesmo sem ficha específica. Hoje isso não muda nada — a clínica começa sem
 * nenhuma pergunta geral cadastrada, então um procedimento sem ficha mostra só observações, como
 * combinado. A regra existe para a pergunta geral cadastrada amanhã não ficar invisível
 * justamente nos procedimentos que ninguém configurou.
 */
export const perguntasDaAvaliacao = (
  gerais: AnamnesisQuestion[],
  ficha?: EvaluationTemplate
): AnamnesisQuestion[] => [...(gerais || []), ...((ficha?.perguntas as AnamnesisQuestion[]) || [])];

/**
 * Só o que foi respondido, para congelar no registro.
 *
 * Guardar a ficha-modelo inteira significaria pagar KB por pergunta em branco em toda avaliação —
 * e a cota do Firestore aqui é por KB gravado. Vazio, `false` e `0` contam como resposta; `0` numa
 * escala é nota, não ausência.
 */
export const perguntasRespondidas = (
  perguntas: AnamnesisQuestion[],
  respostas: Record<string, any>
): AnamnesisQuestion[] =>
  (perguntas || []).filter((q) => {
    const v = (respostas || {})[q.id];
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });

// ==========================================
// O QUE A AVALIAÇÃO TRAVA NA ANAMNESE
// ==========================================

/** "2026-09-21T14:03:00.000Z" -> "2026-09-21". Tolera ISO e data pura. */
const diaDoISO = (iso?: string): string => (iso || '').slice(0, 10);

/**
 * O mesmo tratamento? Igual ao `mesmoProcedimento` dos atendimentos, adaptado ao nome do campo na
 * anamnese (`procedimentoId`, não `procedureId`).
 */
const mesmoTratamento = (
  ficha: Pick<AnamnesisRecord, 'procedimentoId' | 'procedimentoNome'>,
  a: Attendance
): boolean => {
  if (ficha.procedimentoId && a.procedureId) return ficha.procedimentoId === a.procedureId;
  return chaveDeNome(ficha.procedimentoNome) === chaveDeNome(a.procedimentoNome);
};

/**
 * A anamnese fechou para a paciente? — o que substituiu `profissionalPreenchidoEm`.
 *
 * Até aqui, o link público travava quando a profissional preenchia a parte dela **dentro da
 * anamnese**. Tirando essas perguntas de lá, esse campo nunca mais seria escrito em ficha nova, e
 * o link ficaria aberto para sempre: a paciente poderia reabrir semanas depois do procedimento e
 * reescrever o histórico de saúde em que a profissional se baseou para tratar, sem deixar rastro.
 *
 * A pergunta é respondida por **dois campos do próprio registro**, e não pela lista de
 * atendimentos, por uma razão de permissão: `attendances` exige login (`firestore.rules`), e quem
 * abre o link não tem conta. Uma trava que dependesse de ler atendimentos simplesmente não
 * existiria justamente na tela onde ela precisa valer.
 *
 * Quem escreve `encerradaEm` é o app da equipe, no momento em que o atendimento é salvo — ver
 * `anamnesesAFechar()`. `profissionalPreenchidoEm` continua sendo respeitado: nada que já está
 * travado hoje destrava por causa da mudança.
 */
export const anamneseFechada = (
  ficha: Pick<AnamnesisRecord, 'profissionalPreenchidoEm' | 'encerradaEm'>
): boolean => !!ficha.profissionalPreenchidoEm || !!ficha.encerradaEm;

/**
 * As anamneses que um atendimento recém-salvo fecha.
 *
 * Roda no app da equipe, onde os atendimentos estão à mão, e grava `encerradaEm` no registro —
 * é o que leva a informação até a página pública, que não pode consultar atendimento nenhum.
 *
 * Só conta atendimento **realizado**, com data até hoje, do mesmo tratamento, e **a partir do dia
 * em que a ficha nasceu** — senão uma visita de janeiro travaria a anamnese preenchida em março.
 */
export const anamnesesAFechar = (
  atendimento: Attendance,
  fichas: AnamnesisRecord[]
): AnamnesisRecord[] => {
  if (!ehRealizado(atendimento) || !atendimento.data || atendimento.data > hojeISO()) return [];

  return (fichas || []).filter((f) => {
    if (f.pacienteId !== atendimento.pacienteId) return false;
    if (anamneseFechada(f)) return false;
    const nascimento = diaDoISO(f.createdAt) || diaDoISO(f.dataAtendimento);
    if (nascimento && atendimento.data < nascimento) return false;
    return mesmoTratamento(f, atendimento);
  });
};


// ==========================================
// A MIGRAÇÃO: O QUE SAI DA ANAMNESE
// ==========================================

/** Marca gravada em `clinic_settings/migrations` e em cada ficha tocada. */
export const MIGRACAO_AVALIACAO = 'avaliacao-separada-da-anamnese-v1';

/** Da pergunta, o público a que ela pertencia no modelo antigo. Ausente = paciente. */
const ehDaProfissional = (q: AnamnesisQuestion): boolean =>
  (q.publicoAlvo || 'paciente') === 'medico';

/** As categorias de laser presentes no catálogo — o vínculo da ficha única de laser. */
export const categoriasDeLaserDoCatalogo = (catalogo: Procedure[]): string[] =>
  Array.from(
    new Set<string>((catalogo || []).filter((p) => isLaserCategory(p.category)).map((p) => p.category))
  );

export interface PlanoDeMigracao {
  /** A ficha de avaliação a criar. */
  ficha: EvaluationTemplate;
  /** O que sobra em `perguntasEspecificas` da anamnese, já renumerado. */
  perguntasQueFicam: AnamnesisQuestion[];
}

/**
 * O que fazer com **uma** ficha de anamnese na migração — a decisão, sem nenhum acesso ao banco.
 *
 * Mora aqui, e não dentro de `migrarPerguntasProfissionalParaAvaliacao`, para poder ser conferida
 * sem subir o Firebase: é o que `scripts/verificar-migracao-avaliacao.ts` exercita. Uma migração
 * que roda uma vez só por clínica e não pode ser desfeita com um clique não deveria estrear em
 * produção sem ninguém nunca ter visto o que ela produz.
 *
 * Devolve `null` quando a ficha não tem nada a mover.
 */
/**
 * As fichas que a migração deve processar.
 *
 * Usa `fichasParaEscolher`, e **não** `!tpl.oculta`, porque a marca `oculta` pode simplesmente não
 * existir: ela é escrita por outra migração, que roda uma vez por navegador. No banco da clínica
 * hoje, nenhuma das treze fichas de laser por área está marcada — e cada uma delas ainda carrega
 * as 6 perguntas da profissional. Filtrar pela marca criaria catorze fichas de avaliação de laser
 * idênticas, todas disputando a mesma categoria, que é a duplicação que aposentar as treze fichas
 * resolveu. A regra vale em qualquer máquina; a marca, não.
 */
export const fichasAMigrar = (templates: AnamnesisTemplate[]): AnamnesisTemplate[] =>
  fichasParaEscolher(templates || []);

export const planejarMigracaoDaFicha = (
  tpl: AnamnesisTemplate,
  catalogo: Procedure[],
  categoriasDeLaser: string[] = categoriasDeLaserDoCatalogo(catalogo)
): PlanoDeMigracao | null => {
  /**
   * `paraArray` e não `|| []`: em banco real, `perguntasEspecificas` volta como **mapa de chaves
   * numéricas** (`{0: …, 1: …}`) em documento vindo de backup reimportado — a ficha guarda-chuva
   * do laser está exatamente assim hoje. O TypeScript continua jurando que é array, e o `.filter`
   * lançaria no meio da migração, deixando-a pela metade.
   */
  const perguntas = paraArray<AnamnesisQuestion>(
    (tpl as unknown as Record<string, unknown>).perguntasEspecificas
  );
  const daProfissional = perguntas.filter(ehDaProfissional);
  if (daProfissional.length === 0) return null;

  /**
   * Vínculo: laser pela categoria inteira (uma ficha para as treze áreas, como a anamnese já
   * faz), o resto pelo procedimento. Quando nada resolve, a ficha nasce **sem vínculo** e o
   * gerenciador a mostra em vermelho para a equipe ligar à mão — chutar um procedimento errado
   * seria pior do que deixar explícito que falta configurar.
   */
  let procedureIds: string[] = [];
  let categorias: string[] = [];

  if (ehTemplateDeLaser(tpl)) {
    categorias = categoriasDeLaser.length > 0 ? categoriasDeLaser : ['Depilação a Laser'];
  } else {
    const porId = tpl.procedimentoId
      ? (catalogo || []).find((p) => p.id === tpl.procedimentoId)
      : undefined;
    const porNome = (catalogo || []).find(
      (p) => chaveDeNome(p.title) === chaveDeNome(tpl.procedimentoNome)
    );
    const alvo = porId || porNome;
    if (alvo) procedureIds = [alvo.id];
  }

  return {
    ficha: {
      id: `aval-${tpl.id}`,
      nome: `Avaliação — ${tpl.procedimentoNome || 'Sem nome'}`,
      procedureIds,
      categorias,
      perguntas: daProfissional.map((q, i) => ({ ...q, ordem: i + 1 })),
      temFotoSessao: true,
      // Só a referência da imagem; nada é reenviado ao Storage. Os campos **continuam** na ficha
      // de anamnese: `BlankAnamnesisSheet` ainda os lê para imprimir folha em branco.
      fotoModeloUrl: tpl.fotoModeloUrl,
      fotoModeloFemininoUrl: tpl.fotoModeloFemininoUrl,
      fotoModeloMasculinoUrl: tpl.fotoModeloMasculinoUrl,
      descricao: 'Migrada da ficha de anamnese. Preenchida a cada atendimento.',
      migracoesAplicadas: [MIGRACAO_AVALIACAO],
    },
    perguntasQueFicam: perguntas
      .filter((q) => !ehDaProfissional(q))
      .map((q, i) => ({ ...q, ordem: i + 1 })),
  };
};


/** As perguntas de uma ficha, tolerando o campo gravado como mapa de chaves numéricas. */
const perguntasDaFicha = (tpl: AnamnesisTemplate): AnamnesisQuestion[] =>
  paraArray<AnamnesisQuestion>(
    (tpl as unknown as Record<string, unknown>).perguntasEspecificas
  );

export interface AnamneseAtualizada {
  id: string;
  /** O que sobra em `perguntasEspecificas`, já renumerado. */
  perguntasQueFicam: AnamnesisQuestion[];
}

export interface PlanoDaMigracao {
  fichas: EvaluationTemplate[];
  anamneses: AnamneseAtualizada[];
}

/**
 * O plano da migração para a **coleção inteira** — e não ficha a ficha, por causa do laser.
 *
 * A família do laser colapsa numa avaliação só, ligada à categoria: as perguntas da profissional
 * (fototipo, cor e espessura do pelo) são as mesmas em qualquer área, e é a mesma razão pela qual
 * a anamnese do laser já é uma só para as treze regiões.
 *
 * O detalhe que obriga a varrer a família inteira, inclusive as fichas aposentadas: na clínica, as
 * perguntas da profissional do laser não estão na ficha guarda-chuva — estão numa ficha por área,
 * quatro delas cadastradas à mão pela equipe (ids `esp-…`). Processar só as fichas visíveis
 * deixaria esse trabalho para trás e o laser sem avaliação nenhuma. Como tudo vira uma ficha só,
 * varrer as aposentadas não recria duplicação nenhuma.
 *
 * Fora do laser, cada ficha visível vira a sua própria avaliação. Aposentada que não é de laser
 * fica de fora: não há para onde consolidá-la, e ela não renderiza em preenchimento nenhum.
 */
export const planejarMigracao = (
  templates: AnamnesisTemplate[],
  catalogo: Procedure[]
): PlanoDaMigracao => {
  const todas = templates || [];
  const categoriasDeLaser = categoriasDeLaserDoCatalogo(catalogo);
  const fichas: EvaluationTemplate[] = [];
  const anamneses: AnamneseAtualizada[] = [];

  // ---- laser: uma ficha para a família toda ----
  const familiaDeLaser = todas.filter((t) => ehTemplateDeLaser(t));
  const perguntasDoLaser: AnamnesisQuestion[] = [];
  const vistas = new Set<string>();

  familiaDeLaser.forEach((tpl) => {
    const perguntas = perguntasDaFicha(tpl);
    const daProfissional = perguntas.filter(ehDaProfissional);
    if (daProfissional.length === 0) return;

    daProfissional.forEach((q) => {
      // Dedupe por id: as áreas repetem o mesmo bloco, e a ficha final não pode perguntar o
      // fototipo treze vezes.
      if (vistas.has(q.id)) return;
      vistas.add(q.id);
      perguntasDoLaser.push(q);
    });

    anamneses.push({
      id: tpl.id,
      perguntasQueFicam: perguntas
        .filter((q) => !ehDaProfissional(q))
        .map((q, i) => ({ ...q, ordem: i + 1 })),
    });
  });

  if (perguntasDoLaser.length > 0) {
    const guardaChuva = fichaUnicaDeLaser(todas) || familiaDeLaser[0];
    fichas.push({
      id: 'aval-epilacao-laser',
      nome: 'Avaliação — Depilação a Laser',
      procedureIds: [],
      categorias: categoriasDeLaser.length > 0 ? categoriasDeLaser : ['Depilação a Laser'],
      perguntas: perguntasDoLaser.map((q, i) => ({ ...q, ordem: i + 1 })),
      temFotoSessao: true,
      fotoModeloUrl: guardaChuva?.fotoModeloUrl,
      fotoModeloFemininoUrl: guardaChuva?.fotoModeloFemininoUrl,
      fotoModeloMasculinoUrl: guardaChuva?.fotoModeloMasculinoUrl,
      descricao: 'Migrada das fichas de anamnese do laser. Preenchida a cada sessão.',
      migracoesAplicadas: [MIGRACAO_AVALIACAO],
    });
  }

  // ---- o resto: uma avaliação por ficha visível ----
  fichasParaEscolher(todas)
    .filter((t) => !ehTemplateDeLaser(t))
    .forEach((tpl) => {
      const plano = planejarMigracaoDaFicha(tpl, catalogo, categoriasDeLaser);
      if (!plano) return;
      fichas.push(plano.ficha);
      anamneses.push({ id: tpl.id, perguntasQueFicam: plano.perguntasQueFicam });
    });

  return { fichas, anamneses };
};
