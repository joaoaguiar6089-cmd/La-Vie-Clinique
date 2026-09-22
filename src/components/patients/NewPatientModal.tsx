import React, { useEffect, useState } from 'react';
import { AlertCircle, UserPlus, X } from 'lucide-react';
import { Patient } from '../../types';
import { PatientFields, PatientFormValues, VALORES_VAZIOS, formToPatient } from './PatientFields';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Cadastro já existente, usado só para avisar sobre nome repetido — nada é bloqueado. */
  patients: Patient[];
  /** Nome já digitado em outro lugar (a busca da lista, por exemplo) — entra preenchido. */
  nomeInicial?: string;
  onSalvar: (patient: Patient) => Promise<void>;
  /** Chamado com o paciente gravado, para quem abriu decidir o que fazer em seguida. */
  onSalvo?: (patient: Patient) => void;
}

/** Normaliza para comparar nomes digitados com os do cadastro (acento e caixa não contam). */
const chaveDoNome = (nome: string): string =>
  nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Cadastro de um paciente novo direto na seção, sem passar por uma anamnese.
 *
 * Só o nome é obrigatório: quem cadastra na recepção muitas vezes tem apenas o nome e o telefone
 * na mão, e o resto chega depois — pela própria anamnese ou pelo quadro de dados pessoais.
 */
export const NewPatientModal: React.FC<NewPatientModalProps> = ({
  isOpen,
  onClose,
  patients,
  nomeInicial,
  onSalvar,
  onSalvo,
}) => {
  const [form, setForm] = useState<PatientFormValues>({ ...VALORES_VAZIOS });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Cada abertura começa em branco — reaproveitar o que sobrou da última seria cadastrar
  // um paciente com os dados de outro.
  useEffect(() => {
    if (!isOpen) return;
    setForm({ ...VALORES_VAZIOS, nome: nomeInicial || '' });
    setErro(null);
    setSalvando(false);
  }, [isOpen, nomeInicial]);

  if (!isOpen) return null;

  const alterar = (patch: Partial<PatientFormValues>) => setForm((atual) => ({ ...atual, ...patch }));

  const homonimo = form.nome.trim()
    ? patients.find((p) => chaveDoNome(p.nome) === chaveDoNome(form.nome))
    : undefined;

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('O nome do paciente é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const novo = formToPatient(form);
      await onSalvar(novo);
      onSalvo?.(novo);
      onClose();
    } catch (e) {
      setErro(`Não foi possível cadastrar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="novo-paciente-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget && !salvando) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-sm shadow-2xl border border-white/60">
        <div className="bg-ink px-6 py-4 flex items-start justify-between gap-3 sticky top-0 z-10">
          <div>
            <p className="text-label font-semibold uppercase tracking-widest text-brand">
              Cadastro
            </p>
            <h2 id="novo-paciente-titulo" className="text-lg text-white font-serif-luxury">
              Novo paciente
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
          {erro && (
            <div className="px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {erro}
            </div>
          )}

          {/* Aviso, não impedimento: homônimos existem, e quem está na recepção sabe distinguir. */}
          {homonimo && (
            <div className="px-3 py-2 rounded-sm bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                Já existe um cadastro com esse nome
                {homonimo.contato ? ` (${homonimo.contato})` : ''}. Confira se não é a mesma pessoa
                antes de continuar.
              </span>
            </div>
          )}

          <PatientFields values={form} onChange={alterar} idPrefix="paciente-novo" autoFocus />
        </div>

        <div className="px-6 py-4 bg-white/50 border-t border-white/70 flex items-center justify-end gap-3">
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
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-widest hover:bg-brand-hover transition-colors disabled:opacity-60"
          >
            <UserPlus className="w-4 h-4" />
            {salvando ? 'Cadastrando...' : 'Cadastrar paciente'}
          </button>
        </div>
      </div>
    </div>
  );
};
