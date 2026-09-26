import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  MessageSquare,
  Sparkles,
  Calculator,
  CreditCard,
  Plus,
  AlertCircle,
} from 'lucide-react';
import {
  ClinicProfile,
  ConsumoPadrao,
  EvaluationRecord,
  Patient,
  Procedure,
  ProdutoDeEstoque,
  Quote,
  QuoteDraft,
  QuoteItem,
  QuotePaymentOption,
} from '../../types';
import { formatBRL, formatDateOnly } from '../../utils/formatters';
import {
  calcularOrcamento,
  calcularDataValidade,
  itemSessoes,
  itemValorFinal,
  montarTextoApresentacao,
  NOME_FORMA_PAGAMENTO,
  sugerirDescontoCombinado,
  contarProcedimentosParaDesconto,
} from '../../utils/quoteCalc';
import {
  criarOpcaoPagamento,
  montarItemAvulso,
  montarItemDoProcedimento,
  montarSnapshotClinica,
} from '../../utils/quoteFactory';
import { PatientSearchSelect } from './PatientSearchSelect';
import { ProcedureSearchAdd } from './ProcedureSearchAdd';
import { QuoteItemEditor } from './QuoteItemEditor';
import { QuotePaymentOptionEditor } from './QuotePaymentOptionEditor';
import { LaserQuoteMapModal } from '../laser/LaserQuoteMapModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { SidePanel } from '../common/SidePanel';
import { AvisoTinta, CampoTinta, INPUT_TINTA, Interruptor } from '../common/Tinta';
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
import { CustoDeMaterialDoOrcamento } from './CustoDeMaterialDoOrcamento';
import { isLaserCategory } from '../../utils/templateMatching';
import { nomeCurtoDaArea } from '../../utils/laserAreas';
import { procedimentoDoAtendimento } from '../../utils/evaluations';

interface QuoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * `custo` só vem quando há custo de material para gravar (ou para apagar): quem salva o
   * orçamento grava o custo depois, com o id que o orçamento ganhou. Ver `useAcoesDeOrcamento`.
   */
  onSave: (draft: QuoteDraft, existing?: Quote, custo?: CustoEmEdicao) => void | Promise<void>;
  quoteToEdit?: Quote | null;
  /** Itens iniciais ao duplicar ou substituir um orçamento — o número é novo, o conteúdo vem pronto. */
  seedFrom?: Quote | null;
  /**
   * Paciente já escolhido ao abrir um orçamento em branco — é assim que a página do paciente
   * chama o formulário. Ignorado quando há `quoteToEdit` ou `seedFrom`, que trazem o próprio.
   */
  initialPatient?: Patient | null;
  /**
   * A ficha de avaliação que manda montar o orçamento: abre com a paciente, o procedimento e o
   * consumo estimado dela, e o item já "calculado por consumo de produto". Só em orçamento novo.
   */
  avaliacaoDeOrigem?: EvaluationRecord | null;
  procedures: Procedure[];
  patients: Patient[];
  clinic: ClinicProfile;
}

/** `input type="date"` fala YYYY-MM-DD; o documento guarda ISO. */
const toDateInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Meio-dia local: evita o campo de data voltar um dia ao virar para UTC. */
const fromDateInput = (value: string): string => {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
};

const SectionHeader: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h3 className="font-sans text-[15px] font-bold text-ink flex items-center gap-2">
    {icon}
    {children}
  </h3>
);

/** As quatro etapas do orçamento — a ordem em que a conversa com a paciente acontece. */
type Etapa = 1 | 2 | 3 | 4;

const ETAPAS: { numero: Etapa; rotulo: string }[] = [
  { numero: 1, rotulo: 'Paciente' },
  { numero: 2, rotulo: 'Procedimentos' },
  { numero: 3, rotulo: 'Pagamento' },
  { numero: 4, rotulo: 'Revisar' },
];

