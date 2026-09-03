import React from 'react';
import { AnamnesisQuestion } from '../../types';
import { Check, Calendar } from 'lucide-react';

interface QuestionFieldRendererProps {
  question: AnamnesisQuestion;
  value: any;
  onChange?: (value: any) => void;
  readOnly?: boolean;
  error?: string;
  hideMandatoryAsterisk?: boolean;
}

export const QuestionFieldRenderer: React.FC<QuestionFieldRendererProps> = ({
  question,
  value,
  onChange,
  readOnly = false,
  error,
  hideMandatoryAsterisk = false,
}) => {
  const { id, texto, tipo_campo, opcoes = [], escalaMax = 10, obrigatoria, ajuda } = question;

  // READ-ONLY DISPLAY
  if (readOnly) {
    let displayVal = 'Não informado';
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        displayVal = value.length > 0 ? value.join(', ') : 'Nenhuma opção selecionada';
      } else if (typeof value === 'boolean') {
        displayVal = value ? 'Sim' : 'Não';
      } else if (tipo_campo === 'escala') {
        displayVal = `${value} / ${escalaMax}`;
      } else {
        displayVal = String(value);
      }
    }

    return (
      <div className="py-2 border-b border-gray-100 last:border-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-gray-700">{texto}</span>
          {!hideMandatoryAsterisk && obrigatoria && <span className="text-[10px] text-[#A67C52] font-semibold">*</span>}
        </div>
        <div className="mt-1 text-xs text-[#1A1A1A] font-semibold bg-gray-50/80 px-3 py-1.5 rounded-xs border border-gray-200/60">
          {displayVal}
        </div>
      </div>
    );
  }

  // INTERACTIVE INPUTS
  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`input-${id}`} className="block text-xs font-semibold text-gray-800">
          {texto}
          {!hideMandatoryAsterisk && obrigatoria && <span className="text-red-500 ml-1 font-bold">*</span>}
        </label>
        {tipo_campo === 'escala' && (
          <span className="text-[11px] text-gray-400 font-mono">1 a {escalaMax}</span>
        )}
      </div>

      {ajuda && <p className="text-[11px] text-gray-400 leading-snug">{ajuda}</p>}

      {/* 1. TEXTO CURTO */}
      {tipo_campo === 'texto_curto' && (
        <input
          id={`input-${id}`}
          type="text"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Digite sua resposta..."
          className={`w-full px-3 py-2 text-xs rounded-sm bg-white/90 border transition-all ${
            error ? 'border-red-400 focus:ring-1 focus:ring-red-400' : 'border-gray-200 focus:border-[#A67C52] focus:ring-1 focus:ring-[#A67C52]'
          } text-[#1A1A1A] focus:outline-hidden`}
        />
      )}

      {/* 2. TEXTO LONGO */}
      {tipo_campo === 'texto_longo' && (
        <textarea
          id={`input-${id}`}
          rows={3}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Descreva detalhadamente..."
          className={`w-full px-3 py-2 text-xs rounded-sm bg-white/90 border transition-all ${
            error ? 'border-red-400 focus:ring-1 focus:ring-red-400' : 'border-gray-200 focus:border-[#A67C52] focus:ring-1 focus:ring-[#A67C52]'
          } text-[#1A1A1A] focus:outline-hidden resize-y`}
        />
      )}

      {/* 3. NÚMERO */}
      {tipo_campo === 'numero' && (
        <input
          id={`input-${id}`}
          type="number"
          value={value !== undefined ? value : ''}
          onChange={(e) => onChange?.(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
          className={`w-full max-w-xs px-3 py-2 text-xs rounded-sm bg-white/90 border font-mono transition-all ${
            error ? 'border-red-400 focus:ring-1 focus:ring-red-400' : 'border-gray-200 focus:border-[#A67C52] focus:ring-1 focus:ring-[#A67C52]'
          } text-[#1A1A1A] focus:outline-hidden`}
        />
      )}

      {/* 4. DATA */}
      {tipo_campo === 'data' && (
        <div className="relative max-w-xs">
          <input
            id={`input-${id}`}
            type="date"
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            className={`w-full px-3 py-2 text-xs rounded-sm bg-white/90 border transition-all ${
              error ? 'border-red-400 focus:ring-1 focus:ring-red-400' : 'border-gray-200 focus:border-[#A67C52] focus:ring-1 focus:ring-[#A67C52]'
            } text-[#1A1A1A] focus:outline-hidden`}
          />
        </div>
      )}

      {/* 5. ÚNICA ESCOLHA (RADIO / PILLS) */}
      {tipo_campo === 'unica_escolha' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {opcoes.map((opcao, idx) => {
            const isSelected = value === opcao;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onChange?.(opcao)}
                className={`flex items-center gap-2.5 px-3 py-2 text-left rounded-sm text-xs transition-all border ${
                  isSelected
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-xs'
                    : 'bg-white/80 text-gray-700 border-gray-200 hover:border-[#A67C52]/50 hover:bg-white'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-[#C49B74] bg-[#C49B74]' : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A]" />}
                </div>
                <span className="font-medium text-[11px] leading-tight">{opcao}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 6. MÚLTIPLA ESCOLHA (CHECKBOX) */}
      {tipo_campo === 'multipla_escolha' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {opcoes.map((opcao, idx) => {
            const currentList: string[] = Array.isArray(value) ? value : [];
            const isChecked = currentList.includes(opcao);

            const handleToggle = () => {
              if (isChecked) {
                onChange?.(currentList.filter((item) => item !== opcao));
              } else {
                onChange?.([...currentList, opcao]);
              }
            };

            return (
              <button
                key={idx}
                type="button"
                onClick={handleToggle}
                className={`flex items-center gap-2.5 px-3 py-2 text-left rounded-sm text-xs transition-all border ${
                  isChecked
                    ? 'bg-[#A67C52]/10 border-[#A67C52] text-[#1A1A1A] font-semibold'
                    : 'bg-white/80 text-gray-700 border-gray-200 hover:border-[#A67C52]/40 hover:bg-white'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 ${
                    isChecked ? 'bg-[#A67C52] border-[#A67C52] text-white' : 'border-gray-300 bg-white'
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span className="text-[11px] leading-tight">{opcao}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 7. ESCALA (1-5 OU 1-10) */}
      {tipo_campo === 'escala' && (
        <div className="pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from({ length: escalaMax || 10 }, (_, i) => i + 1).map((num) => {
              const isSelected = Number(value) === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => onChange?.(num)}
                  className={`w-9 h-9 rounded-sm text-xs font-mono font-bold transition-all border ${
                    isSelected
                      ? 'bg-[#1A1A1A] text-[#C49B74] border-[#1A1A1A] shadow-xs scale-105'
                      : 'bg-white/90 text-gray-700 border-gray-200 hover:border-[#A67C52] hover:bg-[#A67C52]/5'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
          {value !== undefined && value !== '' && (
            <p className="text-[11px] text-gray-500 mt-1 font-mono">
              Selecionado: <span className="font-bold text-[#A67C52]">{value}</span> de {escalaMax || 10}
            </p>
          )}
        </div>
      )}

      {/* 8. SIM / NÃO */}
      {tipo_campo === 'sim_nao' && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onChange?.('Sim')}
            className={`flex-1 sm:flex-initial sm:w-28 py-2 px-4 rounded-sm text-xs font-semibold uppercase tracking-wider transition-all border ${
              value === 'Sim' || value === true
                ? 'bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-xs'
                : 'bg-white/80 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300'
            }`}
          >
            Sim
          </button>
          <button
            type="button"
            onClick={() => onChange?.('Não')}
            className={`flex-1 sm:flex-initial sm:w-28 py-2 px-4 rounded-sm text-xs font-semibold uppercase tracking-wider transition-all border ${
              value === 'Não' || value === false
                ? 'bg-[#A67C52] text-white border-[#A67C52] shadow-xs'
                : 'bg-white/80 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300'
            }`}
          >
            Não
          </button>
        </div>
      )}

      {error && <p className="text-[10px] text-red-500 font-medium">{error}</p>}
    </div>
  );
};
