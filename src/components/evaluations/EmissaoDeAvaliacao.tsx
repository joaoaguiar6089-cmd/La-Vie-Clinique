import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardPen, Printer, UserPlus } from 'lucide-react';
import {
  AnamnesisQuestion,
  ClinicProfile,
  EvaluationRecord,
  EvaluationTemplate,
  Patient,
  Procedure,
  Professional,
} from '../../types';
import { hojeISO } from '../../utils/attendances';
import { fichaDeAvaliacaoPara } from '../../utils/evaluations';
import { AlvoDaFicha, novoIdDeAvaliacao } from '../../utils/fichasClinicas';
import {
  savePatient,
  subscribeToFichasModelo,
  subscribeToPerguntasGeraisDaFicha,
} from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';
import { ProcedureSearchSelect } from '../common/ProcedureSearchSelect';
import { PatientSearchSelect } from '../quotes/PatientSearchSelect';
import { NewPatientModal } from '../patients/NewPatientModal';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { PrintableFichaSheet } from '../fichas/PrintableFichaSheet';

interface EmissaoDeAvaliacaoProps {
  aberto: boolean;
  onFechar: () => void;
  pacientes: Patient[];
  catalogo: Procedure[];
  professionals: Professional[];
  clinic: ClinicProfile;
  /** Profissional logada — já vem escolhida. */
  professionalIdPadrao?: string;
  /** Aberto a partir da página da paciente: ela já vem escolhida. */
  pacienteInicial?: Patient | null;
  /** "Cadastrar ficha para este procedimento", de dentro do preenchimento. */
  onCadastrarFicha?: (alvo: { procedureId?: string; procedimentoNome: string }) => void;
  /** "Pré-preencher orçamento com este consumo", de dentro do preenchimento. */
  onMontarOrcamento?: (avaliacao: EvaluationRecord) => void;
}

const labelClass = 'block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1';

/**
 * Emitir uma ficha de avaliação: escolher a paciente e o procedimento, e então preencher no
 * sistema ou imprimir a folha em branco para a caneta.
 *
 * A avaliação é o passo antes do procedimento, e por isso não nasce de atendimento nenhum — é a
 * profissional quem decide quando precisa dela. Imprimir em branco não grava nada, como sempre
 * foi: a folha já sai com o nome, o procedimento e a data, e o documento que vale é o de papel.
 *
 * Paciente **com cadastro**: o gênero dela escolhe o mapa anatômico, e a avaliação precisa
 * aparecer na página dela. Um nome solto ganha o atalho para cadastrar ali mesmo.
 */
