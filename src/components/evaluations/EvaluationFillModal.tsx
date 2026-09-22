import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  ClipboardCheck,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import {
  AnamnesisQuestion,
  Attendance,
  ClinicProfile,
  EvaluationRecord,
  EvaluationTemplate,
  Patient,
  Procedure,
  Professional,
} from '../../types';
import { QuestionFieldRenderer } from '../anamnesis/QuestionFieldRenderer';
import { PhotoAnnotationEditor } from '../anamnesis/PhotoAnnotationEditor';
import {
  fichaDeAvaliacaoPara,
  perguntasDaAvaliacao,
  perguntasRespondidas,
} from '../../utils/evaluations';
import { resolveTemplatePhoto } from '../../utils/genderPhoto';
import { downscaleImage } from '../../utils/imageCompressor';
import { subirImagemOuManter } from '../../services/imageStorage';
import {
  getEvaluationRecord,
  saveEvaluationRecord,
  deleteEvaluationRecord,
} from '../../services/databaseService';
import { formatDateOnly } from '../../utils/formatters';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { PrintableEvaluationSheet } from './PrintableEvaluationSheet';

interface EvaluationFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** A visita que está sendo avaliada. O id dela é o id da avaliação. */
  atendimento: Attendance;
  paciente?: Patient;
  fichas: EvaluationTemplate[];
  /** Perguntas gerais de avaliação — valem para todo procedimento. */
  gerais: AnamnesisQuestion[];
  catalogo: Procedure[];
  professionals: Professional[];
  /** Cabeçalho do documento impresso. */
  clinicProfile: ClinicProfile;
  /** Avisa quem abriu que a avaliação mudou, para a fila e o selo se atualizarem. */
  onSalvou?: () => void;
  /** "Cadastrar ficha para este procedimento" — leva ao gerenciador. */
  onCadastrarFicha?: (alvo: { procedureId?: string; procedimentoNome: string }) => void;
}

const labelClass = 'block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1';

/** Qual foto está no editor de anotação. `null` = editor fechado. */
type AlvoAnotacao = 'modelo' | 'sessao' | null;

/**
 * O formulário que a profissional preenche **depois** do atendimento.
 *
 * Só abre para visita que já aconteceu — quem decide isso é `avaliacaoLiberada()`, aplicada por
 * quem abre este modal, e não aqui: a mesma regra precisa valer para o botão da lista, para a
 * fila de pendentes e para o contador do menu, e reimplementá-la em cada um garantiria que um dia
 * discordassem.
 *
 * Um documento por atendimento. Numa paciente com plano de 10 sessões, são 10 avaliações
 * independentes — é o que transforma as sessões num histórico de evolução em vez de um único
 * documento sobrescrito, que era o que acontecia enquanto isto morava dentro da anamnese.
 */
