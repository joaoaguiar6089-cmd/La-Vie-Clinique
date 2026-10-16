import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Package } from 'lucide-react';
import { ProdutoDeEstoque } from '../../types';
import { formatarPrecoUnitario, produtosAtivos } from '../../utils/estoque';

interface ProdutoSearchAddProps {
  /** Todos os produtos do estoque — os arquivados ficam de fora da escolha. */
  produtos: ProdutoDeEstoque[];
  onAdd: (produto: ProdutoDeEstoque) => void;
}

/**
 * Botão que abre a busca no estoque para acrescentar um produto ao orçamento ou ao recibo — o
 * irmão do `ProcedureSearchAdd`, com o mesmo desenho. Cada clique adiciona uma linha nova; quem
 * quer duas unidades muda a quantidade na linha.
 *
 * Mostra o valor repassado à cliente por unidade, que é o preço com que o item nasce. O valor
 * comprado nunca aparece aqui: a busca é aberta com a cliente por perto.
 */
export const ProdutoSearchAdd: React.FC<ProdutoSearchAddProps> = ({ produtos, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const ativos = useMemo(() => produtosAtivos(produtos), [produtos]);

  const filtrados = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return ativos;
    return ativos.filter(
      (p) => p.nome.toLowerCase().includes(term) || (p.marca || '').toLowerCase().includes(term)
    );
  }, [ativos, searchTerm]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setSearchTerm('');
          setIsOpen((v) => !v);
        }}
        className="px-3 py-1.5 bg-white/60 border border-white/80 text-ink text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
      >
        <Package className="w-3.5 h-3.5" />
        Adicionar produto
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-[min(380px,80vw)] bg-white rounded-sm border border-gray-200 shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar no estoque..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xs bg-gray-50 border border-gray-200 text-xs text-ink focus:outline-hidden focus:border-brand"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filtrados.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-5 px-3">
                {ativos.length === 0
                  ? 'Nenhum produto cadastrado no Estoque ainda.'
                  : 'Nenhum produto encontrado.'}
              </p>
            ) : (
              filtrados.map((produto) => (
                <button
                  key={produto.id}
                  type="button"
                  onClick={() => {
                    onAdd(produto);
                    setSearchTerm('');
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface transition-colors flex items-center justify-between gap-3 group"
                >
                  <span className="text-xs text-ink truncate flex items-center gap-1.5">
                    <Plus className="w-3 h-3 text-brand opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    {produto.nome}
                    {produto.marca ? <span className="text-gray-400"> — {produto.marca}</span> : null}
                  </span>
                  <span className="text-body text-gray-400 shrink-0 tabular-nums">
                    {produto.valorCliente > 0
                      ? `${formatarPrecoUnitario(produto.valorCliente)}/${produto.unidade || 'un'}`
                      : 'sem valor'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
