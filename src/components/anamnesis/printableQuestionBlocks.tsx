import React from 'react';
import { AnamnesisQuestion } from '../../types';

/**
 * Os tijolos de uma folha em branco: rótulo, linha pontilhada, caixa de marcar, escala.
 *
 * Moram aqui, e não dentro de `BlankAnamnesisSheet`, porque a ficha de avaliação também imprime
 * em branco — e as duas folhas precisam sair **iguais**. Quem está com o papel na mão reconhece o
 * formato da versão digital pelas mesmas opções, na mesma ordem, com espaço para caneta no lugar
 * do controle; duas cópias destes componentes viveriam divergindo em detalhe até que as duas
 * folhas deixassem de parecer da mesma clínica.
 */

/** Linhas pontilhadas para escrever à caneta. */
export const RuledLines: React.FC<{ count?: number }> = ({ count = 1 }) => (
  <div className="pt-1.5 space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="border-b border-dotted border-gray-400" />
    ))}
  </div>
);

/** Caixa de marcar — redonda para escolha única, quadrada para múltipla escolha. */
export const TickBox: React.FC<{ round?: boolean }> = ({ round }) => (
  <span
    className={`inline-block w-3.5 h-3.5 border border-gray-500 bg-white shrink-0 ${
      round ? 'rounded-full' : 'rounded-[2px]'
    }`}
  />
);

/** Campo de identificação: rótulo pequeno acima de uma linha para preencher. */
export const IdentField: React.FC<{ label: string; className?: string }> = ({ label, className = '' }) => (
  <div className={className}>
    <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">{label}</span>
    <div className="border-b border-dotted border-gray-400 h-6" />
  </div>
);

/**
 * Área de resposta vazia correspondente ao tipo do campo. O objetivo é que quem estiver com a
 * folha na mão reconheça o mesmo formato da versão digital — as mesmas opções, na mesma ordem —
 * só que com espaço para caneta no lugar do controle.
 */
export const BlankAnswer: React.FC<{ question: AnamnesisQuestion }> = ({ question }) => {
  const { tipo_campo, opcoes = [], escalaMax = 10 } = question;

  switch (tipo_campo) {
    case 'texto_longo':
      return <RuledLines count={3} />;

    case 'numero':
      return (
        <div className="pt-2">
          <span className="inline-block w-24 border-b border-dotted border-gray-400 h-5" />
        </div>
      );

    case 'data':
      return (
        <div className="pt-2 flex items-end gap-1.5 text-[10px] text-gray-400 font-mono">
          <span className="inline-block w-9 border-b border-dotted border-gray-400 h-5" /> /
          <span className="inline-block w-9 border-b border-dotted border-gray-400 h-5" /> /
          <span className="inline-block w-14 border-b border-dotted border-gray-400 h-5" />
          <span className="pb-0.5">DD / MM / AAAA</span>
        </div>
      );

    case 'sim_nao':
      return (
        <div className="pt-2 flex items-center gap-6 text-[11px] text-gray-700">
          {['Sim', 'Não'].map((opt) => (
            <span key={opt} className="flex items-center gap-1.5">
              <TickBox round />
              {opt}
            </span>
          ))}
        </div>
      );

    case 'unica_escolha':
    case 'multipla_escolha':
      return (
        <div className="pt-2">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-gray-700">
            {opcoes.map((opcao, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                <TickBox round={tipo_campo === 'unica_escolha'} />
                {opcao}
              </span>
            ))}
          </div>
          {tipo_campo === 'multipla_escolha' && (
            <p className="text-[9px] text-gray-400 italic mt-1.5">Pode marcar mais de uma</p>
          )}
        </div>
      );

    case 'escala':
      return (
        <div className="pt-2 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: escalaMax || 10 }, (_, i) => i + 1).map((num) => (
            <span
              key={num}
              className="w-6 h-6 border border-gray-400 rounded-[3px] flex items-center justify-center text-[10px] text-gray-600 font-mono bg-white"
            >
              {num}
            </span>
          ))}
        </div>
      );

    // 'texto_curto' e qualquer tipo novo que ainda não tenha desenho próprio: uma linha para escrever.
    default:
      return <RuledLines count={1} />;
  }
};

export const QuestionBlock: React.FC<{ question: AnamnesisQuestion; index: number }> = ({ question, index }) => (
  <div className="py-2.5 border-b border-gray-100 last:border-0 page-break-inside-avoid">
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-bold text-[#A67C52] shrink-0">{index}.</span>
      <span className="text-[11px] font-semibold text-[#1A1A1A] leading-snug">
        {question.texto}
        {question.obrigatoria && <span className="text-[#A67C52] ml-1">*</span>}
      </span>
    </div>
    {question.ajuda && <p className="text-[10px] text-gray-400 italic mt-0.5 ml-4">{question.ajuda}</p>}
    <div className="ml-4">
      <BlankAnswer question={question} />
    </div>
  </div>
);

export const SectionHeading: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="mb-2">
    <div className="flex items-center gap-2 border-b border-[#A67C52]/40 pb-1.5">
      <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
      <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">{title}</h4>
    </div>
    {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
  </div>
);

