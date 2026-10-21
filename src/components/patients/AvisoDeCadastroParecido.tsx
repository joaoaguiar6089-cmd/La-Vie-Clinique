import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Patient } from '../../types';
import { CadastroParecido, ROTULO_DO_MOTIVO } from '../../utils/pacientesRepetidos';
import { AvisoTinta } from '../common/Tinta';

interface AvisoDeCadastroParecidoProps {
  /** De `cadastrosParecidos()`. Vazio, o aviso não aparece. */
  parecidos: CadastroParecido[];
  /** "Usar este cadastro", "Abrir o cadastro dela". Sem `onUsar`, o aviso não tem botão. */
  rotuloDaAcao?: string;
  onUsar?: (patient: Patient) => void;
  className?: string;
}

/**
 * "Ela já tem cadastro?" — quando o nome, o telefone ou o CPF digitado bate com o de alguém.
 *
 * Aviso, não impedimento: homônimos existem, e quem está na recepção sabe distinguir. Mas a saída
 * certa fica a um toque, porque o caminho de menor esforço — continuar digitando — era justamente
 * o que criava a segunda Heloíse.
 */
export const AvisoDeCadastroParecido: React.FC<AvisoDeCadastroParecidoProps> = ({
  parecidos,
  rotuloDaAcao,
  onUsar,
  className = '',
}) => {
  if (parecidos.length === 0) return null;
  return (
    <AvisoTinta tom="alerta" icone={AlertCircle} className={className}>
      <p className="font-semibold">
        {parecidos.length === 1 ? 'Ela já pode ter cadastro:' : 'Ela já pode ter cadastro — confira:'}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {parecidos.map(({ patient, motivo }) => (
          <li key={patient.id} className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink truncate">{patient.nome}</span>
              <span className="block text-[13px]">
                {[patient.contato, ROTULO_DO_MOTIVO[motivo]].filter(Boolean).join(' · ')}
              </span>
            </span>
            {onUsar && rotuloDaAcao && (
              <button
                type="button"
                onClick={() => onUsar(patient)}
                className="shrink-0 min-h-[40px] px-3.5 rounded-full bg-ink text-white text-[13px] font-semibold hover:bg-ink/85 transition-colors"
              >
                {rotuloDaAcao}
              </button>
            )}
          </li>
        ))}
      </ul>
    </AvisoTinta>
  );
};
