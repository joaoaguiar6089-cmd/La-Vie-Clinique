import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, Check, Link2Off, UserPlus, X } from 'lucide-react';
import {
  Attendance,
  Patient,
  Procedure,
  Professional,
  Quote,
  SessionPlan,
} from '../../types';
import {
  MaskedDateInput,
  MaskedTimeInput,
  dataParaISO,
  horaValida,
  isoParaData,
} from '../common/MaskedDateTimeInput';
import { ProcedureSearchSelect } from '../common/ProcedureSearchSelect';
import {
  agoraHHMM,
  ehDataFutura,
  hojeISO,
  mesmoProcedimento,
  numeroDaSessao,
  planoAbertoPara,
  procedimentoSugerido,
  progressoDoPlano,
} from '../../utils/attendances';
import { resolveQuoteStatus } from '../../utils/quoteCalc';

/**
 * `novo` nasce em branco; `edicao` corrige um registro; `confirmacao` é o "compareceu" de um
 * agendamento — que abre este mesmo formulário inteiro, e não só um campo de observações,
 * porque quem chegou atrasado ou trocou de procedimento na hora é caso comum.
 */
export type ModoDoFormulario = 'novo' | 'edicao' | 'confirmacao';

interface AttendanceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  /** Se o cadastro dele ainda não existe — o formulário avisa que vai criar ao salvar. */
  cadastroSeraCriado: boolean;
  /** Atendimentos já registrados deste paciente: palpite de procedimento e contagem do plano. */
  atendimentos: Attendance[];
  planos: SessionPlan[];
  /** Orçamentos dele, só para sugerir o total de sessões de um plano novo. */
  quotes: Quote[];
  procedures: Procedure[];
  professionals: Professional[];
  /** Profissional logada — entra pré-selecionada. */
  professionalIdPadrao?: string;
  ultimaAnamnese?: { procedimentoId?: string; procedimentoNome: string };
  /**
   * Em `edicao` e `confirmacao`, o registro que está sendo mexido. Em `novo`, serve só de
   * semente: é assim que "remarcou" abre um agendamento novo já com o procedimento, a
   * profissional e o plano da visita que caiu.
   */
  atendimento?: Attendance | null;
  modo: ModoDoFormulario;
  /** "+ adicionar sessão" de dentro de um plano: o registro nasce amarrado a ele. */
  planoFixoId?: string;
  onSalvar: (attendance: Attendance, planoNovo?: SessionPlan) => Promise<void>;
}

const labelClass = 'block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1';

const TITULO: Record<ModoDoFormulario, string> = {
  novo: 'Novo atendimento',
  edicao: 'Editar atendimento',
  confirmacao: 'Confirmar atendimento',
};

/**
 * Formulário de uma visita.
 *
 * A natureza do registro sai da data e é mostrada em tempo real no alto: data depois de hoje =
 * agendamento (nasce "agendado" e exige hora); hoje ou antes = atendimento realizado. Quem
 * decide isso é o momento de criar — editar a data depois não transforma um no outro, senão um
 * agendamento resolvido semanas atrás voltaria a pedir desfecho.
 */
