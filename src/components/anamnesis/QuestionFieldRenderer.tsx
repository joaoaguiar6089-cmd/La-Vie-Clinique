import React from 'react';
import { AnamnesisQuestion } from '../../types';
import { Check } from 'lucide-react';

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
      <div className="py-2.5 border-b border-[rgba(26,26,26,.07)] last:border-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-medium text-ink-soft">{texto}</span>
          {!hideMandatoryAsterisk && obrigatoria && <span className="text-[13px] text-brand font-semibold">*</span>}
        </div>
        <div className="mt-1.5 text-[14px] text-ink font-semibold bg-surface px-3.5 py-2 rounded-xl border border-[rgba(26,26,26,.07)]">
          {displayVal}
        </div>
      </div>
    );
  }

  // INTERACTIVE INPUTS
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`input-${id}`} className="block text-[15px] font-semibold text-ink">
          {texto}
          {!hideMandatoryAsterisk && obrigatoria && <span className="text-danger ml-1 font-bold">*</span>}
        </label>
        {tipo_campo === 'escala' && (
          <span className="text-[13px] text-muted" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
            1 a {escalaMax}
          </span>
        )}
      </div>

      {ajuda && <p className="text-[13px] text-muted leading-snug">{ajuda}</p>}

      {/* 1. TEXTO CURTO */}
      {tipo_campo === 'texto_curto' && (
        <input
          id={`input-${id}`}
          type="text"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Digite sua resposta..."
          className={`w-full h-[52px] px-4 text-[15px] rounded-[13px] bg-white border transition-colors ${
            error ? 'border-danger' : 'border-[rgba(26,26,26,.12)] focus:border-brand'
          } text-ink focus:outline-hidden`}
        />
      )}

      {/* 2. TEXTO LONGO */}
      {tipo_campo === 'texto_longo' && (
        <textarea
          id={`input-${id}`}
          rows={4}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Descreva detalhadamente..."
          className={`w-full min-h-[120px] px-4 py-3 text-[15px] rounded-2xl bg-white border transition-colors ${
            error ? 'border-danger' : 'border-[rgba(26,26,26,.12)] focus:border-brand'
          } text-ink focus:outline-hidden resize-y`}
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
          className={`w-full max-w-[180px] h-[52px] px-4 text-[15px] rounded-[13px] bg-white border transition-colors ${
            error ? 'border-danger' : 'border-[rgba(26,26,26,.12)] focus:border-brand'
          } text-ink focus:outline-hidden`}
          style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
        />
      )}

      {/* 4. DATA */}
      {tipo_campo === 'data' && (
        <input
          id={`input-${id}`}
          type="date"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full max-w-[220px] h-[52px] px-4 text-[15px] rounded-[13px] bg-white border transition-colors ${
            error ? 'border-danger' : 'border-[rgba(26,26,26,.12)] focus:border-brand'
          } text-ink focus:outline-hidden`}
        />
      )}

      {/* 5. ÚNICA ESCOLHA (linhas com caixa circular) */}
      {tipo_campo === 'unica_escolha' && (
        <div className="space-y-2 pt-0.5">
          {opcoes.map((opcao, idx) => {
            const isSelected = value === opcao;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onChange?.(opcao)}
                className={`w-full flex items-center gap-3 h-[52px] px-4 text-left rounded-[13px] text-[15px] transition-colors border ${
                  isSelected ? 'border-brand border-[1.5px] bg-brand/5' : 'border-[rgba(26,26,26,.12)] bg-white hover:border-brand/40'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-brand bg-brand' : 'border-[rgba(26,26,26,.2)] bg-white'
                  }`}
                >
                  {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <span className={`leading-tight ${isSelected ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                  {opcao}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 6. MÚLTIPLA ESCOLHA (linhas com caixa quadrada) */}
      {tipo_campo === 'multipla_escolha' && (
        <div className="space-y-2 pt-0.5">
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
                className={`w-full flex items-center gap-3 h-[52px] px-4 text-left rounded-[13px] text-[15px] transition-colors border ${
                  isChecked ? 'border-brand border-[1.5px] bg-brand/5' : 'border-[rgba(26,26,26,.12)] bg-white hover:border-brand/40'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${
                    isChecked ? 'bg-brand border-brand text-white' : 'border-[rgba(26,26,26,.2)] bg-white'
                  }`}
                >
                  {isChecked && <Check className="w-4 h-4 stroke-[3]" />}
                </span>
                <span className={`leading-tight ${isChecked ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                  {opcao}
                </span>
              </button>
            );
          })}
          <p className="text-[13px] text-muted pt-0.5">Pode marcar mais de uma</p>
        </div>
      )}

      {/* 7. ESCALA (1-5 OU 1-10) */}
      {tipo_campo === 'escala' && (
        <div className="pt-0.5">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: escalaMax || 10 }, (_, i) => i + 1).map((num) => {
              const isSelected = Number(value) === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => onChange?.(num)}
                  className={`flex-1 min-w-[44px] h-12 rounded-xl transition-colors border ${
                    isSelected
                      ? 'border-brand border-[1.5px] bg-brand/5 text-brand text-[17px] font-bold'
                      : 'border-[rgba(26,26,26,.12)] bg-white text-ink-soft text-[15px] font-medium hover:border-brand/40'
                  }`}
                  style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                >
                  {num}
                </button>
              );
            })}
          </div>
          {value !== undefined && value !== '' && (
            <p className="text-[13px] text-muted mt-2">
              Selecionado: <span className="font-bold text-brand">{value}</span> de {escalaMax || 10}
            </p>
          )}
        </div>
      )}

      {/* 8. SIM / NÃO */}
      {tipo_campo === 'sim_nao' && (
        <div className="flex items-center gap-3 pt-0.5">
          {(['Sim', 'Não'] as const).map((opt) => {
            const isSelected = opt === 'Sim' ? value === 'Sim' || value === true : value === 'Não' || value === false;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange?.(opt)}
                className={`flex-1 h-[52px] flex items-center justify-center gap-2 rounded-[13px] text-[15px] font-semibold transition-colors border ${
                  isSelected
                    ? 'bg-ink text-white border-ink'
                    : 'bg-white text-ink-soft border-[rgba(26,26,26,.12)] hover:border-brand/40'
                }`}
              >
                {isSelected && <Check className="w-4 h-4" />}
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-[13px] text-danger font-medium">{error}</p>}
    </div>
  );
};
