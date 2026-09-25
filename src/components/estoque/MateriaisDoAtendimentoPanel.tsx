import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Info, Loader2 } from 'lucide-react';
import {
  Attendance,
  ConsumoPadrao,
  MateriaisDoAtendimento,
  Procedure,
  ProdutoDeEstoque,
} from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import {
  LinhaDeMaterial,
  linhasParaGravar,
  materiaisSugeridos,
  totaisDosMateriais,
} from '../../utils/estoque';
import { procedimentoDoAtendimento } from '../../utils/evaluations';
import {
  deleteMateriaisDoAtendimento,
  getMateriaisDoAtendimento,
  saveMateriaisDoAtendimento,
  saveProdutoDeEstoque,
  subscribeToConsumosPadrao,
  subscribeToProdutosDeEstoque,
} from '../../services/databaseService';
import { SidePanel } from '../common/SidePanel';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { EditorDeMateriais } from './EditorDeMateriais';

interface MateriaisDoAtendimentoPanelProps {
  /** A visita. `null` = painel fechado. */
  atendimento: Attendance | null;
  onFechar: () => void;
  catalogo: Procedure[];
}

/**
 * Os materiais usados num atendimento, e o que custaram.
 *
 * Abre com o consumo padrão do procedimento (Estoque › Consumo por procedimento), com o preço de
 * hoje de cada produto, e tudo é ajustável: quantidade, valores, materiais a mais ou a menos. Ao
 * salvar, os preços ficam **congelados** no registro — o produto subir de preço amanhã não muda
 * o custo desta visita.
 */
