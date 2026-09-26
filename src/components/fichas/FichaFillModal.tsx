import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Camera, Check, Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import {
  AnamnesisQuestion,
  ClinicProfile,
  EvaluationRecord,
  EvaluationTemplate,
  FotoDaSessao,
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
import { SecaoConsumoEstimado, useConsumoEstimado } from '../estoque/ConsumoEstimado';

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
  /**
   * Só na avaliação: "Pré-preencher orçamento com este consumo". Recebe a ficha **já salva** — o
   * formulário grava e fecha antes, porque o orçamento abre em outro painel e um painel dentro do
   * outro ficaria preso nele. Ausente = o link não aparece.
   */
  onMontarOrcamento?: (registro: EvaluationRecord) => void;
}

const labelClass = 'block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1';

/**
 * Qual foto está no editor de anotação: o mapa, ou a foto da sessão naquela posição da lista.
 * `null` = editor fechado — e é contra `null` que se compara, porque a primeira foto é o 0.
 */
type AlvoAnotacao = 'modelo' | number | null;

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
  onMontarOrcamento,
}) => {
  const rotulos = ROTULOS_DA_FICHA[tipo];

  const [fichas, setFichas] = useState<EvaluationTemplate[]>([]);
  const [gerais, setGerais] = useState<AnamnesisQuestion[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
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
    const doRegistro = registro?.templateId
      ? fichas.find((f) => f.id === registro.templateId)
      : undefined;
    return doRegistro || fichaDeAvaliacaoPara(alvo, fichas, catalogo);
  }, [registro?.templateId, alvo, fichas, catalogo]);

  const perguntas = useMemo(() => perguntasDaAvaliacao(gerais, ficha), [gerais, ficha]);

  /**
   * As perguntas que o registro gravado respondeu e que não estão mais no modelo — uma pergunta
   * apagada da ficha-modelo depois. Continuam aparecendo, senão a resposta sumiria da tela.
   */
  const perguntasSoDoRegistro = useMemo(
    () =>
      (registro?.perguntasSnapshot || []).filter((q) => !perguntas.some((p) => p.id === q.id)),
    [registro, perguntas]
  );

  /** A gravada, senão a da ficha-modelo resolvida pelo gênero da paciente. */
  const fotoModeloUrl =
    fotoModeloGravada || (ficha ? resolveTemplatePhoto(ficha, paciente?.genero) || '' : '');

  /** O acompanhamento é o registro da sessão: as fotos aparecem sempre. Na avaliação, se o modelo pedir. */
  const pedeFoto = tipo === 'acompanhamento' || !!ficha?.temFotoSessao || fotos.length > 0;

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
    setAnotando(null);
    setMexeuNasFotos(false);

    const aplicar = (existente: EvaluationRecord | null) => {
      setRegistro(existente);
      setRespostas(existente?.respostas || {});
      setObservacoes(existente?.observacoes || '');
      setFotos(fotosDaSessao(existente));
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
  const consumo = useConsumoEstimado(
    alvo,
    catalogo,
    isOpen && tipo === 'avaliacao',
    carregando ? undefined : registro
  );

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

  /** `depois` recebe a ficha gravada, com o formulário já fechado — é o caminho do orçamento. */
  const handleSalvar = async (depois?: (salvo: EvaluationRecord) => void) => {
    setSalvando(true);
    setErro(null);
    const agora = new Date().toISOString();
    const todasAsPerguntas = [...perguntas, ...perguntasSoDoRegistro];
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
      onClose();
      return;
    }

    let etapa: 'ficha' | 'materiais' = 'ficha';
    let salvo: EvaluationRecord | null = null;
    try {
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
          respostas,
          // Só o que foi respondido: congelar a ficha-modelo inteira faria cada ficha pagar KB
          // por pergunta em branco, e a cota do Firestore aqui é por KB gravado.
          perguntasSnapshot: perguntasRespondidas(todasAsPerguntas, respostas),
          fotoModeloUrl: fotoModeloUrl || undefined,
          fotoModeloAnotadaUrl: fotoModeloAnotadaUrl || undefined,
          fotoModeloAnotacoesJson,
          // Os campos legados (`fotoSessaoUrl`…) são espelhados da primeira por `saveRegistroDeFicha`.
          fotosSessao: fotos,
          // Só a avaliação estima consumo; vazio apaga o que estava gravado.
          consumoEstimado: tipo === 'avaliacao' ? consumo.paraGravar() : undefined,
          observacoes: observacoes.trim() || undefined,
          preenchidoEm: registro?.preenchidoEm || agora,
          createdAt: registro?.createdAt || agora,
        };
        await saveRegistroDeFicha(tipo, novo);
        // Se os materiais falharem, a segunda tentativa regrava a ficha com as mesmas datas.
        setRegistro(novo);
        salvo = novo;
      }

      etapa = 'materiais';
      if (materiais.acao === 'gravar' && alvo.atendimentoId) {
        await saveMateriaisDoAtendimento(
          montarMateriaisDoAtendimento(
            { ...alvo, atendimentoId: alvo.atendimentoId },
            materiais.itens,
            uso.registro,
            agora
          )
        );
      } else if (materiais.acao === 'apagar' && alvo.atendimentoId) {
        await deleteMateriaisDoAtendimento(alvo.atendimentoId);
      }

      onSalvou?.();
      onClose();
      if (depois && salvo) depois(salvo);
    } catch (e) {
      console.error(e);
      const motivo = (e as Error).message;
      setErro(
        etapa === 'ficha'
          ? `Não foi possível salvar ${rotulos.artigo} ${rotulos.minusculo}: ${motivo}`
          : gravarFicha
          ? `O acompanhamento foi salvo, mas os materiais não: ${motivo} Toque em Salvar de novo.`
          : `Não foi possível salvar os materiais: ${motivo}`
      );
      setSalvando(false);
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
      mensagem: oQueSai + (tipo === 'acompanhamento' ? ' O atendimento em si não é afetado.' : ''),
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

  const fotoModeloExibida = fotoModeloAnotadaUrl || fotoModeloUrl;
  const fotoEmAnotacao = typeof anotando === 'number' ? fotos[anotando] : undefined;

  /*
    Imprimir usa o que está **gravado**, não o rascunho na tela: o documento impresso precisa
    corresponder ao que o prontuário guarda. Por isso só aparece depois do primeiro salvamento.
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
        {registro && (
          <button
            onClick={() => setImprimindo(true)}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:text-brand hover:bg-surface-2 transition-colors"
            title="Imprimir / salvar PDF"
            aria-label={`Imprimir ${rotulos.artigo} ${rotulos.minusculo}`}
          >
            <Printer className="w-5 h-5" />
          </button>
        )}
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
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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
      largura="larga"
      bloqueado={salvando}
      /* Anotar uma foto, anexar a foto da sessão ou tirar um material da lista não gera
         `input`/`change` no painel. */
      alterado={mexeuNasFotos || !!fotoModeloAnotadaUrl || uso.mexido || consumo.mexido}
      rodape={rodape}
    >
      <div className="bg-card min-h-full">
        <div className="px-4 sm:px-6 py-5 space-y-6">
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

              {/*
                Sem ficha cadastrada, a tela não fica vazia: sobram as observações (e a foto, no
                acompanhamento) e o caminho para configurar. Um vazio sem saída faria a
                profissional concluir que a funcionalidade está quebrada.
              */}
              {!ficha && (
                <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-soft bg-surface border border-[rgba(26,26,26,.1)] rounded-xl px-3.5 py-3">
                  <span className="flex-1 min-w-[200px]">
                    Nenhuma ficha-modelo de {rotulos.minusculo} cadastrada para{' '}
                    <strong className="text-ink">{alvo.procedimentoNome}</strong>.
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
              )}

              {perguntas.length + perguntasSoDoRegistro.length > 0 && (
                <div className="space-y-4">
                  {ficha && (
                    <h3 className="text-label font-semibold uppercase tracking-wider text-gray-400">
                      {ficha.nome}
                    </h3>
                  )}
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
              )}

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
                          className="relative rounded-xl overflow-hidden border border-[rgba(26,26,26,.1)] bg-surface"
                        >
                          <img
                            src={foto.anotadaUrl || foto.url}
                            alt={`${rotulos.rotuloDaFoto} ${i + 1}`}
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

              {/* Observações — sempre presente, inclusive sem ficha cadastrada */}
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="ficha-observacoes">
                  {rotulos.rotuloDasObservacoes}
                </label>
                <textarea
                  id="ficha-observacoes"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={4}
                  placeholder={rotulos.dicaDasObservacoes}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[rgba(26,26,26,.15)] text-[14px] text-ink placeholder:text-gray-400 focus:outline-none focus:border-brand transition-colors resize-y"
                />
              </div>

              {/* Só no acompanhamento: material e quantidade, sem valor — o custo fica no Financeiro. */}
              <SecaoUsoDeMaterial uso={uso} />

              {/* Só na avaliação: o consumo estimado, e dele o orçamento já calculado. */}
              <SecaoConsumoEstimado
                consumo={consumo}
                onMontarOrcamento={
                  onMontarOrcamento ? () => handleSalvar(onMontarOrcamento) : undefined
                }
                desabilitado={salvando || enviandoFotos}
              />

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
