import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Boxes,
  ListChecks,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { ConsumoPadrao, Procedure, ProdutoDeEstoque } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { chaveDeNome } from '../../utils/templateMatching';
import {
  formatarPrecoUnitario,
  margemUnitaria,
  produtoEmUso,
  quantidadeComUnidade,
  totaisDoConsumoPadrao,
} from '../../utils/estoque';
import {
  deleteProdutoDeEstoque,
  saveProdutoDeEstoque,
  subscribeToConsumosPadrao,
  subscribeToProdutosDeEstoque,
} from '../../services/databaseService';
import { ModuleTabs } from '../common/ModuleTabs';
import { SkeletonLista } from '../common/Skeleton';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { ProdutoFormPanel } from './ProdutoFormPanel';
import { ConsumoPadraoPanel } from './ConsumoPadraoPanel';

interface EstoqueModuleProps {
  catalogProcedures: Procedure[];
}

type Aba = 'produtos' | 'consumo';

/**
 * A seção de Estoque: os materiais com o que custam e o que é repassado à cliente, e o consumo
 * padrão de cada procedimento.
 *
 * Sem saldo, por enquanto — é o cadastro de custos. O uso registrado em cada atendimento já fica
 * gravado, então ligar a baixa automática depois não exige refazer nada.
 */
