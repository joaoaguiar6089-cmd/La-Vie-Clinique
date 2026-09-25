import React, { useEffect, useState } from 'react';
import { AlertCircle, Info, Loader2 } from 'lucide-react';
import { ConsumoPadrao, MateriaisDoAtendimento, Procedure, ProdutoDeEstoque } from '../../types';
import { AlvoDaFicha } from '../../utils/fichasClinicas';
import { procedimentoDoAtendimento } from '../../utils/evaluations';
import {
  LinhaDeMaterial,
  PlanoDosMateriais,
  materiaisSugeridos,
  planoDosMateriais,
} from '../../utils/estoque';
import {
  getMateriaisDoAtendimento,
  subscribeToConsumosPadrao,
  subscribeToProdutosDeEstoque,
} from '../../services/databaseService';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { EditorDeMateriais } from './EditorDeMateriais';

/** O estado do "Uso de material?" de um acompanhamento — o que o formulário lê para salvar. */
export interface UsoDeMaterial {
  /** Acompanhamento de um atendimento: há de onde tirar e onde gravar os materiais. */
  ativo: boolean;
  /** O registro gravado ainda está sendo lido. */
  carregando: boolean;
  /** O registro existe mas não pôde ser lido: nada muda nele ao salvar. */
  erro: string | null;
  /** O estoque não carregou — as linhas gravadas continuam, a lista de produtos não. */
  avisoDoEstoque: string | null;
  usou: boolean;
  alternar: (marcado: boolean) => void;
  /** As linhas já estão na tela (do registro, ou do consumo padrão depois de marcar). */
  montadas: boolean;
  linhas: LinhaDeMaterial[];
  mudarLinhas: (linhas: LinhaDeMaterial[]) => void;
  produtos: ProdutoDeEstoque[];
  /** O registro gravado quando o formulário abriu. */
  registro: MateriaisDoAtendimento | null;
  veioDoPadrao: boolean;
  nomeDoProcedimento: string;
  /** Mexeu por botão — o painel só percebe digitação, não clique. */
  mexido: boolean;
  plano: () => PlanoDosMateriais;
}

/**
 * Os materiais usados no atendimento, dentro do acompanhamento.
 *
 * Abre desmarcado quando não há registro; marcar traz o consumo padrão do procedimento com o
 * preço de hoje de cada produto — preço que vai para o registro sem aparecer na tela, porque o
 * formulário é preenchido ao lado da paciente. Os valores ficam no Financeiro.
 *
 * `ativo` falso (a avaliação, ou o formulário fechado) não assina nem lê nada.
 */
