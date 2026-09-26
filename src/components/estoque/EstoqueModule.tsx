import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Boxes, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { ConsumoPadrao, Procedure, ProdutoDeEstoque } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { chaveDeNome } from '../../utils/templateMatching';
import {
  formatarPrecoUnitario,
  margemUnitaria,
  produtoEmUso,
  quantidadeComUnidade,
} from '../../utils/estoque';
import {
  deleteProdutoDeEstoque,
  saveProdutoDeEstoque,
  subscribeToConsumosPadrao,
  subscribeToProdutosDeEstoque,
} from '../../services/databaseService';
import { SkeletonLista } from '../common/Skeleton';
import {
  AbasSublinhadas,
  AcaoDoMenu,
  BotaoPilula,
  CampoDeBusca,
  Chip,
  MenuDeAcoes,
  TituloDaTela,
} from '../common/Tinta';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { ProdutoFormPanel } from './ProdutoFormPanel';
import { ConsumoPadraoPanel } from './ConsumoPadraoPanel';

interface EstoqueModuleProps {
  catalogProcedures: Procedure[];
}

type Aba = 'produtos' | 'consumo';

/**
 * A seção de Estoque: os materiais com o que custam e o que é repassado à cliente, e o consumo
 * padrão de cada procedimento — este só em materiais e quantidades, sem valor: a quantidade muda
 * de uma sessão para outra, e o custo que vale é o registrado em cada atendimento.
 *
 * Sem saldo, por enquanto — é o cadastro de custos. O uso registrado em cada atendimento já fica
 * gravado, então ligar a baixa automática depois não exige refazer nada.
 *
 * No redesign, cada produto é um cartão com **a margem em destaque** — é o número que responde "vale
 * a pena?" —, e o comprado e o repassado lado a lado embaixo.
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

  const abrirEdicao = (p: ProdutoDeEstoque) => {
    setEditando(p);
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
    <div className="flex flex-col gap-4">
      <TituloDaTela
        titulo="Estoque"
        acao={
          aba === 'produtos' ? (
            <BotaoPilula icone={Plus} onClick={abrirNovo}>
              <span className="sm:hidden">Produto</span>
              <span className="hidden sm:inline">Novo produto</span>
            </BotaoPilula>
          ) : undefined
        }
      />

      <AbasSublinhadas
        abas={[
          { id: 'produtos' as const, rotulo: 'Produtos', contagem: ativos },
          { id: 'consumo' as const, rotulo: 'Consumo por procedimento', contagem: configurados },
        ]}
        ativa={aba}
        onSelecionar={setAba}
      />

      <p className="text-[14px] text-ink-soft leading-relaxed max-w-2xl">
        {aba === 'produtos'
          ? 'Os materiais que a clínica usa, com o valor comprado e o valor repassado à cliente — os dois por unidade de uso (U, ml, seringa…).'
          : 'Os materiais e as quantidades que cada procedimento costuma usar por sessão. O registro de materiais do atendimento e o custo estimado do orçamento abrem preenchidos com esta lista, e é lá que o custo é calculado.'}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <CampoDeBusca
          valor={busca}
          onMudar={setBusca}
          placeholder={aba === 'produtos' ? 'Produto ou marca' : 'Procedimento'}
          rotulo={aba === 'produtos' ? 'Buscar produto ou marca' : 'Buscar procedimento'}
          className="flex-1"
        />
        {aba === 'produtos' && produtos.some((p) => p.arquivado) && (
          <Chip ativo={verArquivados} onClick={() => setVerArquivados((v) => !v)}>
            Mostrar arquivados
          </Chip>
        )}
      </div>

      {erro && <p className="px-4 py-3 rounded-[14px] bg-danger-bg text-[14px] text-danger">{erro}</p>}

      {carregando ? (
        <SkeletonLista linhas={5} comAvatar={false} />
      ) : aba === 'produtos' ? (
        produtosVisiveis.length === 0 ? (
          <div className="rounded-[20px] bg-card border border-ink/8 p-10 text-center">
            <Boxes className="w-9 h-9 text-ink-soft mx-auto mb-3" />
            <p className="text-[15px] font-bold text-ink">
              {produtos.length === 0 ? 'Nenhum produto cadastrado ainda' : 'Nada encontrado'}
            </p>
            {produtos.length === 0 && (
              <button
                type="button"
                onClick={abrirNovo}
                className="mt-2 text-[14px] font-semibold text-ink underline underline-offset-2"
              >
                Cadastrar o primeiro
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {produtosVisiveis.map((p) => {
              const margem = margemUnitaria(p);
              const acoes: AcaoDoMenu[] = [
                { rotulo: 'Editar', icone: Pencil, onClick: () => abrirEdicao(p) },
                p.arquivado
                  ? { rotulo: 'Reativar', icone: ArchiveRestore, onClick: () => arquivar(p, false) }
                  : {
                      rotulo: 'Arquivar',
                      descricao: 'Sai das listas de escolha',
                      icone: Archive,
                      onClick: () => arquivar(p, true),
                    },
                { rotulo: 'Excluir', icone: Trash2, tom: 'perigo', onClick: () => pedirExclusao(p) },
              ];
              return (
                <article
                  key={p.id}
                  className={`rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3.5 ${
                    p.arquivado ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(p)}
                      className="min-w-0 flex-1 text-left group"
                      title={`Editar ${p.nome}`}
                    >
                      <span className="block text-[16px] font-bold text-ink group-hover:underline underline-offset-2">
                        {p.nome}
                        {p.arquivado && (
                          <span className="ml-2 align-middle px-2 py-0.5 rounded-full bg-line-soft text-ink-soft text-[11px] font-bold">
                            Arquivado
                          </span>
                        )}
                      </span>
                      <span className="block text-[13px] text-ink-soft">
                        {[
                          p.marca,
                          `por ${p.unidade}`,
                          p.caixa &&
                            `caixa com ${quantidadeComUnidade(p.caixa.unidades, '')}${
                              p.caixa.custo > 0 ? ` (${formatBRL(p.caixa.custo)})` : ''
                            }`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <div className="flex items-start gap-1 shrink-0">
                      {margem && (
                        <div className="text-right">
                          <p
                            className={`text-[22px] font-bold tabular-nums leading-tight ${
                              margem.valor < 0 ? 'text-danger' : 'text-ok'
                            }`}
                          >
                            {margem.percentual}%
                          </p>
                          <p className="text-[12px] font-medium text-ink-soft">margem</p>
                        </div>
                      )}
                      <MenuDeAcoes
                        tom="discreto"
                        acoes={acoes}
                        rotulo={`Mais ações para ${p.nome}`}
                        titulo={p.nome}
                        className="-mr-2 -mt-1.5"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 border-t border-ink/8 pt-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-ink-soft">Comprado · por {p.unidade}</p>
                      <p className="text-[16px] font-bold text-ink tabular-nums truncate">
                        {formatarPrecoUnitario(p.custoUnitario)}
                      </p>
                    </div>
                    <div className="min-w-0 border-l border-ink/8 pl-3.5">
                      <p className="text-[12px] font-medium text-ink-soft">Repassado à cliente</p>
                      <p className="text-[16px] font-bold text-ink tabular-nums truncate">
                        {p.valorCliente > 0 ? formatarPrecoUnitario(p.valorCliente) : '—'}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
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

      <ProdutoFormPanel aberto={formAberto} onFechar={() => setFormAberto(false)} produto={editando} />

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