export const QuoteFormModal: React.FC<QuoteFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  quoteToEdit,
  seedFrom,
  initialPatient,
  avaliacaoDeOrigem,
  procedures,
  patients,
  clinic,
}) => {
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
  const [mapaAberto, setMapaAberto] = useState(false);
  /** Item de laser que a profissional tentou desmarcar mas que já foi editado — pede confirmação. */
  const [confirmarRemocao, setConfirmarRemocao] = useState<QuoteItem | null>(null);
  /** Aviso de que a lista nasceu da ficha de anamnese da paciente. */
  const [avisoDaAnamnese, setAvisoDaAnamnese] = useState<{ quantidade: number; data: string } | null>(null);
  /** Data (YYYY-MM-DD) da avaliação que pré-preencheu o orçamento, para o aviso. */
  const [avisoDaAvaliacao, setAvisoDaAvaliacao] = useState<string | null>(null);
  /** Interruptor da página do manequim no PDF. Padrão ligado. */
  const [mostrarMapaCorporal, setMostrarMapaCorporal] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Custo de material, por item (id do item no formulário). Interno — não entra no documento do
   * orçamento, que a cliente lê pelo link; é gravado à parte, em `quote_costs`.
   */
  const [custos, setCustos] = useState<Record<string, LinhaDeMaterial[]>>({});
  /** Itens cujo custo já não segue o consumo padrão: veio gravado ou a profissional mexeu. */
  const [custoFixo, setCustoFixo] = useState<Set<string>>(new Set());
  /** O orçamento de origem já tinha custo gravado — salvar sem linhas precisa apagá-lo. */
  const [custoGravadoExistia, setCustoGravadoExistia] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[]>([]);
  const [consumos, setConsumos] = useState<ConsumoPadrao[]>([]);
  /** A etapa aberta: 1 paciente, 2 procedimentos, 3 pagamento, 4 revisar. */
  const [etapa, setEtapa] = useState<Etapa>(1);

  const base = quoteToEdit || seedFrom || null;

  useEffect(() => {
    if (!isOpen) return;

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
    }
    setErrors({});
    setIsSaving(false);
    setAvisoDaAnamnese(null);
    setAvisoDaAvaliacao(null);
    // Com a paciente já conhecida (editar, duplicar, vir da página dela ou da avaliação), a
    // primeira pergunta já está respondida — o formulário abre nos procedimentos.
    setEtapa(base || initialPatient || avaliacaoDeOrigem ? 2 : 1);
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
  }, [isOpen, quoteToEdit?.id, seedFrom?.id, initialPatient?.id, avaliacaoDeOrigem?.id]);

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
    // Vindo da avaliação, a lista é a que ela estimou — as áreas da anamnese não entram por cima.
    if (!isOpen || base || !pacienteId || avaliacaoDeOrigem) return;
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

        const doCatalogo = refs
          .map((r) => procedures.find((p) => p.id === r.procedureId))
          .filter((p): p is Procedure => !!p);

        if (doCatalogo.length === 0) return;

        setItens((prev) => {
          if (prev.length > 0) return prev; // Alguém já mexeu enquanto a leitura voltava.
          return doCatalogo.map((p) => montarItemDoProcedimento(p, professionals));
        });
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
  }, [isOpen, pacienteId, base?.id]);

  // Estoque e consumo padrão, só enquanto o formulário está aberto.
  useEffect(() => {
    if (!isOpen) return;
    const pararProdutos = subscribeToProdutosDeEstoque(setProdutos);
    const pararConsumos = subscribeToConsumosPadrao(setConsumos);
    return () => {
      pararProdutos();
      pararConsumos();
    };
  }, [isOpen]);

  /**
   * O custo que o orçamento de origem gravou — ao editar, duplicar ou substituir. Os itens do
   * formulário nascem com os mesmos ids dos de origem, então a ligação é direta. Os itens que
   * vieram com custo gravado ficam fixos: o consumo padrão de hoje não reescreve a estimativa
   * feita na emissão.
   */
  useEffect(() => {
    if (!isOpen || !base) return;
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
  }, [isOpen, base?.id]);

  /**
   * Itens que ainda seguem o consumo padrão acompanham o formulário: entrou procedimento, mudou o
   * número de sessões, o custo vem junto. Item que saiu leva o custo com ele.
   */
  useEffect(() => {
    if (!isOpen) return;
    setCustos((atual) => {
      const novo: Record<string, LinhaDeMaterial[]> = {};
      itens.forEach((item) => {
        novo[item.id] = custoFixo.has(item.id)
          ? atual[item.id] || []
          : materiaisDoItem(item, consumos, produtos, procedures);
      });
      return novo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itens, consumos, produtos, custoFixo]);

  /**
   * Orçamento montado a partir da ficha de avaliação: a paciente, "já teve avaliação" com a data
   * dela, e um item do procedimento avaliado, calculado pelo consumo estimado ali.
   *
   * Mora num efeito à parte, declarado **depois** do que acompanha o consumo padrão, e não dentro
   * do de abertura: na mesma passada os dois rodam, e aquele reescreve `custos` a partir dos itens
   * da renderização anterior — declarado antes, apagaria as linhas que acabaram de chegar.
   */
  useEffect(() => {
    if (!isOpen || base || !avaliacaoDeOrigem) return;
    const avaliacao = avaliacaoDeOrigem;
    const cadastro = initialPatient || patients.find((p) => p.id === avaliacao.pacienteId);

    setPacienteId(avaliacao.pacienteId);
    setPacienteNome(cadastro?.nome || avaliacao.pacienteNome);
    setPacienteContato(cadastro?.contato || '');
    const dia = (avaliacao.dataAtendimento || '').slice(0, 10);
    setJaTeveAvaliacao(true);
    setDataAvaliacao(fromDateInput(dia));

    const procedimento = procedimentoDoAtendimento(avaliacao, procedures);
    const doCatalogo = procedimento
      ? montarItemDoProcedimento(procedimento, professionals)
      : { ...montarItemAvulso(), titulo: avaliacao.procedimentoNome };
    // Quem avaliou costuma ser quem faz — e continua trocável no item.
    const profissional = professionals.find((p) => p.id === avaliacao.professionalId);
    const item = profissional
      ? { ...doCatalogo, professionalId: profissional.id, profissionalNome: profissional.name }
      : doCatalogo;
    const linhas = avaliacao.consumoEstimado || [];

    setItens([aplicarConsumoNoItem(item, linhas)]);
    setCustos({ [item.id]: linhas });
    setCustoFixo(new Set([item.id]));
    setAvisoDaAvaliacao(dia);
    // Só na abertura: o catálogo e a equipe mudam de referência a cada sync e refariam o item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, avaliacaoDeOrigem?.id, base?.id]);

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

  /** Todas as áreas de laser contam como um só procedimento aqui. Ver `quoteCalc`. */
  const procedimentosParaDesconto = useMemo(
    () => contarProcedimentosParaDesconto(itens),
    [itens]
  );

  /**
   * `procedureId` dos itens de laser já na lista — o que o mapa desenha como selecionado.
   *
   * Fica **antes** do `return null` porque é um hook: declarado depois, ele deixaria de rodar
   * com o modal fechado e mudaria a ordem dos hooks entre renderizações, que é justamente o que o
   * React proíbe.
   */
  const areasNoOrcamento = useMemo(
    () =>
      new Set(
        itens
          .filter((i) => i.procedureId && isLaserCategory(i.categoria))
          .map((i) => i.procedureId as string)
      ),
    [itens]
  );

  if (!isOpen) return null;

  /**
   * Acrescenta um procedimento à lista.
   *
   * Duplicar é permitido de propósito no catálogo geral — o mesmo procedimento pode entrar duas
   * vezes, em regiões diferentes. **Em depilação a laser essa justificativa não existe: a região
   * já É o procedimento**, e "Axilas" duas vezes é cobrar axilas duas vezes. Por isso o laser é
   * idempotente: já está na lista, não entra de novo, só acende no mapa.
   *
   * O efeito colateral bom é que a lista e o mapa viram o mesmo estado, e o controle vivo passa a
   * funcionar nos dois sentidos — digitar "Axilas" na busca acende a área no manequim.
   */
  const addProcedure = (procedure: Procedure) =>
    setItens((prev) => {
      if (isLaserCategory(procedure.category) && prev.some((i) => i.procedureId === procedure.id)) {
        return prev;
      }
      return [...prev, montarItemDoProcedimento(procedure, professionals)];
    });

  /**
   * Um item já mexido pela profissional: desconto, número de sessões ou detalhes alterados.
   *
   * Serve à trava do controle vivo — desmarcar no mapa remove o item, mas desmarcar por engano um
   * item onde ela já negociou 20% e 6 sessões apagaria um trabalho que não se refaz sozinho.
   */
  const itemFoiEditado = (item: QuoteItem): boolean =>
    item.temDesconto ||
    item.maisDeUmaSessao ||
    !!item.calculadoPorConsumo ||
    (item.detalhes || []).some((d) => d.titulo.trim() || d.valor.trim());

  const alternarAreaDoLaser = (procedureId: string) => {
    const existente = itens.find((i) => i.procedureId === procedureId);

    if (!existente) {
      const procedimento = procedures.find((p) => p.id === procedureId);
      if (procedimento) addProcedure(procedimento);
      return;
    }

    if (itemFoiEditado(existente)) {
      setConfirmarRemocao(existente);
      return;
    }
    removeItem(existente.id);
  };

  const updateItem = (item: QuoteItem) =>
    setItens((prev) => prev.map((i) => (i.id === item.id ? item : i)));

  const removeItem = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

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
      mudarConsumoDoItem(itemId, materiaisDoItem(item, consumos, produtos, procedures));
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

  const handleToggleCombinado = (checked: boolean) => {
    setTemDescontoCombinado(checked);
    if (checked && descontoCombinadoPercentual === 0) {
      setDescontoCombinadoPercentual(sugerirDescontoCombinado(procedimentosParaDesconto, clinic));
    }
  };

  const addOpcaoPagamento = () =>
    setOpcoesPagamento((prev) => [...prev, criarOpcaoPagamento('pix')]);

  const updateOpcaoPagamento = (opcao: QuotePaymentOption) =>
    setOpcoesPagamento((prev) => prev.map((o) => (o.id === opcao.id ? opcao : o)));

  const removeOpcaoPagamento = (id: string) =>
    setOpcoesPagamento((prev) => (prev.length > 1 ? prev.filter((o) => o.id !== id) : prev));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const novosErros: Record<string, string> = {};

    if (!pacienteNome.trim()) novosErros.paciente = 'Informe a paciente';
    if (itens.length === 0) novosErros.itens = 'Adicione ao menos um procedimento';
    if (itens.some((i) => !i.titulo.trim())) novosErros.itens = 'Todo procedimento precisa de um título';
    if (!dataValidade) novosErros.validade = 'Informe a data de validade';
    if (jaTeveAvaliacao && !dataAvaliacao) novosErros.avaliacao = 'Informe a data da avaliação';

    if (Object.keys(novosErros).length > 0) {
      setErrors(novosErros);
      // Volta para a etapa do primeiro problema — o aviso mora lá, junto do campo.
      setEtapa(novosErros.paciente || novosErros.validade || novosErros.avaliacao ? 1 : 2);
      return;
    }

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
      clinica: montarSnapshotClinica(clinic),
      total: totais.total,
    };

    // Custo só vai junto quando há o que gravar — ou quando havia e agora precisa ser apagado.
    const temCusto = itens.some((i) => (custos[i.id] || []).length > 0);
    const custo: CustoEmEdicao | undefined =
      temCusto || custoGravadoExistia ? { itens, linhas: custos } : undefined;

    try {
      setIsSaving(true);
      await onSave(draft, quoteToEdit || undefined, custo);
      onClose();
    } catch (e) {
      setIsSaving(false);
      // Mostra o motivo real: sem isso, um erro de permissão do Firestore vira
      // "tente de novo" e a pessoa fica repetindo uma ação que nunca vai funcionar
      setErrors({ salvar: `Não foi possível salvar: ${(e as Error).message}` });
    }
  };

  const tituloModal = quoteToEdit
    ? `Editar orçamento ${quoteToEdit.numero}`
    : seedFrom
      ? `Novo a partir de ${seedFrom.numero}`
      : 'Novo orçamento';

  const proximaEtapa = ETAPAS.find((e) => e.numero === etapa + 1);

  /* As etapas no cabeçalho preto. Tocáveis: nada obriga a seguir a ordem, e voltar para mudar a
     paciente depois de montar os procedimentos não perde nada. */
  const cabecalho = (
    <nav aria-label="Etapas do orçamento" className="-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ol className="flex gap-4 px-1 w-max">
        {ETAPAS.map((e) => {
          const ativa = e.numero === etapa;
          return (
            <li key={e.numero}>
              <button
                type="button"
                onClick={() => setEtapa(e.numero)}
                aria-current={ativa ? 'step' : undefined}
                className={`pb-1.5 border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  ativa
                    ? 'text-white border-brand-light'
                    : 'text-cream/60 border-transparent hover:text-cream'
                }`}
              >
                {e.numero} {e.rotulo}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  /* A barra preta de baixo: o total, que se atualiza enquanto se monta, e o próximo passo. */
  const rodape = (
    <div className="flex items-center gap-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-cream/75 truncate">
          Total · {itens.length} {itens.length === 1 ? 'procedimento' : 'procedimentos'}
        </p>
        <p className="text-[22px] font-bold text-white tabular-nums leading-tight truncate">
          {formatBRL(totais.total)}
        </p>
      </div>
      {etapa < 4 && proximaEtapa ? (
        <button
          type="button"
          onClick={() => setEtapa(proximaEtapa.numero)}
          className="shrink-0 h-[52px] px-[22px] rounded-full bg-brand-light text-ink text-[16px] font-bold flex items-center gap-2 hover:brightness-105 active:scale-[.97] transition"
        >
          {proximaEtapa.rotulo}
          <ArrowRight className="w-[18px] h-[18px]" />
        </button>
      ) : (
        <button
          type="submit"
          form="form-orcamento"
          disabled={isSaving}
          className="shrink-0 h-[52px] px-[22px] rounded-full bg-brand-light text-ink text-[16px] font-bold flex items-center gap-2 hover:brightness-105 active:scale-[.97] transition disabled:opacity-50"
        >
          {isSaving ? 'Salvando…' : quoteToEdit ? 'Salvar alterações' : 'Salvar orçamento'}
        </button>
      )}
    </div>
  );

  const principal = totais.opcoesPagamento[0];
  const opcaoPrincipal = opcoesPagamento[0];

  return (
    <SidePanel
      aberto={isOpen}
      onFechar={onClose}
      titulo={tituloModal}
      sobretitulo={pacienteNome.trim() || 'Orçamento'}
      cabecalho={cabecalho}
      onVoltar={etapa > 1 ? () => setEtapa((etapa - 1) as Etapa) : undefined}
      etapa={etapa}
      largura="larga"
      bloqueado={isSaving}
      /* Adicionar ou remover um procedimento não passa por `input`/`change`, então o painel
         não enxergaria a alteração sozinho. */
      alterado={itens.length > 0 && !quoteToEdit}
      rodape={rodape}
      rodapeTom="escuro"
    >
      <form
        id="form-orcamento"
        /* Enter num campo leva para a etapa seguinte; salvar é só na última, pelo botão. */
        onSubmit={(e) => {
          e.preventDefault();
          if (etapa < 4) setEtapa((etapa + 1) as Etapa);
          else handleSubmit();
        }}
        className="px-5 sm:px-6 py-5 space-y-6"
      >
        {errors.salvar && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {errors.salvar}
          </AvisoTinta>
        )}

        {/* ETAPA 1 — A PACIENTE */}
        {etapa === 1 && (
          <>
            {!quoteToEdit && (
              <p className="text-[13px] text-ink-soft -mt-1">
                O número é gerado ao salvar — abrir e desistir não gasta numeração.
              </p>
            )}
            <div className="space-y-3.5">
              <div>
                <PatientSearchSelect
                  patients={patients}
                  pacienteId={pacienteId}
                  pacienteNome={pacienteNome}
                  onSelect={({ id, nome, contato }) => {
                    setPacienteId(id);
                    setPacienteNome(nome);
                    if (contato !== undefined) setPacienteContato(contato);
                  }}
                />
                {errors.paciente && (
                  <p className="mt-1 px-1 text-[13px] font-medium text-danger">{errors.paciente}</p>
                )}
              </div>

              <CampoTinta rotulo="WhatsApp" htmlFor="orcamento-contato">
                <input
                  id="orcamento-contato"
                  type="tel"
                  inputMode="tel"
                  value={pacienteContato}
                  onChange={(e) => setPacienteContato(e.target.value)}
                  placeholder="(19) 99123-4567"
                  autoComplete="off"
                  className={INPUT_TINTA}
                />
              </CampoTinta>

              <div className="grid grid-cols-2 gap-2.5">
                <CampoTinta rotulo="Emissão" htmlFor="orcamento-emissao">
                  <input
                    id="orcamento-emissao"
                    type="date"
                    value={toDateInput(dataEmissao)}
                    onChange={(e) => setDataEmissao(fromDateInput(e.target.value))}
                    className={`${INPUT_TINTA} min-h-[24px]`}
                  />
                </CampoTinta>
                <CampoTinta rotulo="Válido até" htmlFor="orcamento-validade" erro={errors.validade}>
                  <input
                    id="orcamento-validade"
                    type="date"
                    value={toDateInput(dataValidade)}
                    onChange={(e) => setDataValidade(fromDateInput(e.target.value))}
                    className={`${INPUT_TINTA} min-h-[24px]`}
                  />
                </CampoTinta>
              </div>

              <div className="rounded-2xl bg-card border border-ink/10 px-4 py-3.5 flex flex-col gap-3">
                <Interruptor
                  ligado={jaTeveAvaliacao}
                  onMudar={setJaTeveAvaliacao}
                  rotulo="Já teve avaliação"
                  descricao="A data sai no PDF, junto do nome da paciente."
                />
                {jaTeveAvaliacao && (
                  <CampoTinta
                    rotulo="Data da avaliação"
                    htmlFor="orcamento-avaliacao"
                    erro={errors.avaliacao}
                    className="max-w-[220px]"
                  >
                    <input
                      id="orcamento-avaliacao"
                      type="date"
                      value={toDateInput(dataAvaliacao)}
                      onChange={(e) => setDataAvaliacao(fromDateInput(e.target.value))}
                      className={`${INPUT_TINTA} min-h-[24px]`}
                    />
                  </CampoTinta>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <SectionHeader icon={<MessageSquare className="w-4 h-4" />}>Mensagem de abertura</SectionHeader>
              <CampoTinta rotulo="O texto que abre o orçamento" htmlFor="orcamento-apresentacao">
                <textarea
                  id="orcamento-apresentacao"
                  value={textoApresentacao}
                  onChange={(e) => {
                    setTextoApresentacao(e.target.value);
                    setTextoEditadoManualmente(true);
                  }}
                  rows={3}
                  className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
                />
              </CampoTinta>
              {!textoEditadoManualmente && (
                <p className="px-1 text-[13px] text-ink-soft">
                  Sugestão automática — acompanha o nome da paciente até você editar.
                </p>
              )}
            </div>
          </>
        )}

        {/* ETAPA 2 — OS PROCEDIMENTOS */}
        {etapa === 2 && (
          <>
            <div className="space-y-3">
              <SectionHeader icon={<Sparkles className="w-4 h-4" />}>
                Procedimentos ({itens.length})
              </SectionHeader>

              {errors.itens && (
                <AvisoTinta tom="erro" icone={AlertCircle}>
                  {errors.itens}
                </AvisoTinta>
              )}

              <div className="space-y-3">
                {itens.map((item, index) => (
                  <QuoteItemEditor
                    key={item.id}
                    item={item}
                    index={index}
                    total={itens.length}
                    professionals={professionals}
                    onChange={updateItem}
                    onRemove={() => removeItem(item.id)}
                    onMove={(direction) => moveItem(index, direction)}
                    produtos={produtos}
                    linhasDoConsumo={custos[item.id] || []}
                    onAlternarConsumo={(marcado) => alternarConsumoDoItem(item, marcado)}
                    onMudarConsumo={(linhas) => mudarConsumoDoItem(item.id, linhas)}
                    onRecalcularConsumo={() => recalcularConsumoDoItem(item.id)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-start gap-2">
                <ProcedureSearchAdd
                  procedures={procedures}
                  onAdd={addProcedure}
                  onAbrirMapa={() => setMapaAberto(true)}
                  areasNoMapa={areasNoOrcamento.size}
                />
                {areasNoOrcamento.size > 0 && (
                  <label className="w-full flex items-center gap-2 text-body text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mostrarMapaCorporal}
                      onChange={(e) => setMostrarMapaCorporal(e.target.checked)}
                      className="w-4 h-4 accent-ink"
                    />
                    Incluir o manequim com as áreas contratadas no PDF
                  </label>
                )}

                {avisoDaAvaliacao && (
                  <p className="w-full text-body text-ok bg-ok-bg rounded-xl px-3 py-2 leading-snug flex items-start justify-between gap-2">
                    <span>
                      Preenchido com o consumo estimado na avaliação de{' '}
                      {formatDateOnly(avisoDaAvaliacao)}. Confira as quantidades no item.
                    </span>
                    <button
                      type="button"
                      onClick={() => setAvisoDaAvaliacao(null)}
                      className="shrink-0 underline underline-offset-2 hover:no-underline"
                    >
                      ok
                    </button>
                  </p>
                )}
                {avisoDaAnamnese && (
                  <p className="w-full text-body text-ok bg-ok-bg rounded-xl px-3 py-2 leading-snug flex items-start justify-between gap-2">
                    <span>
                      {avisoDaAnamnese.quantidade}{' '}
                      {avisoDaAnamnese.quantidade === 1 ? 'área veio' : 'áreas vieram'} da ficha de{' '}
                      {new Date(avisoDaAnamnese.data).toLocaleDateString('pt-BR')}. Desmarque no mapa
                      o que não entrar.
                    </span>
                    <button
                      type="button"
                      onClick={() => setAvisoDaAnamnese(null)}
                      className="shrink-0 underline underline-offset-2 hover:no-underline"
                    >
                      ok
                    </button>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setItens((prev) => [...prev, montarItemAvulso()])}
                  className="h-10 px-4 rounded-full border border-ink/15 text-ink text-[14px] font-semibold hover:border-ink/40 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Procedimento fora do catálogo
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <SectionHeader icon={<Calculator className="w-4 h-4" />}>Desconto</SectionHeader>

              <div className="rounded-2xl bg-card border border-ink/10 px-4 py-3.5 flex flex-col gap-3">
                <Interruptor
                  ligado={temDescontoCombinado}
                  onMudar={handleToggleCombinado}
                  rotulo="Desconto plano combinado"
                  descricao={`Sugestão: ${sugerirDescontoCombinado(procedimentosParaDesconto, clinic)}% para ${procedimentosParaDesconto} ${
                    procedimentosParaDesconto === 1 ? 'procedimento' : 'procedimentos'
                  }.`}
                />
                {temDescontoCombinado && (
                  <div className="flex items-end gap-3">
                    <CampoTinta
                      rotulo="Percentual"
                      htmlFor="orcamento-desconto-combinado"
                      sufixo={<span className="text-[14px] font-semibold text-ink-soft">%</span>}
                      className="w-36"
                    >
                      <input
                        id="orcamento-desconto-combinado"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={descontoCombinadoPercentual}
                        onChange={(e) => setDescontoCombinadoPercentual(Number(e.target.value) || 0)}
                        className={`${INPUT_TINTA} tabular-nums`}
                      />
                    </CampoTinta>
                    <p className="text-[13px] text-ink-soft pb-3">
                      abate {formatBRL(totais.descontoCombinadoValor)}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-card border border-ink/10 p-4 space-y-1.5 text-[14px] tabular-nums">
                <div className="flex justify-between text-ink-soft">
                  <span>Subtotal</span>
                  <span>{formatBRL(totais.subtotal)}</span>
                </div>
                {temDescontoCombinado && totais.descontoCombinadoValor > 0 && (
                  <div className="flex justify-between text-ink-soft">
                    <span>Desconto plano combinado ({descontoCombinadoPercentual}%)</span>
                    <span>− {formatBRL(totais.descontoCombinadoValor)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 mt-1 border-t border-ink/8 text-ink font-bold">
                  <span>Total</span>
                  <span className="text-[17px]">{formatBRL(totais.total)}</span>
                </div>
                {totais.descontoEfetivoPercentual > 0 && (
                  <p className="text-[13px] text-ink-soft pt-1">
                    Desconto efetivo de {totais.descontoEfetivoPercentual.toFixed(1).replace('.', ',')}
                    % sobre os valores de tabela
                  </p>
                )}
              </div>
            </div>

            {/* Seção interna — custo de material. Nunca vai para o documento do orçamento. */}
            <CustoDeMaterialDoOrcamento
              itens={itens}
              custos={custos}
              produtos={produtos}
              totalDoOrcamento={totais.total}
              onChange={mudarConsumoDoItem}
              onRecalcular={recalcularConsumoDoItem}
            />
          </>
        )}

        {/* ETAPA 3 — O PAGAMENTO */}
        {etapa === 3 && (
          <div className="space-y-4">
            <SectionHeader icon={<CreditCard className="w-4 h-4" />}>
              Formas de pagamento ({opcoesPagamento.length})
            </SectionHeader>

            <p className="text-[13px] text-ink-soft -mt-2">
              A primeira forma é a principal — dá o valor do bloco preto no PDF. As demais aparecem
              como alternativas, ex.: cartão parcelado com Pix à vista com desconto ao lado.
            </p>

            <div className="space-y-3">
              {opcoesPagamento.map((opcao, index) => {
                const resultado = totais.opcoesPagamento[index];
                return (
                  <QuotePaymentOptionEditor
                    key={opcao.id}
                    opcao={opcao}
                    valorFinal={resultado?.valorFinal ?? 0}
                    parcela={resultado?.parcela ?? null}
                    principal={index === 0}
                    podeRemover={opcoesPagamento.length > 1}
                    onChange={updateOpcaoPagamento}
                    onRemove={() => removeOpcaoPagamento(opcao.id)}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={addOpcaoPagamento}
              className="h-10 px-4 rounded-full border border-ink/15 text-ink text-[14px] font-semibold hover:border-ink/40 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Adicionar forma de pagamento
            </button>

            <CampoTinta rotulo="Negociação (opcional)" htmlFor="orcamento-negociacao">
              <textarea
                id="orcamento-negociacao"
                value={negociacao}
                onChange={(e) => setNegociacao(e.target.value)}
                rows={2}
                placeholder="Entrada de R$ 800,00 no Pix e o restante parcelado..."
                className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
              />
            </CampoTinta>

            <CampoTinta rotulo="Observações (opcional)" htmlFor="orcamento-observacoes">
              <textarea
                id="orcamento-observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Você pode iniciar por um único procedimento e incluir o outro depois..."
                className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
              />
            </CampoTinta>
          </div>
        )}

        {/* ETAPA 4 — REVISAR: o que vai sair, antes de salvar. */}
        {etapa === 4 && (
          <div className="space-y-3">
            <div className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setEtapa(1)} className="min-w-0 text-left group">
                  <span className="block text-[12px] font-semibold text-ink-soft">Para</span>
                  <span className="block text-[17px] font-bold text-ink truncate group-hover:underline underline-offset-2">
                    {pacienteNome.trim() || 'Falta escolher a paciente'}
                  </span>
                </button>
                <div className="text-right shrink-0">
                  <span className="block text-[12px] font-semibold text-ink-soft">Válido até</span>
                  <span className="block text-[15px] font-bold text-ink tabular-nums">
                    {dataValidade ? new Date(dataValidade).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>
              </div>

              <ul className="border-t border-ink/8 divide-y divide-ink/8">
                {itens.length === 0 ? (
                  <li className="py-3 text-[14px] text-ink-soft">
                    Nenhum procedimento ainda.{' '}
                    <button type="button" onClick={() => setEtapa(2)} className="font-semibold text-ink underline underline-offset-2">
                      Adicionar
                    </button>
                  </li>
                ) : (
                  itens.map((item) => (
                    <li key={item.id} className="py-2.5 flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-ink">{item.titulo || 'Sem título'}</span>
                        <span className="block text-[13px] text-ink-soft truncate">
                          {[
                            item.profissionalNome,
                            itemSessoes(item) > 1 ? `${itemSessoes(item)} sessões` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Sem profissional'}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-bold text-ink tabular-nums">
                        {formatBRL(itemValorFinal(item))}
                      </span>
                    </li>
                  ))
                )}
              </ul>

              <div className="border-t border-ink/8 pt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <span className="block text-[12px] font-semibold text-ink-soft">Investimento</span>
                  {opcaoPrincipal && principal && (
                    <span className="block text-[13px] text-ink-soft">
                      {NOME_FORMA_PAGAMENTO[opcaoPrincipal.forma]}
                      {principal.parcela ? ` · ${principal.parcelas}× de ${formatBRL(principal.parcela)}` : ''}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[22px] font-bold text-ink tabular-nums">
                  {formatBRL(principal ? principal.valorFinal : totais.total)}
                </span>
              </div>
            </div>

            <p className="text-[13px] text-ink-soft px-1">
              Toque numa etapa lá em cima para corrigir qualquer coisa — nada do que já foi preenchido
              se perde.
            </p>
          </div>
        )}
      </form>

      {/* Fora do <form>: um clique no mapa não pode disparar o submit do orçamento. */}
      <LaserQuoteMapModal
        isOpen={mapaAberto}
        onClose={() => setMapaAberto(false)}
        procedures={procedures}
        clinic={clinic}
        selecionadas={areasNoOrcamento}
        onToggle={alternarAreaDoLaser}
      />

      <ConfirmDialog
        pedido={
          confirmarRemocao
            ? {
                titulo: `Remover ${nomeCurtoDaArea(confirmarRemocao.titulo)} do orçamento?`,
                mensagem:
                  'Este item já foi ajustado — desconto, número de sessões ou detalhes. Removê-lo ' +
                  'descarta esses ajustes, e eles não voltam ao marcar a área de novo.',
                textoConfirmar: 'Remover mesmo assim',
                onConfirmar: () => {
                  removeItem(confirmarRemocao.id);
                  setConfirmarRemocao(null);
                },
              }
            : null
        }
        onFechar={() => setConfirmarRemocao(null)}
      />
    </SidePanel>
  );
};
