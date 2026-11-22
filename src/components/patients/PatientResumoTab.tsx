import React, { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import {
  AnamnesisRecord,
  AnamnesisTemplate,
  Attendance,
  Procedure,
  Quote,
  SessionPlan,
} from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import {
  ItemDaLinha,
  linhaDoTempo,
  progressoDosPlanos,
} from '../../utils/pacienteResumo';
import { ItemDaLinhaDoTempo } from '../linhaDoTempo/ItemDaLinhaDoTempo';
import { AcoesDaLinha, PainelDoEvento } from '../linhaDoTempo/PainelDoEvento';
import { ContextoDaJornada } from '../../utils/passosDaJornada';

/**
 * A aba Resumo da ficha da paciente.
 *
 * Mostra o progresso dos planos (o que está em curso), a evolução em foto e a linha do tempo.
 */

interface PatientResumoTabProps {
  records: AnamnesisRecord[];
  atendimentos: Attendance[];
  planos: SessionPlan[];
  quotes: Quote[];
  catalogProcedures: Procedure[];
  /** Fichas-modelo de anamnese — juntam as áreas do laser num tratamento só, no painel do evento. */
  templates: AnamnesisTemplate[];
  /** O que o painel do evento faz — o mesmo da linha da clínica, na tela Hoje. */
  acoes: AcoesDaLinha;
  onAgendarSessao: (plano: SessionPlan) => void;
  /**
   * O antes e depois por ângulo, montado pela página — é ela que tem o cadastro, as fotos das
   * três fichas e o salvar. A aba Fotos mostra o mesmo.
   */
  antesEDepois: React.ReactNode;
}

export const PatientResumoTab: React.FC<PatientResumoTabProps> = ({
  records,
  atendimentos,
  planos,
  quotes,
  catalogProcedures,
  templates,
  acoes,
  onAgendarSessao,
  antesEDepois,
}) => {
  const progressos = useMemo(
    () => progressoDosPlanos(planos, atendimentos, catalogProcedures),
    [planos, atendimentos, catalogProcedures]
  );
  const linha = useMemo(
    () => linhaDoTempo(atendimentos, records, quotes),
    [atendimentos, records, quotes]
  );

  /** O evento tocado na linha do tempo: abre o painel com o documento e o passo seguinte. */
  const [aberto, setAberto] = useState<ItemDaLinha | null>(null);
  const contexto: ContextoDaJornada = useMemo(
    () => ({
      atendimentos,
      anamneses: records,
      catalogo: catalogProcedures,
      templatesAnamnese: templates,
    }),
    [atendimentos, records, catalogProcedures, templates]
  );

  return (
    <div className="space-y-6">

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
        {antesEDepois}
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
                mostrarData
                onAbrir={setAberto}
              />
            ))}
          </ol>
        )}
      </section>

      {aberto && (
        <PainelDoEvento
          item={aberto}
          contexto={contexto}
          acoes={acoes}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
};
