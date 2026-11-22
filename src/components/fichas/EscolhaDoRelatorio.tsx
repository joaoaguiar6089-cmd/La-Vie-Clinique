import React from 'react';
import { CheckCircle2, NotebookPen } from 'lucide-react';
import { Attendance } from '../../types';
import { acompanhamentoComRegistro } from '../../utils/fichasClinicas';
import { nomeDosProcedimentos } from '../../utils/attendances';
import { JanelaDeEscolha } from '../common/JanelaDeEscolha';

interface EscolhaDoRelatorioProps {
  /** Os atendimentos da visita — um relatório por procedimento. */
  visita: Attendance[];
  /** A lista ao vivo, para o relatório preenchido acender em verde ao voltar para cá. */
  atendimentosAoVivo: Attendance[];
  onAbrir: (a: Attendance) => void;
  onFechar: () => void;
}

/**
 * Depois do Compareceu de uma visita com mais de um procedimento: "Preencher os relatórios?", com
 * um botão por procedimento — cada um tem o seu relatório. Preenchido um, a janela volta com ele
 * marcado, até alguém tocar em "Depois".
 */
export const EscolhaDoRelatorio: React.FC<EscolhaDoRelatorioProps> = ({
  visita,
  atendimentosAoVivo,
  onAbrir,
  onFechar,
}) => (
  <JanelaDeEscolha
    titulo="Preencher os relatórios?"
    descricao={`${visita[0]?.pacienteNome || ''} — um relatório para cada procedimento. Dá para completar depois pelo atendimento.`}
    onFechar={onFechar}
    rodape={
      <button
        type="button"
        onClick={onFechar}
        className="w-full min-h-[44px] rounded-xl border border-line bg-card text-body font-semibold text-ink hover:border-brand transition-colors"
      >
        Depois
      </button>
    }
  >
    <ul className="flex flex-col gap-2 p-1">
      {visita.map((a) => {
        const aoVivo = atendimentosAoVivo.find((x) => x.id === a.id) || a;
        const feito = acompanhamentoComRegistro(aoVivo);
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onAbrir({ ...a, ...aoVivo })}
              className={`w-full flex items-center gap-3 text-left rounded-xl border px-3.5 py-3 transition-colors ${
                feito ? 'border-ok-line bg-ok-bg' : 'border-line bg-card hover:border-brand'
              }`}
            >
              {feito ? (
                <CheckCircle2 className="w-4 h-4 text-ok shrink-0" />
              ) : (
                <NotebookPen className="w-4 h-4 text-brand shrink-0" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-body-lg font-semibold text-ink truncate">
                  Relatório · {nomeDosProcedimentos(aoVivo)}
                </span>
                <span className="block text-body text-muted">
                  {a.hora ? `${a.hora} · ` : ''}
                  {feito ? 'preenchido' : 'por preencher'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </JanelaDeEscolha>
);
