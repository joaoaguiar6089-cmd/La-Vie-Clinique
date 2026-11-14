import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ArchiveRestore, Boxes, ChevronRight, PackagePlus, Pencil, Plus, Settings2, ShoppingBag, Trash2 } from 'lucide-react';
import { ConsumoPadrao, LoteDeEstoque, PedidoDeCompra, Procedure, ProdutoDeEstoque, TipoDeProduto } from '../../types';
import { chaveDeNome } from '../../utils/templateMatching';
import { produtoEmUso, quantidadeComUnidade, quantidadeDoProduto } from '../../utils/estoque';
import { resumoDosTipos, tiposUsados, totaisLegiveis } from '../../utils/lotes';
import { hojeISO } from '../../utils/attendances';
import {
  deleteProdutoDeEstoque,
  saveProdutoDeEstoque,
  subscribeToConsumosPadrao,
  subscribeToLotesDeEstoque,
  subscribeToPedidosDeCompra,
  subscribeToProdutosDeEstoque,
  subscribeToTiposDeProduto,
} from '../../services/databaseService';
import { SkeletonLista } from '../common/Skeleton';
import {
  AbasSublinhadas,
  AcaoDoMenu,
  BotaoPilula,
  CampoDeBusca,
  Chip,
  TituloDaTela,
} from '../common/Tinta';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { ProdutoFormPanel } from './ProdutoFormPanel';
import { ConsumoPadraoPanel } from './ConsumoPadraoPanel';
import { TipoDeProdutoPanel } from './TipoDeProdutoPanel';
import { PedidoDeCompraPanel } from './PedidoDeCompraPanel';
import { ComprasDoEstoque } from './ComprasDoEstoque';

interface EstoqueModuleProps {
  catalogProcedures: Procedure[];
  /** Quem está logada — assina os pedidos e os ajustes de lote. */
  autor?: { uid: string; nome: string } | null;
}

type Aba = 'produtos' | 'compras' | 'consumo';

/**
 * A seção de Estoque.
 *
 * - **Produtos**, por tipo: "Ácido hialurônico" soma o Voluma e o Restylane. Cada tipo mostra
 *   quanto há, e o painel dele traz os produtos (nome, marca, preços) e os lotes — data da compra,
 *   lote, validade e quanto resta. Tipo abaixo do mínimo e lote vencendo aparecem em destaque.
 * - **Compras**: os pedidos de compra, com a foto ou o PDF. Cada item vira um lote; o produto passa
 *   a custar o desta compra. É também por aqui que se lança o estoque atual, para começar.
 * - **Consumo por procedimento**: os materiais que cada procedimento costuma usar por sessão.
 *
 * O saldo desce com os materiais lançados no relatório do atendimento (do lote que vence primeiro)
 * e com o "Ajustar" do lote. Venda de produto ao cliente não mexe no estoque.
 */
