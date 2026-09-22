import React from 'react';
import { ConsentTermSection } from '../../types';
import { ScrollText } from 'lucide-react';

export const CONSENT_TERM_HEADING = 'Termo de Consentimento e Responsabilidade';

interface ConsentTermViewProps {
  sections: ConsentTermSection[];
  /** 'paciente' = cartão do formulário online. 'documento' = ficha impressa / PDF. */
  variant?: 'paciente' | 'documento';
  className?: string;
}

/**
 * Exibição do Termo de Consentimento e Responsabilidade configurado na ficha-modelo.
 *
 * O texto de cada bloco é escrito livremente pela clínica, inclusive como lista de itens em várias
 * linhas — por isso `whitespace-pre-line`: as quebras que a equipe digitou no editor são as mesmas
 * que o paciente lê na tela e as mesmas que saem no papel.
 */
export const ConsentTermView: React.FC<ConsentTermViewProps> = ({
  sections,
  variant = 'paciente',
  className = '',
}) => {
  if (sections.length === 0) return null;

  if (variant === 'documento') {
    return (
      <div className={`page-break-inside-avoid ${className}`}>
        <div className="flex items-center gap-2 border-b border-brand/40 pb-1.5 mb-3">
          <span className="w-2 h-2 rounded-full bg-brand" />
          <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-ink">
            {CONSENT_TERM_HEADING}
          </h4>
        </div>

        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.id} className="page-break-inside-avoid">
              {s.titulo && (
                <h5 className="font-serif-luxury text-[13px] font-bold text-ink leading-tight">
                  {s.titulo}
                </h5>
              )}
              {s.texto && (
                <p className="text-[10.5px] text-gray-700 leading-relaxed whitespace-pre-line mt-0.5">
                  {s.texto}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-[0_3px_14px_rgba(0,0,0,.04)] ${className}`}>
      <div className="flex items-start gap-2.5 mb-4">
        <span className="shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center">
          <ScrollText className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink leading-tight">{CONSENT_TERM_HEADING}</p>
          <p className="text-[13px] text-muted mt-0.5">
            Leia com atenção antes de concluir a ficha.
          </p>
        </div>
      </div>

      <div className="space-y-4 divide-y divide-[rgba(26,26,26,.07)]">
        {sections.map((s) => (
          <div key={s.id} className="pt-4 first:pt-0">
            {s.titulo && (
              <h4 className="font-serif-luxury text-[17px] font-semibold text-brand leading-tight">
                {s.titulo}
              </h4>
            )}
            {s.texto && (
              <p className="text-[14px] text-ink-soft leading-relaxed whitespace-pre-line mt-1.5">
                {s.texto}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