export const EstoqueModule: React.FC<EstoqueModuleProps> = ({ catalogProcedures }) => {
  const [aba, setAba] = useState<Aba>('produtos');
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[]>([]);
  const [consumos, setConsumos] = useState<ConsumoPadrao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [verArquivados, setVerArquivados] = useState(false);
  const [editando, setEditando] = useState<ProdutoDeEstoque | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [configurando, setConfigurando] = useState<Procedure | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    // Coleções novas: sem as regras publicadas, o Firestore recusa — melhor dizer do que mostrar
    // uma seção vazia que parece funcionar.
    const avisar = (e: Error) => {
      setCarregando(false);
      setErro(
        `Não foi possível carregar o estoque: ${e.message}. Se for erro de permissão, publique ` +
          'as regras novas do Firebase.'
      );
    };
    const pararProdutos = subscribeToProdutosDeEstoque((dados) => {
      setProdutos(dados);
      setCarregando(false);
    }, avisar);
    const pararConsumos = subscribeToConsumosPadrao(setConsumos, avisar);
    return () => {
      pararProdutos();
      pararConsumos();
    };
  }, []);

  const termo = chaveDeNome(busca).trim();

  const produtosVisiveis = useMemo(
    () =>
      produtos.filter(
        (p) =>
          (verArquivados || !p.arquivado) &&
          (!termo || chaveDeNome(`${p.nome} ${p.marca || ''}`).includes(termo))
      ),
    [produtos, verArquivados, termo]
  );

  const ativos = produtos.filter((p) => !p.arquivado).length;

  /** O catálogo em grupos por categoria, na ordem em que o catálogo já aparece. */
  const porCategoria = useMemo(() => {
    const grupos = new Map<string, Procedure[]>();
    [...catalogProcedures]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .filter((p) => !termo || chaveDeNome(`${p.title} ${p.category}`).includes(termo))
      .forEach((p) => {
        const lista = grupos.get(p.category || 'Sem categoria') || [];
        lista.push(p);
        grupos.set(p.category || 'Sem categoria', lista);
      });
    return Array.from(grupos.entries());
  }, [catalogProcedures, termo]);

  const configurados = consumos.filter((c) => c.itens.length > 0).length;

  const abrirNovo = () => {
    setEditando(null);
    setFormAberto(true);
  };

  const arquivar = async (p: ProdutoDeEstoque, arquivado: boolean) => {
    try {
      await saveProdutoDeEstoque({ ...p, arquivado });
    } catch (e) {
      setErro(`Não foi possível atualizar: ${(e as Error).message}`);
    }
  };

  const pedirExclusao = (p: ProdutoDeEstoque) => {
    if (produtoEmUso(p.id, consumos)) {
      const motivo =
        'Ele está no consumo padrão de algum procedimento, então não dá para excluir — tire-o ' +
        'de lá antes.';
      setConfirmacao(
        p.arquivado
          ? aviso(
              `"${p.nome}" continua em uso`,
              `${motivo} Arquivado, ele já não aparece nas listas de escolha.`
            )
          : {
              titulo: `Arquivar "${p.nome}"?`,
              mensagem: `${motivo} Arquivado, some das listas de escolha, e os consumos que o usam seguem calculando.`,
              textoConfirmar: 'Arquivar',
              tom: 'neutro',
              onConfirmar: () => arquivar(p, true),
            }
      );
      return;
    }
    setConfirmacao({
      titulo: `Excluir "${p.nome}"?`,
      mensagem:
        'O produto sai do estoque. Os atendimentos em que ele já foi usado não mudam — cada ' +
        'registro guardou o nome e o preço do dia.',
      textoConfirmar: 'Excluir',
      onConfirmar: async () => {
        try {
          await deleteProdutoDeEstoque(p.id);
        } catch (e) {
          setErro(`Não foi possível excluir: ${(e as Error).message}`);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <ModuleTabs
        tabs={[
          { id: 'produtos' as const, icon: Package, label: 'Produtos', count: ativos },
          {
            id: 'consumo' as const,
            icon: ListChecks,
            label: 'Consumo por procedimento',
            count: configurados,
          },
        ]}
        active={aba}
        onSelect={setAba}
      />

      {erro && (
        <p className="px-4 py-3 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700">
          {erro}
        </p>
      )}

      <div className="bg-card rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              <h3 className="font-serif-luxury text-xl font-medium text-ink">
                {aba === 'produtos' ? 'Produtos do estoque' : 'Consumo por procedimento'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
              {aba === 'produtos'
                ? 'Os materiais que a clínica usa, com o valor comprado e o valor repassado à cliente — os dois por unidade de uso (U, ml, seringa…).'
                : 'O que cada procedimento costuma gastar por sessão. O registro de materiais do atendimento e o custo estimado do orçamento abrem preenchidos com esta lista.'}
            </p>
          </div>
          {aba === 'produtos' && (
            <button
              type="button"
              onClick={abrirNovo}
              className="w-full md:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-hover shadow-xs active:scale-95 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              Novo produto
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={aba === 'produtos' ? 'Buscar produto ou marca' : 'Buscar procedimento'}
              className="w-full glass-input pl-9 pr-3 py-2 rounded-sm text-sm text-ink focus:outline-hidden"
            />
          </div>
          {aba === 'produtos' && produtos.some((p) => p.arquivado) && (
            <label className="flex items-center gap-2 text-body text-ink-soft cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={verArquivados}
                onChange={(e) => setVerArquivados(e.target.checked)}
                className="w-3.5 h-3.5 accent-brand"
              />
              Mostrar arquivados
            </label>
          )}
        </div>
      </div>

      {carregando ? (
        <SkeletonLista linhas={5} comAvatar={false} />
      ) : aba === 'produtos' ? (
        produtosVisiveis.length === 0 ? (
          <div className="bg-white/50 rounded-sm border border-white/70 p-12 text-center">
            <Boxes className="w-9 h-9 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-ink">
              {produtos.length === 0 ? 'Nenhum produto cadastrado ainda' : 'Nada encontrado'}
            </p>
            {produtos.length === 0 && (
              <button
                type="button"
                onClick={abrirNovo}
                className="mt-2 text-xs font-semibold text-brand hover:underline"
              >
                Cadastrar o primeiro
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-sm border border-white/70 shadow-xs overflow-hidden divide-y divide-gray-100">
            {produtosVisiveis.map((p) => {
              const margem = margemUnitaria(p);
              return (
                <div
                  key={p.id}
                  className={`p-4 sm:px-5 flex flex-wrap items-center gap-x-4 gap-y-2 ${
                    p.arquivado ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-semibold text-ink">
                      {p.nome}
                      {p.arquivado && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-xs bg-gray-100 text-gray-500 text-label font-semibold uppercase tracking-wider">
                          Arquivado
                        </span>
                      )}
                    </p>
                    <p className="text-body text-gray-400">
                      {[p.marca, `por ${p.unidade}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right tabular-nums min-w-[120px]">
                    <p className="text-body text-gray-400">Comprado</p>
                    <p className="text-sm text-ink">{formatarPrecoUnitario(p.custoUnitario)}</p>
                  </div>
                  <div className="text-right tabular-nums min-w-[120px]">
                    <p className="text-body text-gray-400">Repassado</p>
                    <p className="text-sm text-ink">
                      {p.valorCliente > 0 ? formatarPrecoUnitario(p.valorCliente) : '—'}
                    </p>
                    {margem && (
                      <p className={`text-label ${margem.valor < 0 ? 'text-danger' : 'text-ok'}`}>
                        margem {margem.percentual}%
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(p);
                        setFormAberto(true);
                      }}
                      title="Editar"
                      aria-label={`Editar ${p.nome}`}
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => arquivar(p, !p.arquivado)}
                      title={p.arquivado ? 'Reativar' : 'Arquivar — sai das listas de escolha'}
                      aria-label={p.arquivado ? `Reativar ${p.nome}` : `Arquivar ${p.nome}`}
                      className="p-2 text-gray-400 hover:text-brand transition-colors"
                    >
                      {p.arquivado ? (
                        <ArchiveRestore className="w-4 h-4" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => pedirExclusao(p)}
                      title="Excluir"
                      aria-label={`Excluir ${p.nome}`}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : porCategoria.length === 0 ? (
        <div className="bg-white/50 rounded-sm border border-white/70 p-12 text-center">
          <p className="text-sm font-semibold text-ink">Nenhum procedimento encontrado</p>
        </div>
      ) : (
        <div className="space-y-5">
          {porCategoria.map(([categoria, procs]) => (
            <section key={categoria} className="space-y-2">
              <h4 className="text-label uppercase tracking-widest font-semibold text-brand">
                {categoria}
              </h4>
              <div className="bg-card rounded-sm border border-white/70 shadow-xs overflow-hidden divide-y divide-gray-100">
                {procs.map((p) => {
                  const consumo = consumos.find((c) => c.procedureId === p.id);
                  const totais = totaisDoConsumoPadrao(consumo, produtos);
                  const itens = consumo?.itens || [];
                  return (
                    <div key={p.id} className="p-4 sm:px-5 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-sm text-ink">{p.title}</p>
                        {itens.length === 0 ? (
                          <p className="text-body text-gray-400">Sem consumo configurado</p>
                        ) : (
                          <p className="text-body text-gray-500 line-clamp-2">
                            {itens
                              .map((i) => {
                                const produto = produtos.find((x) => x.id === i.produtoId);
                                return produto
                                  ? `${produto.nome} ${quantidadeComUnidade(i.quantidade, produto.unidade)}`
                                  : null;
                              })
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                      {itens.length > 0 && (
                        <div className="text-right tabular-nums">
                          <p className="text-sm font-semibold text-ink">{formatBRL(totais.custo)}</p>
                          <p className="text-body text-gray-400">
                            custo por sessão
                            {totais.valorCliente > 0
                              ? ` · cliente ${formatBRL(totais.valorCliente)}`
                              : ''}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfigurando(p)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-sm bg-white border border-gray-200 text-label font-semibold uppercase tracking-wider text-ink hover:border-brand transition-colors"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        {itens.length === 0 ? 'Configurar' : 'Editar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProdutoFormPanel
        aberto={formAberto}
        onFechar={() => setFormAberto(false)}
        produto={editando}
      />

      <ConsumoPadraoPanel
        aberto={!!configurando}
        onFechar={() => setConfigurando(null)}
        procedimento={configurando}
        catalogo={catalogProcedures}
        produtos={produtos}
        consumos={consumos}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
