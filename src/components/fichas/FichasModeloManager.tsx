import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ClipboardCheck,
  Edit3,
  Layers,
  Loader2,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import {
  AnamnesisQuestion,
  EvaluationTemplate,
  Procedure,
  QuestionFieldType,
} from '../../types';
import { ProcedureMultiSelect } from '../ProcedureMultiSelect';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { downscaleImage } from '../../utils/imageCompressor';
import { ROTULOS_DA_FICHA, TipoDeFicha } from '../../utils/fichasClinicas';

interface FichasModeloManagerProps {
  tipo: TipoDeFicha;
  fichas: EvaluationTemplate[];
  catalogo: Procedure[];
  onSalvar: (ficha: EvaluationTemplate) => Promise<void>;
  onExcluir: (fichaId: string) => Promise<void>;
  /** Abre a folha em branco desta ficha, para preencher à mão. */
  onImprimirEmBranco: (ficha: EvaluationTemplate) => void;
  /**
   * Procedimento que chegou pelo atalho "cadastrar ficha" do formulário de preenchimento — a
   * ficha nova já nasce vinculada a ele, para a profissional não ter que procurá-lo na lista
   * logo depois de o sistema já saber qual era.
   */
  criarPara?: { procedureId?: string; procedimentoNome: string } | null;
  onCriarParaConsumido?: () => void;
}

const FIELD_TYPE_LABELS: Record<QuestionFieldType, string> = {
  texto_curto: 'Texto Curto',
  texto_longo: 'Texto Longo (Parágrafo)',
  numero: 'Numérico',
  data: 'Data',
  unica_escolha: 'Única Escolha (Radio)',
  multipla_escolha: 'Múltipla Escolha (Checkbox)',
  escala: 'Escala Numérica',
  sim_nao: 'Sim / Não',
};

const inputClass =
  'w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-ink focus:outline-hidden focus:border-brand';
const labelClass = 'block text-xs font-semibold text-gray-800 mb-1';

const fichaVazia = (tipo: TipoDeFicha): EvaluationTemplate => ({
  id: `${tipo === 'avaliacao' ? 'aval' : 'acomp'}-${Date.now()}`,
  nome: '',
  procedureIds: [],
  categorias: [],
  perguntas: [],
  temFotoSessao: true,
});

/**
 * Onde a clínica define o que perguntar em cada procedimento — na avaliação (antes) ou no
 * acompanhamento (depois do atendimento). O mesmo gerenciador serve aos dois tipos; muda só o
 * vocabulário, que vem de `ROTULOS_DA_FICHA`.
 *
 * O vínculo é plural — procedimentos e/ou categorias inteiras — porque a depilação a laser tem
 * treze áreas no catálogo e uma ficha só: fototipo e características do pelo não mudam de buço
 * para axila. Sem isso, a equipe teria que cadastrar treze fichas idênticas e mantê-las em
 * sincronia à mão, que é exatamente o problema que aposentar as treze fichas de anamnese resolveu.
 */
