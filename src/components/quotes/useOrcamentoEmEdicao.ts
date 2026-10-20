import { useEffect, useMemo, useState } from 'react';
import {
  AreaDoProcedimento,
  ClinicProfile,
  ConsumoPadrao,
  MaterialUsado,
  Patient,
  PatientGender,
  Procedure,
  ProdutoDeEstoque,
  Quote,
  QuoteDraft,
  QuoteItem,
  QuotePaymentOption,
} from '../../types';
import {
  calcularOrcamento,
  calcularDataValidade,
  itemEhProduto,
  itemQuantidade,
  itemSessoes,
  montarTextoApresentacao,
  sugerirDescontoCombinado,
  contarProcedimentosParaDesconto,
} from '../../utils/quoteCalc';
import {
  criarOpcaoPagamento,
  montarItemAvulso,
  montarItemDaArea,
  montarItemDoProcedimento,
  montarItemDoProduto,
  montarSnapshotClinica,
  sessoesDoProcedimento,
} from '../../utils/quoteFactory';
import {
  getCustoDoOrcamento,
  getRecordsForPatient,
  subscribeToConsumosPadrao,
  subscribeToProdutosDeEstoque,
} from '../../services/databaseService';
import {
  CustoEmEdicao,
  LinhaDeMaterial,
  aplicarConsumoNoItem,
  materiaisDoItem,
  tirarConsumoDoItem,
} from '../../utils/estoque';
import { isLaserCategory } from '../../utils/templateMatching';
import { chaveDaRef, procedimentoTemMapa } from '../../utils/laserAreas';
import { procedimentoDoAtendimento } from '../../utils/evaluations';

/** `input type="date"` fala YYYY-MM-DD; o documento guarda ISO. */
export const toDateInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Meio-dia local: evita o campo de data voltar um dia ao virar para UTC. */
export const fromDateInput = (value: string): string => {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
};

/** A avaliação que monta o orçamento: de quem, de quê, de quando e quem avaliou. */
export interface AvaliacaoDoOrcamento {
  pacienteId?: string;
  pacienteNome: string;
  pacienteContato?: string;
  procedureId?: string;
  procedimentoNome: string;
  /** YYYY-MM-DD (ou ISO) do dia da avaliação. */
  data: string;
  professionalId?: string;
  /** A avaliação personalizada não é de um procedimento do catálogo: a lista começa vazia. */
  semItem?: boolean;
}

interface OpcoesDoOrcamento {
  aberto: boolean;
  quoteToEdit?: Quote | null;
  /** Itens iniciais ao duplicar ou substituir — o número é novo, o conteúdo vem pronto. */
  seedFrom?: Quote | null;
  /** Paciente já escolhida ao abrir um orçamento em branco. Ignorada com `quoteToEdit`/`seedFrom`. */
  initialPatient?: Patient | null;
  /**
   * O orçamento mora dentro da ficha de avaliação: a lista nasce do consumo estimado ali, e as
   * áreas da anamnese não entram por cima.
   */
  daAvaliacao?: boolean;
  procedures: Procedure[];
  clinic: ClinicProfile;
}

/**
 * O orçamento em edição — tudo o que o formulário de orçamento guarda e faz, fora da tela.
 *
 * Mora fora do `QuoteFormModal` porque a ficha de avaliação monta o mesmo orçamento dentro dela:
 * os mesmos itens, o mesmo consumo, o mesmo desconto e o mesmo pagamento. Duas cópias desta
 * lógica divergiriam na primeira correção — e é aqui que mora a conta que vira o preço.
 */
