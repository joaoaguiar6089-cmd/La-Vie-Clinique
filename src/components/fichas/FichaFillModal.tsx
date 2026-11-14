import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import {
  AnamnesisQuestion,
  ClinicProfile,
  EvaluationRecord,
  EvaluationTemplate,
  FotoDaSessao,
  GrupoDePerguntasExtra,
  MateriaisDoAtendimento,
  Patient,
  Procedure,
  Professional,
} from '../../types';
import { QuestionFieldRenderer } from '../anamnesis/QuestionFieldRenderer';
import { PhotoAnnotationEditor } from '../anamnesis/PhotoAnnotationEditor';
import {
  fichaDeAvaliacaoPara,
  fichaTemConteudo,
  fotosDaSessao,
  MAX_FOTOS_DA_SESSAO,
  perguntasDaAvaliacao,
  perguntasRespondidas,
} from '../../utils/evaluations';
import { AlvoDaFicha, ROTULOS_DA_FICHA, TipoDeFicha } from '../../utils/fichasClinicas';
import {
  ehPerguntaExtra,
  grupoDaFichaModelo,
  gruposParaGravar,
  ID_DO_GRUPO_LIVRE,
  novoDadoLivre,
  TITULO_DO_GRUPO_LIVRE,
} from '../../utils/gruposExtras';
import { montarMateriaisDoAtendimento } from '../../utils/estoque';
import { resolveTemplatePhoto } from '../../utils/genderPhoto';
import { downscaleImage } from '../../utils/imageCompressor';
import { subirImagemOuManter } from '../../services/imageStorage';
import {
  deleteMateriaisDoAtendimento,
  deleteRegistroDeFicha,
  getRegistroDeFicha,
  saveMateriaisDoAtendimento,
  saveRegistroDeFicha,
  subscribeToFichasModelo,
  subscribeToPerguntasGeraisDaFicha,
} from '../../services/databaseService';
import { formatDateOnly } from '../../utils/formatters';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { PrintableFichaSheet } from './PrintableFichaSheet';
import { SidePanel } from '../common/SidePanel';
import { SecaoUsoDeMaterial, useUsoDeMaterial } from '../estoque/UsoDeMaterial';
import {
  OrcamentoGravado,
  SecaoDadosDoOrcamentoDaAvaliacao,
  SecaoOrcamentoDaAvaliacao,
  useOrcamentoDaAvaliacao,
} from './OrcamentoDaAvaliacao';
import { PerguntaCriadaNaHora } from './PerguntaCriadaNaHora';

interface FichaFillModalProps {
  tipo: TipoDeFicha;
  isOpen: boolean;
  onClose: () => void;
  /** Sobre quem e sobre o quê — ver `AlvoDaFicha`. O `registroId` dele é o id da ficha. */
  alvo: AlvoDaFicha;
  /** O cadastro da paciente, quando há: o gênero dela escolhe o mapa anatômico. */
  paciente?: Patient;
  catalogo: Procedure[];
  professionals: Professional[];
  /** Cabeçalho do documento impresso. */
  clinicProfile: ClinicProfile;
  /** Avisa quem abriu que a ficha mudou. */
  onSalvou?: () => void;
  /** "Cadastrar ficha para este procedimento" — leva ao gerenciador. */
  onCadastrarFicha?: (alvo: { procedureId?: string; procedimentoNome: string }) => void;
}

const labelClass = 'block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1';

/**
 * As perguntas uma embaixo da outra; no computador largo, em duas colunas — é o que faz a página
 * de perguntas caber sem rolar. Grade, e não colunas de texto: com colunas de texto, uma resposta
 * que cresce empurraria as perguntas de uma coluna para a outra enquanto se digita.
 */
const COLUNAS_DE_PERGUNTAS = 'space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-5 lg:items-start';

/**
 * Qual foto está no editor de anotação: o mapa, ou a foto da sessão naquela posição da lista.
 * `null` = editor fechado — e é contra `null` que se compara, porque a primeira foto é o 0.
 */
type AlvoAnotacao = 'modelo' | number | null;

/**
 * As páginas da ficha no computador, uma por assunto — ver o comentário de `FichaFillModal`.
 * Só entram as que a ficha tem: sem mapa nem foto, não há página de fotos; materiais só no
 * relatório de um atendimento; o orçamento só na avaliação, e os dados dele só com ele montado.
 */
type Pagina = 'perguntas' | 'fotos' | 'observacoes' | 'materiais' | 'orcamento' | 'dadosDoOrcamento';

/**
 * O formulário das duas fichas clínicas: a **avaliação** (antes do procedimento, emitida pela
 * seção) e o **acompanhamento** (depois de cada atendimento).
 *
 * As fichas-modelo e as perguntas gerais do tipo são assinadas aqui dentro, e não recebidas por
 * prop: quem abre o formulário — a aba da paciente, a agenda, a tela Hoje, a própria seção — só
 * precisa dizer o tipo e o alvo. As assinaturas são compartilhadas, então abrir de novo não custa
 * leitura.
 *
 * Um documento por ficha. Numa paciente com plano de 10 sessões, são 10 acompanhamentos
 * independentes — é o que transforma as sessões num histórico de evolução em vez de um único
 * documento sobrescrito.
 *
 * O acompanhamento carrega também os materiais usados ("Uso de material?"), sem valor nenhum na
 * tela: ele é preenchido ao lado da paciente. Continuam dois documentos — a ficha e os materiais —
 * gravados pelo mesmo botão; o custo aparece só no Financeiro.
 *
 * **No computador**, a ficha abre numa janela flutuante no meio da tela, quase do tamanho dela, e
 * vai em páginas por assunto — perguntas; mapa e fotos; observações; materiais ou o orçamento
 * (procedimentos e pagamento, depois os dados dele) — para preencher sem rolar. As abas no topo e
 * os botões do rodapé passam de uma para outra; o Salvar vale em qualquer página. **No celular**
 * nada disso: tela cheia e tudo numa rolagem só, como sempre foi. As páginas que não estão na tela
 * só ficam escondidas (`sm:hidden`), montadas, então nada do que foi preenchido se perde ao trocar.
 *
 * O **PDF** grava antes de abrir a folha: a folha sai do que está gravado, e quem acabou de
 * responder uma pergunta espera vê-la ali sem ter que lembrar de salvar antes.
 */
