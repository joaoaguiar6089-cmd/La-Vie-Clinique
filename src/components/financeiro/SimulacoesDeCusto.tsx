import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calculator, ChevronRight, Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ClinicProfile,
  ConsumoPadrao,
  Patient,
  Procedure,
  ProdutoDeEstoque,
  SimulacaoDeCusto,
} from '../../types';
import { formatBRL } from '../../utils/formatters';
import { chaveDeNome } from '../../utils/templateMatching';
import { resumoDosProcedimentos, simulacoesVisiveis } from '../../utils/simulacaoDeCusto';
import {
  deleteSimulacaoDeCusto,
  subscribeToConsumosPadrao,
  subscribeToProdutosDeEstoque,
  subscribeToSimulacoesDeCusto,
} from '../../services/databaseService';
import { dataCurta } from '../documentos/estiloA4';
import { SkeletonLista } from '../common/Skeleton';
import { AvisoTinta, BotaoPilula, CampoDeBusca, MenuDeAcoes, TituloDaTela } from '../common/Tinta';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { PedidoDeSimulacao, SimulacaoFormPanel } from './SimulacaoFormPanel';
import { SimulacaoPreviewModal } from './SimulacaoPreviewModal';

interface SimulacoesDeCustoProps {
  catalogProcedures: Procedure[];
  pacientes: Patient[];
  clinic: ClinicProfile;
  /** Quem está logada. Sem login reconhecido não há de quem mostrar nem em nome de quem gravar. */
  autor: { uid: string; nome: string } | null;
  /** A administradora vê as simulações de todas; a profissional, só as dela. */
  ehAdmin: boolean;
}

/**
 * A aba "Simulação de custo" do Financeiro: a lista das simulações, o formulário e o PDF.
 *
 * É a única parte do Financeiro aberta a toda a equipe — faturamento e margem continuam só das
 * administradoras. Cada profissional vê só as simulações que criou; a administradora vê as de
 * todas, com o nome de quem fez.
 */
