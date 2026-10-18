import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronRight, NotebookPen, UserPlus } from 'lucide-react';
import { Attendance, ClinicProfile, Patient, Procedure, Professional } from '../../types';
import {
  AlvoDaFicha,
  acompanhamentoComRegistro,
  alvoDoAtendimento,
  atendimentoAconteceu,
} from '../../utils/fichasClinicas';
import { formatDateOnly } from '../../utils/formatters';
import { savePatient } from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';
import { PatientSearchSelect } from '../quotes/PatientSearchSelect';
import { NewPatientModal } from '../patients/NewPatientModal';
import { FichaFillModal } from '../fichas/FichaFillModal';

interface NovoRelatorioProps {
  aberto: boolean;
  onFechar: () => void;
  pacientes: Patient[];
  /** Todos os atendimentos da clínica — os da paciente escolhida saem daqui. */
  atendimentos: Attendance[];
  catalogo: Procedure[];
  professionals: Professional[];
  clinic: ClinicProfile;
  /**
   * A visita não está na agenda: registrá-la (a Agenda abre o formulário só para o que já
   * aconteceu) e, salva, o relatório abre. Sem `pacienteId`, a Agenda cria o cadastro ao salvar.
   */
  onRegistrarVisita: (paciente: { pacienteId?: string; pacienteNome: string }) => void;
}

/** As visitas que aparecem para escolher — as mais recentes bastam; a agenda tem o resto. */
const MAX_NA_LISTA = 20;

/**
 * Criar um relatório do zero, pelo "Criar": escolher a paciente e o atendimento.
 *
 * O relatório é o registro de um atendimento, e por isso não nasce solto: a lista mostra as
 * visitas dela que já aconteceram e ainda não têm relatório. A que não está na agenda (ou a
 * paciente nova) é registrada na hora, e o relatório abre em seguida — sem duplicar a visita que
 * a recepção já lançou.
 */
export const NovoRelatorio: React.FC<NovoRelatorioProps> = ({
  aberto,
  onFechar,
  pacientes,
  atendimentos,
  catalogo,
  professionals,
  clinic,
  onRegistrarVisita,
}) => {
  const [pacienteId, setPacienteId] = useState<string | undefined>();
  const [pacienteNome, setPacienteNome] = useState('');
  const [cadastroAberto, setCadastroAberto] = useState(false);
  /** Pacientes cadastradas agora, antes de a assinatura trazê-las de volta. */
  const [recemCadastradas, setRecemCadastradas] = useState<Patient[]>([]);
  /** O atendimento escolhido — o relatório dele aberto. Fica depois de o painel fechar. */
  const [preenchendo, setPreenchendo] = useState<AlvoDaFicha | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setPacienteId(undefined);
    setPacienteNome('');
  }, [aberto]);

  const todasAsPacientes = useMemo(
    () => [...pacientes, ...recemCadastradas.filter((r) => !pacientes.some((p) => p.id === r.id))],
    [pacientes, recemCadastradas]
  );

  /** As visitas dela que já aconteceram e ainda não têm relatório, da mais recente para trás. */
  const semRelatorio = useMemo(
    () =>
      pacienteId
        ? atendimentos
            .filter((a) => a.pacienteId === pacienteId && atendimentoAconteceu(a) && !acompanhamentoComRegistro(a))
            .sort((a, b) => `${b.data} ${b.hora || ''}`.localeCompare(`${a.data} ${a.hora || ''}`))
            .slice(0, MAX_NA_LISTA)
        : [],
    [atendimentos, pacienteId]
  );

  const abrirRelatorio = (a: Attendance) => {
    onFechar();
    setPreenchendo(alvoDoAtendimento(a));
  };

  const registrarVisita = () => {
    onFechar();
    onRegistrarVisita({ pacienteId, pacienteNome: pacienteNome.trim() });
  };

  const primeiroNome = pacienteNome.trim().split(/\s+/)[0];

  return (
    <>
      <SidePanel aberto={aberto} onFechar={onFechar} titulo="Novo relatório" sobretitulo="Relatório do atendimento">
        <div className="p-4 sm:p-6 space-y-5">
          <p className="text-body text-muted -mt-1">
            O relatório é o registro de um atendimento que já aconteceu. Escolha a paciente e a
            visita — ou registre a visita agora, se ela não estiver na agenda.
          </p>

          <div>
            <PatientSearchSelect
              patients={todasAsPacientes}
              pacienteId={pacienteId}
              pacienteNome={pacienteNome}
              onSelect={({ id, nome }) => {
                setPacienteId(id);
                setPacienteNome(nome);
              }}
            />
            {!pacienteId && pacienteNome.trim() && (
              <button
                type="button"
                onClick={() => setCadastroAberto(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-body font-semibold text-brand hover:underline"
              >
                <UserPlus className="w-4 h-4" />
                Cadastrar "{pacienteNome.trim()}"
              </button>
            )}
          </div>

          {pacienteId && (
            <section className="space-y-2">
              <h3 className="text-label font-semibold uppercase tracking-wider text-gray-400">
                Atendimentos sem relatório
              </h3>
              {semRelatorio.length === 0 ? (
                <p className="text-body text-muted bg-surface border border-line rounded-xl px-3.5 py-3">
                  {primeiroNome || 'A paciente'} não tem atendimento realizado sem relatório. Registre
                  a visita abaixo e o relatório abre em seguida.
                </p>
              ) : (
                <ul className="space-y-2">
                  {semRelatorio.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => abrirRelatorio(a)}
                        className="w-full flex items-center gap-3 text-left rounded-xl border border-line bg-card px-3.5 py-3 hover:border-brand transition-colors"
                      >
                        <NotebookPen className="w-4 h-4 text-brand shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-body-lg font-semibold text-ink truncate">
                            {a.procedimentoNome || 'Atendimento'}
                          </span>
                          <span className="block text-body text-muted truncate">
                            {formatDateOnly(a.data)}
                            {a.hora ? ` · ${a.hora}` : ''}
                            {a.profissionalNome ? ` · ${a.profissionalNome}` : ''}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {pacienteNome.trim() && (
            <button
              type="button"
              onClick={registrarVisita}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-line bg-card text-body-lg font-semibold text-ink hover:border-brand transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
              {pacienteId ? 'Registrar outra visita' : 'Registrar a visita'}
            </button>
          )}
          {pacienteNome.trim() && !pacienteId && (
            <p className="text-body text-muted -mt-2">
              Sem cadastro, o de {pacienteNome.trim()} é criado ao salvar a visita.
            </p>
          )}
        </div>
      </SidePanel>

      <NewPatientModal
        isOpen={cadastroAberto}
        onClose={() => setCadastroAberto(false)}
        patients={todasAsPacientes}
        nomeInicial={pacienteNome}
        onSalvar={savePatient}
        onSalvo={(novo) => {
          setRecemCadastradas((atual) => [...atual, novo]);
          setPacienteId(novo.id);
          setPacienteNome(novo.nome);
        }}
      />

      {preenchendo && (
        <FichaFillModal
          tipo="acompanhamento"
          isOpen
          onClose={() => setPreenchendo(null)}
          alvo={preenchendo}
          paciente={todasAsPacientes.find((p) => p.id === preenchendo.pacienteId)}
          catalogo={catalogo}
          professionals={professionals}
          clinicProfile={clinic}
        />
      )}
    </>
  );
};