export const useUsoDeMaterial = (
  alvo: AlvoDaFicha,
  catalogo: Procedure[],
  aberto: boolean
): UsoDeMaterial => {
  const ativo = aberto && !!alvo.atendimentoId;
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[] | null>(null);
  const [consumos, setConsumos] = useState<ConsumoPadrao[] | null>(null);
  const [avisoDoEstoque, setAvisoDoEstoque] = useState<string | null>(null);
  const [registro, setRegistro] = useState<MateriaisDoAtendimento | null>(null);
  /** O registro foi lido, ou se sabia que não havia o que ler. */
  const [lido, setLido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [usou, setUsou] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDeMaterial[]>([]);
  const [montadas, setMontadas] = useState(false);
  const [veioDoPadrao, setVeioDoPadrao] = useState(false);
  const [mexido, setMexido] = useState(false);

  // Assinaturas compartilhadas: abrir de novo não custa leitura.
  useEffect(() => {
    if (!ativo) return;
    const avisar = (e: Error) =>
      setAvisoDoEstoque(`Não foi possível carregar os produtos do estoque (${e.message}).`);
    const pararProdutos = subscribeToProdutosDeEstoque(setProdutos, avisar);
    const pararConsumos = subscribeToConsumosPadrao(setConsumos, avisar);
    return () => {
      pararProdutos();
      pararConsumos();
    };
  }, [ativo]);

  // Cada abertura recomeça do banco.
  useEffect(() => {
    if (!ativo || !alvo.atendimentoId) return;
    let cancelado = false;
    setRegistro(null);
    setLido(false);
    setErro(null);
    setUsou(false);
    setLinhas([]);
    setMontadas(false);
    setVeioDoPadrao(false);
    setMexido(false);

    // O atendimento diz que não há materiais: poupa a leitura.
    if (alvo.materiaisRegistrados === false) {
      setLido(true);
      return;
    }
    getMateriaisDoAtendimento(alvo.atendimentoId)
      .then((existente) => {
        if (cancelado) return;
        setRegistro(existente);
        if (existente) {
          setLinhas(existente.itens);
          setUsou(true);
          setMontadas(true);
        }
        setLido(true);
      })
      .catch((e) => {
        if (cancelado) return;
        setErro(
          `Não foi possível carregar os materiais registrados (${(e as Error).message.replace(/\.$/, '')}). ` +
            'Eles continuam como estavam — feche e abra de novo para mexer neles.'
        );
      });
    return () => {
      cancelado = true;
    };
    // Só a identidade do atendimento: o alvo é recriado a cada render de quem abre o formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, alvo.atendimentoId]);

  // Marcado sem registro: as linhas do consumo padrão, assim que o estoque chegar.
  useEffect(() => {
    if (!ativo || !usou || montadas || !lido || !produtos || !consumos) return;
    const sugeridos = materiaisSugeridos(alvo, consumos, produtos, catalogo);
    setLinhas(sugeridos);
    setVeioDoPadrao(sugeridos.length > 0);
    setMontadas(true);
  }, [ativo, usou, montadas, lido, produtos, consumos, alvo, catalogo]);

  return {
    ativo,
    carregando: ativo && !lido && !erro,
    erro,
    avisoDoEstoque,
    usou,
    alternar: (marcado) => {
      setUsou(marcado);
      setMexido(true);
    },
    montadas,
    linhas,
    mudarLinhas: (novas) => {
      setLinhas(novas);
      setMexido(true);
    },
    produtos: produtos || [],
    registro,
    veioDoPadrao,
    nomeDoProcedimento: procedimentoDoAtendimento(alvo, catalogo)?.title || alvo.procedimentoNome,
    mexido,
    plano: () => planoDosMateriais({ usou, linhas, existia: !!registro, pronto: lido }),
  };
};

/**
 * O checkbox "Uso de material?" e, marcado, a lista de materiais — só material e quantidade.
 *
 * Material fora do estoque entra com nome, unidade e quantidade; o valor dele é completado depois
 * no Financeiro, que mostra "falta valor" até lá.
 */
export const SecaoUsoDeMaterial: React.FC<{ uso: UsoDeMaterial }> = ({ uso }) => {
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  if (!uso.ativo) return null;

  const alternar = (marcado: boolean) => {
    // Desmarcar apaga o que está gravado ao salvar — e o custo sai do Financeiro junto.
    if (!marcado && uso.registro) {
      setConfirmacao({
        titulo: 'Tirar os materiais deste atendimento?',
        mensagem:
          'Ao salvar, os materiais registrados são apagados e o custo deles sai do Financeiro.',
        textoConfirmar: 'Tirar',
        onConfirmar: () => uso.alternar(false),
      });
      return;
    }
    uso.alternar(marcado);
  };

  return (
    <div className="space-y-3">
      <label
        className={`flex items-start gap-2.5 p-3.5 rounded-xl border border-line bg-surface ${
          uso.carregando || uso.erro ? 'opacity-60' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          checked={uso.usou}
          disabled={uso.carregando || !!uso.erro}
          onChange={(e) => alternar(e.target.checked)}
          className="w-4 h-4 accent-brand mt-0.5"
        />
        <span className="text-body text-ink">
          <span className="font-semibold">Uso de material?</span>
          <span className="block text-muted">
            Marque para anotar os materiais e as quantidades desta sessão.
          </span>
        </span>
        {uso.carregando && <Loader2 className="w-4 h-4 animate-spin text-muted ml-auto shrink-0" />}
      </label>

      {uso.erro && (
        <div className="flex items-start gap-2 text-body text-danger bg-danger-bg border border-danger-line rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{uso.erro}</span>
        </div>
      )}

      {uso.usou &&
        !uso.erro &&
        (!uso.montadas ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {uso.avisoDoEstoque && (
              <p className="text-body text-danger">{uso.avisoDoEstoque}</p>
            )}
            {!uso.registro && (
              <p className="flex items-start gap-2 text-body text-ink-soft bg-surface border border-line rounded-xl px-3 py-2.5">
                <Info className="w-4 h-4 shrink-0 mt-px text-brand" />
                <span>
                  {uso.veioDoPadrao
                    ? `Preenchido com o consumo padrão de ${uso.nomeDoProcedimento}. Ajuste o que foi diferente nesta sessão.`
                    : `Nenhum consumo padrão configurado para ${uso.nomeDoProcedimento}. Adicione os materiais abaixo — ou configure o padrão em Estoque › Consumo por procedimento.`}
                </span>
              </p>
            )}
            <EditorDeMateriais
              idBase="uso-material"
              itens={uso.linhas}
              onChange={uso.mudarLinhas}
              produtos={uso.produtos}
              mostrarValores={false}
              mostrarTotais={false}
            />
          </>
        ))}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
