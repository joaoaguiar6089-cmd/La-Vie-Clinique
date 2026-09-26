import React from 'react';
import { Patient, PatientGender } from '../../types';
import { formatCpf } from '../../utils/formatters';
import { CampoTinta, INPUT_TINTA, PilulasDeEscolha, RotuloTinta } from '../common/Tinta';

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
  /** Erro do nome — o único campo obrigatório. */
  erroNome?: string;
}

/**
 * Os campos no desenho preenchido do redesign: rótulo dentro da caixa, sem contorno, 16px. Na
 * ordem em que a recepção costuma receber os dados — o nome e o WhatsApp primeiro, o resto
 * quando houver.
 */
export const PatientFields: React.FC<PatientFieldsProps> = ({
  values,
  onChange,
  idPrefix,
  autoFocus,
  erroNome,
}) => (
  <div className="flex flex-col gap-3.5">
    <CampoTinta rotulo="Nome completo" htmlFor={`${idPrefix}-nome`} erro={erroNome}>
      <input
        id={`${idPrefix}-nome`}
        type="text"
        autoFocus={autoFocus}
        autoComplete="off"
        value={values.nome}
        onChange={(e) => onChange({ nome: e.target.value })}
        placeholder="Nome e sobrenome"
        className={INPUT_TINTA}
      />
    </CampoTinta>

    <CampoTinta rotulo="WhatsApp" htmlFor={`${idPrefix}-contato`}>
      <input
        id={`${idPrefix}-contato`}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={values.contato}
        onChange={(e) => onChange({ contato: e.target.value })}
        placeholder="(19) 90000-0000"
        className={INPUT_TINTA}
      />
    </CampoTinta>

    <div className="grid grid-cols-2 gap-2.5">
      <CampoTinta rotulo="Nascimento" htmlFor={`${idPrefix}-nascimento`}>
        <input
          id={`${idPrefix}-nascimento`}
          type="date"
          value={values.dataNascimento}
          onChange={(e) => onChange({ dataNascimento: e.target.value })}
          className={`${INPUT_TINTA} min-h-[24px]`}
        />
      </CampoTinta>
      <CampoTinta rotulo="CPF" htmlFor={`${idPrefix}-cpf`}>
        <input
          id={`${idPrefix}-cpf`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={values.cpf}
          onChange={(e) => onChange({ cpf: formatCpf(e.target.value) })}
          placeholder="000.000.000-00"
          className={`${INPUT_TINTA} tabular-nums`}
        />
      </CampoTinta>
    </div>

    <div>
      <RotuloTinta>Gênero · define o mapa anatômico das fichas</RotuloTinta>
      <PilulasDeEscolha
        rotulo="Gênero"
        opcoes={[
          { id: 'feminino', rotulo: 'Feminino' },
          { id: 'masculino', rotulo: 'Masculino' },
        ]}
        valor={values.genero}
        onMudar={(genero) => onChange({ genero: genero as PatientFormValues['genero'] })}
        permiteDesmarcar
      />
    </div>

    <CampoTinta rotulo="E-mail" htmlFor={`${idPrefix}-email`}>
      <input
        id={`${idPrefix}-email`}
        type="email"
        autoComplete="off"
        value={values.email}
        onChange={(e) => onChange({ email: e.target.value })}
        placeholder="nome@email.com"
        className={INPUT_TINTA}
      />
    </CampoTinta>

    <CampoTinta rotulo="Observações" htmlFor={`${idPrefix}-observacoes`}>
      <textarea
        id={`${idPrefix}-observacoes`}
        value={values.observacoes}
        onChange={(e) => onChange({ observacoes: e.target.value })}
        rows={2}
        placeholder="Alergias, indicação, preferências de horário"
        className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
      />
    </CampoTinta>
  </div>
);