export const useOrcamentoEmEdicao = ({
  aberto,
  quoteToEdit,
  seedFrom,
  initialPatient,
  daAvaliacao,
  procedures,
  clinic,
}: OpcoesDoOrcamento) => {
  const professionals = clinic.professionals || [];

  const [dataEmissao, setDataEmissao] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [pacienteId, setPacienteId] = useState<string | undefined>(undefined);
  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteContato, setPacienteContato] = useState('');
  const [jaTeveAvaliacao, setJaTeveAvaliacao] = useState(false);
  const [dataAvaliacao, setDataAvaliacao] = useState('');
  const [textoApresentacao, setTextoApresentacao] = useState('');
  const [textoEditadoManualmente, setTextoEditadoManualmente] = useState(false);
  const [itens, setItens] = useState<QuoteItem[]>([]);
  const [temDescontoCombinado, setTemDescontoCombinado] = useState(false);
  const [descontoCombinadoPercentual, setDescontoCombinadoPercentual] = useState(0);
  const [opcoesPagamento, setOpcoesPagamento] = useState<QuotePaymentOption[]>([]);
  const [negociacao, setNegociacao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  /** `id` do procedimento cujo mapa de áreas está aberto. */
  const [mapaAberto, setMapaAberto] = useState<string | null>(null);
  /** Foto do mapa — de mulher ou de homem. Vai gravada no orçamento, para o PDF sair igual. */
  const [sexoDoMapa, setSexoDoMapa] = useState<PatientGender>('feminino');
  /** Item de área que a profissional tentou desmarcar mas que já foi editado — pede confirmação. */
  const [confirmarRemocao, setConfirmarRemocao] = useState<QuoteItem | null>(null);
  /** Aviso de que a lista nasceu da ficha de anamnese da paciente. */
  const [avisoDaAnamnese, setAvisoDaAnamnese] = useState<{ quantidade: number; data: string } | null>(null);
  /** Interruptor da página do manequim no PDF. Padrão ligado. */
  const [mostrarMapaCorporal, setMostrarMapaCorporal] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Custo de material, por item (id do item no formulário). Interno — não entra no documento do
   * orçamento, que a cliente lê pelo link; é gravado à parte, em `quote_costs`.
   */
  const [custos, setCustos] = useState<Record<string, LinhaDeMaterial[]>>({});
  /** Itens cujo custo já não segue o consumo padrão: veio gravado ou a profissional mexeu. */
  const [custoFixo, setCustoFixo] = useState<Set<string>>(new Set());
  /** O orçamento de origem já tinha custo gravado — salvar sem linhas precisa apagá-lo. */
  const [custoGravadoExistia, setCustoGravadoExistia] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[] | null>(null);
  const [consumos, setConsumos] = useState<ConsumoPadrao[] | null>(null);
  /** O estoque não carregou — dá para montar o orçamento, só sem a lista de produtos. */
  const [avisoDoEstoque, setAvisoDoEstoque] = useState<string | null>(null);

  const base = quoteToEdit || seedFrom || null;

  useEffect(() => {
    if (!aberto) return;

    if (base) {
      const emissao = quoteToEdit ? base.dataEmissao : new Date().toISOString();
      setDataEmissao(emissao);
      setDataValidade(quoteToEdit ? base.dataValidade : calcularDataValidade(emissao, clinic));
      setPacienteId(base.pacienteId);
      setPacienteNome(base.pacienteNome);
      setPacienteContato(base.pacienteContato || '');
      setJaTeveAvaliacao(base.jaTeveAvaliacao);
      setDataAvaliacao(base.dataAvaliacao || '');
      setTextoApresentacao(base.textoApresentacao);
      setTextoEditadoManualmente(true);
      setItens(base.itens);
      setTemDescontoCombinado(base.temDescontoCombinado);
      setDescontoCombinadoPercentual(base.descontoCombinadoPercentual || 0);
      // Cópia rasa: editar aqui não pode mexer no objeto do orçamento de origem
      setOpcoesPagamento(base.pagamento.opcoes.map((o) => ({ ...o })));
      setNegociacao(base.pagamento.negociacao || '');
      setObservacoes(base.observacoes || '');
      setMostrarMapaCorporal(base.mostrarMapaCorporal !== false);
      setSexoDoMapa(base.sexoDoMapa || 'feminino');
    } else {
      const emissao = new Date().toISOString();
      setDataEmissao(emissao);
      setDataValidade(calcularDataValidade(emissao, clinic));
      setPacienteId(initialPatient?.id);
      setPacienteNome(initialPatient?.nome || '');
      setPacienteContato(initialPatient?.contato || '');
      setJaTeveAvaliacao(false);
      setDataAvaliacao('');
      setTextoApresentacao('');
      setTextoEditadoManualmente(false);
      setItens([]);
      setTemDescontoCombinado(false);
      setDescontoCombinadoPercentual(0);
      setOpcoesPagamento([criarOpcaoPagamento('pix')]);
      setNegociacao('');
      setObservacoes('');
      setMostrarMapaCorporal(true);
      setSexoDoMapa(initialPatient?.genero || 'feminino');
    }
    setMapaAberto(null);
    setErrors({});
    setAvisoDaAnamnese(null);
    setCustos({});
    // O item calculado por consumo nunca segue o consumo padrão sozinho: as linhas dele são as
    // gravadas em `quote_costs`, que chegam logo abaixo. Seguir o padrão até lá mostraria uma conta
    // que não é a que deu o valor do item.
    setCustoFixo(
      new Set(base ? base.itens.filter((i) => i.calculadoPorConsumo).map((i) => i.id) : [])
    );
    setCustoGravadoExistia(false);
    // `clinic` e `professionals` mudam de referência a cada sync do perfil e
    // reabririam o formulário zerado no meio da edição — por isso ficam de fora
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, quoteToEdit?.id, seedFrom?.id, initialPatient?.id]);

  /**
   * Áreas que a paciente já pediu na ficha de anamnese entram pré-selecionadas.
   *
   * É o ponto em que as duas pontas do mapa viram uma coisa só: ela marcou virilha e axila pelo
   * link, e o orçamento abre com as duas na lista em vez de a profissional reconstruir de memória
   * o que a paciente respondeu.
   *
   * Só em orçamento novo e só uma vez por abertura: num orçamento já salvo, a lista de itens é o
   * que foi negociado, e reescrevê-la a partir de uma ficha antiga seria desfazer trabalho. Falha
   * de leitura não faz nada — o orçamento abre vazio, como sempre abriu.
   */
  useEffect(() => {
    // Dentro da avaliação, a lista é a que ela estimou — as áreas da anamnese não entram por cima.
    if (!aberto || base || !pacienteId || daAvaliacao) return;
    let cancelado = false;

    (async () => {
      try {
        const registros = await getRecordsForPatient(pacienteId);
        if (cancelado) return;

        const comAreas = registros
          .filter((r) => (r.areasConfirmadas?.length || 0) > 0 || (r.areasSolicitadas?.length || 0) > 0)
          .sort((a, b) => (b.dataAtendimento || b.createdAt).localeCompare(a.dataAtendimento || a.createdAt));

        const maisRecente = comAreas[0];
        if (!maisRecente) return;

        // A conduta da profissional vence o pedido da paciente quando as duas existem.
        const refs = maisRecente.areasConfirmadas?.length
          ? maisRecente.areasConfirmadas
          : maisRecente.areasSolicitadas || [];

        // A área é achada pelo ID em qualquer procedimento com mapa — inclusive a de uma ficha
        // antiga, de quando cada área era um procedimento: a conversão manteve o ID.
        const doCatalogo = refs
          .map((r) => acharArea(chaveDaRef(r)))
          .filter((a): a is { procedimento: Procedure; area: AreaDoProcedimento } => !!a);

        if (doCatalogo.length === 0) return;

        setItens((prev) => {
          if (prev.length > 0) return prev; // Alguém já mexeu enquanto a leitura voltava.
          return doCatalogo.map(({ procedimento, area }) =>
            montarItemDaArea(procedimento, area, professionals)
          );
        });
        if (maisRecente.pacienteGenero) setSexoDoMapa(maisRecente.pacienteGenero);
        setAvisoDaAnamnese({
          quantidade: doCatalogo.length,
          data: maisRecente.dataAtendimento || maisRecente.createdAt,
        });
      } catch (err) {
        console.warn('Não foi possível ler as áreas da ficha de anamnese da paciente:', err);
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, pacienteId, base?.id]);

  // Estoque e consumo padrão, só enquanto o formulário está aberto.
  useEffect(() => {
    if (!aberto) return;
    const avisar = (e: Error) =>
      setAvisoDoEstoque(`Não foi possível carregar os produtos do estoque (${e.message}).`);
    const pararProdutos = subscribeToProdutosDeEstoque(setProdutos, avisar);
    const pararConsumos = subscribeToConsumosPadrao(setConsumos, avisar);
    return () => {
      pararProdutos();
      pararConsumos();
    };
  }, [aberto]);

  /**
   * O custo que o orçamento de origem gravou — ao editar, duplicar ou substituir. Os itens do
   * formulário nascem com os mesmos ids dos de origem, então a ligação é direta. Os itens que
   * vieram com custo gravado ficam fixos: o consumo padrão de hoje não reescreve a estimativa
   * feita na emissão.
   */
  useEffect(() => {
    if (!aberto || !base) return;
    let cancelado = false;
    getCustoDoOrcamento(base.id)
      .then((gravado) => {
        if (cancelado || !gravado) return;
        const linhas: Record<string, LinhaDeMaterial[]> = {};
        gravado.itens.forEach((i) => {
          linhas[i.quoteItemId] = i.materiais;
        });
        setCustos((atual) => ({ ...atual, ...linhas }));
        setCustoFixo((atual) => new Set([...atual, ...Object.keys(linhas)]));
        setCustoGravadoExistia(true);
      })
      .catch((e) => console.warn('Não foi possível ler o custo estimado do orçamento:', e));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, base?.id]);

  /**
   * Itens que ainda seguem o consumo padrão acompanham o formulário: entrou procedimento, mudou o
   * número de sessões, o custo vem junto. Item que saiu leva o custo com ele.
   */
  useEffect(() => {
    if (!aberto) return;
    setCustos((atual) => {
      const novo: Record<string, LinhaDeMaterial[]> = {};
      itens.forEach((item) => {
        novo[item.id] = custoFixo.has(item.id)
          ? atual[item.id] || []
          : materiaisDoItem(item, consumos || [], produtos || [], procedures);
      });
      return novo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, itens, consumos, produtos, custoFixo]);

  // A mensagem acompanha o nome enquanto ninguém a editar à mão
  useEffect(() => {
    if (textoEditadoManualmente) return;
    setTextoApresentacao(montarTextoApresentacao(pacienteNome, clinic));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteNome, textoEditadoManualmente]);

  const pagamento = useMemo(
    () => ({
      opcoes: opcoesPagamento,
      negociacao: negociacao.trim() || undefined,
    }),
    [opcoesPagamento, negociacao]
  );

  const totais = useMemo(
    () =>
      calcularOrcamento({
        itens,
        temDescontoCombinado,
        descontoCombinadoPercentual,
        pagamento,
      }),
    [itens, temDescontoCombinado, descontoCombinadoPercentual, pagamento]
  );

  /** As áreas de um mesmo procedimento contam como um só aqui. Ver `quoteCalc`. */
  const procedimentosParaDesconto = useMemo(() => contarProcedimentosParaDesconto(itens), [itens]);

  /**
   * A área que um item vende — `areaId` nos de agora; nos de antes da conversão, o `procedureId`
   * do procedimento de laser que era a área (a conversão manteve o ID).
   */
  const chaveDaAreaDoItem = (item: QuoteItem): string | undefined =>
    item.areaId || (item.procedureId && isLaserCategory(item.categoria) ? item.procedureId : undefined);

  /** A área e o procedimento dono dela, pelo ID da área. */
  const acharArea = (areaId: string) => {
    for (const procedimento of procedures) {
      if (!procedimentoTemMapa(procedimento)) continue;
      const area = procedimento.areasDoMapa!.find((a) => a.id === areaId);
      if (area) return { procedimento, area };
    }
    return undefined;
  };

  /** `id` das áreas já na lista — o que o mapa desenha como selecionado. */
  const areasNoOrcamento = useMemo(
    () =>
      new Set(itens.map(chaveDaAreaDoItem).filter((chave): chave is string => !!chave)),
    [itens]
  );

  /**
   * Acrescenta um procedimento à lista.
   *
   * Duplicar é permitido de propósito no catálogo geral — o mesmo procedimento pode entrar duas
   * vezes, em regiões diferentes. Um procedimento vendido por área não entra assim: a busca abre
   * o mapa dele (ver `addArea`).
   */
  const addProcedure = (procedure: Procedure) =>
    setItens((prev) => [...prev, montarItemDoProcedimento(procedure, professionals)]);

  /**
   * Acrescenta uma área de um procedimento vendido por área — e é **idempotente**.
   *
   * Aqui a justificativa de duplicar não existe: a região já É o item, e "Axilas" duas vezes é
   * cobrar axilas duas vezes. Já está na lista, não entra de novo, só acende no mapa.
   *
   * O efeito colateral bom é que a lista e o mapa viram o mesmo estado, e o controle vivo passa a
   * funcionar nos dois sentidos — digitar "Axilas" na busca acende a área no mapa.
   */
  const addArea = (procedure: Procedure, area: AreaDoProcedimento) =>
    setItens((prev) => {
      if (prev.some((i) => chaveDaAreaDoItem(i) === area.id)) return prev;
      return [...prev, montarItemDaArea(procedure, area, professionals)];
    });

  /**
   * Um item já mexido pela profissional: desconto, número de sessões diferente do cadastro ou
   * cálculo por consumo.
   *
   * Serve à trava do controle vivo — desmarcar no mapa remove o item, mas desmarcar por engano um
   * item onde ela já negociou 20% e 6 sessões apagaria um trabalho que não se refaz sozinho.
   *
   * As sessões se comparam com as do cadastro porque o item já nasce com elas: laser de 10 sessões
   * não é "mexido" só por existir. Os detalhes ficaram de fora — só o cadastro do procedimento os
   * edita, então o item nunca os altera.
   */
  const itemFoiEditado = (item: QuoteItem): boolean => {
    const chave = chaveDaAreaDoItem(item);
    const daArea = chave ? acharArea(chave)?.area : undefined;
    const doCatalogo = procedures.find((p) => p.id === item.procedureId);
    const sessoesDoCadastro = daArea
      ? sessoesDoProcedimento(daArea)
      : doCatalogo
        ? sessoesDoProcedimento(doCatalogo)
        : 1;
    return item.temDesconto || !!item.calculadoPorConsumo || itemSessoes(item) !== sessoesDoCadastro;
  };

  const removeItem = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

  const alternarAreaDoLaser = (areaId: string) => {
    const existente = itens.find((i) => chaveDaAreaDoItem(i) === areaId);

    if (!existente) {
      const achada = acharArea(areaId);
      if (achada) addArea(achada.procedimento, achada.area);
      return;
    }

    if (itemFoiEditado(existente)) {
      setConfirmarRemocao(existente);
      return;
    }
    removeItem(existente.id);
  };

  const updateItem = (item: QuoteItem) => {
    // O custo do item de produto é o próprio produto na quantidade vendida: mudou a quantidade, o
    // custo volta a acompanhar, mesmo que tenha vindo gravado.
    const anterior = itens.find((i) => i.id === item.id);
    if (itemEhProduto(item) && anterior && itemQuantidade(anterior) !== itemQuantidade(item)) {
      setCustoFixo((atual) => {
        const novo = new Set(atual);
        novo.delete(item.id);
        return novo;
      });
    }
    setItens((prev) => prev.map((i) => (i.id === item.id ? item : i)));
  };

  /** Do estoque: cada produto entra como uma linha nova, com uma unidade. */
  const addProduto = (produto: ProdutoDeEstoque) =>
    setItens((prev) => [...prev, montarItemDoProduto(produto)]);

  const addItemAvulso = () => setItens((prev) => [...prev, montarItemAvulso()]);

  /**
   * Toda mudança nas linhas de consumo de um item passa por aqui — venha do próprio item ou da
   * seção de custo de material. Grava as linhas, tira o item do consumo padrão automático e, no
   * item calculado por consumo, refaz o valor na mesma hora.
   *
   * O valor é refeito aqui, no handler, e não num efeito que observe `custos`: o efeito que
   * acompanha o consumo padrão já reescreve `custos` a cada mudança de `itens`, e os dois juntos
   * entrariam em laço.
   */
  const mudarConsumoDoItem = (itemId: string, linhas: LinhaDeMaterial[]) => {
    setCustos((atual) => ({ ...atual, [itemId]: linhas }));
    setCustoFixo((atual) => new Set([...atual, itemId]));
    setItens((prev) =>
      prev.map((i) => (i.id === itemId && i.calculadoPorConsumo ? aplicarConsumoNoItem(i, linhas) : i))
    );
  };

  /**
   * Ao ligar, o valor sai das linhas que o item já tem (o consumo padrão × sessões, ou as gravadas);
   * ao desligar, volta o preço do catálogo. As linhas ficam — continuam sendo o custo estimado.
   */
  const alternarConsumoDoItem = (item: QuoteItem, marcado: boolean) => {
    if (!marcado) {
      setItens((prev) => prev.map((i) => (i.id === item.id ? tirarConsumoDoItem(i, procedures) : i)));
      return;
    }
    const linhas = custos[item.id] || [];
    setCustos((atual) => ({ ...atual, [item.id]: linhas }));
    setCustoFixo((atual) => new Set([...atual, item.id]));
    setItens((prev) => prev.map((i) => (i.id === item.id ? aplicarConsumoNoItem(i, linhas) : i)));
  };

  /** No item por consumo, refaz as linhas pelo padrão; nos demais, volta a seguir o padrão. */
  const recalcularConsumoDoItem = (itemId: string) => {
    const item = itens.find((i) => i.id === itemId);
    if (item?.calculadoPorConsumo) {
      mudarConsumoDoItem(itemId, materiaisDoItem(item, consumos || [], produtos || [], procedures));
      return;
    }
    setCustoFixo((atual) => {
      const novo = new Set(atual);
      novo.delete(itemId);
      return novo;
    });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setItens((prev) => {
      const destino = index + direction;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[index], copia[destino]] = [copia[destino], copia[index]];
      return copia;
    });
  };

  const alternarDescontoCombinado = (checked: boolean) => {
    setTemDescontoCombinado(checked);
    if (checked && descontoCombinadoPercentual === 0) {
      setDescontoCombinadoPercentual(sugerirDescontoCombinado(procedimentosParaDesconto, clinic));
    }
  };

  const addOpcaoPagamento = () => setOpcoesPagamento((prev) => [...prev, criarOpcaoPagamento('pix')]);

  const updateOpcaoPagamento = (opcao: QuotePaymentOption) =>
    setOpcoesPagamento((prev) => prev.map((o) => (o.id === opcao.id ? opcao : o)));

  const removeOpcaoPagamento = (id: string) =>
    setOpcoesPagamento((prev) => (prev.length > 1 ? prev.filter((o) => o.id !== id) : prev));

  /**
   * O orçamento da avaliação: a paciente, "já teve avaliação" com a data dela, e (salvo `semItem`)
   * um item do procedimento avaliado, calculado pelo consumo — o estimado (`linhas`) ou, sem ele, o consumo
   * padrão do procedimento × sessões. Chamar só com o estoque carregado (`estoquePronto`).
   *
   * As três trocas de estado vão juntas: o efeito que acompanha o consumo padrão roda na mesma
   * passada e, com o item já em `custoFixo`, mantém as linhas que acabaram de chegar.
   */
  const semearDaAvaliacao = (avaliacao: AvaliacaoDoOrcamento, linhas?: MaterialUsado[]) => {
    setPacienteId(avaliacao.pacienteId);
    setPacienteNome(avaliacao.pacienteNome);
    setPacienteContato(avaliacao.pacienteContato || '');
    const dia = (avaliacao.data || '').slice(0, 10);
    setJaTeveAvaliacao(true);
    setDataAvaliacao(fromDateInput(dia));

    if (avaliacao.semItem) {
      setItens([]);
      setCustos({});
      setCustoFixo(new Set());
      return;
    }

    const procedimento = procedimentoDoAtendimento(avaliacao, procedures);
    const doCatalogo = procedimento
      ? montarItemDoProcedimento(procedimento, professionals)
      : { ...montarItemAvulso(), titulo: avaliacao.procedimentoNome };
    // Quem avaliou costuma ser quem faz — e continua trocável no item.
    const profissional = professionals.find((p) => p.id === avaliacao.professionalId);
    const item = profissional
      ? { ...doCatalogo, professionalId: profissional.id, profissionalNome: profissional.name }
      : doCatalogo;
    const consumo = linhas || materiaisDoItem(item, consumos || [], produtos || [], procedures);

    setItens([aplicarConsumoNoItem(item, consumo)]);
    setCustos({ [item.id]: consumo });
    setCustoFixo(new Set([item.id]));
  };

  /** Confere o que impede salvar. Devolve os erros — vazio = pode salvar. */
  const validar = (): Record<string, string> => {
    const novosErros: Record<string, string> = {};
    if (!pacienteNome.trim()) novosErros.paciente = 'Informe a paciente';
    if (itens.length === 0) novosErros.itens = 'Adicione ao menos um procedimento';
    if (itens.some((i) => !i.titulo.trim())) novosErros.itens = 'Todo procedimento precisa de um título';
    if (!dataValidade) novosErros.validade = 'Informe a data de validade';
    if (jaTeveAvaliacao && !dataAvaliacao) novosErros.avaliacao = 'Informe a data da avaliação';
    setErrors(novosErros);
    return novosErros;
  };

  /**
   * O documento do orçamento e, à parte, o custo de material. `custo` só vem quando há o que
   * gravar — ou quando havia e agora precisa ser apagado.
   */
  const montar = (): { draft: QuoteDraft; custo?: CustoEmEdicao } => {
    const draft: QuoteDraft = {
      dataEmissao,
      dataValidade,
      pacienteId,
      pacienteNome: pacienteNome.trim(),
      pacienteContato: pacienteContato.trim() || undefined,
      jaTeveAvaliacao,
      dataAvaliacao: jaTeveAvaliacao ? dataAvaliacao : undefined,
      textoApresentacao: textoApresentacao.trim(),
      itens,
      temDescontoCombinado,
      descontoCombinadoPercentual: temDescontoCombinado ? descontoCombinadoPercentual : undefined,
      pagamento,
      observacoes: observacoes.trim() || undefined,
      // Só grava quando é `false`: o padrão é mostrar, e um campo a menos no documento é um campo
      // a menos de peso na cota por gravação.
      mostrarMapaCorporal: mostrarMapaCorporal ? undefined : false,
      // Só quando há área no orçamento, e só quando não é o padrão — mesmo motivo do interruptor.
      sexoDoMapa: areasNoOrcamento.size > 0 && sexoDoMapa === 'masculino' ? 'masculino' : undefined,
      clinica: montarSnapshotClinica(clinic),
      total: totais.total,
    };
    const temCusto = itens.some((i) => (custos[i.id] || []).length > 0);
    return {
      draft,
      custo: temCusto || custoGravadoExistia ? { itens, linhas: custos } : undefined,
    };
  };

  return {
    professionals,
    dataEmissao,
    setDataEmissao,
    dataValidade,
    setDataValidade,
    pacienteId,
    setPacienteId,
    pacienteNome,
    setPacienteNome,
    pacienteContato,
    setPacienteContato,
    jaTeveAvaliacao,
    setJaTeveAvaliacao,
    dataAvaliacao,
    setDataAvaliacao,
    textoApresentacao,
    setTextoApresentacao,
    textoEditadoManualmente,
    setTextoEditadoManualmente,
    itens,
    temDescontoCombinado,
    descontoCombinadoPercentual,
    setDescontoCombinadoPercentual,
    opcoesPagamento,
    negociacao,
    setNegociacao,
    observacoes,
    setObservacoes,
    mapaAberto,
    setMapaAberto,
    sexoDoMapa,
    setSexoDoMapa,
    confirmarRemocao,
    setConfirmarRemocao,
    avisoDaAnamnese,
    setAvisoDaAnamnese,
    mostrarMapaCorporal,
    setMostrarMapaCorporal,
    errors,
    setErrors,
    custos,
    produtos: produtos || [],
    /** Produtos e consumo padrão chegaram (ou falharam) — já dá para montar o consumo. */
    estoquePronto: (!!produtos && !!consumos) || !!avisoDoEstoque,
    avisoDoEstoque,
    totais,
    procedimentosParaDesconto,
    areasNoOrcamento,
    addProcedure,
    addArea,
    addProduto,
    addItemAvulso,
    removeItem,
    updateItem,
    moveItem,
    alternarAreaDoLaser,
    mudarConsumoDoItem,
    alternarConsumoDoItem,
    recalcularConsumoDoItem,
    alternarDescontoCombinado,
    addOpcaoPagamento,
    updateOpcaoPagamento,
    removeOpcaoPagamento,
    semearDaAvaliacao,
    validar,
    montar,
  };
};

export type OrcamentoEmEdicao = ReturnType<typeof useOrcamentoEmEdicao>;