export const AttendanceFormModal: React.FC<AttendanceFormModalProps> = ({
  isOpen,
  onClose,
  patient,
  cadastroSeraCriado,
  atendimentos,
  planos,
  quotes,
  procedures,
  professionals,
  professionalIdPadrao,
  ultimaAnamnese,
  atendimento,
  modo,
  planoFixoId,
  onSalvar,
}) => {
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [procedimento, setProcedimento] = useState<{
    procedureId?: string;
    procedimentoNome: string;
  }>({ procedimentoNome: '' });
  const [professionalId, setProfessionalId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [criarPlano, setCriarPlano] = useState(false);
  const [totalSessoes, setTotalSessoes] = useState('');
  const [desvinculado, setDesvinculado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Cada abertura recomeça do zero: sobras do preenchimento anterior virariam o atendimento de
  // uma paciente lançado na página de outra.
  useEffect(() => {
    if (!isOpen) return;
    setErros({});
    setErroGeral(null);
    setSalvando(false);
    setCriarPlano(false);
    setTotalSessoes('');
    setDesvinculado(false);

    if (atendimento) {
      setData(isoParaData(atendimento.data));
      setHora(atendimento.hora || '');
      setProcedimento({
        procedureId: atendimento.procedureId,
        procedimentoNome: atendimento.procedimentoNome,
      });
      setProfessionalId(atendimento.professionalId || professionalIdPadrao || '');
      setObservacoes(atendimento.observacoes || '');
      return;
    }

    const sugestao = procedimentoSugerido(atendimentos, ultimaAnamnese, procedures);
    setData(isoParaData(hojeISO()));
    setHora(agoraHHMM());
    setProcedimento(sugestao || { procedimentoNome: '' });
    setProfessionalId(professionalIdPadrao || '');
    setObservacoes('');
  }, [isOpen, atendimento, professionalIdPadrao]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataISO = dataParaISO(data);
  const seraAgendamento = modo === 'novo' && !!dataISO && ehDataFutura(dataISO);

  /**
   * O plano que vai receber esta sessão. O "+ adicionar sessão" fixa um; fora dele, o plano
   * aberto do mesmo procedimento é detectado e oferecido — nunca aplicado calado.
   */
  const planoVinculado = useMemo(() => {
    if (desvinculado) return undefined;
    if (planoFixoId) return planos.find((p) => p.id === planoFixoId);
    if (atendimento?.planoId) return planos.find((p) => p.id === atendimento.planoId);
    if (!procedimento.procedimentoNome.trim()) return undefined;
    return planoAbertoPara(planos, procedimento);
  }, [desvinculado, planoFixoId, planos, atendimento, procedimento]);

  /** Em que posição esta sessão entra — o número que o aviso mostra antes de salvar. */
  const posicaoNoPlano = useMemo(() => {
    if (!planoVinculado) return null;
    const doPlano = atendimentos.filter((a) => a.planoId === planoVinculado.id);
    const progresso = progressoDoPlano(planoVinculado, doPlano);
    // Editar mantém a posição que ele já ocupa; criar entra depois da última realizada.
    const jaExiste = atendimento && doPlano.some((a) => a.id === atendimento.id);
    const numero = jaExiste
      ? numeroDaSessao(atendimento!, doPlano) ?? progresso.realizadas
      : progresso.realizadas + 1;
    return { numero, total: progresso.total };
  }, [planoVinculado, atendimentos, atendimento]);

  /**
   * Quantas sessões o orçamento já vendeu deste procedimento — só como valor inicial do campo
   * quando a pessoa liga o plano. Sugestão, nunca vínculo: plano não depende de orçamento.
   */
  const sugestaoDeSessoes = useMemo(() => {
    if (!procedimento.procedimentoNome.trim()) return undefined;
    for (const q of quotes) {
      if (resolveQuoteStatus(q) !== 'aceito') continue;
      const item = q.itens.find((i) =>
        mesmoProcedimento(
          { procedureId: i.procedureId, procedimentoNome: i.titulo },
          procedimento
        )
      );
      if (item?.maisDeUmaSessao && item.sessoes > 1) return item.sessoes;
    }
    return undefined;
  }, [quotes, procedimento]);

  if (!isOpen) return null;

  const ligarPlano = (ligado: boolean) => {
    setCriarPlano(ligado);
    if (ligado && !totalSessoes && sugestaoDeSessoes) setTotalSessoes(String(sugestaoDeSessoes));
  };

  const validar = (): Record<string, string> => {
    const novos: Record<string, string> = {};
    if (!data.trim()) novos.data = 'Informe a data.';
    else if (!dataISO) novos.data = 'Essa data não existe no calendário.';

    if (!horaValida(hora)) novos.hora = 'Hora inválida.';
    else if (seraAgendamento && !hora.trim()) novos.hora = 'Agendamento precisa de horário.';

    if (!procedimento.procedimentoNome.trim()) novos.procedimento = 'Informe o procedimento.';

    if (criarPlano) {
      const total = Number(totalSessoes);
      if (!Number.isInteger(total) || total < 2) {
        novos.plano = 'O plano precisa de um total de 2 sessões ou mais.';
      }
    }
    return novos;
  };

  const salvar = async () => {
    const novos = validar();
    setErros(novos);
    if (Object.keys(novos).length > 0) return;

    setSalvando(true);
    setErroGeral(null);
    try {
      const agora = new Date().toISOString();
      const profissional = professionals.find((p) => p.id === professionalId);

      let planoNovo: SessionPlan | undefined;
      if (criarPlano) {
        planoNovo = {
          id: `plan-${Date.now()}`,
          pacienteId: patient.id,
          procedureId: procedimento.procedureId,
          procedimentoNome: procedimento.procedimentoNome.trim(),
          totalSessoes: Number(totalSessoes),
          createdAt: agora,
        };
      }

      const registro: Attendance = {
        // Em `novo`, `atendimento` é semente e não identidade — reaproveitar o id dele
        // sobrescreveria a visita que serviu de modelo.
        id: modo === 'novo' ? `atd-${Date.now()}` : atendimento!.id,
        pacienteId: patient.id,
        pacienteNome: patient.nome,
        data: dataISO!,
        hora: hora.trim() || undefined,
        procedureId: procedimento.procedureId,
        procedimentoNome: procedimento.procedimentoNome.trim(),
        planoId: planoNovo?.id || planoVinculado?.id,
        professionalId: professionalId || undefined,
        profissionalNome: profissional?.name,
        observacoes: observacoes.trim() || undefined,
        // Natureza congelada na criação. Confirmar resolve o agendamento; editar não mexe nela.
        status:
          modo === 'confirmacao'
            ? 'compareceu'
            : modo === 'novo'
            ? seraAgendamento
              ? 'agendado'
              : undefined
            : atendimento?.status,
        // Guarda o horário que estava marcado, para o caso de a pessoa ter chegado noutro.
        agendadoPara:
          modo === 'confirmacao'
            ? atendimento?.agendadoPara ||
              `${atendimento?.data}T${atendimento?.hora || '00:00'}:00`
            : modo === 'edicao'
            ? atendimento?.agendadoPara
            : undefined,
        createdAt: modo === 'novo' ? agora : atendimento?.createdAt || agora,
      };

      await onSalvar(registro, planoNovo);
      onClose();
    } catch (e) {
      setErroGeral(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atendimento-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget && !salvando) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#F9F8F6] rounded-sm shadow-2xl border border-white/60">
        <div className="bg-[#1A1A1A] px-6 py-4 flex items-start justify-between gap-3 sticky top-0 z-10">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A67C52]">
              {patient.nome}
            </p>
            <h2 id="atendimento-titulo" className="text-lg text-white font-serif-luxury">
              {TITULO[modo]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            aria-label="Fechar"
            className="text-white/60 hover:text-white transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {erroGeral && (
            <div className="px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {erroGeral}
            </div>
          )}

          {/* Quem só existe como nome num orçamento ganha o cadastro aqui, sem parar a recepção
              para preencher formulário com a cliente na frente. */}
          {cadastroSeraCriado && (
            <div className="px-3 py-2 rounded-sm bg-[#A67C52]/10 border border-[#A67C52]/25 text-xs text-[#8E653D] flex items-start gap-2">
              <UserPlus className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>O cadastro de {patient.nome} será criado ao salvar este atendimento.</span>
            </div>
          )}

          {/* A natureza do registro, ao vivo — some a dúvida de "isso vai virar agendamento?" */}
          {seraAgendamento && (
            <div className="px-3 py-2 rounded-sm bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                Data no futuro — será salvo como <strong>agendamento</strong>, e você marca
                compareceu, faltou ou remarcou depois.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <MaskedDateInput
              id="atendimento-data"
              label="Data *"
              value={data}
              onChange={setData}
              erro={erros.data}
              autoFocus
            />
            <MaskedTimeInput
              id="atendimento-hora"
              label={seraAgendamento ? 'Hora *' : 'Hora'}
              value={hora}
              onChange={setHora}
              erro={erros.hora}
              ajuda={seraAgendamento ? undefined : 'Opcional'}
            />
          </div>

          <ProcedureSearchSelect
            procedures={procedures}
            procedureId={procedimento.procedureId}
            nome={procedimento.procedimentoNome}
            onSelect={setProcedimento}
            erro={erros.procedimento}
          />

          {/* Plano: ou o vínculo detectado, ou a oferta de criar um. Nunca os dois — digitar um
              total novo enquanto existe plano aberto não teria significado claro (criaria um
              segundo plano paralelo ou mexeria nas outras sessões sem avisar). */}
          {planoVinculado ? (
            <div className="px-3 py-2.5 rounded-sm bg-white/70 border border-[#A67C52]/25 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A67C52]">
                  Plano em andamento
                </p>
                <p className="text-xs text-[#1A1A1A] truncate">
                  {planoVinculado.procedimentoNome} —{' '}
                  <strong className="tabular-nums">
                    {posicaoNoPlano?.numero}ª de {posicaoNoPlano?.total}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDesvinculado(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[11px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Link2Off className="w-3.5 h-3.5" />
                Desvincular
              </button>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-sm bg-white/50 border border-white/80">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={criarPlano}
                  onChange={(e) => ligarPlano(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#A67C52]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-[#1A1A1A]">
                    Plano de sessões
                  </span>
                  <span className="block text-[11px] text-gray-400">
                    Para pacotes contínuos — as sessões seguintes entram neste plano sozinhas.
                  </span>
                </span>
              </label>

              {criarPlano && (
                <div className="mt-3 pl-7">
                  <label className={labelClass} htmlFor="atendimento-total-sessoes">
                    Total de sessões
                  </label>
                  <input
                    id="atendimento-total-sessoes"
                    type="text"
                    inputMode="numeric"
                    value={totalSessoes}
                    onChange={(e) => setTotalSessoes(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="10"
                    className="w-24 glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] tabular-nums focus:outline-hidden"
                  />
                  {erros.plano && <p className="mt-1 text-[11px] text-red-600">{erros.plano}</p>}
                  {!erros.plano && sugestaoDeSessoes && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Sugerido pelo orçamento aceito desta cliente.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <span className={labelClass}>Quem atendeu</span>
            {professionals.length === 0 ? (
              <p className="text-xs text-gray-400">
                Nenhuma profissional cadastrada nas configurações da clínica.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {professionals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProfessionalId(professionalId === p.id ? '' : p.id)}
                    className={`px-3 py-2 rounded-sm text-xs font-medium border transition-colors ${
                      professionalId === p.id
                        ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                        : 'bg-white/70 text-gray-600 border-gray-200 hover:border-[#A67C52]/40'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="atendimento-observacoes">
              Observações
            </label>
            <textarea
              id="atendimento-observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder="Parâmetros usados, reação da paciente, o que combinar para a próxima"
              className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] resize-y focus:outline-hidden"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-white/50 border-t border-white/70 flex items-center justify-end gap-3 sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest hover:bg-[#8E653D] transition-colors disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            {salvando ? 'Salvando...' : seraAgendamento ? 'Agendar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};
