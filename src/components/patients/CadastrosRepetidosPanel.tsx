import React, { useState } from 'react';
import { AlertCircle, Loader2, Merge } from 'lucide-react';
import { LinhaDePaciente } from '../../utils/patientsPanel';
import { ParRepetido, ROTULO_DO_MOTIVO } from '../../utils/pacientesRepetidos';
import { SidePanel } from '../common/SidePanel';
import { Avatar, AvisoTinta } from '../common/Tinta';

interface CadastrosRepetidosPanelProps {
  aberto: boolean;
  /** De `paresRepetidos()`, já sem os descartados. */
  pares: ParRepetido[];
  onFechar: () => void;
  /** Abre a junção do par — o painel dela abre por cima deste. */
  onJuntar: (par: ParRepetido) => void;
  /** "Não são a mesma pessoa": o par sai daqui e não volta. */
  onDescartar: (par: ParRepetido) => Promise<void>;
}

const UmDoPar: React.FC<{ linha: LinhaDePaciente }> = ({ linha }) => (
  <span className="flex items-center gap-2.5 min-w-0">
    <Avatar nome={linha.nome} tamanho={34} />
    <span className="min-w-0">
      <span className="block text-[15px] font-bold text-ink truncate">{linha.nome}</span>
      <span className="block text-[13px] text-ink-soft truncate">
        {[linha.patient ? null : 'sem cadastro', linha.contato].filter(Boolean).join(' · ') ||
          'Sem telefone'}
      </span>
    </span>
  </span>
);

/**
 * "Possíveis cadastros repetidos" — os pares que o sistema acha que são a mesma pessoa.
 *
 * Existe principalmente pelo link genérico da anamnese: ali é a própria paciente quem se cadastra,
 * sem login e sem ver a lista, então não há como avisar na hora. O CPF que ela digita é o que
 * denuncia a repetição depois, aqui.
 */
export const CadastrosRepetidosPanel: React.FC<CadastrosRepetidosPanelProps> = ({
  aberto,
  pares,
  onFechar,
  onJuntar,
  onDescartar,
}) => {
  const [descartando, setDescartando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const descartar = async (par: ParRepetido) => {
    setDescartando(par.chave);
    setErro(null);
    try {
      await onDescartar(par);
    } catch (e) {
      setErro(`Não foi possível marcar: ${(e as Error).message}`);
    } finally {
      setDescartando(null);
    }
  };

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo="Cadastros repetidos"
      sobretitulo="Pacientes"
      subtitulo="Mesmo CPF, mesmo telefone ou nome parecido. Junte os que são a mesma pessoa."
    >
      <div className="px-5 sm:px-6 py-5 flex flex-col gap-3">
        {erro && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {erro}
          </AvisoTinta>
        )}

        {pares.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-ink-soft">
            Nenhum cadastro repetido por aqui.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pares.map((par) => (
              <li key={par.chave} className="rounded-[18px] bg-card border border-ink/8 px-4 py-3.5">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-warn mb-2">
                  {ROTULO_DO_MOTIVO[par.motivo]}
                </p>
                <div className="flex flex-col gap-2">
                  <UmDoPar linha={par.a} />
                  <UmDoPar linha={par.b} />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => onJuntar(par)}
                    disabled={descartando === par.chave}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full bg-ink text-white text-[14px] font-semibold hover:bg-ink/85 transition-colors disabled:opacity-50"
                  >
                    <Merge className="w-4 h-4" />
                    Juntar
                  </button>
                  <button
                    type="button"
                    onClick={() => descartar(par)}
                    disabled={descartando === par.chave}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-line-soft transition-colors disabled:opacity-50"
                  >
                    {descartando === par.chave && <Loader2 className="w-4 h-4 animate-spin" />}
                    Não são a mesma pessoa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SidePanel>
  );
};
