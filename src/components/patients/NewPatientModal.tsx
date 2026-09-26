import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Patient } from '../../types';
import { PatientFields, PatientFormValues, VALORES_VAZIOS, formToPatient } from './PatientFields';
import { SidePanel } from '../common/SidePanel';
import { AvisoTinta, BotaoPrincipal } from '../common/Tinta';

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
 *
 * No redesign ele deixou de ser uma caixa no meio da tela e passou a ser um formulário de tela
 * cheia (painel lateral no desktop), como os outros quatro de criação.
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
  const [erroNome, setErroNome] = useState<string | undefined>(undefined);

  // Cada abertura começa em branco — reaproveitar o que sobrou da última seria cadastrar
  // um paciente com os dados de outro.
  useEffect(() => {
    if (!isOpen) return;
    setForm({ ...VALORES_VAZIOS, nome: nomeInicial || '' });
    setErro(null);
    setErroNome(undefined);
    setSalvando(false);
  }, [isOpen, nomeInicial]);

  const alterar = (patch: Partial<PatientFormValues>) => {
    setForm((atual) => ({ ...atual, ...patch }));
    if (patch.nome !== undefined) setErroNome(undefined);
  };

  const homonimo = form.nome.trim()
    ? patients.find((p) => chaveDoNome(p.nome) === chaveDoNome(form.nome))
    : undefined;

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErroNome('O nome da paciente é obrigatório.');
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
    <SidePanel
      aberto={isOpen}
      onFechar={onClose}
      titulo="Nova paciente"
      sobretitulo="Pacientes"
      subtitulo="Só o nome é obrigatório. O resto ela completa ao preencher a primeira anamnese."
      bloqueado={salvando}
      rodape={
        <BotaoPrincipal onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
          {salvando ? 'Cadastrando…' : 'Cadastrar paciente'}
        </BotaoPrincipal>
      }
    >
      <form
        className="px-5 sm:px-6 py-5 flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {erro && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {erro}
          </AvisoTinta>
        )}

        {/* Aviso, não impedimento: homônimos existem, e quem está na recepção sabe distinguir. */}
        {homonimo && (
          <AvisoTinta tom="alerta" icone={AlertCircle}>
            Já existe um cadastro com esse nome
            {homonimo.contato ? ` (${homonimo.contato})` : ''}. Confira se não é a mesma pessoa antes
            de continuar.
          </AvisoTinta>
        )}

        <PatientFields
          values={form}
          onChange={alterar}
          idPrefix="paciente-novo"
          autoFocus
          erroNome={erroNome}
        />

        {/* Enter no teclado do celular envia o formulário, como o botão de baixo. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </SidePanel>
  );
};
