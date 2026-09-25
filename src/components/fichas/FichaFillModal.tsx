import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Camera, Check, Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import {
  AnamnesisQuestion,
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
import { AlvoDaFicha, ROTULOS_DA_FICHA, TipoDeFicha } from '../../utils/fichasClinicas';
import { resolveTemplatePhoto } from '../../utils/genderPhoto';
import { downscaleImage } from '../../utils/imageCompressor';
import { subirImagemOuManter } from '../../services/imageStorage';
import {
  deleteRegistroDeFicha,
  getRegistroDeFicha,
  saveRegistroDeFicha,
  subscribeToFichasModelo,
  subscribeToPerguntasGeraisDaFicha,
} from '../../services/databaseService';
import { formatDateOnly } from '../../utils/formatters';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { PrintableFichaSheet } from './PrintableFichaSheet';
import { SidePanel } from '../common/SidePanel';

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

/** Qual foto está no editor de anotação. `null` = editor fechado. */
type AlvoAnotacao = 'modelo' | 'sessao' | null;

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
  const [fotoSessaoUrl, setFotoSessaoUrl] = useState('');
  const [fotoSessaoAnotadaUrl, setFotoSessaoAnotadaUrl] = useState('');
  const [fotoSessaoAnotacoesJson, setFotoSessaoAnotacoesJson] = useState<string | undefined>();
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

  /** O acompanhamento é o registro da sessão: a foto aparece sempre. Na avaliação, se o modelo pedir. */
  const pedeFoto = tipo === 'acompanhamento' || !!ficha?.temFotoSessao || !!fotoSessaoUrl;

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

    const aplicar = (existente: EvaluationRecord | null) => {
      setRegistro(existente);
      setRespostas(existente?.respostas || {});
      setObservacoes(existente?.observacoes || '');
      setFotoSessaoUrl(existente?.fotoSessaoUrl || '');
      setFotoSessaoAnotadaUrl(existente?.fotoSessaoAnotadaUrl || '');
      setFotoSessaoAnotacoesJson(existente?.fotoSessaoAnotacoesJson);
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

  if (!isOpen) return null;

  const handleResposta = (questionId: string, valor: any) => {
    setRespostas((prev) => ({ ...prev, [questionId]: valor }));
  };

  const handleFotoSessao = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const comprimida = await downscaleImage(file);
      setFotoSessaoUrl(await subirImagemOuManter(comprimida, `${rotulos.pastaDoStorage}/sessao`));
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
    const url = await subirImagemOuManter(dataUrl, `${rotulos.pastaDoStorage}/anotadas`);
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
        // Só o que foi respondido: congelar a ficha-modelo inteira faria cada ficha pagar KB por
        // pergunta em branco, e a cota do Firestore aqui é por KB gravado.
        perguntasSnapshot: perguntasRespondidas([...perguntas, ...perguntasSoDoRegistro], respostas),
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

      await saveRegistroDeFicha(tipo, novo);
      onSalvou?.();
      onClose();
    } catch (e) {
      console.error(e);
      setErro(`Não foi possível salvar ${rotulos.artigo} ${rotulos.minusculo}. Tente de novo.`);
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
      titulo: `Excluir ${rotulos.artigo === 'a' ? 'esta' : 'este'} ${rotulos.minusculo}?`,
      mensagem:
        'As respostas e as anotações das fotos são apagadas.' +
        (tipo === 'acompanhamento' ? ' O atendimento em si não é afetado.' : ''),
      textoConfirmar: 'Excluir',
      tom: 'perigo',
      onConfirmar: async () => {
        setSalvando(true);
        try {
          await deleteRegistroDeFicha(tipo, registro);
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
  const fotoSessaoExibida = fotoSessaoAnotadaUrl || fotoSessaoUrl;

  /*
    Imprimir usa o que está **gravado**, não o rascunho na tela: o documento impresso precisa
    corresponder ao que o prontuário guarda. Por isso só aparece depois do primeiro salvamento.
  */
  const rodape = carregando || leituraFalhou ? null : (
    <div className="flex items-center justify-between gap-3">
      {registro ? (
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
          onClick={handleSalvar}
          disabled={salvando}
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
      /* Anotar uma foto ou anexar a foto da sessão não gera `input`/`change` no painel. */
      alterado={!!fotoSessaoUrl || !!fotoModeloAnotadaUrl || !!fotoSessaoAnotadaUrl}
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

              {/* Foto */}
              {pedeFoto && (
                <div className="space-y-2">
                  <span className={labelClass}>{rotulos.rotuloDaFoto}</span>
                  {fotoSessaoUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-[rgba(26,26,26,.1)] bg-surface">
                      <img
                        src={fotoSessaoExibida}
                        alt={rotulos.rotuloDaFoto}
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
                        Enviar {rotulos.rotuloDaFoto.toLowerCase()}
                      </span>
                      <span className="text-[12px] text-gray-400">{rotulos.dicaDaFoto}</span>
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

      {anotando && (
        <PhotoAnnotationEditor
          imageUrl={anotando === 'modelo' ? fotoModeloUrl : fotoSessaoUrl}
          initialAnnotationsJson={
            anotando === 'modelo' ? fotoModeloAnotacoesJson : fotoSessaoAnotacoesJson
          }
          title={anotando === 'modelo' ? 'Mapa anatômico' : rotulos.rotuloDaFoto}
          onSave={handleSalvarAnotacao}
          onClose={() => setAnotando(null)}
        />
      )}
    </SidePanel>
  );
};