export const EvaluationFillModal: React.FC<EvaluationFillModalProps> = ({
  isOpen,
  onClose,
  atendimento,
  paciente,
  fichas,
  gerais,
  catalogo,
  professionals,
  clinicProfile,
  onSalvou,
  onCadastrarFicha,
}) => {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
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
  const [fotoSessaoUrl, setFotoSessaoUrl] = useState('');
  const [fotoSessaoAnotadaUrl, setFotoSessaoAnotadaUrl] = useState('');
  const [fotoSessaoAnotacoesJson, setFotoSessaoAnotacoesJson] = useState<string | undefined>();
  const [anotando, setAnotando] = useState<AlvoAnotacao>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [imprimindo, setImprimindo] = useState(false);

  const ficha = useMemo(
    () => fichaDeAvaliacaoPara(atendimento, fichas, catalogo),
    [atendimento, fichas, catalogo]
  );

  const perguntas = useMemo(() => perguntasDaAvaliacao(gerais, ficha), [gerais, ficha]);

  /** A gravada, senão a da ficha-modelo resolvida pelo gênero da paciente. */
  const fotoModeloUrl =
    fotoModeloGravada || (ficha ? resolveTemplatePhoto(ficha, paciente?.genero) || '' : '');

  const profissional = useMemo(
    () => professionals.find((p) => p.id === atendimento.professionalId),
    [professionals, atendimento.professionalId]
  );

  /**
   * Cada abertura recomeça do banco. Sobras do preenchimento anterior virariam a avaliação de uma
   * sessão gravada por cima da de outra — o mesmo cuidado que o formulário de atendimento toma.
   */
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;

    setCarregando(true);
    setErro(null);
    setAnotando(null);

    (async () => {
      try {
        const existente = await getEvaluationRecord(atendimento.id);
        if (cancelado) return;

        setRegistro(existente);
        setRespostas(existente?.respostas || {});
        setObservacoes(existente?.observacoes || '');
        setFotoSessaoUrl(existente?.fotoSessaoUrl || '');
        setFotoSessaoAnotadaUrl(existente?.fotoSessaoAnotadaUrl || '');
        setFotoSessaoAnotacoesJson(existente?.fotoSessaoAnotacoesJson);
        setFotoModeloAnotadaUrl(existente?.fotoModeloAnotadaUrl || '');
        setFotoModeloAnotacoesJson(existente?.fotoModeloAnotacoesJson);
        setFotoModeloGravada(existente?.fotoModeloUrl || '');
      } catch (e) {
        console.error(e);
        if (!cancelado) setErro('Não foi possível carregar a avaliação. Tente de novo.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
    // Depende só da identidade da visita, e **não** de `ficha`.
    //
    // `ficha` é derivada de `fichas`/`catalogo`, que vêm de assinaturas ao vivo: qualquer
    // atendimento salvo na clínica — por outra pessoa, em outra paciente — produz arrays novos,
    // recalcula `ficha` e faria este efeito rodar de novo, jogando fora o que a profissional
    // estivesse digitando neste instante.
  }, [isOpen, atendimento.id]);

  if (!isOpen) return null;

  const handleResposta = (questionId: string, valor: any) => {
    setRespostas((prev) => ({ ...prev, [questionId]: valor }));
  };

  const handleFotoSessao = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const comprimida = await downscaleImage(file);
      setFotoSessaoUrl(await subirImagemOuManter(comprimida, 'avaliacoes/sessao'));
      // A anotação antiga descreve a foto antiga; mantê-la colaria rabiscos numa imagem que não
      // é mais aquela.
      setFotoSessaoAnotadaUrl('');
      setFotoSessaoAnotacoesJson(undefined);
    } catch (err) {
      console.error(err);
      setErro('Falha ao processar a foto.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSalvarAnotacao = async (dataUrl: string, annotationsJson: string) => {
    const url = await subirImagemOuManter(dataUrl, 'avaliacoes/anotadas');
    if (anotando === 'modelo') {
      setFotoModeloAnotadaUrl(url);
      setFotoModeloAnotacoesJson(annotationsJson);
    } else {
      setFotoSessaoAnotadaUrl(url);
      setFotoSessaoAnotacoesJson(annotationsJson);
    }
    setAnotando(null);
  };

  const handleSalvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const agora = new Date().toISOString();
      const novo: EvaluationRecord = {
        id: atendimento.id,
        atendimentoId: atendimento.id,
        pacienteId: atendimento.pacienteId,
        pacienteNome: atendimento.pacienteNome,
        pacienteGenero: paciente?.genero,
        procedureId: atendimento.procedureId,
        procedimentoNome: atendimento.procedimentoNome,
        dataAtendimento: atendimento.data,
        professionalId: atendimento.professionalId,
        profissionalNome: profissional?.name || atendimento.profissionalNome,
        templateId: ficha?.id,
        respostas,
        // Só o que foi respondido: congelar a ficha-modelo inteira faria cada avaliação pagar KB
        // por pergunta em branco, e a cota do Firestore aqui é por KB gravado.
        perguntasSnapshot: perguntasRespondidas(perguntas, respostas),
        fotoModeloUrl: fotoModeloUrl || undefined,
        fotoModeloAnotadaUrl: fotoModeloAnotadaUrl || undefined,
        fotoModeloAnotacoesJson,
        fotoSessaoUrl: fotoSessaoUrl || undefined,
        fotoSessaoAnotadaUrl: fotoSessaoAnotadaUrl || undefined,
        fotoSessaoAnotacoesJson,
        observacoes: observacoes.trim() || undefined,
        preenchidoEm: registro?.preenchidoEm || agora,
        createdAt: registro?.createdAt || agora,
      };

      await saveEvaluationRecord(novo);
      onSalvou?.();
      onClose();
    } catch (e) {
      console.error(e);
      setErro('Não foi possível salvar a avaliação. Tente de novo.');
      setSalvando(false);
    }
  };

  /**
   * `window.confirm` não serve aqui: em contexto embutido ele responde sozinho, sem mostrar nada
   * — ou a exclusão nunca roda, ou roda sem perguntar. Ver `ConfirmDialog`.
   */
  const pedirExclusao = () => {
    if (!registro) return;
    setConfirmacao({
      titulo: 'Excluir esta avaliação?',
      mensagem:
        'As respostas e as anotações das fotos são apagadas, e o atendimento volta para a fila ' +
        'de pendentes. O atendimento em si não é afetado.',
      textoConfirmar: 'Excluir',
      tom: 'perigo',
      onConfirmar: async () => {
        setSalvando(true);
        try {
          await deleteEvaluationRecord(atendimento.id);
          onSalvou?.();
          onClose();
        } catch (e) {
          console.error(e);
          setErro('Não foi possível excluir a avaliação.');
          setSalvando(false);
        }
      },
    });
  };

  const fotoModeloExibida = fotoModeloAnotadaUrl || fotoModeloUrl;
  const fotoSessaoExibida = fotoSessaoAnotadaUrl || fotoSessaoUrl;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      {/*
        O que rola é ESTE contêiner; a centralização mora no wrapper de dentro.
      
        Juntar as duas coisas — `overflow-y-auto` e `items-center` no mesmo elemento — quebra
        silenciosamente quando o conteúdo passa da altura da tela: o item centralizado transborda
        para os dois lados, e o que sai por cima fica **fora do alcance da rolagem**. O formulário
        abre já cortado no meio e não há como subir. Com o wrapper `min-h-full`, a centralização
        só acontece enquanto sobra espaço; quando não sobra, o wrapper cresce e tudo é alcançável.
      */}
      <div className="flex min-h-full items-start sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-xl min-h-screen sm:min-h-0 sm:my-8">
          {/* Cabeçalho */}
          <div className="sticky top-0 z-10 bg-white border-b border-[rgba(26,26,26,.1)] px-4 sm:px-6 py-4 flex items-start justify-between gap-3 sm:rounded-t-2xl">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-brand shrink-0" />
                <h2 className="text-[17px] font-semibold text-ink truncate">
                  Ficha de avaliação
                </h2>
              </div>
              <p className="text-[13px] text-ink-soft mt-0.5 truncate">
                {atendimento.pacienteNome} · {atendimento.procedimentoNome} ·{' '}
                {formatDateOnly(atendimento.data)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/*
                Imprime o que está **gravado**, não o rascunho na tela: o documento impresso precisa
                corresponder ao que o prontuário guarda. Por isso só aparece depois do primeiro
                salvamento.
              */}
              {registro && (
                <button
                  onClick={() => setImprimindo(true)}
                  className="p-2 text-gray-400 hover:text-brand transition-colors"
                  title="Imprimir / salvar PDF"
                  aria-label="Imprimir a ficha de avaliação"
                >
                  <Printer className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-ink transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="px-4 sm:px-6 py-5 space-y-6">
            {carregando ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
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
                  Sem ficha cadastrada, a tela não fica vazia: sobram as observações e o caminho
                  para configurar. Um vazio sem saída faria a profissional concluir que a
                  funcionalidade está quebrada.
                */}
                {!ficha && (
                  <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-soft bg-surface border border-[rgba(26,26,26,.1)] rounded-xl px-3.5 py-3">
                    <span className="flex-1 min-w-[200px]">
                      Nenhuma ficha de avaliação cadastrada para{' '}
                      <strong className="text-ink">{atendimento.procedimentoNome}</strong>.
                    </span>
                    {onCadastrarFicha && (
                      <button
                        onClick={() =>
                          onCadastrarFicha({
                            procedureId: atendimento.procedureId,
                            procedimentoNome: atendimento.procedimentoNome,
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

                {perguntas.length > 0 && (
                  <div className="space-y-4">
                    {ficha && (
                      <h3 className="text-label font-semibold uppercase tracking-wider text-gray-400">
                        {ficha.nome}
                      </h3>
                    )}
                    {perguntas.map((q) => (
                      <QuestionFieldRenderer
                        key={q.id}
                        question={q}
                        value={respostas[q.id]}
                        onChange={(v) => handleResposta(q.id, v)}
                        // Sem asterisco: a avaliação é documento interno e se completa ao longo do
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

                {/* Foto da sessão */}
                {ficha?.temFotoSessao && (
                  <div className="space-y-2">
                    <span className={labelClass}>Foto desta sessão</span>
                    {fotoSessaoUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-[rgba(26,26,26,.1)] bg-surface">
                        <img
                          src={fotoSessaoExibida}
                          alt="Foto da sessão"
                          className="w-full object-contain max-h-[420px]"
                        />
                        <div className="absolute bottom-3 right-3 flex gap-2">
                          <button
                            onClick={() => {
                              setFotoSessaoUrl('');
                              setFotoSessaoAnotadaUrl('');
                              setFotoSessaoAnotacoesJson(undefined);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 text-ink text-[13px] font-semibold shadow-lg hover:bg-white transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remover
                          </button>
                          <button
                            onClick={() => setAnotando('sessao')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink text-white text-[13px] font-semibold shadow-lg hover:bg-black transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {fotoSessaoAnotadaUrl ? 'Editar anotações' : 'Anotar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border border-dashed border-[rgba(26,26,26,.2)] bg-surface cursor-pointer hover:border-brand transition-colors">
                        <Camera className="w-6 h-6 text-gray-400" />
                        <span className="text-[13px] font-semibold text-ink-soft">
                          Enviar foto desta sessão
                        </span>
                        <span className="text-[12px] text-gray-400">
                          Registro de evolução — uma por atendimento
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFotoSessao}
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* Observações — sempre presente, inclusive sem ficha cadastrada */}
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="aval-observacoes">
                    Observações da avaliação
                  </label>
                  <textarea
                    id="aval-observacoes"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={4}
                    placeholder="O que foi observado nesta sessão, parâmetros usados, resposta do tecido, orientações dadas."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[rgba(26,26,26,.15)] text-[14px] text-ink placeholder:text-gray-400 focus:outline-none focus:border-brand transition-colors resize-y"
                  />
                </div>

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

          {/* Rodapé */}
          {!carregando && (
            <div className="sticky bottom-0 bg-white border-t border-[rgba(26,26,26,.1)] px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 sm:rounded-b-2xl">
              {registro ? (
                <button
                  onClick={pedirExclusao}
                  disabled={salvando}
                  className="text-[13px] font-semibold text-gray-400 hover:text-danger transition-colors disabled:opacity-40"
                >
                  Excluir avaliação
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={salvando}
                  className="px-4 py-2.5 rounded-xl text-[14px] font-semibold text-ink-soft hover:bg-surface transition-colors disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-40"
                >
                  {salvando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Salvar avaliação
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {imprimindo && registro && (
        <PrintableEvaluationSheet
          ficha={ficha}
          registro={registro}
          gerais={gerais}
          clinicProfile={clinicProfile}
          onClose={() => setImprimindo(false)}
        />
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />

      {anotando && (
        <PhotoAnnotationEditor
          imageUrl={anotando === 'modelo' ? fotoModeloUrl : fotoSessaoUrl}
          initialAnnotationsJson={
            anotando === 'modelo' ? fotoModeloAnotacoesJson : fotoSessaoAnotacoesJson
          }
          title={anotando === 'modelo' ? 'Mapa anatômico' : 'Foto desta sessão'}
          onSave={handleSalvarAnotacao}
          onClose={() => setAnotando(null)}
        />
      )}
    </div>
  );
};