export const EstoqueModule: React.FC<EstoqueModuleProps> = ({ catalogProcedures, autor }) => {
  const [aba, setAba] = useState<Aba>('produtos');
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[]>([]);
  const [consumos, setConsumos] = useState<ConsumoPadrao[]>([]);
  const [lotes, setLotes] = useState<LoteDeEstoque[]>([]);
  const [tipos, setTipos] = useState<TipoDeProduto[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDeCompra[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [verArquivados, setVerArquivados] = useState(false);
  const [editando, setEditando] = useState<ProdutoDeEstoque | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [tipoDoNovo, setTipoDoNovo] = useState<string | undefined>(undefined);
  const [tipoAberto, setTipoAberto] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<'compra' | 'estoque-inicial' | null>(null);
  const [configurando, setConfigurando] = useState<Procedure | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const hoje = hojeISO();

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
    const parar = [
      subscribeToProdutosDeEstoque((dados) => {
        setProdutos(dados);
        setCarregando(false);
      }, avisar),
      subscribeToConsumosPadrao(setConsumos, avisar),
      subscribeToLotesDeEstoque(setLotes, avisar),
      subscribeToTiposDeProduto(setTipos, avisar),
      subscribeToPedidosDeCompra(setPedidos, avisar),
    ];
    return () => parar.forEach((p) => p());
  }, []);

  const termo = chaveDeNome(busca).trim();

  const resumos = useMemo(
    () => resumoDosTipos(produtos, lotes, tipos, hoje, verArquivados),
    [produtos, lotes, tipos, hoje, verArquivados]
  );
  const resumosVisiveis = useMemo(
    () =>
      resumos.filter(
        (r) =>
          !termo ||
          chaveDeNome(r.nome).includes(termo) ||
          r.produtos.some((p) => chaveDeNome(`${p.nome} ${p.marca || ''}`).includes(termo))
      ),
    [resumos, termo]
  );
  const resumoAberto = tipoAberto !== null ? resumos.find((r) => r.chave === tipoAberto) || null : null;
  const sugestoesDeTipo = useMemo(() => tiposUsados(produtos), [produtos]);

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

  const abrirNovo = (tipo?: string) => {
    setEditando(null);
    setTipoDoNovo(tipo || undefined);
    setFormAberto(true);
  };

  const abrirEdicao = (p: ProdutoDeEstoque) => {
    setEditando(p);
    setTipoDoNovo(undefined);
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
    const temLotes = lotes.some((l) => l.produtoId === p.id);
    if (produtoEmUso(p.id, consumos) || temLotes) {
      const motivo = temLotes
        ? 'Ele tem lotes no estoque (comprados ou já usados), então não dá para excluir — o histórico precisa dele.'
        : 'Ele está no consumo padrão de algum procedimento, então não dá para excluir — tire-o de lá antes.';
      setConfirmacao(
        p.arquivado
          ? aviso(`"${p.nome}" continua em uso`, `${motivo} Arquivado, ele já não aparece nas listas de escolha.`)
          : {
              titulo: `Arquivar "${p.nome}"?`,
              mensagem: `${motivo} Arquivado, some das listas de escolha, e o que já existe com ele continua valendo.`,
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

  const acoesDoProduto = (p: ProdutoDeEstoque): AcaoDoMenu[] => [
    { rotulo: 'Editar', icone: Pencil, onClick: () => abrirEdicao(p) },
    p.arquivado
      ? { rotulo: 'Reativar', icone: ArchiveRestore, onClick: () => arquivar(p, false) }
      : { rotulo: 'Arquivar', descricao: 'Sai das listas de escolha', icone: Archive, onClick: () => arquivar(p, true) },
    { rotulo: 'Excluir', icone: Trash2, tom: 'perigo', onClick: () => pedirExclusao(p) },
  ];

  const semLotes = lotes.length === 0 && produtos.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <TituloDaTela
        titulo="Estoque"
        acao={
          aba === 'produtos' ? (
            <BotaoPilula icone={Plus} onClick={() => abrirNovo()}>
              <span className="sm:hidden">Produto</span>
              <span className="hidden sm:inline">Novo produto</span>
            </BotaoPilula>
          ) : aba === 'compras' ? (
            <BotaoPilula icone={ShoppingBag} onClick={() => setPedidoAberto('compra')}>
              <span className="sm:hidden">Compra</span>
              <span className="hidden sm:inline">Nova compra</span>
            </BotaoPilula>
          ) : undefined
        }
      />

      <AbasSublinhadas
        abas={[
          { id: 'produtos' as const, rotulo: 'Produtos', contagem: ativos },
          { id: 'compras' as const, rotulo: 'Compras', contagem: pedidos.length },
          { id: 'consumo' as const, rotulo: 'Consumo por procedimento', contagem: configurados },
        ]}
        ativa={aba}
        onSelecionar={setAba}
      />

      <p className="text-[14px] text-ink-soft leading-relaxed max-w-2xl">
        {aba === 'produtos'
          ? 'Quanto há de cada tipo de produto. Toque num tipo para ver os produtos e os lotes — data da compra, lote, validade e quanto resta.'
          : aba === 'compras'
            ? 'Os pedidos de compra, com a foto ou o PDF. Cada item vira um lote no estoque; o produto passa a custar o desta compra.'
            : 'Os materiais e as quantidades que cada procedimento costuma usar por sessão. O registro de materiais do atendimento e o custo estimado do orçamento abrem preenchidos com esta lista, e é lá que o custo é calculado.'}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder={aba === 'consumo' ? 'Procedimento' : aba === 'compras' ? 'Fornecedor ou produto' : 'Tipo, produto ou marca'}
          rotulo={aba === 'consumo' ? 'Buscar procedimento' : aba === 'compras' ? 'Buscar compra' : 'Buscar tipo, produto ou marca'}
          className="flex-1"
        />
        {aba === 'produtos' && produtos.some((p) => p.arquivado) && (
          <Chip ativo={verArquivados} onClick={() => setVerArquivados((v) => !v)}>
            Mostrar arquivados
          </Chip>
        )}
        {aba === 'compras' && (
          <button
            type="button"
            onClick={() => setPedidoAberto('estoque-inicial')}
            className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full border border-ink/15 text-[14px] font-semibold text-ink hover:border-ink/40 transition-colors"
          >
            <PackagePlus className="w-[18px] h-[18px]" />
            Lançar o estoque atual
          </button>
        )}
      </div>

      {erro && <p className="px-4 py-3 rounded-[14px] bg-danger-bg text-[14px] text-danger">{erro}</p>}

      {carregando ? (
        <SkeletonLista linhas={5} comAvatar={false} />
      ) : aba === 'produtos' ? (
        <>
          {semLotes && (
            <div className="rounded-[18px] bg-line-soft px-4 py-3 text-[14px] text-ink flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="flex-1 min-w-[220px]">
                Ainda não há quantidades. Para começar, lance o que já está na prateleira — com lote e validade.
              </span>
              <button
                type="button"
                onClick={() => {
                  setAba('compras');
                  setPedidoAberto('estoque-inicial');
                }}
                className="h-10 px-4 rounded-full bg-ink text-white text-[14px] font-semibold"
              >
                Lançar o estoque atual
              </button>
            </div>
          )}
          {resumosVisiveis.length === 0 ? (
            <div className="rounded-[20px] bg-card border border-ink/8 p-10 text-center">
              <Boxes className="w-9 h-9 text-ink-soft mx-auto mb-3" />
              <p className="text-[15px] font-bold text-ink">
                {produtos.length === 0 ? 'Nenhum produto cadastrado ainda' : 'Nada encontrado'}
              </p>
              {produtos.length === 0 && (
                <button
                  type="button"
                  onClick={() => abrirNovo()}
                  className="mt-2 text-[14px] font-semibold text-ink underline underline-offset-2"
                >
                  Cadastrar o primeiro
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resumosVisiveis.map((r) => (
                <button
                  key={r.chave || 'sem-tipo'}
                  type="button"
                  onClick={() => setTipoAberto(r.chave)}
                  className={`rounded-[20px] bg-card border p-4 flex flex-col gap-2 text-left hover:border-ink/30 transition-colors ${
                    r.abaixoDoMinimo ? 'border-danger-line' : 'border-ink/8'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className={`block text-[16px] font-bold truncate ${r.chave ? 'text-ink' : 'text-ink-soft'}`}>{r.nome}</span>
                      <span className="block text-[13px] text-ink-soft truncate">
                        {r.produtos.length} {r.produtos.length === 1 ? 'produto' : 'produtos'}
                        {r.produtos.length > 0 && ` · ${[...new Set(r.produtos.map((p) => p.marca).filter(Boolean))].join(', ') || 'sem marca'}`}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-ink-soft shrink-0 mt-1" />
                  </span>
                  <span className={`text-[22px] font-bold tabular-nums leading-tight ${r.totais.length ? 'text-ink' : 'text-ink-soft'}`}>
                    {totaisLegiveis(r.totais)}
                  </span>
                  {(r.abaixoDoMinimo || r.vencidos > 0 || r.vencendo > 0) && (
                    <span className="flex flex-wrap gap-1.5">
                      {r.abaixoDoMinimo && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger-bg text-danger text-[12px] font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Abaixo do mínimo ({quantidadeDoProduto(r.minimo || 0, r.unidadeDoMinimo || '')})
                        </span>
                      )}
                      {r.vencidos > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-danger-bg text-danger text-[12px] font-bold">
                          {r.vencidos} {r.vencidos === 1 ? 'lote vencido' : 'lotes vencidos'}
                        </span>
                      )}
                      {r.vencendo > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-warn-bg text-warn text-[12px] font-bold">
                          {r.vencendo} vencendo
                        </span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      ) : aba === 'compras' ? (
        <ComprasDoEstoque pedidos={pedidos} lotes={lotes} produtos={produtos} termo={termo} />
      ) : porCategoria.length === 0 ? (
        <div className="rounded-[20px] bg-card border border-ink/8 p-10 text-center">
          <p className="text-[15px] font-bold text-ink">Nenhum procedimento encontrado</p>
        </div>
      ) : (
        <div className="space-y-5">
          {porCategoria.map(([categoria, procs]) => (
            <section key={categoria} className="space-y-2">
              <h2 className="font-sans text-[13px] font-semibold text-ink-soft">{categoria}</h2>
              <div className="rounded-[20px] bg-card border border-ink/8 overflow-hidden divide-y divide-ink/8">
                {procs.map((p) => {
                  const itens = consumos.find((c) => c.procedureId === p.id)?.itens || [];
                  // Produto excluído do estoque sai da lista, como sai da sugestão do atendimento.
                  const materiais = itens.flatMap((i) => {
                    const produto = produtos.find((x) => x.id === i.produtoId);
                    return produto ? [{ produto, quantidade: i.quantidade }] : [];
                  });
                  return (
                    <div key={p.id} className="p-4 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-[15px] font-bold text-ink">{p.title}</p>
                        {materiais.length === 0 ? (
                          <p className="text-[13px] text-ink-soft">Sem consumo configurado</p>
                        ) : (
                          <ul className="mt-1.5 flex flex-wrap gap-1.5">
                            {materiais.map(({ produto, quantidade }, i) => (
                              <li
                                key={i}
                                className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-full bg-line-soft text-[13px] text-ink-soft"
                              >
                                <span className="font-bold text-ink tabular-nums">
                                  {quantidadeComUnidade(quantidade, produto.unidade)}
                                </span>
                                {produto.nome}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfigurando(p)}
                        className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[14px] font-semibold transition-colors ${
                          itens.length === 0
                            ? 'bg-ink text-white hover:bg-black'
                            : 'border border-ink/15 text-ink hover:border-ink/40'
                        }`}
                      >
                        <Settings2 className="w-4 h-4" />
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


      <TipoDeProdutoPanel
        resumo={resumoAberto}
        onFechar={() => setTipoAberto(null)}
        hoje={hoje}
        autorNome={autor?.nome}
        onEditarProduto={abrirEdicao}
        onNovoProduto={abrirNovo}
        acoesDoProduto={acoesDoProduto}
      />

      <ProdutoFormPanel
        aberto={formAberto}
        onFechar={() => setFormAberto(false)}
        produto={editando}
        tiposSugeridos={sugestoesDeTipo}
        tipoInicial={tipoDoNovo}
      />

      <PedidoDeCompraPanel
        aberto={!!pedidoAberto}
        onFechar={() => setPedidoAberto(null)}
        estoqueInicial={pedidoAberto === 'estoque-inicial'}
        produtos={produtos}
        tiposSugeridos={sugestoesDeTipo}
        autor={autor}
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
