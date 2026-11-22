import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { mesmoFoco } from '../utils/procedimentoAvaliacao';

interface CampoDeFocosProps {
  focos: string[];
  onMudar: (focos: string[]) => void;
  /** Exemplo do campo vazio — o da Avaliação é diferente do de um procedimento comum. */
  placeholder?: string;
  /**
   * Sugestões para tocar e acrescentar — na Avaliação, os procedimentos do catálogo. As que já
   * estão na lista não aparecem.
   */
  sugestoes?: string[];
  rotuloDasSugestoes?: string;
}

/**
 * A lista de "Foco / Aplicação" do cadastro do procedimento: digita e acrescenta, toca no × para
 * tirar. Repetido (sem acento e caixa) não entra duas vezes.
 */
export const CampoDeFocos: React.FC<CampoDeFocosProps> = ({
  focos,
  onMudar,
  placeholder = 'Ex: Trocanter, Volume, Celulite',
  sugestoes = [],
  rotuloDasSugestoes = 'Sugestões',
}) => {
  const [novo, setNovo] = useState('');

  const acrescentar = (texto: string) => {
    const t = texto.trim();
    if (!t || focos.some((f) => mesmoFoco(f, t))) return;
    onMudar([...focos, t]);
  };

  const confirmarNovo = () => {
    acrescentar(novo);
    setNovo('');
  };

  const sugestoesLivres = sugestoes.filter((s) => s.trim() && !focos.some((f) => mesmoFoco(f, s)));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmarNovo();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
        />
        <button
          type="button"
          onClick={confirmarNovo}
          disabled={!novo.trim()}
          className="px-3 py-2 bg-ink text-white text-xs font-semibold rounded-sm hover:bg-black disabled:opacity-40 transition-colors"
        >
          Adicionar
        </button>
      </div>

      {focos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {focos.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 text-xs bg-white px-2.5 py-1 rounded-full border border-brand/30 text-ink font-medium"
            >
              {f}
              <button
                type="button"
                onClick={() => onMudar(focos.filter((x) => x !== f))}
                className="text-muted hover:text-danger -mr-1 p-0.5"
                aria-label={`Tirar o foco ${f}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {sugestoesLivres.length > 0 && (
        <div>
          <span className="block text-label text-muted mb-1">{rotuloDasSugestoes}</span>
          <div className="flex flex-wrap gap-1.5">
            {sugestoesLivres.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => acrescentar(s)}
                className="inline-flex items-center gap-1 text-label px-2 py-1 rounded-full border border-dashed border-line text-ink-soft hover:border-brand hover:text-brand transition-colors"
              >
                <Plus className="w-3 h-3" />
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
