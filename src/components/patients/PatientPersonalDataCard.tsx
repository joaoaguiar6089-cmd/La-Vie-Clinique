import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, IdCard, Pencil, X } from 'lucide-react';
import { Patient } from '../../types';
import { formatCpf, formatDateOnly } from '../../utils/formatters';
import { PatientFields, PatientFormValues, formToPatient, patientToForm } from './PatientFields';

interface PatientPersonalDataCardProps {
  patient: Patient;
  onSalvar: (patient: Patient) => Promise<void>;
}

/** Rótulo + valor no modo leitura. Campo vazio vira "Não informado", nunca um buraco na grade. */
const Campo: React.FC<{ rotulo: string; valor?: string; className?: string }> = ({
  rotulo,
  valor,
  className = '',
}) => (
  <div className={className}>
    <dt className="text-label font-semibold uppercase tracking-wider text-gray-400">{rotulo}</dt>
    <dd className={`text-sm mt-0.5 ${valor ? 'text-ink' : 'text-gray-300 italic'}`}>
      {valor || 'Não informado'}
    </dd>
  </div>
);

/**
 * Quadro de dados pessoais do paciente. Na maioria dos casos ele já vem preenchido pela anamnese
 * — é lá que o paciente digita nome, CPF, nascimento e contato —, e aqui a equipe corrige o que
 * veio errado ou completa o que faltou, sem precisar abrir uma ficha.
 *
 * O que é gravado é só o documento do paciente: as fichas e orçamentos já emitidos guardam o nome
 * e o contato que valiam no dia da emissão, e isso é proposital — documento já enviado não muda
 * retroativamente porque o cadastro mudou.
 */
export const PatientPersonalDataCard: React.FC<PatientPersonalDataCardProps> = ({
  patient,
  onSalvar,
}) => {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<PatientFormValues>(() => patientToForm(patient));

  // Recarrega o formulário quando o paciente muda (ou quando um sync traz uma versão nova), mas
  // nunca no meio de uma edição — sobrescrever o que a pessoa está digitando é pior do que
  // mostrar por um instante um dado desatualizado.
  useEffect(() => {
    if (editando) return;
    setForm(patientToForm(patient));
    setErro(null);
  }, [patient, editando]);

  const alterar = (patch: Partial<PatientFormValues>) => setForm((atual) => ({ ...atual, ...patch }));

  const cancelar = () => {
    setEditando(false);
    setErro(null);
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('O nome do paciente é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(formToPatient(form, patient));
      setEditando(false);
    } catch (e) {
      setErro(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="glass-card rounded-sm p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand">
          <IdCard className="w-4 h-4" />
          Dados pessoais
        </h2>

        {editando ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cancelar}
              disabled={salvando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white/70 border border-gray-200 text-xs font-medium text-gray-600 hover:text-ink transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-hover transition-colors disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" />
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white/70 border border-gray-200 text-xs font-medium text-gray-600 hover:text-brand hover:border-brand/40 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </button>
        )}
      </div>

      {erro && (
        <div className="mb-4 px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {erro}
        </div>
      )}

      {editando ? (
        <PatientFields values={form} onChange={alterar} idPrefix="paciente-edicao" />
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Campo rotulo="Nome completo" valor={patient.nome} className="sm:col-span-2" />
          <Campo rotulo="Telefone / WhatsApp" valor={patient.contato} />
          <Campo rotulo="E-mail" valor={patient.email} />
          <Campo rotulo="Data de nascimento" valor={formatDateOnly(patient.dataNascimento)} />
          <Campo rotulo="CPF" valor={patient.cpf ? formatCpf(patient.cpf) : ''} />
          <Campo
            rotulo="Gênero"
            valor={
              patient.genero === 'feminino'
                ? 'Feminino'
                : patient.genero === 'masculino'
                ? 'Masculino'
                : ''
            }
          />
          <Campo rotulo="Observações" valor={patient.observacoes} className="sm:col-span-2" />
        </dl>
      )}
    </section>
  );
};