export const EmissaoDeAvaliacao: React.FC<EmissaoDeAvaliacaoProps> = ({
  aberto,
  onFechar,
  pacientes,
  catalogo,
  professionals,
  clinic,
  professionalIdPadrao,
  pacienteInicial,
  onCadastrarFicha,
  onMontarOrcamento,
}) => {
  const [pacienteId, setPacienteId] = useState<string | undefined>();
  const [pacienteNome, setPacienteNome] = useState('');
  const [procedimento, setProcedimento] = useState<{ procedureId?: string; procedimentoNome: string }>({
    procedimentoNome: '',
  });
  const [data, setData] = useState(hojeISO());
  const [professionalId, setProfessionalId] = useState('');
  const [erros, setErros] = useState<{ paciente?: string; procedimento?: string }>({});
  const [cadastroAberto, setCadastroAberto] = useState(false);
  /** Pacientes cadastradas agora, antes de a assinatura trazê-las de volta. */
  const [recemCadastradas, setRecemCadastradas] = useState<Patient[]>([]);

  const [preenchendo, setPreenchendo] = useState<AlvoDaFicha | null>(null);
  const [imprimindo, setImprimindo] = useState<AlvoDaFicha | null>(null);
  const [fichas, setFichas] = useState<EvaluationTemplate[]>([]);
  const [gerais, setGerais] = useState<AnamnesisQuestion[]>([]);

  // Cada abertura começa limpa, com a paciente da página (quando há) e a profissional logada.
  useEffect(() => {
    if (!aberto) return;
    // A página de quem ainda não tem cadastro passa um id provisório, que não está na lista:
    // entra só o nome, e o painel oferece cadastrar.
    const cadastrada = !!pacienteInicial && pacientes.some((p) => p.id === pacienteInicial.id);
    setPacienteId(cadastrada ? pacienteInicial?.id : undefined);
    setPacienteNome(pacienteInicial?.nome || '');
    setProcedimento({ procedimentoNome: '' });
    setData(hojeISO());
    setProfessionalId(professionalIdPadrao || '');
    setErros({});
  }, [aberto, pacienteInicial?.id, professionalIdPadrao]);

  // A folha em branco precisa da ficha-modelo e das perguntas gerais.
  useEffect(() => {
    if (!aberto && !imprimindo) return;
    const pararFichas = subscribeToFichasModelo('avaliacao', setFichas);
    const pararGerais = subscribeToPerguntasGeraisDaFicha('avaliacao', setGerais);
    return () => {
      pararFichas();
      pararGerais();
    };
  }, [aberto, imprimindo]);

  const todasAsPacientes = useMemo(
    () => [...pacientes, ...recemCadastradas.filter((r) => !pacientes.some((p) => p.id === r.id))],
    [pacientes, recemCadastradas]
  );

  const paciente = pacienteId ? todasAsPacientes.find((p) => p.id === pacienteId) : undefined;

  const montarAlvo = (): AlvoDaFicha | null => {
    const novosErros: typeof erros = {};
    if (!paciente) {
      novosErros.paciente = pacienteNome.trim()
        ? 'Paciente sem cadastro — cadastre para emitir a avaliação.'
        : 'Escolha a paciente.';
    }
    if (!procedimento.procedimentoNome.trim()) novosErros.procedimento = 'Informe o procedimento.';
    setErros(novosErros);
    if (!paciente || novosErros.procedimento) return null;

    const profissional = professionals.find((p) => p.id === professionalId);
    return {
      registroId: novoIdDeAvaliacao(),
      novo: true,
      pacienteId: paciente.id,
      pacienteNome: paciente.nome,
      procedureId: procedimento.procedureId,
      procedimentoNome: procedimento.procedimentoNome.trim(),
      data: data || hojeISO(),
      professionalId: profissional?.id,
      profissionalNome: profissional?.name,
    };
  };

  const preencher = () => {
    const alvo = montarAlvo();
    if (!alvo) return;
    onFechar();
    setPreenchendo(alvo);
  };

  const imprimir = () => {
    const alvo = montarAlvo();
    if (!alvo) return;
    onFechar();
    setImprimindo(alvo);
  };

  const rodape = (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
      <button
        type="button"
        onClick={imprimir}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-line bg-card text-body-lg font-semibold text-ink hover:border-brand transition-colors"
      >
        <Printer className="w-4 h-4" />
        Imprimir em branco
      </button>
      <button
        type="button"
        onClick={preencher}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-ink text-white text-body-lg font-semibold transition-colors"
      >
        <ClipboardPen className="w-4 h-4" />
        Preencher agora
      </button>
    </div>
  );

  return (
    <>
      <SidePanel
        aberto={aberto}
        onFechar={onFechar}
        titulo="Nova avaliação"
        sobretitulo="Ficha de avaliação"
        rodape={rodape}
      >
        <div className="p-4 sm:p-6 space-y-5">
          <p className="text-body text-muted -mt-1">
            A avaliação é o passo antes do procedimento. Preencha aqui no sistema ou imprima a
            folha em branco, que já sai com a paciente, o procedimento e a data.
          </p>

          <div>
            <PatientSearchSelect
              patients={todasAsPacientes}
              pacienteId={pacienteId}
              pacienteNome={pacienteNome}
              onSelect={({ id, nome }) => {
                setPacienteId(id);
                setPacienteNome(nome);
                setErros((e) => ({ ...e, paciente: undefined }));
              }}
            />
            {erros.paciente && <p className="mt-1 text-body text-red-600">{erros.paciente}</p>}
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

          <ProcedureSearchSelect
            procedures={catalogo}
            procedureId={procedimento.procedureId}
            nome={procedimento.procedimentoNome}
            onSelect={(escolha) => {
              setProcedimento(escolha);
              setErros((e) => ({ ...e, procedimento: undefined }));
            }}
            erro={erros.procedimento}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="avaliacao-data">
                Data da avaliação
              </label>
              <input
                id="avaliacao-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full glass-input px-3 py-2 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="avaliacao-profissional">
                Profissional
              </label>
              <select
                id="avaliacao-profissional"
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className="w-full glass-input px-3 py-2 rounded-sm text-sm text-ink focus:outline-hidden"
              >
                <option value="">Sem profissional definida</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
          setErros((e) => ({ ...e, paciente: undefined }));
        }}
      />

      {preenchendo && (
        <FichaFillModal
          tipo="avaliacao"
          isOpen
          onClose={() => setPreenchendo(null)}
          alvo={preenchendo}
          paciente={todasAsPacientes.find((p) => p.id === preenchendo.pacienteId)}
          catalogo={catalogo}
          professionals={professionals}
          clinicProfile={clinic}
          onMontarOrcamento={onMontarOrcamento}
          onCadastrarFicha={
            onCadastrarFicha
              ? (alvo) => {
                  setPreenchendo(null);
                  onCadastrarFicha(alvo);
                }
              : undefined
          }
        />
      )}

      {imprimindo && (
        <PrintableFichaSheet
          tipo="avaliacao"
          ficha={fichaDeAvaliacaoPara(imprimindo, fichas, catalogo)}
          gerais={gerais}
          cabecalho={{
            pacienteNome: imprimindo.pacienteNome,
            procedimentoNome: imprimindo.procedimentoNome,
            data: imprimindo.data,
            profissionalNome: imprimindo.profissionalNome,
          }}
          clinicProfile={clinic}
          onClose={() => setImprimindo(null)}
        />
      )}
    </>
  );
};