export const FichaFillModal: React.FC<FichaFillModalProps> = ({
  tipo,
  isOpen,
  onClose,
  alvo,
  paciente,
  catalogo,
  professionals,
  clinicProfile,
  onSalvou,
  onCadastrarFicha,
}) => {
  const rotulos = ROTULOS_DA_FICHA[tipo];

  const [fichas, setFichas] = useState<EvaluationTemplate[]>([]);
  const [gerais, setGerais] = useState<AnamnesisQuestion[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Conta os erros de salvar: o aviso mora no topo e o botão, no rodapé — cada erro novo leva a
   * rolagem de volta ao topo (é a `etapa` do painel), senão o Salvar parece não fazer nada.
   */
  const [errosAoSalvar, setErrosAoSalvar] = useState(0);
  /**
   * A ficha pode existir mas não pôde ser lida. O formulário não abre em branco nesse caso:
   * salvar gravaria respostas vazias por cima das que estavam lá.
   */
  const [leituraFalhou, setLeituraFalhou] = useState(false);
  const [registro, setRegistro] = useState<EvaluationRecord | null>(null);

  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [observacoes, setObservacoes] = useState('');
  /**
   * O mapa anatômico que **o registro gravou**, quando existe.
   *
   * Tem precedência sobre o da ficha-modelo: trocar a imagem no cadastro não pode mudar a figura
   * sobre a qual as anotações de março foram desenhadas. Vazio = usa a da ficha-modelo, resolvida
   * no render (`fotoModeloUrl`) e não aqui, para não amarrar o carregamento à ficha.
   */
  const [fotoModeloGravada, setFotoModeloGravada] = useState('');
  const [fotoModeloAnotadaUrl, setFotoModeloAnotadaUrl] = useState('');
  const [fotoModeloAnotacoesJson, setFotoModeloAnotacoesJson] = useState<string | undefined>();
  const [fotos, setFotos] = useState<FotoDaSessao[]>([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  /** Anexar, remover ou anotar uma foto não gera `input`/`change` no painel. */
  const [mexeuNasFotos, setMexeuNasFotos] = useState(false);
  const [anotando, setAnotando] = useState<AlvoAnotacao>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  /** O PDF está gravando a ficha para depois abrir a folha — o giro fica no botão dele. */
  const [gerandoPdf, setGerandoPdf] = useState(false);
  /** Gravações feitas sem fechar o formulário (o PDF): cada uma deixa o painel "sem alterações". */
  const [gravacoes, setGravacoes] = useState(0);
  /** A página aberta no computador. No celular não esconde nada — ver `naPagina`. */
  const [pagina, setPagina] = useState<Pagina>('perguntas');

  /**
   * Perguntas de outra ficha-modelo (só no relatório) e as criadas na hora (em toda ficha). Ver
   * `GrupoDePerguntasExtra`.
   */
  const [grupos, setGrupos] = useState<GrupoDePerguntasExtra[]>([]);
  /** Juntar ou tirar um grupo não gera `input`/`change` no painel. */
  const [mexeuNosGrupos, setMexeuNosGrupos] = useState(false);
  const [escolhendoFicha, setEscolhendoFicha] = useState(false);
  /** As fichas-modelo de avaliação, para puxar perguntas — assinadas só com a escolha aberta. */
  const [fichasDeAvaliacao, setFichasDeAvaliacao] = useState<EvaluationTemplate[] | null>(null);
  /** A pergunta recém-criada — o texto dela já abre com o cursor. */
  const [dadoRecemCriado, setDadoRecemCriado] = useState<string | null>(null);
  /** Puxar as perguntas de outra ficha-modelo — no relatório, para o procedimento sem ficha. */
  const montavel = tipo === 'acompanhamento';
  /**
   * Avaliação personalizada: sem ficha-modelo e sem perguntas gerais — só as perguntas que a
   * profissional cria na hora.
   */
  const personalizada = tipo === 'avaliacao' && !!(alvo.personalizada || registro?.personalizada);

  useEffect(() => {
    if (!isOpen || !escolhendoFicha || tipo !== 'acompanhamento') return;
    return subscribeToFichasModelo('avaliacao', setFichasDeAvaliacao);
  }, [isOpen, escolhendoFicha, tipo]);

  useEffect(() => {
    if (!isOpen) return;
    const pararFichas = subscribeToFichasModelo(tipo, setFichas);
    const pararGerais = subscribeToPerguntasGeraisDaFicha(tipo, setGerais);
    return () => {
      pararFichas();
      pararGerais();
    };
  }, [isOpen, tipo]);

  /**
   * A ficha-modelo do registro, quando ele já foi preenchido com uma; senão a que vale hoje para
   * o procedimento. Reabrir uma ficha antiga com o modelo de hoje trocaria a figura e as perguntas
   * sobre as quais ela foi escrita.
   */
  const ficha = useMemo(() => {
    if (personalizada) return undefined;
    const doRegistro = registro?.templateId
      ? fichas.find((f) => f.id === registro.templateId)
      : undefined;
    return doRegistro || fichaDeAvaliacaoPara(alvo, fichas, catalogo);
  }, [personalizada, registro?.templateId, alvo, fichas, catalogo]);

  const perguntas = useMemo(
    () => (personalizada ? [] : perguntasDaAvaliacao(gerais, ficha)),
    [personalizada, gerais, ficha]
  );

  /**
   * As perguntas que o registro gravado respondeu e que não estão mais no modelo — uma pergunta
   * apagada da ficha-modelo depois. Continuam aparecendo, senão a resposta sumiria da tela.
   */
  const perguntasSoDoRegistro = useMemo(
    () =>
      (registro?.perguntasSnapshot || []).filter(
        // As de grupo extra têm lugar próprio na tela; as de um grupo tirado saíram de propósito.
        (q) => !ehPerguntaExtra(q) && !perguntas.some((p) => p.id === q.id)
      ),
    [registro, perguntas]
  );

  const gruposDeFicha = grupos.filter((g) => !g.livre);
  const dadosLivres = grupos.find((g) => g.livre)?.perguntas || [];

  /** A gravada, senão a da ficha-modelo resolvida pelo gênero da paciente. */
  const fotoModeloUrl =
    fotoModeloGravada || (ficha ? resolveTemplatePhoto(ficha, paciente?.genero) || '' : '');

  /**
   * O relatório é o registro da sessão: as fotos aparecem sempre. Na avaliação, se o modelo pedir —
   * e sempre na personalizada, que não tem modelo para pedir.
   */
  const pedeFoto =
    tipo === 'acompanhamento' || personalizada || !!ficha?.temFotoSessao || fotos.length > 0;

  const profissional = useMemo(
    () => professionals.find((p) => p.id === alvo.professionalId),
    [professionals, alvo.professionalId]
  );

  /**
   * Cada abertura recomeça do banco. Sobras do preenchimento anterior virariam a ficha de uma
   * sessão gravada por cima da de outra — o mesmo cuidado que o formulário de atendimento toma.
   */
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;

    setErro(null);
    setLeituraFalhou(false);
    setPagina('perguntas');
    setImprimindo(false);
    setGerandoPdf(false);
    setAnotando(null);
    setMexeuNasFotos(false);
    setMexeuNosGrupos(false);
    setEscolhendoFicha(false);

    const aplicar = (existente: EvaluationRecord | null) => {
      setRegistro(existente);
      setRespostas(existente?.respostas || {});
      setObservacoes(existente?.observacoes || '');
      setFotos(fotosDaSessao(existente));
      setGrupos(existente?.gruposExtras || []);
      setFotoModeloAnotadaUrl(existente?.fotoModeloAnotadaUrl || '');
      setFotoModeloAnotacoesJson(existente?.fotoModeloAnotacoesJson);
      setFotoModeloGravada(existente?.fotoModeloUrl || '');
    };

    // Ficha recém-emitida: não há o que buscar, e a leitura seria cobrada à toa.
    if (alvo.novo) {
      aplicar(null);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    (async () => {
      try {
        const existente = await getRegistroDeFicha(tipo, alvo.registroId);
        if (cancelado) return;
        aplicar(existente);
      } catch (e) {
        console.error(e);
        if (!cancelado) {
          setErro(`Não foi possível carregar ${rotulos.artigo} ${rotulos.minusculo}. Feche e tente de novo.`);
          setLeituraFalhou(true);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
    // Depende só da identidade da ficha, e **não** de `ficha`.
    //
    // `ficha` é derivada de `fichas`/`catalogo`, que vêm de assinaturas ao vivo: qualquer
    // gravação na clínica produz arrays novos, recalcula `ficha` e faria este efeito rodar de novo,
    // jogando fora o que a profissional estivesse digitando neste instante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tipo, alvo.registroId]);

  const uso = useUsoDeMaterial(alvo, catalogo, isOpen && tipo === 'acompanhamento');
  // O registro só vale depois de lido: antes disso, `null` quer dizer "ainda não sei", não "não há".
  const orcamento = useOrcamentoDaAvaliacao({
    alvo,
    paciente,
    catalogo,
    clinic: clinicProfile,
    ativo: isOpen && tipo === 'avaliacao',
    registro: carregando ? undefined : registro,
  });

  if (!isOpen) return null;

  const handleResposta = (questionId: string, valor: any) => {
    setRespostas((prev) => ({ ...prev, [questionId]: valor }));
  };

  /**
   * Uma ou várias fotos de uma vez — a galeria do celular deixa marcar várias. Sobem uma por vez,
   * e cada uma entra na lista assim que chega: se a quinta falhar, as quatro primeiras já estão lá.
   */
  const handleFotosSessao = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (arquivos.length === 0) return;

    const cabem = MAX_FOTOS_DA_SESSAO - fotos.length;
    if (cabem <= 0) {
      setErro(`Cada ficha aceita até ${MAX_FOTOS_DA_SESSAO} fotos. Remova uma para enviar outra.`);
      return;
    }
    const aceitos = arquivos.slice(0, cabem);

    setErro(null);
    setEnviandoFotos(true);
    try {
      for (const arquivo of aceitos) {
        const comprimida = await downscaleImage(arquivo);
        const url = await subirImagemOuManter(comprimida, `${rotulos.pastaDoStorage}/sessao`);
        setFotos((atual) => [...atual, { url }]);
        setMexeuNasFotos(true);
      }
      if (aceitos.length < arquivos.length) {
        setErro(
          `Cada ficha aceita até ${MAX_FOTOS_DA_SESSAO} fotos — entraram só as primeiras ${aceitos.length}.`
        );
      }
    } catch (err) {
      console.error(err);
      setErro('Falha ao processar a foto.');
    } finally {
      setEnviandoFotos(false);
    }
  };

  const removerFoto = (indice: number) => {
    setFotos((atual) => atual.filter((_, i) => i !== indice));
    setMexeuNasFotos(true);
  };

  const mudarLegenda = (indice: number, legenda: string) => {
    setFotos((atual) => atual.map((f, i) => (i === indice ? { ...f, legenda } : f)));
  };

  // ==========================================
  // GRUPOS EXTRAS E "NOVO DADO"
  // ==========================================

  /** Respostas de perguntas que saíram do formulário não podem ir para o snapshot. */
  const esquecerRespostas = (ids: string[]) => {
    if (ids.length === 0) return;
    setRespostas((prev) => {
      const prox = { ...prev };
      ids.forEach((id) => delete prox[id]);
      return prox;
    });
  };

  const adicionarGrupo = (modelo: EvaluationTemplate, origem: TipoDeFicha) => {
    const grupo = grupoDaFichaModelo(modelo, origem);
    // Antes do grupo livre: as perguntas criadas na hora ficam sempre por último, junto do botão.
    setGrupos((atual) => [...atual.filter((g) => !g.livre), grupo, ...atual.filter((g) => g.livre)]);
    setEscolhendoFicha(false);
    setMexeuNosGrupos(true);
  };

  const removerGrupo = (grupo: GrupoDePerguntasExtra) => {
    const tirar = () => {
      setGrupos((atual) => atual.filter((g) => g.id !== grupo.id));
      esquecerRespostas(grupo.perguntas.map((q) => q.id));
      setMexeuNosGrupos(true);
    };
    // Sem resposta nenhuma não há o que perder, e a pergunta só atrasaria.
    if (perguntasRespondidas(grupo.perguntas, respostas).length === 0) {
      tirar();
      return;
    }
    setConfirmacao({
      titulo: `Tirar "${grupo.titulo}"?`,
      mensagem: 'As respostas deste grupo saem deste relatório.',
      textoConfirmar: 'Tirar',
      tom: 'perigo',
      onConfirmar: tirar,
    });
  };

  /** As perguntas criadas na hora moram num grupo só; ele nasce com a primeira. */
  const mudarDadosLivres = (
    mudar: (perguntas: AnamnesisQuestion[]) => AnamnesisQuestion[]
  ) => {
    setGrupos((atual) => {
      const livre = atual.find((g) => g.livre);
      const perguntas = mudar(livre?.perguntas || []);
      const resto = atual.filter((g) => !g.livre);
      return perguntas.length === 0
        ? resto
        : [
            ...resto,
            { id: ID_DO_GRUPO_LIVRE, titulo: TITULO_DO_GRUPO_LIVRE, livre: true, perguntas },
          ];
    });
  };

  const adicionarDadoLivre = () => {
    const novo = novoDadoLivre(dadosLivres.length);
    mudarDadosLivres((perguntas) => [...perguntas, novo]);
    setDadoRecemCriado(novo.id);
    setMexeuNosGrupos(true);
  };

  const mudarDadoLivre = (pergunta: AnamnesisQuestion) =>
    mudarDadosLivres((perguntas) => perguntas.map((q) => (q.id === pergunta.id ? pergunta : q)));

  /** A resposta de antes não serve ao tipo novo — "sim" não é uma data. */
  const trocarTipoDoDadoLivre = (pergunta: AnamnesisQuestion) => {
    mudarDadoLivre(pergunta);
    esquecerRespostas([pergunta.id]);
    setMexeuNosGrupos(true);
  };

  const removerDadoLivre = (id: string) => {
    mudarDadosLivres((perguntas) => perguntas.filter((q) => q.id !== id));
    esquecerRespostas([id]);
    setMexeuNosGrupos(true);
  };

  const handleSalvarAnotacao = async (dataUrl: string, annotationsJson: string) => {
    const url = await subirImagemOuManter(dataUrl, `${rotulos.pastaDoStorage}/anotadas`);
    if (anotando === 'modelo') {
      setFotoModeloAnotadaUrl(url);
      setFotoModeloAnotacoesJson(annotationsJson);
    } else if (typeof anotando === 'number') {
      const indice = anotando;
      setFotos((atual) =>
        atual.map((f, i) => (i === indice ? { ...f, anotadaUrl: url, anotacoesJson: annotationsJson } : f))
      );
      setMexeuNasFotos(true);
    }
    setAnotando(null);
  };

  /**
   * Grava a ficha (e o orçamento, e os materiais). O Salvar fecha o formulário depois.
   *
   * `paraImprimir` é o PDF: grava o que está na tela e, em vez de fechar, abre a folha com o que
   * acabou de ser gravado — a folha sai sempre do gravado, então sem gravar antes ela mostraria
   * as respostas de antes da última mexida. O formulário continua aberto atrás da folha, e o que
   * estava mexido passa a contar como salvo.
   */
  const handleSalvar = async (paraImprimir = false) => {
    // O orçamento da avaliação é conferido antes de gravar qualquer coisa.
    const problemaNoOrcamento = orcamento.validar();
    if (problemaNoOrcamento) {
      setErro(problemaNoOrcamento.mensagem);
      // No computador, leva à página onde está o campo com o aviso.
      setPagina(problemaNoOrcamento.parte === 'dados' ? 'dadosDoOrcamento' : 'orcamento');
      setErrosAoSalvar((n) => n + 1);
      return;
    }
    setSalvando(true);
    setGerandoPdf(paraImprimir);
    setErro(null);
    const agora = new Date().toISOString();
    const gruposExtras = gruposParaGravar(grupos, respostas);
    const todasAsPerguntas = [
      ...perguntas,
      ...gruposExtras.flatMap((g) => g.perguntas),
      ...perguntasSoDoRegistro,
    ];
    const materiais = uso.plano();
    /*
      A ficha só é gravada se tem o que guardar, ou se já existia. Lançar só os materiais não
      pode criar um acompanhamento em branco — ele apareceria como preenchido na lista da seção.
    */
    const gravarFicha =
      tipo === 'avaliacao' ||
      !!registro ||
      fichaTemConteudo({
        perguntas: todasAsPerguntas,
        respostas,
        fotosSessao: fotos,
        fotoModeloAnotadaUrl,
        observacoes,
      });
    if (!gravarFicha && materiais.acao === 'manter') {
      if (paraImprimir) {
        // Nada gravado e nada para gravar: não há folha preenchida para mostrar.
        setErro(
          `Nada preenchido ainda — responda alguma pergunta para gerar o PDF ${
            rotulos.artigo === 'a' ? 'da' : 'do'
          } ${rotulos.minusculo}.`
        );
        setErrosAoSalvar((n) => n + 1);
        setSalvando(false);
        setGerandoPdf(false);
        return;
      }
      onClose();
      return;
    }

    let etapa: 'orcamento' | 'ficha' | 'materiais' = 'ficha';
    let doOrcamento: OrcamentoGravado = { consumoEstimado: [] };
    try {
      // Só a avaliação tem orçamento. Vai primeiro: a ficha guarda o id que ele ganhar.
      if (tipo === 'avaliacao') {
        etapa = 'orcamento';
        doOrcamento = await orcamento.gravar();
        etapa = 'ficha';
      }

      if (gravarFicha) {
        const novo: EvaluationRecord = {
          id: alvo.registroId,
          atendimentoId: alvo.atendimentoId,
          pacienteId: alvo.pacienteId,
          pacienteNome: alvo.pacienteNome,
          pacienteGenero: paciente?.genero || registro?.pacienteGenero,
          procedureId: alvo.procedureId,
          procedimentoNome: alvo.procedimentoNome,
          dataAtendimento: alvo.data,
          professionalId: alvo.professionalId,
          profissionalNome: profissional?.name || alvo.profissionalNome,
          templateId: ficha?.id,
          personalizada: personalizada || undefined,
          respostas,
          // Só o que foi respondido: congelar a ficha-modelo inteira faria cada ficha pagar KB
          // por pergunta em branco, e a cota do Firestore aqui é por KB gravado.
          perguntasSnapshot: perguntasRespondidas(todasAsPerguntas, respostas),
          // Vai inteiro, respondido ou não: é o que permite reabrir e completar depois.
          gruposExtras: gruposExtras.length > 0 ? gruposExtras : undefined,
          fotoModeloUrl: fotoModeloUrl || undefined,
          fotoModeloAnotadaUrl: fotoModeloAnotadaUrl || undefined,
          fotoModeloAnotacoesJson,
          // Os campos legados (`fotoSessaoUrl`…) são espelhados da primeira por `saveRegistroDeFicha`.
          fotosSessao: fotos,
          // Só a avaliação estima consumo e tem orçamento; vazio apaga o que estava gravado.
          consumoEstimado: tipo === 'avaliacao' ? doOrcamento.consumoEstimado : undefined,
          orcamentoId: tipo === 'avaliacao' ? doOrcamento.orcamentoId : undefined,
          observacoes: observacoes.trim() || undefined,
          preenchidoEm: registro?.preenchidoEm || agora,
          createdAt: registro?.createdAt || agora,
        };
        await saveRegistroDeFicha(tipo, novo);
        // Se os materiais falharem, a segunda tentativa regrava a ficha com as mesmas datas.
        // É também o que a folha do PDF mostra, e o "última alteração" do pé da ficha.
        setRegistro({ ...novo, updatedAt: agora });
      }

      etapa = 'materiais';
      /** O que ficou gravado dos materiais — `undefined` = não mexeu neles. */
      let materiaisGravados: MateriaisDoAtendimento | null | undefined;
      if (materiais.acao === 'gravar' && alvo.atendimentoId) {
        materiaisGravados = montarMateriaisDoAtendimento(
          { ...alvo, atendimentoId: alvo.atendimentoId },
          materiais.itens,
          uso.registro,
          agora
        );
        await saveMateriaisDoAtendimento(materiaisGravados);
      } else if (materiais.acao === 'apagar' && alvo.atendimentoId) {
        await deleteMateriaisDoAtendimento(alvo.atendimentoId);
        materiaisGravados = null;
      }

      onSalvou?.();

      // O custo de material do orçamento falhou (a avaliação e o orçamento estão salvos), ou é o
      // PDF: o painel fica aberto, e o que estava na tela passa a ser o gravado. Salvar de novo
      // atualiza o mesmo orçamento e os mesmos materiais.
      if (paraImprimir || doOrcamento.aviso) {
        if (materiaisGravados !== undefined) uso.marcarGravado(materiaisGravados);
        orcamento.marcarGravado();
        setMexeuNasFotos(false);
        setMexeuNosGrupos(false);
        setGravacoes((n) => n + 1);
        setSalvando(false);
        setGerandoPdf(false);
      }
      if (doOrcamento.aviso) {
        setErro(`A avaliação foi salva. ${doOrcamento.aviso}`);
        setErrosAoSalvar((n) => n + 1);
      }
      if (paraImprimir) {
        if (gravarFicha) {
          setImprimindo(true);
        } else {
          // Só os materiais tinham o que gravar: o relatório continua em branco, sem folha.
          setErro(
            `Os materiais foram salvos. O PDF sai depois que ${rotulos.artigo} ${rotulos.minusculo} tiver alguma resposta.`
          );
          setErrosAoSalvar((n) => n + 1);
        }
        return;
      }
      if (doOrcamento.aviso) return;
      onClose();
    } catch (e) {
      console.error(e);
      const motivo = (e as Error).message;
      setErro(
        etapa === 'orcamento'
          ? `Não foi possível salvar o orçamento — a avaliação não foi salva: ${motivo}`
          : etapa === 'ficha'
          ? `Não foi possível salvar ${rotulos.artigo} ${rotulos.minusculo}: ${motivo}`
          : gravarFicha
          ? `O relatório foi salvo, mas os materiais não: ${motivo} Toque em Salvar de novo.`
          : `Não foi possível salvar os materiais: ${motivo}`
      );
      setErrosAoSalvar((n) => n + 1);
      setSalvando(false);
      setGerandoPdf(false);
    }
  };

  /**
   * `window.confirm` não serve aqui: em contexto embutido ele responde sozinho, sem mostrar nada
   * — ou a exclusão nunca roda, ou roda sem perguntar. Ver `ConfirmDialog`.
   *
   * No acompanhamento, excluir leva a ficha e os materiais: os dois são o mesmo formulário.
   */
  const pedirExclusao = () => {
    if (!registro && !uso.registro) return;
    const oQueSai =
      registro && uso.registro
        ? 'As respostas, as anotações das fotos e os materiais registrados são apagados.'
        : registro
        ? 'As respostas e as anotações das fotos são apagadas.'
        : 'Os materiais registrados são apagados.';
    setConfirmacao({
      titulo: `Excluir ${rotulos.artigo === 'a' ? 'esta' : 'este'} ${rotulos.minusculo}?`,
      mensagem:
        oQueSai +
        (tipo === 'acompanhamento' ? ' O atendimento em si não é afetado.' : '') +
        (registro?.orcamentoId ? ' O orçamento montado nela continua em Orçamentos.' : ''),
      textoConfirmar: 'Excluir',
      tom: 'perigo',
      onConfirmar: async () => {
        setSalvando(true);
        try {
          if (registro) await deleteRegistroDeFicha(tipo, registro);
          if (uso.registro && alvo.atendimentoId) {
            await deleteMateriaisDoAtendimento(alvo.atendimentoId);
          }
          onSalvou?.();
          onClose();
        } catch (e) {
          console.error(e);
          setErro(`Não foi possível excluir ${rotulos.artigo} ${rotulos.minusculo}.`);
          setSalvando(false);
        }
      },
    });
  };

  /**
   * As fichas-modelo de onde dá para puxar perguntas: as de acompanhamento primeiro (são do mesmo
   * momento da jornada), depois as de avaliação. Ficha sem pergunta nenhuma não entra — escolhê-la
   * não acrescentaria nada.
   */
  type OpcaoDeGrupo = { tipo: TipoDeFicha; rotulo: string; fichas: EvaluationTemplate[] };
  const opcoesDeGrupo: OpcaoDeGrupo[] = (
    [
      { tipo: 'acompanhamento', rotulo: 'Fichas de relatório', fichas },
      { tipo: 'avaliacao', rotulo: 'Fichas de avaliação', fichas: fichasDeAvaliacao || [] },
    ] as OpcaoDeGrupo[]
  )
    .map((o) => ({ ...o, fichas: o.fichas.filter((f) => (f.perguntas || []).length > 0) }))
    .filter((o) => o.fichas.length > 0);

  const fotoModeloExibida = fotoModeloAnotadaUrl || fotoModeloUrl;
  const fotoEmAnotacao = typeof anotando === 'number' ? fotos[anotando] : undefined;

  // ==========================================
  // AS PÁGINAS (SÓ NO COMPUTADOR)
  // ==========================================

  const temMapa = !!fotoModeloUrl;
  const paginas: { id: Pagina; rotulo: string }[] = [
    { id: 'perguntas', rotulo: 'Perguntas' },
    ...(temMapa || pedeFoto
      ? [
          {
            id: 'fotos' as const,
            rotulo: temMapa && pedeFoto ? 'Mapa e fotos' : temMapa ? 'Mapa anatômico' : 'Fotos',
          },
        ]
      : []),
    { id: 'observacoes', rotulo: 'Observações' },
    ...(uso.ativo ? [{ id: 'materiais' as const, rotulo: 'Materiais' }] : []),
    ...(orcamento.ativo ? [{ id: 'orcamento' as const, rotulo: 'Procedimentos e pagamento' }] : []),
    ...(orcamento.ativo && orcamento.comDados
      ? [{ id: 'dadosDoOrcamento' as const, rotulo: 'Dados do orçamento' }]
      : []),
  ];
  // A página escolhida pode sumir (o orçamento desmarcado leva os dados dele): volta à primeira.
  const indiceDaPagina = Math.max(0, paginas.findIndex((p) => p.id === pagina));
  const paginaAtiva = paginas[indiceDaPagina].id;
  const paginaAnterior = paginas[indiceDaPagina - 1];
  const proximaPagina = paginas[indiceDaPagina + 1];
  /**
   * A página que não está aberta some **só no computador** (`sm:hidden`); no celular tudo continua
   * numa rolagem só. E some escondida, não desmontada: o que foi digitado nela fica.
   */
  const naPagina = (id: Pagina) => (paginaAtiva === id ? '' : 'sm:hidden');
  const comPaginas = !carregando && !leituraFalhou;

  /* As abas, presas sob o título. Tocáveis em qualquer ordem: a ficha não tem etapa obrigatória. */
  const navegacao = comPaginas ? (
    <nav
      aria-label={`Páginas ${rotulos.artigo === 'a' ? 'da' : 'do'} ${rotulos.minusculo}`}
      className="hidden sm:block px-5 sm:px-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ol className="flex gap-7 w-max">
        {paginas.map((p, i) => {
          const ativa = p.id === paginaAtiva;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPagina(p.id)}
                aria-current={ativa ? 'page' : undefined}
                className={`pt-1 pb-3 border-b-2 text-[14px] font-semibold whitespace-nowrap transition-colors ${
                  ativa
                    ? 'text-white border-brand-light'
                    : 'text-cream/60 border-transparent hover:text-cream'
                }`}
              >
                <span className={`mr-0.5 tabular-nums ${ativa ? 'text-brand-light' : ''}`}>{i + 1}</span>{' '}
                {p.rotulo}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  ) : null;

  /*
    O PDF grava antes de abrir a folha (ver `handleSalvar`): a folha sai do que está **gravado** —
    o documento precisa corresponder ao que o prontuário guarda —, e assim ela já sai com o que
    acabou de ser preenchido. Por isso também aparece antes do primeiro salvamento.

    No computador, entre o Excluir e os botões de sempre, o "voltar" e o "próxima" das páginas.
  */
  const rodape = carregando || leituraFalhou ? null : (
    <div className="flex items-center justify-between gap-3">
      {registro || uso.registro ? (
        <button
          onClick={pedirExclusao}
          disabled={salvando}
          className="min-h-[44px] px-2 text-body font-semibold text-muted hover:text-danger transition-colors disabled:opacity-40"
        >
          Excluir
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {paginaAnterior && (
          <button
            type="button"
            onClick={() => setPagina(paginaAnterior.id)}
            aria-label={`Voltar para ${paginaAnterior.rotulo}`}
            title={`Voltar para ${paginaAnterior.rotulo}`}
            className="hidden sm:inline-flex items-center gap-1.5 min-h-[44px] px-3 md:px-3.5 rounded-xl text-body-lg font-semibold text-ink-soft hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden md:inline">Voltar</span>
          </button>
        )}
        {proximaPagina && (
          <button
            type="button"
            onClick={() => setPagina(proximaPagina.id)}
            className="hidden sm:inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-line bg-card text-body-lg font-semibold text-ink hover:border-brand transition-colors"
          >
            {/* Na janela estreita, o nome da página não cabe ao lado dos outros botões. */}
            <span className="md:hidden">Próxima</span>
            <span className="hidden md:inline">{proximaPagina.rotulo}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {(paginaAnterior || proximaPagina) && (
          <span aria-hidden className="hidden sm:block w-px h-7 bg-line mx-1.5" />
        )}
        <button
          onClick={() => handleSalvar(true)}
          disabled={salvando || enviandoFotos}
          className="min-w-11 h-11 sm:px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-muted hover:text-brand hover:bg-surface-2 transition-colors disabled:opacity-40"
          title="Salvar e ver o PDF"
          aria-label={`Salvar e ver o PDF ${rotulos.artigo === 'a' ? 'da' : 'do'} ${rotulos.minusculo}`}
        >
          {gerandoPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
          <span className="hidden sm:inline text-body-lg font-semibold">PDF</span>
        </button>
        <button
          onClick={onClose}
          disabled={salvando}
          className="min-h-[44px] px-4 rounded-xl text-body-lg font-semibold text-ink-soft hover:bg-surface-2 transition-colors disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={() => handleSalvar()}
          disabled={salvando || enviandoFotos}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-ink text-white text-body-lg font-semibold transition-colors disabled:opacity-40"
        >
          {salvando && !gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salvar
        </button>
      </div>
    </div>
  );

  return (
    <SidePanel
      aberto
      onFechar={onClose}
      titulo={rotulos.nome}
      sobretitulo={`${alvo.pacienteNome} · ${alvo.procedimentoNome} · ${formatDateOnly(alvo.data)}`}
      formato="central"
      largura="tela"
      navegacao={navegacao}
      // Trocar de página e cada erro novo levam a rolagem ao topo — o aviso mora lá.
      etapa={`${paginaAtiva}:${errosAoSalvar}`}
      gravado={gravacoes}
      bloqueado={salvando}
      /* Anotar uma foto, anexar a foto da sessão ou tirar um material da lista não gera
         `input`/`change` no painel. A anotação do mapa só conta se é diferente da gravada. */
      alterado={
        mexeuNasFotos ||
        mexeuNosGrupos ||
        fotoModeloAnotadaUrl !== (registro?.fotoModeloAnotadaUrl || '') ||
        uso.mexido ||
        orcamento.mexido
      }
      rodape={rodape}
    >
      <div className="bg-card min-h-full">
        <div className="px-4 sm:px-8 lg:px-10 py-5 sm:py-7 space-y-6">
          {carregando ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : leituraFalhou ? (
            <div className="flex items-start gap-2 text-[13px] text-danger bg-danger-bg border border-danger-line rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          ) : (
            <>
              {erro && (
                <div className="flex items-start gap-2 text-[13px] text-danger bg-danger-bg border border-danger-line rounded-xl px-3.5 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{erro}</span>
                </div>
              )}

              {/* ===== Página 1 — as perguntas ===== */}
              <section className={`space-y-6 ${naPagina('perguntas')}`}>
                {/* Personalizada: não há ficha-modelo de propósito — as perguntas nascem aqui. */}
                {personalizada && (
                  <p className="text-[13px] text-ink-soft bg-surface border border-[rgba(26,26,26,.1)] rounded-xl px-3.5 py-3">
                    <strong className="text-ink">Avaliação personalizada</strong> — sem ficha-modelo.
                    Crie abaixo, em "Nova pergunta", as perguntas e os campos desta avaliação.
                  </p>
                )}

                {/*
                  Sem ficha cadastrada, a tela não fica vazia: sobram as observações (e a foto, no
                  relatório), as perguntas criadas na hora e o caminho para configurar. Um vazio sem
                  saída faria a profissional concluir que a funcionalidade está quebrada.
                */}
                {!ficha && !personalizada && (
                  <div className="text-[13px] text-ink-soft bg-surface border border-[rgba(26,26,26,.1)] rounded-xl px-3.5 py-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex-1 min-w-[200px]">
                        Nenhuma ficha-modelo de {rotulos.minusculo} cadastrada para{' '}
                        <strong className="text-ink">{alvo.procedimentoNome}</strong>.
                        {montavel
                          ? ' Dá para usar as perguntas de outra ficha-modelo e criar as suas em "Nova pergunta".'
                          : ' Dá para criar as perguntas em "Nova pergunta".'}
                      </span>
                      {onCadastrarFicha && (
                        <button
                          onClick={() =>
                            onCadastrarFicha({
                              procedureId: alvo.procedureId,
                              procedimentoNome: alvo.procedimentoNome,
                            })
                          }
                          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Cadastrar ficha
                        </button>
                      )}
                    </div>

                    {montavel && (
                      <button
                        type="button"
                        onClick={() => setEscolhendoFicha((v) => !v)}
                        aria-expanded={escolhendoFicha}
                        className="w-full flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border border-[rgba(26,26,26,.15)] bg-card text-left text-[14px] font-semibold text-ink hover:border-brand transition-colors"
                      >
                        <Layers className="w-4 h-4 text-brand shrink-0" />
                        <span className="flex-1 min-w-0">
                          Usar perguntas de uma ficha-modelo
                        </span>
                        {escolhendoFicha ? (
                          <ChevronUp className="w-4 h-4 text-muted shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                        )}
                      </button>
                    )}

                    {montavel && escolhendoFicha && (
                      <div className="space-y-3">
                        {fichasDeAvaliacao === null && opcoesDeGrupo.length === 0 ? (
                          <div className="flex justify-center py-3 text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        ) : opcoesDeGrupo.length === 0 ? (
                          <p className="text-[13px] text-muted">
                            Nenhuma ficha-modelo com perguntas cadastrada ainda. Use "Nova pergunta" para
                            criar os campos deste relatório.
                          </p>
                        ) : (
                          opcoesDeGrupo.map((opcao) => (
                            <div key={opcao.tipo} className="space-y-1.5">
                              <span className={labelClass}>{opcao.rotulo}</span>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {opcao.fichas.map((f) => {
                                  const jaUsada = grupos.some((g) => g.origemFichaId === f.id);
                                  const total = (f.perguntas || []).length;
                                  return (
                                    <button
                                      key={f.id}
                                      type="button"
                                      disabled={jaUsada}
                                      onClick={() => adicionarGrupo(f, opcao.tipo)}
                                      className="text-left rounded-xl border border-[rgba(26,26,26,.12)] bg-card px-3.5 py-2.5 hover:border-brand transition-colors disabled:opacity-50 disabled:hover:border-[rgba(26,26,26,.12)]"
                                    >
                                      <span className="block text-[14px] font-semibold text-ink">
                                        {f.nome}
                                      </span>
                                      <span className="block text-[12px] text-muted mt-0.5">
                                        {jaUsada
                                          ? 'Já está neste relatório'
                                          : `${total} pergunta${total === 1 ? '' : 's'}`}
                                      </span>
                                      {!jaUsada && (
                                        <span className="block text-[12px] text-gray-400 mt-1 line-clamp-2">
                                          {(f.perguntas || [])
                                            .slice(0, 3)
                                            .map((q) => q.texto)
                                            .join(' · ')}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {perguntas.length + perguntasSoDoRegistro.length > 0 && (
                  <div className="space-y-4">
                    {ficha && (
                      <h3 className="text-label font-semibold uppercase tracking-wider text-gray-400">
                        {ficha.nome}
                      </h3>
                    )}
                    {/* No computador largo, duas colunas: a página de perguntas cabe sem rolar. */}
                    <div className={COLUNAS_DE_PERGUNTAS}>
                      {[...perguntas, ...perguntasSoDoRegistro].map((q) => (
                        <QuestionFieldRenderer
                          key={q.id}
                          question={q}
                          value={respostas[q.id]}
                          onChange={(v) => handleResposta(q.id, v)}
                          // Sem asterisco: a ficha é documento interno e se completa ao longo do
                          // dia — marcar campo obrigatório aqui só criaria uma trava que a
                          // profissional teria que contornar para salvar o que já sabe.
                          hideMandatoryAsterisk
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Grupos puxados de outras fichas-modelo — cada um com o nome da ficha de origem */}
                {gruposDeFicha.map((g) => (
                  <div key={g.id} className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-label font-semibold uppercase tracking-wider text-gray-400">
                        {g.titulo}
                        {g.origemTipo === 'avaliacao' && (
                          <span className="normal-case tracking-normal font-normal"> · da avaliação</span>
                        )}
                      </h3>
                      <button
                        type="button"
                        onClick={() => removerGrupo(g)}
                        className="min-h-[36px] px-1 text-[13px] font-semibold text-muted hover:text-danger transition-colors"
                      >
                        Tirar grupo
                      </button>
                    </div>
                    <div className={COLUNAS_DE_PERGUNTAS}>
                      {g.perguntas.map((q) => (
                        <QuestionFieldRenderer
                          key={q.id}
                          question={q}
                          value={respostas[q.id]}
                          onChange={(v) => handleResposta(q.id, v)}
                          hideMandatoryAsterisk
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Perguntas criadas na hora — em toda ficha: o atendimento sempre traz alguma
                    pergunta que a ficha-modelo não previu. */}
                <div className="space-y-3">
                  {dadosLivres.length > 0 && (
                    <h3 className="text-label font-semibold uppercase tracking-wider text-gray-400">
                      {personalizada ? 'Perguntas desta avaliação' : TITULO_DO_GRUPO_LIVRE}
                    </h3>
                  )}
                  {dadosLivres.map((q) => (
                    <PerguntaCriadaNaHora
                      key={q.id}
                      pergunta={q}
                      valor={respostas[q.id]}
                      focar={q.id === dadoRecemCriado}
                      onMudarPergunta={mudarDadoLivre}
                      onTrocarTipo={trocarTipoDoDadoLivre}
                      onResponder={(v) => handleResposta(q.id, v)}
                      onRemover={() => removerDadoLivre(q.id)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={adicionarDadoLivre}
                    className="inline-flex items-center gap-1.5 min-h-[36px] text-[13px] font-semibold text-brand hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova pergunta
                  </button>
                </div>
              </section>

              {/* ===== Página 2 — o mapa anatômico e as fotos ===== */}
              {(temMapa || pedeFoto) && (
                <section
                  // A grade só na página aberta: o `lg:grid` venceria o `sm:hidden` das outras.
                  className={`space-y-6 ${
                    paginaAtiva !== 'fotos'
                      ? naPagina('fotos')
                      : temMapa && pedeFoto
                        ? 'lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start'
                        : ''
                  }`}
                >
                  {/* Mapa anatômico anotável */}
                  {fotoModeloUrl && (
                    <div className="space-y-2">
                      <span className={labelClass}>Mapa anatômico</span>
                      <div className="relative rounded-xl overflow-hidden border border-[rgba(26,26,26,.1)] bg-surface">
                        <img
                          src={fotoModeloExibida}
                          alt="Mapa anatômico do procedimento"
                          className="w-full object-contain max-h-[420px]"
                        />
                        <button
                          onClick={() => setAnotando('modelo')}
                          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink text-white text-[13px] font-semibold shadow-lg hover:bg-black transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {fotoModeloAnotadaUrl ? 'Editar anotações' : 'Anotar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fotos da sessão — quantas forem precisas, cada uma anotável à parte */}
                  {pedeFoto && (
                    <div className="space-y-2">
                      <span className={labelClass}>
                        {rotulos.rotuloDasFotos}
                        {fotos.length > 0 ? ` (${fotos.length})` : ''}
                      </span>
                      {fotos.length > 0 && (
                        <div className={`grid gap-3 ${fotos.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                          {fotos.map((foto, i) => (
                            <div
                              key={`${i}-${foto.url}`}
                              className="rounded-xl overflow-hidden border border-[rgba(26,26,26,.1)] bg-surface"
                            >
                              <div className="relative">
                                <img
                                  src={foto.anotadaUrl || foto.url}
                                  alt={foto.legenda?.trim() || `${rotulos.rotuloDaFoto} ${i + 1}`}
                                  className={`w-full object-contain ${fotos.length > 1 ? 'max-h-[300px]' : 'max-h-[420px]'}`}
                                />
                                <div className="absolute bottom-3 right-3 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => removerFoto(i)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 text-ink text-[13px] font-semibold shadow-lg hover:bg-white transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Remover
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAnotando(i)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink text-white text-[13px] font-semibold shadow-lg hover:bg-black transition-colors"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    {foto.anotadaUrl ? 'Editar anotações' : 'Anotar'}
                                  </button>
                                </div>
                              </div>
                              {/* Legenda: o que identifica a foto entre as outras da sessão */}
                              <input
                                value={foto.legenda || ''}
                                onChange={(e) => mudarLegenda(i, e.target.value)}
                                maxLength={60}
                                placeholder="Legenda — ex.: frente, perfil direito"
                                aria-label={`Legenda da foto ${i + 1}`}
                                className="w-full px-3.5 py-2.5 bg-card border-t border-[rgba(26,26,26,.1)] text-[14px] text-ink placeholder:text-gray-400 focus:outline-none focus:bg-white transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {fotos.length < MAX_FOTOS_DA_SESSAO && (
                        <label
                          className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(26,26,26,.2)] bg-surface transition-colors ${
                            fotos.length === 0 ? 'py-8' : 'py-4'
                          } ${enviandoFotos ? 'opacity-70' : 'cursor-pointer hover:border-brand'}`}
                        >
                          {enviandoFotos ? (
                            <Loader2 className="w-6 h-6 text-muted animate-spin" />
                          ) : fotos.length === 0 ? (
                            <Camera className="w-6 h-6 text-gray-400" />
                          ) : (
                            <Plus className="w-5 h-5 text-gray-400" />
                          )}
                          <span className="text-[13px] font-semibold text-ink-soft">
                            {enviandoFotos
                              ? 'Enviando…'
                              : fotos.length === 0
                              ? `Enviar ${rotulos.rotuloDasFotos.toLowerCase()}`
                              : 'Adicionar mais fotos'}
                          </span>
                          {fotos.length === 0 && (
                            <span className="text-[12px] text-gray-400">{rotulos.dicaDaFoto}</span>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={enviandoFotos}
                            className="hidden"
                            onChange={handleFotosSessao}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* ===== Página 3 — observações ===== */}
              {/* Observações — sempre presente, inclusive sem ficha cadastrada */}
              <section className={`space-y-1.5 ${naPagina('observacoes')}`}>
                <label className={labelClass} htmlFor="ficha-observacoes">
                  {rotulos.rotuloDasObservacoes}
                </label>
                <textarea
                  id="ficha-observacoes"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={4}
                  placeholder={rotulos.dicaDasObservacoes}
                  // No computador a página é dela: a caixa já abre grande.
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[rgba(26,26,26,.15)] text-[14px] text-ink placeholder:text-gray-400 focus:outline-none focus:border-brand transition-colors resize-y sm:min-h-[300px]"
                />
              </section>

              {/* ===== Página 4 — os materiais (só no relatório de um atendimento) ===== */}
              {/* Material e quantidade, sem valor — o custo fica no Financeiro. */}
              {uso.ativo && (
                <section className={naPagina('materiais')}>
                  <SecaoUsoDeMaterial uso={uso} />
                </section>
              )}

              {/* ===== Página 4 — o orçamento (só na avaliação) ===== */}
              {/* O consumo estimado e, com ele, os procedimentos, os produtos e o pagamento. */}
              {orcamento.ativo && (
                <section className={naPagina('orcamento')}>
                  <SecaoOrcamentoDaAvaliacao oa={orcamento} catalogo={catalogo} clinic={clinicProfile} />
                </section>
              )}

              {/* ===== Página 5 — os dados do orçamento: datas e mensagem de abertura ===== */}
              {orcamento.ativo && orcamento.comDados && (
                <section className={naPagina('dadosDoOrcamento')}>
                  <SecaoDadosDoOrcamentoDaAvaliacao oa={orcamento} />
                </section>
              )}

              {registro?.preenchidoEm && (
                <p className="text-[12px] text-gray-400">
                  Preenchida em {formatDateOnly(registro.preenchidoEm.slice(0, 10))}
                  {registro.updatedAt &&
                    registro.updatedAt.slice(0, 10) !== registro.preenchidoEm.slice(0, 10) &&
                    ` · última alteração em ${formatDateOnly(registro.updatedAt.slice(0, 10))}`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {imprimindo && registro && (
        <PrintableFichaSheet
          tipo={tipo}
          ficha={ficha}
          registro={registro}
          gerais={gerais}
          clinicProfile={clinicProfile}
          onClose={() => setImprimindo(false)}
        />
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />

      {(anotando === 'modelo' || fotoEmAnotacao) && (
        <PhotoAnnotationEditor
          imageUrl={anotando === 'modelo' ? fotoModeloUrl : fotoEmAnotacao?.url || ''}
          initialAnnotationsJson={
            anotando === 'modelo' ? fotoModeloAnotacoesJson : fotoEmAnotacao?.anotacoesJson
          }
          title={
            anotando === 'modelo'
              ? 'Mapa anatômico'
              : fotoEmAnotacao?.legenda?.trim()
              ? `${rotulos.rotuloDaFoto} · ${fotoEmAnotacao.legenda.trim()}`
              : fotos.length > 1 && typeof anotando === 'number'
              ? `${rotulos.rotuloDaFoto} ${anotando + 1}`
              : rotulos.rotuloDaFoto
          }
          onSave={handleSalvarAnotacao}
          onClose={() => setAnotando(null)}
        />
      )}
    </SidePanel>
  );
};