export const MateriaisDoAtendimentoPanel: React.FC<MateriaisDoAtendimentoPanelProps> = ({
  atendimento,
  onFechar,
  catalogo,
}) => {
  const aberto = !!atendimento;
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[] | null>(null);
  const [consumos, setConsumos] = useState<ConsumoPadrao[] | null>(null);
  const [registro, setRegistro] = useState<MateriaisDoAtendimento | null>(null);
  /** O registro já foi buscado (ou não havia o que buscar). */
  const [registroPronto, setRegistroPronto] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDeMaterial[]>([]);
  /** As linhas já foram montadas nesta abertura — daqui em diante, são da profissional. */
  const [montadas, setMontadas] = useState(false);
  const [veioDoPadrao, setVeioDoPadrao] = useState(false);
  /** A lista foi mexida por botão (adicionar, remover, trocar produto) — o painel não vê isso. */
  const [mexida, setMexida] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * O registro existe mas não pôde ser lido. Nada de editar a partir do consumo padrão nesse
   * caso: salvar gravaria a lista sugerida por cima do que já estava registrado.
   */
  const [leituraFalhou, setLeituraFalhou] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const avisar = (e: Error) =>
      setErro(
        `Não foi possível carregar o estoque: ${e.message}. Se for erro de permissão, publique as regras novas do Firebase.`
      );
    const pararProdutos = subscribeToProdutosDeEstoque(setProdutos, avisar);
    const pararConsumos = subscribeToConsumosPadrao(setConsumos, avisar);
    return () => {
      pararProdutos();
      pararConsumos();
    };
  }, [aberto]);

  // Cada abertura recomeça do banco.
  useEffect(() => {
    if (!atendimento) return;
    let cancelado = false;
    setRegistro(null);
    setLinhas([]);
    setMontadas(false);
    setVeioDoPadrao(false);
    setMexida(false);
    setSalvando(false);
    setErro(null);
    setLeituraFalhou(false);

    // Sem a marca, não há registro: poupa a leitura e vai direto para o consumo padrão.
    if (!atendimento.materiaisRegistradosEm) {
      setRegistroPronto(true);
      return;
    }
    setRegistroPronto(false);
    getMateriaisDoAtendimento(atendimento.id)
      .then((existente) => {
        if (cancelado) return;
        setRegistro(existente);
        setRegistroPronto(true);
      })
      .catch((e) => {
        if (cancelado) return;
        setErro(
          `Não foi possível carregar os materiais registrados (${(e as Error).message.replace(/\.$/, '')}). Feche e tente de novo quando a conexão voltar.`
        );
        setLeituraFalhou(true);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendimento?.id]);

  // Monta as linhas uma vez: do registro gravado, ou do consumo padrão quando ainda não há.
  useEffect(() => {
    if (!atendimento || montadas || !registroPronto) return;
    if (registro) {
      setLinhas(registro.itens);
      setMontadas(true);
      return;
    }
    if (!produtos || !consumos) return; // o consumo padrão ainda não chegou
    const sugeridos = materiaisSugeridos(atendimento, consumos, produtos, catalogo);
    setLinhas(sugeridos);
    setVeioDoPadrao(sugeridos.length > 0);
    setMontadas(true);
  }, [atendimento, montadas, registroPronto, registro, produtos, consumos, catalogo]);

  if (!atendimento) return null;

  const carregando = !montadas && !erro;
  const totais = totaisDosMateriais(linhas);
  const procedimento = procedimentoDoAtendimento(atendimento, catalogo);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      // Material digitado à mão e marcado para o estoque vira produto antes, para a linha já
      // nascer apontando para ele.
      const comProdutos = await Promise.all(
        linhas.map(async (l) => {
          if (l.produtoId || !l.cadastrarNoEstoque || !l.nome.trim()) return l;
          const novo: ProdutoDeEstoque = {
            id: `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            nome: l.nome.trim(),
            unidade: (l.unidade || 'un').trim(),
            custoUnitario: l.custoUnitario,
            valorCliente: l.valorCliente,
            createdAt: new Date().toISOString(),
          };
          await saveProdutoDeEstoque(novo);
          return { ...l, produtoId: novo.id };
        })
      );
      const itens = linhasParaGravar(comProdutos);

      if (itens.length === 0) {
        if (registro) await deleteMateriaisDoAtendimento(atendimento.id);
        onFechar();
        return;
      }

      const soma = totaisDosMateriais(itens);
      const agora = new Date().toISOString();
      await saveMateriaisDoAtendimento({
        id: atendimento.id,
        atendimentoId: atendimento.id,
        pacienteId: atendimento.pacienteId,
        pacienteNome: atendimento.pacienteNome,
        procedureId: atendimento.procedureId,
        procedimentoNome: atendimento.procedimentoNome,
        data: atendimento.data,
        itens,
        custoTotal: soma.custo,
        valorClienteTotal: soma.valorCliente,
        createdAt: registro?.createdAt || agora,
      });
      onFechar();
    } catch (e) {
      setErro(`Não foi possível salvar: ${(e as Error).message}`);
      setSalvando(false);
    }
  };

  const pedirRemocao = () =>
    setConfirmacao({
      titulo: 'Apagar o registro de materiais?',
      mensagem: 'As linhas e o custo deste atendimento são apagados. O atendimento em si não muda.',
      textoConfirmar: 'Apagar',
      onConfirmar: async () => {
        try {
          await deleteMateriaisDoAtendimento(atendimento.id);
          onFechar();
        } catch (e) {
          setErro(`Não foi possível apagar: ${(e as Error).message}`);
        }
      },
    });

  const rodape = carregando || leituraFalhou ? null : (
    <div className="flex items-center justify-between gap-3">
      {registro ? (
        <button
          type="button"
          onClick={pedirRemocao}
          disabled={salvando}
          className="min-h-[44px] px-2 text-body font-semibold text-muted hover:text-danger transition-colors disabled:opacity-40"
        >
          Apagar registro
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onFechar}
          disabled={salvando}
          className="min-h-[44px] px-4 rounded-xl text-body-lg font-semibold text-ink-soft hover:bg-surface-2 transition-colors disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-ink text-white text-body-lg font-semibold disabled:opacity-40"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Salvar
        </button>
      </div>
    </div>
  );

  return (
    <SidePanel
      aberto={aberto}
      onFechar={onFechar}
      titulo="Materiais usados"
      sobretitulo={`${atendimento.pacienteNome} · ${atendimento.procedimentoNome} · ${formatDateOnly(atendimento.data)}`}
      bloqueado={salvando}
      alterado={mexida}
      rodape={rodape}
    >
      <div className="p-4 sm:p-6 space-y-5">
        {erro && (
          <div className="flex items-start gap-2 text-body text-danger bg-danger-bg border border-danger-line rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{erro}</span>
          </div>
        )}

        {leituraFalhou ? null : carregando ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {!registro && (
              <p className="flex items-start gap-2 text-body text-ink-soft bg-surface border border-line rounded-xl px-3 py-2.5">
                <Info className="w-4 h-4 shrink-0 mt-px text-brand" />
                <span>
                  {veioDoPadrao
                    ? `Preenchido com o consumo padrão de ${procedimento?.title || atendimento.procedimentoNome}. Ajuste o que foi diferente nesta sessão.`
                    : `Nenhum consumo padrão configurado para ${procedimento?.title || atendimento.procedimentoNome}. Adicione os materiais abaixo — ou configure o padrão em Estoque › Consumo por procedimento.`}
                </span>
              </p>
            )}

            <EditorDeMateriais
              idBase="materiais"
              itens={linhas}
              onChange={(novas) => {
                setLinhas(novas);
                setMexida(true);
              }}
              produtos={produtos || []}
              oferecerCadastro
            />

            {registro && totais.custo !== registro.custoTotal && (
              <p className="text-body text-muted">
                Ao salvar, o custo deste atendimento passa a ser o total acima.
              </p>
            )}
          </>
        )}
      </div>

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </SidePanel>
  );
};
