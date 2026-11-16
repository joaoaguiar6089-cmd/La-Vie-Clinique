import React, { useMemo, useRef, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { ProdutoDeEstoque } from '../../types';
import { formatarPrecoUnitario, produtosAtivos } from '../../utils/estoque';
import { EscolhaNaJanela, OpcaoDaLista } from '../common/JanelaDeEscolha';

interface ProdutoSearchAddProps {
  /** Todos os produtos do estoque — os arquivados ficam de fora da escolha. */
  produtos: ProdutoDeEstoque[];
  onAdd: (produto: ProdutoDeEstoque) => void;
  /**
   * O botão grande e branco do orçamento, do mesmo tamanho do "Adicionar procedimento" preto ao
   * lado. Sem ele, o botão pequeno do recibo.
   */
  grande?: boolean;
}

/**
 * Botão que abre a busca no estoque para acrescentar um produto ao orçamento ou ao recibo — o
 * irmão do `ProcedureSearchAdd`, com o mesmo desenho. Cada clique adiciona uma linha nova; quem
 * quer duas unidades muda a quantidade na linha.
 *
 * Mostra o valor repassado à cliente por unidade, que é o preço com que o item nasce. O valor
 * comprado nunca aparece aqui: a busca é aberta com a cliente por perto.
 *
 * A busca abre na janela de escolha, no meio da tela (ver `JanelaDeEscolha`).
 */
export const ProdutoSearchAdd: React.FC<ProdutoSearchAddProps> = ({ produtos, onAdd, grande = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);

  const ativos = useMemo(() => produtosAtivos(produtos), [produtos]);

  const opcoes = useMemo<OpcaoDaLista[]>(
    () =>
      ativos.map((produto) => ({
        valor: produto.id,
        rotulo: produto.nome,
        detalhe: produto.marca || undefined,
        lateral:
          produto.valorCliente > 0
            ? `${formatarPrecoUnitario(produto.valorCliente)}/${produto.unidade || 'un'}`
            : 'sem valor',
        icone: Plus,
      })),
    [ativos]
  );

  return (
    <div className={grande ? 'w-full' : undefined}>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={
          grande
            ? 'w-full h-12 px-5 rounded-full bg-white border border-ink/15 text-ink text-[15px] font-semibold whitespace-nowrap hover:border-ink/40 active:scale-[.99] transition-colors flex items-center justify-center gap-2'
            : 'px-3 py-1.5 bg-white/60 border border-white/80 text-ink text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5'
        }
      >
        <Package className={grande ? 'w-[18px] h-[18px] shrink-0' : 'w-3.5 h-3.5'} />
        Adicionar produto
      </button>

      {isOpen && (
        <EscolhaNaJanela
          titulo="Adicionar produto"
          opcoes={opcoes}
          buscavel
          onEscolher={(o) => {
            const produto = ativos.find((p) => p.id === o.valor);
            if (produto) onAdd(produto);
          }}
          onFechar={() => setIsOpen(false)}
          placeholderDaBusca="Buscar no estoque…"
          vazio={ativos.length === 0 ? 'Nenhum produto cadastrado no Estoque ainda.' : 'Nenhum produto encontrado.'}
          origem={botaoRef}
        />
      )}
    </div>
  );
};
