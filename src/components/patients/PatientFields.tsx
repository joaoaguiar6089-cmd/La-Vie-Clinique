import React from 'react';
import { Patient, PatientGender } from '../../types';
import { formatCpf } from '../../utils/formatters';

/**
 * Os campos do cadastro de paciente, em um só lugar. São exatamente os mesmos no cadastro de um
 * paciente novo e na edição dos dados de quem já existe — manter dois formulários iguais era
 * garantir que um dia eles deixariam de ser iguais.
 */
export interface PatientFormValues {
  nome: string;
  contato: string;
  dataNascimento: string;
  genero: PatientGender | '';
  cpf: string;
  email: string;
  observacoes: string;
}

export const VALORES_VAZIOS: PatientFormValues = {
  nome: '',
  contato: '',
  dataNascimento: '',
  genero: '',
  cpf: '',
  email: '',
  observacoes: '',
};

/** Do documento gravado para o formulário. */
export const patientToForm = (patient?: Patient | null): PatientFormValues =>
  patient
    ? {
        nome: patient.nome,
        contato: patient.contato || '',
        dataNascimento: patient.dataNascimento || '',
        genero: patient.genero || '',
        cpf: formatCpf(patient.cpf || ''),
        email: patient.email || '',
        observacoes: patient.observacoes || '',
      }
    : { ...VALORES_VAZIOS };

/**
 * Do formulário para o documento. Com `base`, atualiza o paciente existente preservando id e
 * `createdAt`; sem ela, monta um cadastro novo. Campos em branco viram `undefined` — é o que
 * `cleanForFirestore` remove do documento, em vez de gravar strings vazias.
 */
export const formToPatient = (form: PatientFormValues, base?: Patient | null): Patient => ({
  ...(base || {}),
  id: base?.id || `pat-${Date.now()}`,
  nome: form.nome.trim(),
  contato: form.contato.trim() || undefined,
  dataNascimento: form.dataNascimento || undefined,
  genero: form.genero || undefined,
  cpf: form.cpf.replace(/\D/g, '') || undefined,
  email: form.email.trim() || undefined,
  observacoes: form.observacoes.trim() || undefined,
  createdAt: base?.createdAt || new Date().toISOString(),
});

const inputClass =
  'w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden';
const labelClass = 'block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1';

interface PatientFieldsProps {
  values: PatientFormValues;
  onChange: (patch: Partial<PatientFormValues>) => void;
  /**
   * Prefixo dos `id` dos campos. O quadro de dados e o modal de cadastro podem estar montados ao
   * mesmo tempo, e dois `<label for>` apontando para o mesmo id fariam o clique no rótulo focar o
   * campo errado.
   */
  idPrefix: string;
  autoFocus?: boolean;
}

export const PatientFields: React.FC<PatientFieldsProps> = ({
  values,
  onChange,
  idPrefix,
  autoFocus,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div className="sm:col-span-2">
      <label className={labelClass} htmlFor={`${idPrefix}-nome`}>
        Nome completo *
      </label>
      <input
        id={`${idPrefix}-nome`}
        type="text"
        autoFocus={autoFocus}
        value={values.nome}
        onChange={(e) => onChange({ nome: e.target.value })}
        className={inputClass}
      />
    </div>

    <div>
      <label className={labelClass} htmlFor={`${idPrefix}-contato`}>
        Telefone / WhatsApp
      </label>
      <input
        id={`${idPrefix}-contato`}
        type="tel"
        inputMode="tel"
        value={values.contato}
        onChange={(e) => onChange({ contato: e.target.value })}
        placeholder="(11) 98888-7777"
        className={inputClass}
      />
    </div>

    <div>
      <label className={labelClass} htmlFor={`${idPrefix}-email`}>
        E-mail
      </label>
      <input
        id={`${idPrefix}-email`}
        type="email"
        value={values.email}
        onChange={(e) => onChange({ email: e.target.value })}
        className={inputClass}
      />
    </div>

    <div>
      <label className={labelClass} htmlFor={`${idPrefix}-nascimento`}>
        Data de nascimento
      </label>
      <input
        id={`${idPrefix}-nascimento`}
        type="date"
        value={values.dataNascimento}
        onChange={(e) => onChange({ dataNascimento: e.target.value })}
        className={inputClass}
      />
    </div>

    <div>
      <label className={labelClass} htmlFor={`${idPrefix}-cpf`}>
        CPF
      </label>
      <input
        id={`${idPrefix}-cpf`}
        type="text"
        inputMode="numeric"
        value={values.cpf}
        onChange={(e) => onChange({ cpf: formatCpf(e.target.value) })}
        placeholder="000.000.000-00"
        className={inputClass}
      />
    </div>

    <div className="sm:col-span-2">
      <span className={labelClass}>
        Gênero <span className="normal-case">(define a foto de referência das fichas)</span>
      </span>
      <div className="flex items-center gap-2">
        {(['feminino', 'masculino'] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => onChange({ genero: values.genero === opcao ? '' : opcao })}
            className={`px-4 py-2 rounded-sm text-xs font-medium border transition-colors ${
              values.genero === opcao
                ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                : 'bg-white/70 text-gray-600 border-gray-200 hover:border-[#A67C52]/40'
            }`}
          >
            {opcao === 'feminino' ? 'Feminino' : 'Masculino'}
          </button>
        ))}
      </div>
    </div>

    <div className="sm:col-span-2">
      <label className={labelClass} htmlFor={`${idPrefix}-observacoes`}>
        Observações
      </label>
      <textarea
        id={`${idPrefix}-observacoes`}
        value={values.observacoes}
        onChange={(e) => onChange({ observacoes: e.target.value })}
        rows={3}
        placeholder="Anotações da equipe sobre este paciente"
        className={`${inputClass} resize-y`}
      />
    </div>
  </div>
);
