import React from 'react';

/**
 * "Mais de 1 sessão" + quantidade — o número que o orçamento usa para já nascer com as sessões do
 * pacote preenchidas. Aparece no cadastro do procedimento e no de cada área do mapa, com o mesmo
 * comportamento; só o estilo do campo muda.
 */
export const CampoMaisDeUmaSessao: React.FC<{
  marcado: boolean;
  quantidade: string;
  onMarcar: (marcado: boolean) => void;
  onQuantidade: (quantidade: string) => void;
  inputClassName: string;
}> = ({ marcado, quantidade, onMarcar, onQuantidade, inputClassName }) => (
  <div className="space-y-1.5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => onMarcar(e.target.checked)}
          className="w-3.5 h-3.5 accent-brand"
        />
        <span className="text-xs font-medium text-ink">Mais de 1 sessão</span>
      </label>
      {marcado && (
        <input
          type="number"
          min="2"
          step="1"
          value={quantidade}
          onChange={(e) => onQuantidade(e.target.value)}
          // Sair do campo vazio ou com 1 devolve o mínimo, para o número nunca ficar inválido.
          onBlur={() => {
            if (!(Math.floor(Number(quantidade)) >= 2)) onQuantidade('2');
          }}
          aria-label="Quantidade de sessões"
          className={`w-20 tabular-nums ${inputClassName}`}
        />
      )}
    </div>
    <p className="text-label text-muted leading-snug">
      {marcado
        ? 'O orçamento já nasce com esse número de sessões — dá para ajustar lá.'
        : 'Marque para pacotes: o orçamento já nasce com o número de sessões preenchido.'}
    </p>
  </div>
);
