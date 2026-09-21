import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  ChevronDown,
  ChevronRight,
  Layers,
  Link2Off,
  ClipboardCheck,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Unlock,
} from 'lucide-react';
import { Attendance, SessionPlan } from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import { avaliacaoVisivel } from '../../utils/evaluations';
import {
  ehPendente,
  ehPendenteAtrasado,
  ehRealizado,
  LinhaDoHistorico,
  montarHistorico,
  numeroDaSessao,
  ProgressoDoPlano,
  ROTULO_DO_STATUS,
} from '../../utils/attendances';

interface AttendancesTabProps {
  atendimentos: Attendance[];
  planos: SessionPlan[];
  primeiroNome: string;
  onNovo: () => void;
  onEditar: (a: Attendance) => void;
  onExcluir: (a: Attendance) => void;
  /** "Compareceu" — abre o formulário inteiro pré-preenchido para confirmar. */
  onConfirmar: (a: Attendance) => void;
  onAvaliar: (a: Attendance) => void;
  onFaltou: (a: Attendance) => void;
  /** Marca como remarcado e abre um agendamento novo com os dados copiados. */
  onRemarcar: (a: Attendance) => void;
  onAdicionarSessao: (planoId: string) => void;
  onEncerrarPlano: (plano: SessionPlan) => void;
  onReabrirPlano: (plano: SessionPlan) => void;
  onExcluirPlano: (plano: SessionPlan) => void;
}

const acaoClass =
  'p-2 text-gray-400 hover:text-[#A67C52] transition-colors disabled:opacity-40';

/** Data e hora na linha. Hora ausente é o caso do registro retroativo, e some sem deixar buraco. */
const quando = (a: Attendance): string =>
  a.hora ? `${formatDateOnly(a.data)} · ${a.hora}` : formatDateOnly(a.data);

