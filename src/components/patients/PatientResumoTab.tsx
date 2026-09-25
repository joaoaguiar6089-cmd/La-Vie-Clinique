import React, { useMemo } from 'react';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import {
  AnamnesisRecord,
  Attendance,
  EvaluationRecord,
  Procedure,
  Quote,
  SessionPlan,
} from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import {
  ItemDaLinha,
  alertaDaAnamnese,
  fotosDaPaciente,
  linhaDoTempo,
  progressoDosPlanos,
} from '../../utils/pacienteResumo';
import { BeforeAfterCompare } from './BeforeAfterCompare';
import { AcoesDaLinha, ItemDaLinhaDoTempo } from '../linhaDoTempo/ItemDaLinhaDoTempo';

/**
 * A aba Resumo da ficha da paciente.
 *
 * A ordem é a ordem do risco: **o alerta da anamnese vem antes de qualquer outra coisa**, porque
 * é a única informação desta tela que muda a conduta de um atendimento que está prestes a
 * acontecer. Depois o progresso dos planos (o que está em curso), depois a evolução em foto, e
 * por último a linha do tempo, que é consulta.
 */

interface PatientResumoTabProps {
  records: AnamnesisRecord[];
  atendimentos: Attendance[];
  planos: SessionPlan[];
  quotes: Quote[];
  /** Avaliações emitidas para ela — entram na linha do tempo. */
  avaliacoes: EvaluationRecord[];
  catalogProcedures: Procedure[];
  /** Os atalhos da linha do tempo — os mesmos da linha da clínica, na tela Hoje. */
  acoes: AcoesDaLinha;
  onIrParaAba: (aba: 'atendimentos' | 'anamneses' | 'orcamentos') => void;
  onAgendarSessao: (plano: SessionPlan) => void;
}

export const PatientResumoTab: React.FC<PatientResumoTabProps> = ({
  records,
  atendimentos,
  planos,
  quotes,
  avaliacoes,
  catalogProcedures,
  acoes,
  onIrParaAba,
  onAgendarSessao,
}) => {
  const alerta = useMemo(
    () => alertaDaAnamnese(records, catalogProcedures),
    [records, catalogProcedures]
  );
  const progressos = useMemo(
    () => progressoDosPlanos(planos, atendimentos, catalogProcedures),
    [planos, atendimentos, catalogProcedures]
  );
  const fotos = useMemo(() => fotosDaPaciente(records), [records]);
  const linha = useMemo(
    () => linhaDoTempo(atendimentos, records, quotes, avaliacoes),
    [atendimentos, records, quotes, avaliacoes]
  );

  const abrirItem = (item: ItemDaLinha) => {
    if (item.tipo === 'anamnese') acoes.onVerAnamnese(item.ref);
    else if (item.tipo === 'avaliacao') acoes.onVerAvaliacao(item.ref);
    else if (item.tipo === 'orcamento') acoes.orcamento.abrirPrevia(item.ref);
    else onIrParaAba('atendimentos');
  };

  return (
    <div className="space-y-6">
      {/* 1. O alerta, antes de tudo */}
      {alerta && (
        <section
          className="rounded-card border border-warn-line bg-warn-bg p-4"
          role="note"
          aria-label="Alerta da anamnese"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-[18px] h-[18px] text-warn shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-body-lg font-semibold text-warn">
                Atenção — anamnese de {formatDateOnly(alerta.data.slice(0, 10))}
              </p>
              <p className="text-body text-ink-soft mt-0.5">{alerta.procedimentoNome}</p>

              {alerta.contraindicacoes && (
                <p className="text-body text-ink mt-2.5 leading-relaxed">
                  <strong className="font-semibold">Contraindicações do procedimento:</strong>{' '}
                  {alerta.contraindicacoes}
                </p>
              )}

              {alerta.respostasDeRisco.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-body font-semibold text-ink">
                    Respondeu "sim" em {alerta.respostasDeRisco.length}{' '}
                    {alerta.respostasDeRisco.length === 1 ? 'pergunta' : 'perguntas'}:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {alerta.respostasDeRisco.map((texto, i) => (
                      <li key={i} className="text-body text-ink-soft flex gap-1.5">
                        <span aria-hidden className="text-warn">
                          •
                        </span>
                        <span className="min-w-0">{texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => onIrParaAba('anamneses')}
                className="mt-2.5 text-body font-semibold text-brand hover:underline"
              >
                Ver a ficha completa
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 2. Planos em curso */}
      {progressos.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-serif-luxury text-title text-ink">Pacotes em andamento</h3>
          {progressos.map((p) => (
            <div key={p.plano.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body-lg font-medium text-ink truncate">
                    {p.plano.procedimentoNome}
                  </p>
                  <p className="text-body text-muted">
                    {p.realizadas} de {p.total} {p.total === 1 ? 'sessão' : 'sessões'}
                  </p>
                </div>
                <span className="shrink-0 text-title font-serif-luxury text-brand tabular-nums">
                  {p.percentual}%
                </span>
              </div>

              <div
                className="mt-2.5 h-2 rounded-full bg-surface-2 overflow-hidden"
                role="progressbar"
                aria-valuenow={p.realizadas}
                aria-valuemin={0}
                aria-valuemax={p.total}
                aria-label={`${p.plano.procedimentoNome}: ${p.realizadas} de ${p.total} sessões`}
              >
                <span
                  className="block h-full bg-brand rounded-full transition-[width] duration-300"
                  style={{ width: `${p.percentual}%` }}
                />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                {p.jaAgendada ? (
                  <p className="text-body text-ok font-medium">Próxima sessão já agendada.</p>
                ) : p.proximaSugerida ? (
                  <p className="text-body text-muted">
                    Próxima sugerida:{' '}
                    <strong className="text-ink font-semibold">
                      {formatDateOnly(p.proximaSugerida)}
                    </strong>
                  </p>
                ) : (
                  <p className="text-body text-muted">
                    {p.realizadas >= p.total
                      ? 'Todas as sessões contratadas já aconteceram.'
                      : 'Sem sessão anterior de onde contar o intervalo.'}
                  </p>
                )}

                {!p.jaAgendada && (
                  <button
                    type="button"
                    onClick={() => onAgendarSessao(p.plano)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-line bg-card text-body font-semibold text-ink hover:border-brand transition-colors"
                  >
                    <CalendarPlus className="w-4 h-4 text-brand" />
                    Agendar sessão
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 3. Evolução em foto */}
      <section className="space-y-2">
        <h3 className="font-serif-luxury text-title text-ink">Antes e depois</h3>
        <BeforeAfterCompare fotos={fotos} />
      </section>

      {/* 4. Linha do tempo */}
      <section className="space-y-2">
        <h3 className="font-serif-luxury text-title text-ink">Linha do tempo</h3>
        {linha.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <p className="text-body-lg text-ink font-medium">Nada registrado ainda.</p>
            <p className="text-body text-muted mt-1">
              Orçamentos, anamneses, avaliações e atendimentos aparecem aqui conforme forem
              acontecendo.
            </p>
          </div>
        ) : (
          <ol className="relative border-l border-line ml-3 space-y-0.5">
            {linha.map((item) => (
              <ItemDaLinhaDoTempo
                key={`${item.tipo}-${item.id}`}
                item={item}
                acoes={acoes}
                mostrarData
                onAbrir={abrirItem}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};