export const FichasModeloManager: React.FC<FichasModeloManagerProps> = ({
  tipo,
  fichas,
  catalogo,
  onSalvar,
  onExcluir,
  onImprimirEmBranco,
  criarPara,
  onCriarParaConsumido,
}) => {
  const rotulos = ROTULOS_DA_FICHA[tipo];
  const [draft, setDraft] = useState<EvaluationTemplate | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  // Editor de pergunta
  const [qModalAberto, setQModalAberto] = useState(false);
  const [qIndex, setQIndex] = useState<number | null>(null);
  const [qTexto, setQTexto] = useState('');
  const [qTipo, setQTipo] = useState<QuestionFieldType>('texto_curto');
  const [qObrigatoria, setQObrigatoria] = useState(false);
  const [qAjuda, setQAjuda] = useState('');
  const [qOpcoes, setQOpcoes] = useState('');
  const [qEscalaMax, setQEscalaMax] = useState(10);
  const [qErro, setQErro] = useState('');

  const categoriasDoCatalogo = useMemo(
    () =>
      Array.from(new Set<string>(catalogo.map((p) => p.category).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [catalogo]
  );

  /** O atalho vindo do preenchimento abre o editor já com o procedimento amarrado. */
  useEffect(() => {
    if (!criarPara) return;
    const nova = fichaVazia(tipo);
    const proc = criarPara.procedureId
      ? catalogo.find((p) => p.id === criarPara.procedureId)
      : undefined;
    setDraft({
      ...nova,
      nome: `${rotulos.curto} — ${proc?.title || criarPara.procedimentoNome}`,
      procedureIds: proc ? [proc.id] : [],
    });
    setErro('');
    onCriarParaConsumido?.();
  }, [criarPara, catalogo, onCriarParaConsumido, tipo, rotulos.curto]);

  const resumoDoVinculo = (f: EvaluationTemplate): string => {
    const partes: string[] = [];
    if (f.categorias?.length) {
      partes.push(
        f.categorias.length === 1
          ? `categoria ${f.categorias[0]}`
          : `${f.categorias.length} categorias`
      );
    }
    if (f.procedureIds?.length) {
      const nomes = f.procedureIds
        .map((id) => catalogo.find((p) => p.id === id)?.title)
        .filter(Boolean) as string[];
      partes.push(nomes.length === 1 ? nomes[0] : `${f.procedureIds.length} procedimentos`);
    }
    return partes.length > 0 ? partes.join(' · ') : 'Sem vínculo — não vale para procedimento nenhum';
  };

  // ---- Perguntas ----

  const abrirPerguntaNova = () => {
    setQIndex(null);
    setQTexto('');
    setQTipo('texto_curto');
    setQObrigatoria(false);
    setQAjuda('');
    setQOpcoes('');
    setQEscalaMax(10);
    setQErro('');
    setQModalAberto(true);
  };

  const abrirPerguntaExistente = (idx: number) => {
    if (!draft) return;
    const q = draft.perguntas[idx];
    setQIndex(idx);
    setQTexto(q.texto);
    setQTipo(q.tipo_campo);
    setQObrigatoria(q.obrigatoria);
    setQAjuda(q.ajuda || '');
    setQOpcoes(q.opcoes ? q.opcoes.join('\n') : '');
    setQEscalaMax(q.escalaMax || 10);
    setQErro('');
    setQModalAberto(true);
  };

  const salvarPergunta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!qTexto.trim()) {
      setQErro('Informe o enunciado da pergunta.');
      return;
    }

    let opcoes: string[] | undefined;
    if (qTipo === 'unica_escolha' || qTipo === 'multipla_escolha') {
      const lista = qOpcoes
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (lista.length < 2) {
        setQErro('Informe ao menos 2 opções de resposta (uma por linha).');
        return;
      }
      opcoes = lista;
    }

    const nova: AnamnesisQuestion = {
      // O id de pergunta existente NUNCA é regerado: as respostas já gravadas apontam para ele,
      // e trocá-lo desligaria silenciosamente a resposta correspondente em todo o histórico.
      id: qIndex !== null ? draft.perguntas[qIndex].id : `${rotulos.prefixoDePergunta}-${Date.now()}`,
      texto: qTexto.trim(),
      tipo_campo: qTipo,
      obrigatoria: qObrigatoria,
      ordem: qIndex !== null ? draft.perguntas[qIndex].ordem : draft.perguntas.length + 1,
      ajuda: qAjuda.trim() || undefined,
      opcoes,
      escalaMax: qTipo === 'escala' ? qEscalaMax : undefined,
    };

    const lista = [...draft.perguntas];
    if (qIndex !== null) lista[qIndex] = nova;
    else lista.push(nova);

    setDraft({ ...draft, perguntas: lista });
    setQModalAberto(false);
  };

  const moverPergunta = (idx: number, dir: 'up' | 'down') => {
    if (!draft) return;
    const alvo = dir === 'up' ? idx - 1 : idx + 1;
    if (alvo < 0 || alvo >= draft.perguntas.length) return;
    const lista = [...draft.perguntas];
    const [movida] = lista.splice(idx, 1);
    lista.splice(alvo, 0, movida);
    setDraft({ ...draft, perguntas: lista.map((q, i) => ({ ...q, ordem: i + 1 })) });
  };

  const removerPergunta = (idx: number) => {
    if (!draft) return;
    const lista = draft.perguntas.filter((_, i) => i !== idx);
    setDraft({ ...draft, perguntas: lista.map((q, i) => ({ ...q, ordem: i + 1 })) });
  };

  // ---- Fotos ----

  const handleFoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    campo: 'fotoModeloUrl' | 'fotoModeloFemininoUrl' | 'fotoModeloMasculinoUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !draft) return;
    try {
      const comprimida = await downscaleImage(file);
      setDraft({ ...draft, [campo]: comprimida });
    } catch (err) {
      console.error(err);
      setErro('Falha ao processar a imagem.');
    } finally {
      e.target.value = '';
    }
  };

  // ---- Ficha ----

  const salvarFicha = async () => {
    if (!draft) return;
    if (!draft.nome.trim()) {
      setErro('Dê um nome à ficha.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await onSalvar({ ...draft, nome: draft.nome.trim() });
      setDraft(null);
    } catch (e) {
      console.error(e);
      setErro('Não foi possível salvar a ficha.');
    } finally {
      setSalvando(false);
    }
  };

  const pedirExclusao = (f: EvaluationTemplate) => {
    setConfirmacao({
      titulo: `Excluir "${f.nome}"?`,
      mensagem:
        `${rotulos.artigo === 'a' ? 'As' : 'Os'} ${rotulos.plural} já preenchid${rotulos.artigo}s ` +
        'com esta ficha não mudam — ' +
        'guardam as próprias perguntas. O que se perde é o modelo, e as próximas fichas deste ' +
        'procedimento passam a abrir só com observações.',
      textoConfirmar: 'Excluir',
      tom: 'perigo',
      onConfirmar: () => {
        onExcluir(f.id);
      },
    });
  };

  const FotoSlot: React.FC<{
    rotulo: string;
    campo: 'fotoModeloUrl' | 'fotoModeloFemininoUrl' | 'fotoModeloMasculinoUrl';
  }> = ({ rotulo, campo }) => {
    const url = draft?.[campo];
    return (
      <div className="flex-1 min-w-[140px]">
        <span className="block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1">
          {rotulo}
        </span>
        {url ? (
          <div className="relative rounded-sm overflow-hidden border border-gray-200 bg-surface">
            <img src={url} alt={rotulo} className="w-full h-28 object-contain" />
            <button
              type="button"
              onClick={() => draft && setDraft({ ...draft, [campo]: undefined })}
              className="absolute top-1.5 right-1.5 p-1 rounded-xs bg-white/90 text-gray-500 hover:text-danger"
              aria-label={`Remover ${rotulo}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-1 h-28 rounded-sm border border-dashed border-gray-300 bg-surface cursor-pointer hover:border-brand transition-colors">
            <Camera className="w-4 h-4 text-gray-400" />
            <span className="text-label text-gray-500">Enviar</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFoto(e, campo)}
            />
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand" />
            <h3 className="font-serif-luxury text-xl font-medium text-ink">
              {rotulos.tituloDosModelos}
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            {rotulos.descricaoDosModelos}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(fichaVazia(tipo));
            setErro('');
          }}
          className="w-full md:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-hover shadow-xs active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Nova Ficha
        </button>
      </div>

      {/* Lista */}
      {fichas.length === 0 ? (
        <div className="bg-white/50 rounded-sm border border-white/70 p-10 text-center">
          <ClipboardCheck className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            Nenhuma ficha-modelo de {rotulos.minusculo} cadastrada ainda.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fichas.map((f) => (
            <div
              key={f.id}
              className="bg-white/70 rounded-sm border border-white/80 shadow-xs p-4 flex flex-col gap-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-sm text-ink leading-snug">{f.nome}</h4>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => onImprimirEmBranco(f)}
                    className="p-1.5 text-gray-400 hover:text-brand transition-colors"
                    title="Imprimir folha em branco"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setDraft({ ...f });
                      setErro('');
                    }}
                    className="p-1.5 text-gray-400 hover:text-ink transition-colors"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => pedirExclusao(f)}
                    className="p-1.5 text-gray-400 hover:text-danger transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p
                className={`text-body flex items-start gap-1.5 ${
                  (f.categorias?.length || 0) + (f.procedureIds?.length || 0) === 0
                    ? 'text-danger'
                    : 'text-gray-500'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0 mt-px" />
                {resumoDoVinculo(f)}
              </p>

              <div className="flex items-center gap-2 flex-wrap text-label">
                <span className="px-1.5 py-0.5 rounded-xs bg-brand/10 text-brand font-semibold">
                  {f.perguntas.length} perguntas
                </span>
                {(f.temFotoSessao || tipo === 'acompanhamento') && (
                  <span className="px-1.5 py-0.5 rounded-xs bg-gray-100 text-gray-600 font-medium">
                    {rotulos.rotuloDaFoto}
                  </span>
                )}
                {(f.fotoModeloUrl || f.fotoModeloFemininoUrl || f.fotoModeloMasculinoUrl) && (
                  <span className="px-1.5 py-0.5 rounded-xs bg-gray-100 text-gray-600 font-medium">
                    Mapa anatômico
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor da ficha */}
      {draft && (
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
            <div className="bg-surface w-full sm:max-w-2xl sm:rounded-sm shadow-xl min-h-screen sm:min-h-0 sm:my-8">
              <div className="sticky top-0 z-10 bg-ink px-5 py-4 flex items-center justify-between">
                <h3 className="font-serif-luxury text-lg text-white">
                  {fichas.some((f) => f.id === draft.id)
                    ? 'Editar ficha'
                    : `Nova ficha de ${rotulos.minusculo}`}
                </h3>
                <button
                  onClick={() => setDraft(null)}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-5">
                {erro && (
                  <div className="flex items-start gap-2 text-xs text-danger bg-danger-bg border border-danger-line rounded-sm px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                    <span>{erro}</span>
                  </div>
                )}

                <div>
                  <label className={labelClass} htmlFor="ficha-nome">
                    Nome da ficha
                  </label>
                  <input
                    id="ficha-nome"
                    value={draft.nome}
                    onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
                    placeholder={`Ex: ${rotulos.curto} — Depilação a Laser`}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="ficha-desc">
                    Descrição (opcional)
                  </label>
                  <input
                    id="ficha-desc"
                    value={draft.descricao || ''}
                    onChange={(e) => setDraft({ ...draft, descricao: e.target.value })}
                    className={inputClass}
                  />
                </div>

                {/* Vínculo */}
                <div className="space-y-3 p-3.5 rounded-sm border border-gray-200 bg-white">
                  <span className="text-label font-bold uppercase tracking-wider text-gray-500">
                    Onde esta ficha vale
                  </span>

                  <div>
                    <label className={labelClass}>Categorias inteiras</label>
                    <div className="flex flex-wrap gap-1.5">
                      {categoriasDoCatalogo.map((cat) => {
                        const marcada = (draft.categorias || []).includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                categorias: marcada
                                  ? (draft.categorias || []).filter((c) => c !== cat)
                                  : [...(draft.categorias || []), cat],
                              })
                            }
                            className={`px-2.5 py-1 rounded-sm text-body font-medium border transition-colors ${
                              marcada
                                ? 'bg-ink text-white border-ink'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Procedimentos específicos</label>
                    <ProcedureMultiSelect
                      procedures={catalogo}
                      selectedIds={draft.procedureIds || []}
                      onChange={(ids) => setDraft({ ...draft, procedureIds: ids })}
                    />
                    <p className="text-label text-gray-400 mt-1.5">
                      Um procedimento listado aqui usa esta ficha mesmo que a categoria dele aponte
                      para outra — o específico sempre vence o geral.
                    </p>
                  </div>
                </div>

                {/* Perguntas */}
                <div className="space-y-2 p-3.5 rounded-sm border border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-label font-bold uppercase tracking-wider text-gray-500">
                      Perguntas ({draft.perguntas.length})
                    </span>
                    <button
                      type="button"
                      onClick={abrirPerguntaNova}
                      className="flex items-center gap-1 text-body font-semibold text-brand hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar
                    </button>
                  </div>

                  {draft.perguntas.length === 0 ? (
                    <p className="text-body text-gray-400 py-3 text-center">
                      Nenhuma pergunta ainda. A ficha ainda assim abre com observações e foto.
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {draft.perguntas.map((q, idx) => (
                        <div key={q.id} className="py-2 flex items-start gap-2">
                          <span className="w-5 h-5 rounded-xs bg-ink text-brand-light font-mono text-label font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-ink leading-snug">
                              {q.texto}
                            </p>
                            <span className="text-label text-brand">
                              {FIELD_TYPE_LABELS[q.tipo_campo]}
                              {q.obrigatoria ? ' · obrigatória' : ''}
                              {q.opcoes?.length ? ` · ${q.opcoes.length} opções` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => moverPergunta(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 text-gray-300 hover:text-ink disabled:opacity-30"
                              aria-label="Subir"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moverPergunta(idx, 'down')}
                              disabled={idx === draft.perguntas.length - 1}
                              className="p-1 text-gray-300 hover:text-ink disabled:opacity-30"
                              aria-label="Descer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirPerguntaExistente(idx)}
                              className="p-1 text-gray-400 hover:text-ink"
                              aria-label="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removerPergunta(idx)}
                              className="p-1 text-gray-400 hover:text-danger"
                              aria-label="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Imagens */}
                <div className="space-y-3 p-3.5 rounded-sm border border-gray-200 bg-white">
                  <span className="text-label font-bold uppercase tracking-wider text-gray-500">
                    Mapa anatômico para anotação
                  </span>
                  <p className="text-label text-gray-400 -mt-1.5">
                    A versão por gênero é resolvida pelo cadastro da paciente. A imagem única serve
                    de reserva quando não há versão para o gênero dela.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <FotoSlot rotulo="Feminino" campo="fotoModeloFemininoUrl" />
                    <FotoSlot rotulo="Masculino" campo="fotoModeloMasculinoUrl" />
                    <FotoSlot rotulo="Única (reserva)" campo="fotoModeloUrl" />
                  </div>

                  {/* No acompanhamento a foto do atendimento aparece sempre — é o registro da
                      sessão. Só a avaliação escolhe se pede foto. */}
                  {tipo === 'avaliacao' ? (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-ink pt-1">
                      <input
                        type="checkbox"
                        checked={draft.temFotoSessao}
                        onChange={(e) => setDraft({ ...draft, temFotoSessao: e.target.checked })}
                        className="accent-brand w-4 h-4 rounded-xs"
                      />
                      <span>
                        Pedir {rotulos.rotuloDaFoto.toLowerCase()}
                        <span className="text-gray-400 ml-1">({rotulos.dicaDaFoto.toLowerCase()})</span>
                      </span>
                    </label>
                  ) : (
                    <p className="text-label text-gray-400 pt-1">
                      A {rotulos.rotuloDaFoto.toLowerCase()} aparece sempre no acompanhamento.
                    </p>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 bg-surface border-t border-gray-200 px-5 py-3.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={salvando}
                  className="px-4 py-2 rounded-sm border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={salvarFicha}
                  disabled={salvando}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-sm bg-ink text-white text-xs font-semibold hover:bg-black disabled:opacity-40"
                >
                  {salvando ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Salvar ficha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor de pergunta */}
      {qModalAberto && (
        <div className="fixed inset-0 z-[60] bg-black/50 overflow-y-auto">
          <div className="flex min-h-full items-start sm:items-center justify-center p-0 sm:p-4">
            <form
              onSubmit={salvarPergunta}
              className="bg-surface w-full sm:max-w-lg sm:rounded-sm shadow-xl min-h-screen sm:min-h-0 sm:my-8"
            >
              <div className="bg-ink px-5 py-4 flex items-center justify-between">
                <h3 className="font-serif-luxury text-lg text-white">
                  {qIndex !== null ? 'Editar pergunta' : 'Nova pergunta'}
                </h3>
                <button
                  type="button"
                  onClick={() => setQModalAberto(false)}
                  className="p-1 text-gray-400 hover:text-white"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">
                {qErro && (
                  <div className="flex items-start gap-2 text-xs text-danger bg-danger-bg border border-danger-line rounded-sm px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                    <span>{qErro}</span>
                  </div>
                )}

                <div>
                  <label className={labelClass} htmlFor="q-texto">
                    Enunciado
                  </label>
                  <input
                    id="q-texto"
                    value={qTexto}
                    onChange={(e) => setQTexto(e.target.value)}
                    placeholder="Ex: Fototipo de Fitzpatrick"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="q-tipo">
                    Tipo de campo
                  </label>
                  <select
                    id="q-tipo"
                    value={qTipo}
                    onChange={(e) => setQTipo(e.target.value as QuestionFieldType)}
                    className={inputClass}
                  >
                    {Object.entries(FIELD_TYPE_LABELS).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </div>

                {(qTipo === 'unica_escolha' || qTipo === 'multipla_escolha') && (
                  <div>
                    <label className={labelClass} htmlFor="q-opcoes">
                      Opções (uma por linha)
                    </label>
                    <textarea
                      id="q-opcoes"
                      value={qOpcoes}
                      onChange={(e) => setQOpcoes(e.target.value)}
                      rows={5}
                      className={`${inputClass} resize-y`}
                    />
                  </div>
                )}

                {qTipo === 'escala' && (
                  <div>
                    <label className={labelClass}>Escala</label>
                    <div className="flex items-center gap-3">
                      {[5, 10].map((max) => (
                        <button
                          key={max}
                          type="button"
                          onClick={() => setQEscalaMax(max)}
                          className={`px-4 py-2 rounded-sm text-xs font-semibold border ${
                            qEscalaMax === max
                              ? 'bg-ink text-white border-ink'
                              : 'bg-white text-gray-700 border-gray-200'
                          }`}
                        >
                          1 a {max}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className={labelClass} htmlFor="q-ajuda">
                    Texto de ajuda (opcional)
                  </label>
                  <input
                    id="q-ajuda"
                    value={qAjuda}
                    onChange={(e) => setQAjuda(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={qObrigatoria}
                    onChange={(e) => setQObrigatoria(e.target.checked)}
                    className="accent-brand w-4 h-4 rounded-xs"
                  />
                  <span>
                    Marcar como obrigatória
                    <span className="text-gray-400 ml-1">
                      (sinaliza importância; não trava o salvamento)
                    </span>
                  </span>
                </label>
              </div>

              <div className="border-t border-gray-200 px-5 py-3.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQModalAberto(false)}
                  className="px-4 py-2 rounded-sm border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-sm bg-ink text-white text-xs font-semibold hover:bg-black"
                >
                  {qIndex !== null ? 'Salvar alterações' : 'Adicionar pergunta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