const BadgeDoStatus: React.FC<{ atendimento: Attendance }> = ({ atendimento }) => {
  if (!atendimento.status) return null;
  const atrasado = ehPendenteAtrasado(atendimento);
  const cor =
    atendimento.status === 'compareceu'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : atendimento.status === 'faltou'
      ? 'bg-red-50 text-red-700 border-red-200'
      : atendimento.status === 'remarcado'
      ? 'bg-gray-100 text-gray-500 border-gray-200'
      : atrasado
      ? 'bg-amber-50 text-amber-800 border-amber-300'
      : 'bg-[#A67C52]/10 text-[#8E653D] border-[#A67C52]/25';

  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-xs border ${cor}`}
      title={atrasado ? 'A data já passou e ninguém marcou o desfecho' : undefined}
    >
      {atrasado && <AlertTriangle className="w-3 h-3" />}
      {ROTULO_DO_STATUS[atendimento.status]}
    </span>
  );
};

/** Os três desfechos de um agendamento ainda em aberto. */
const AcoesDoAgendamento: React.FC<{
  atendimento: Attendance;
  onConfirmar: (a: Attendance) => void;
  onFaltou: (a: Attendance) => void;
  onRemarcar: (a: Attendance) => void;
}> = ({ atendimento, onConfirmar, onFaltou, onRemarcar }) => (
  <div className="flex items-center gap-0.5">
    <button
      type="button"
      onClick={() => onConfirmar(atendimento)}
      title="Compareceu — abre o registro para confirmar"
      aria-label="Marcar como compareceu"
      className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
    >
      <CalendarCheck className="w-4 h-4" />
    </button>
    <button
      type="button"
      onClick={() => onFaltou(atendimento)}
      title="Faltou"
      aria-label="Marcar como faltou"
      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
    >
      <CalendarX className="w-4 h-4" />
    </button>
    <button
      type="button"
      onClick={() => onRemarcar(atendimento)}
      title="Remarcou — abre um agendamento novo com os mesmos dados"
      aria-label="Remarcar"
      className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
    >
      <RotateCcw className="w-4 h-4" />
    </button>
  </div>
);

/** Uma visita na lista — serve tanto solta quanto dentro de um plano expandido. */
const LinhaDeAtendimento: React.FC<{
  atendimento: Attendance;
  /** "3ª sessão" quando faz parte de um plano e consumiu sessão. */
  rotuloDaSessao?: string;
  compacta?: boolean;
  onEditar: (a: Attendance) => void;
  onExcluir: (a: Attendance) => void;
  onConfirmar: (a: Attendance) => void;
  onFaltou: (a: Attendance) => void;
  onRemarcar: (a: Attendance) => void;
  /** Abre a ficha de avaliação desta visita. */
  onAvaliar: (a: Attendance) => void;
}> = ({
  atendimento,
  rotuloDaSessao,
  compacta,
  onEditar,
  onExcluir,
  onConfirmar,
  onFaltou,
  onRemarcar,
  onAvaliar,
}) => (
  <div
    className={
      compacta
        ? 'flex flex-wrap items-center gap-3 py-2.5 pl-4 pr-2 border-t border-white/70'
        : 'glass-card glass-card-hover rounded-sm p-4 flex flex-wrap items-center gap-3'
    }
  >
    <div className="flex-1 min-w-[150px]">
      <p className="text-sm text-[#1A1A1A] truncate">
        {rotuloDaSessao && (
          <span className="text-[#A67C52] font-semibold tabular-nums">{rotuloDaSessao} · </span>
        )}
        {atendimento.procedimentoNome}
      </p>
      <p className="text-[11px] text-gray-400 truncate">
        {quando(atendimento)}
        {atendimento.profissionalNome && ` · ${atendimento.profissionalNome}`}
      </p>
      {atendimento.observacoes && (
        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 whitespace-pre-line">
          {atendimento.observacoes}
        </p>
      )}
    </div>

    <BadgeDoStatus atendimento={atendimento} />

    <div className="flex items-center gap-0.5 ml-auto">
      {ehPendente(atendimento) && (
        <AcoesDoAgendamento
          atendimento={atendimento}
          onConfirmar={onConfirmar}
          onFaltou={onFaltou}
          onRemarcar={onRemarcar}
        />
      )}

      {/*
        Só aparece depois que a visita aconteceu — avaliar o que ainda não ocorreu não faz
        sentido, e agendamento que virou falta ou remarcação nunca teve o que avaliar. A regra
        mora em `avaliacaoVisivel`, compartilhada com a fila de pendentes e o contador do menu.
      */}
      {avaliacaoVisivel(atendimento) && (
        <button
          type="button"
          onClick={() => onAvaliar(atendimento)}
          title={atendimento.avaliacaoPreenchidaEm ? 'Ver avaliação' : 'Preencher avaliação'}
          aria-label={`Ficha de avaliação do atendimento de ${atendimento.procedimentoNome}`}
          className={
            atendimento.avaliacaoPreenchidaEm
              ? 'p-2 text-emerald-600 hover:text-emerald-700 transition-colors'
              : acaoClass
          }
        >
          <ClipboardCheck className="w-4 h-4" />
        </button>
      )}

      <button
        type="button"
        onClick={() => onEditar(atendimento)}
        title="Editar"
        aria-label={`Editar o atendimento de ${atendimento.procedimentoNome}`}
        className={acaoClass}
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onExcluir(atendimento)}
        title="Excluir"
        aria-label={`Excluir o atendimento de ${atendimento.procedimentoNome}`}
        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  </div>
);

/** "3/10 sessões", com o que sobra (agendadas, faltas, estouro) em texto secundário. */
const ResumoDoPlano: React.FC<{ progresso: ProgressoDoPlano }> = ({ progresso }) => {
  const extras = [
    progresso.agendadas > 0 ? `${progresso.agendadas} agendada${progresso.agendadas === 1 ? '' : 's'}` : '',
    progresso.faltas > 0 ? `${progresso.faltas} falta${progresso.faltas === 1 ? '' : 's'}` : '',
    progresso.encerrado ? 'encerrado' : '',
  ].filter(Boolean);

  return (
    <p className="text-[11px] text-gray-400 truncate">
      <span
        className={`tabular-nums font-semibold ${
          progresso.estourado ? 'text-amber-700' : 'text-[#A67C52]'
        }`}
        title={progresso.estourado ? 'Passou do total contratado' : undefined}
      >
        {progresso.realizadas}/{progresso.total} sessões
      </span>
      {extras.length > 0 && ` · ${extras.join(' · ')}`}
    </p>
  );
};

/**
 * Aba "Atendimentos": o diário da paciente.
 *
 * Uma lista só, em ordem de data decrescente — o que está marcado para o futuro cai no topo
 * naturalmente, sem um bloco "Próximos" à parte (a agenda de verdade vem depois; uma meia-agenda
 * aqui teria que ser desmontada). Plano de sessões ocupa **uma linha**, com o progresso no
 * título; as sessões aparecem ao abrir.
 */
export const AttendancesTab: React.FC<AttendancesTabProps> = ({
  atendimentos,
  planos,
  primeiroNome,
  onNovo,
  onEditar,
  onExcluir,
  onConfirmar,
  onAvaliar,
  onFaltou,
  onRemarcar,
  onAdicionarSessao,
  onEncerrarPlano,
  onReabrirPlano,
  onExcluirPlano,
}) => {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const historico = useMemo(
    () => montarHistorico(atendimentos, planos),
    [atendimentos, planos]
  );

  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  if (historico.length === 0) {
    return (
      <div className="glass-card rounded-sm py-14 text-center">
        <CalendarClock className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Nenhum atendimento de {primeiroNome} ainda.</p>
        <button
          type="button"
          onClick={onNovo}
          className="mt-3 text-xs font-semibold text-[#A67C52] hover:underline"
        >
          Registrar o primeiro
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {historico.map((linha: LinhaDoHistorico) => {
        if (linha.tipo === 'avulso') {
          return (
            <LinhaDeAtendimento
              key={linha.chave}
              atendimento={linha.atendimento}
              onEditar={onEditar}
              onExcluir={onExcluir}
              onConfirmar={onConfirmar}
              onAvaliar={onAvaliar}
              onFaltou={onFaltou}
              onRemarcar={onRemarcar}
            />
          );
        }

        const { plano, progresso, atendimentos: doPlano } = linha;
        const aberto = abertos.has(linha.chave);

        return (
          <div
            key={linha.chave}
            className={`glass-card rounded-sm overflow-hidden ${
              progresso.encerrado ? 'opacity-70' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-3 p-4">
              {/* O agrupador inteiro é o alvo de clique — abrir o plano é o que se quer fazer
                  nele em 9 de cada 10 vezes. */}
              <button
                type="button"
                onClick={() => alternar(linha.chave)}
                aria-expanded={aberto}
                className="flex-1 min-w-[150px] flex items-center gap-3 text-left"
              >
                <span className="w-8 h-8 shrink-0 rounded-sm bg-[#A67C52]/10 text-[#A67C52] flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[#1A1A1A] truncate">
                    {plano.procedimentoNome}
                  </span>
                  <ResumoDoPlano progresso={progresso} />
                </span>
                {aberto ? (
                  <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                )}
              </button>

              <div className="flex items-center gap-0.5 ml-auto">
                {progresso.encerrado ? (
                  <button
                    type="button"
                    onClick={() => onReabrirPlano(plano)}
                    title="Reabrir plano"
                    aria-label={`Reabrir o plano de ${plano.procedimentoNome}`}
                    className={acaoClass}
                  >
                    <Unlock className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onEncerrarPlano(plano)}
                    title="Encerrar plano — para de receber sessões novas"
                    aria-label={`Encerrar o plano de ${plano.procedimentoNome}`}
                    className={acaoClass}
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onExcluirPlano(plano)}
                  title="Excluir plano — as sessões viram atendimentos avulsos"
                  aria-label={`Excluir o plano de ${plano.procedimentoNome}`}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Link2Off className="w-4 h-4" />
                </button>
              </div>
            </div>

            {aberto && (
              <div className="bg-white/40">
                {doPlano.length === 0 ? (
                  <p className="px-4 py-3 text-[11px] text-gray-400 border-t border-white/70">
                    Nenhuma sessão registrada neste plano ainda.
                  </p>
                ) : (
                  doPlano.map((a) => {
                    const numero = numeroDaSessao(a, doPlano);
                    return (
                      <LinhaDeAtendimento
                        key={a.id}
                        atendimento={a}
                        rotuloDaSessao={numero ? `${numero}ª sessão` : undefined}
                        compacta
                        onEditar={onEditar}
                        onExcluir={onExcluir}
                        onConfirmar={onConfirmar}
                        onAvaliar={onAvaliar}
                        onFaltou={onFaltou}
                        onRemarcar={onRemarcar}
                      />
                    );
                  })
                )}

                <div className="px-4 py-3 border-t border-white/70">
                  <button
                    type="button"
                    onClick={() => onAdicionarSessao(plano.id)}
                    disabled={progresso.encerrado}
                    title={
                      progresso.encerrado
                        ? 'Plano encerrado — reabra para registrar mais sessões'
                        : undefined
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A67C52] hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar sessão
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** O contador da aba na página do paciente — agendamento futuro não é atendimento feito. */
export const contarAtendimentosRealizados = (atendimentos: Attendance[]): number =>
  atendimentos.filter(ehRealizado).length;