export const SimulacoesDeCusto: React.FC<SimulacoesDeCustoProps> = ({
  catalogProcedures,
  pacientes,
  clinic,
  autor,
  ehAdmin,
}) => {
  const [simulacoes, setSimulacoes] = useState<SimulacaoDeCusto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[]>([]);
  const [consumos, setConsumos] = useState<ConsumoPadrao[]>([]);
  const [busca, setBusca] = useState('');
  const [pedido, setPedido] = useState<PedidoDeSimulacao | null>(null);
  const [previaId, setPreviaId] = useState<string | null>(null);
  /** A recém-salva, para a prévia abrir antes de a lista receber a versão do banco. */
  const [recemSalva, setRecemSalva] = useState<SimulacaoDeCusto | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  const uid = autor?.uid;

  useEffect(() => {
    if (!uid) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(null);
    return subscribeToSimulacoesDeCusto(
      { uid, todas: ehAdmin },
      (dados) => {
        setSimulacoes(dados);
        setCarregando(false);
      },
      (e) => {
        setCarregando(false);
        setErro(
          `Não foi possível carregar as simulações: ${e.message}. Se for erro de permissão, publique ` +
            'as regras novas do Firebase.'
        );
      }
    );
  }, [uid, ehAdmin]);

  // O estoque, para os materiais: o consumo padrão e a lista de produtos do formulário.
  useEffect(() => {
    const pararProdutos = subscribeToProdutosDeEstoque(setProdutos);
    const pararConsumos = subscribeToConsumosPadrao(setConsumos);
    return () => {
      pararProdutos();
      pararConsumos();
    };
  }, []);

  const visiveis = useMemo(() => simulacoesVisiveis(simulacoes, uid, ehAdmin), [simulacoes, uid, ehAdmin]);
  const filtradas = useMemo(() => {
    const termo = chaveDeNome(busca);
    if (!termo) return visiveis;
    return visiveis.filter((s) =>
      chaveDeNome([s.pacienteNome, resumoDosProcedimentos(s), s.criadoPorNome].filter(Boolean).join(' ')).includes(termo)
    );
  }, [visiveis, busca]);

  const previa = previaId
    ? visiveis.find((s) => s.id === previaId) || (recemSalva?.id === previaId ? recemSalva : null)
    : null;

  const pedirExclusao = (s: SimulacaoDeCusto) =>
    setConfirmacao({
      titulo: 'Excluir a simulação?',
      mensagem: `A simulação ${s.pacienteNome ? `de ${s.pacienteNome} ` : ''}de ${dataCurta(
        s.createdAt
      )} é apagada. O PDF que já foi baixado continua existindo.`,
      textoConfirmar: 'Excluir simulação',
      tom: 'perigo',
      onConfirmar: async () => {
        try {
          await deleteSimulacaoDeCusto(s.id);
          setPreviaId((atual) => (atual === s.id ? null : atual));
        } catch (e) {
          setConfirmacao(aviso('Não foi possível excluir a simulação', (e as Error).message, 'perigo'));
        }
      },
    });

  const novaSimulacao = () => setPedido({});

  return (
    <div className="flex flex-col gap-4">
      <TituloDaTela
        sobre="Financeiro"
        titulo="Simulação de custo"
        sub="O custo dos materiais de um ou mais procedimentos, com PDF."
        acao={
          autor ? (
            <BotaoPilula icone={Plus} onClick={novaSimulacao}>
              <span className="hidden sm:inline">Nova simulação</span>
              <span className="sm:hidden">Nova</span>
            </BotaoPilula>
          ) : undefined
        }
      />

      {!autor && (
        <AvisoTinta tom="alerta" icone={AlertCircle}>
          Não foi possível identificar o seu login. Entre de novo para ver e criar simulações.
        </AvisoTinta>
      )}

      {erro && (
        <AvisoTinta tom="erro" icone={AlertCircle}>
          {erro}
        </AvisoTinta>
      )}

      {visiveis.length > 5 && (
        <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Buscar por cliente ou procedimento" />
      )}

      {carregando ? (
        <SkeletonLista linhas={3} />
      ) : visiveis.length === 0 ? (
        autor &&
        !erro && (
          <div className="rounded-[20px] bg-card border border-ink/8 p-6 text-center flex flex-col items-center gap-3">
            <Calculator className="w-8 h-8 text-ink-soft" />
            <div>
              <p className="text-body-lg font-semibold text-ink">Nenhuma simulação ainda</p>
              <p className="text-body text-ink-soft mt-1 max-w-sm">
                Escolha os procedimentos e os materiais de cada um para saber quanto eles custam. Do
                catálogo, os materiais já vêm pelo consumo padrão do Estoque.
              </p>
            </div>
            <BotaoPilula icone={Plus} onClick={novaSimulacao}>
              Nova simulação
            </BotaoPilula>
          </div>
        )
      ) : filtradas.length === 0 ? (
        <p className="text-body text-ink-soft">Nenhuma simulação encontrada para “{busca}”.</p>
      ) : (
        <ul className="rounded-[20px] bg-card border border-ink/8 divide-y divide-ink/8 overflow-hidden">
          {filtradas.map((s) => {
            const deOutra = ehAdmin && s.criadoPorUid !== uid;
            return (
              <li key={s.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => setPreviaId(s.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left hover:bg-surface transition-colors"
                >
                  <span className="w-12 shrink-0 text-body font-bold text-ink tabular-nums">
                    {dataCurta(s.createdAt).slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-body-lg font-semibold truncate ${
                        s.pacienteNome ? 'text-ink' : 'text-ink-soft'
                      }`}
                    >
                      {s.pacienteNome || 'Sem cliente'}
                    </span>
                    {/* A autora vem antes: no celular a linha corta no fim, e para a admin é
                        justamente o nome dela que diferencia uma simulação da outra. */}
                    <span className="block text-body text-ink-soft truncate">
                      {[deOutra ? `por ${s.criadoPorNome}` : null, resumoDosProcedimentos(s)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-body-lg font-bold text-ink tabular-nums">{formatBRL(s.custoTotal)}</span>
                    <span className="block text-label text-muted">custo</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink-soft shrink-0" />
                </button>
                <MenuDeAcoes
                  rotulo="Mais ações da simulação"
                  titulo={s.pacienteNome || resumoDosProcedimentos(s)}
                  tom="discreto"
                  acoes={[
                    { rotulo: 'Ver PDF', icone: FileText, onClick: () => setPreviaId(s.id) },
                    { rotulo: 'Editar', icone: Pencil, onClick: () => setPedido({ simulacao: s }) },
                    {
                      rotulo: 'Duplicar',
                      icone: Copy,
                      descricao: 'Uma simulação nova, com a mesma cliente e os mesmos materiais',
                      onClick: () => setPedido({ copiaDe: s }),
                    },
                    { rotulo: 'Excluir', icone: Trash2, tom: 'perigo', onClick: () => pedirExclusao(s) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      {autor && (
        <SimulacaoFormPanel
          pedido={pedido}
          onFechar={() => setPedido(null)}
          onSalva={(salva) => {
            // Salva, o passo seguinte costuma ser o PDF: a prévia abre com o "Baixar".
            setRecemSalva(salva);
            setPreviaId(salva.id);
          }}
          pacientes={pacientes}
          catalogo={catalogProcedures}
          produtos={produtos}
          consumos={consumos}
          autor={autor}
        />
      )}

      <SimulacaoPreviewModal
        simulacao={previa}
        clinic={clinic}
        onClose={() => setPreviaId(null)}
        onEditar={(s) => {
          setPreviaId(null);
          setPedido({ simulacao: s });
        }}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
