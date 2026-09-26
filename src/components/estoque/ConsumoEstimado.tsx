import React, { useEffect, useState } from 'react';
import { Info, Loader2, Receipt } from 'lucide-react';
import {
  ConsumoPadrao,
  EvaluationRecord,
  MaterialUsado,
  Procedure,
  ProdutoDeEstoque,
} from '../../types';
import { AlvoDaFicha } from '../../utils/fichasClinicas';
import { procedimentoDoAtendimento } from '../../utils/evaluations';
import { LinhaDeMaterial, linhasParaGravar, materiaisSugeridos } from '../../utils/estoque';
import {
  subscribeToConsumosPadrao,
  subscribeToProdutosDeEstoque,
} from '../../services/databaseService';
import { EditorDeMateriais } from './EditorDeMateriais';

/** O estado do "Consumo estimado de produto" de uma avaliação — o que o formulário lê para salvar. */
export interface ConsumoEstimado {
  /** Só a avaliação tem a seção; no acompanhamento o que conta é o "Uso de material?". */
  ativo: boolean;
  estimou: boolean;
  alternar: (marcado: boolean) => void;
  /** As linhas já estão na tela (do registro, ou do consumo padrão depois de marcar). */
  montadas: boolean;
  linhas: LinhaDeMaterial[];
  mudarLinhas: (linhas: LinhaDeMaterial[]) => void;
  produtos: ProdutoDeEstoque[];
  /** O estoque não carregou — as linhas já na tela continuam, a lista de produtos não. */
  avisoDoEstoque: string | null;
  veioDoPadrao: boolean;
  nomeDoProcedimento: string;
  /** Mexeu por botão — o painel só percebe digitação, não clique. */
  mexido: boolean;
  /** O que vai para `EvaluationRecord.consumoEstimado`. Vazio = nada a gravar (e o gravado sai). */
  paraGravar: () => MaterialUsado[];
}

/**
 * O consumo de produto que a profissional estima na avaliação, para o procedimento dela.
 *
 * Abre marcado quando a ficha já tem consumo gravado. Marcar sem linhas traz o consumo padrão do
 * procedimento, com o preço de hoje de cada produto — preço que vai para o registro sem aparecer
 * na tela, porque a avaliação é feita ao lado da paciente. Os valores aparecem no orçamento.
 *
 * `ativo` falso (o acompanhamento, ou o formulário fechado) não assina nada.
 */
export const useConsumoEstimado = (
  alvo: AlvoDaFicha,
  catalogo: Procedure[],
  ativo: boolean,
  /** O registro lido do banco; `undefined` enquanto a leitura não voltou. */
  registro: EvaluationRecord | null | undefined
): ConsumoEstimado => {
  const [produtos, setProdutos] = useState<ProdutoDeEstoque[] | null>(null);
  const [consumos, setConsumos] = useState<ConsumoPadrao[] | null>(null);
  const [avisoDoEstoque, setAvisoDoEstoque] = useState<string | null>(null);
  const [estimou, setEstimou] = useState(false);
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

  // Cada abertura recomeça do registro — sobras da ficha anterior não podem virar a desta.
  useEffect(() => {
    if (!ativo || registro === undefined) return;
    const gravado = registro?.consumoEstimado || [];
    setLinhas(gravado);
    setEstimou(gravado.length > 0);
    setMontadas(gravado.length > 0);
    setVeioDoPadrao(false);
    setMexido(false);
    // Só a identidade do registro: o alvo é recriado a cada render de quem abre o formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, alvo.registroId, registro]);

  // Marcado sem linhas: o consumo padrão do procedimento, assim que o estoque chegar. Se o estoque
  // não carregar, a lista abre vazia em vez de girar para sempre — dá para digitar um avulso.
  useEffect(() => {
    if (!ativo || !estimou || montadas) return;
    if ((!produtos || !consumos) && !avisoDoEstoque) return;
    const sugeridos = materiaisSugeridos(alvo, consumos || [], produtos || [], catalogo);
    setLinhas(sugeridos);
    setVeioDoPadrao(sugeridos.length > 0);
    setMontadas(true);
  }, [ativo, estimou, montadas, produtos, consumos, avisoDoEstoque, alvo, catalogo]);

  return {
    ativo,
    estimou,
    alternar: (marcado) => {
      setEstimou(marcado);
      setMexido(true);
    },
    montadas,
    linhas,
    mudarLinhas: (novas) => {
      setLinhas(novas);
      setMexido(true);
    },
    produtos: produtos || [],
    avisoDoEstoque,
    veioDoPadrao,
    nomeDoProcedimento: procedimentoDoAtendimento(alvo, catalogo)?.title || alvo.procedimentoNome,
    mexido,
    paraGravar: () => (estimou ? linhasParaGravar(linhas) : []),
  };
};

/**
 * O checkbox "Consumo estimado de produto" e, marcado, a lista — só produto e quantidade.
 *
 * Com alguma linha preenchida aparece o link que monta o orçamento a partir dela: a ficha é
 * salva, fecha, e o orçamento abre com a paciente, o procedimento e este consumo, já calculado.
 */
export const SecaoConsumoEstimado: React.FC<{
  consumo: ConsumoEstimado;
  /** Ausente = quem abriu a ficha não sabe abrir orçamento, e o link não aparece. */
  onMontarOrcamento?: () => void;
  desabilitado?: boolean;
}> = ({ consumo, onMontarOrcamento, desabilitado }) => {
  if (!consumo.ativo) return null;
  const temLinha = consumo.estimou && linhasParaGravar(consumo.linhas).length > 0;

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-line bg-surface cursor-pointer">
        <input
          type="checkbox"
          checked={consumo.estimou}
          onChange={(e) => consumo.alternar(e.target.checked)}
          className="w-4 h-4 accent-brand mt-0.5"
        />
        <span className="text-body text-ink">
          <span className="font-semibold">Consumo estimado de produto</span>
          <span className="block text-muted">
            Marque para estimar os produtos e as quantidades que {consumo.nomeDoProcedimento} vai
            usar — e montar o orçamento a partir disso.
          </span>
        </span>
      </label>

      {consumo.estimou && !consumo.montadas && (
        <div className="flex items-center justify-center py-6 text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {consumo.estimou && consumo.montadas && (
        <>
          {consumo.avisoDoEstoque && <p className="text-body text-danger">{consumo.avisoDoEstoque}</p>}
          {(consumo.veioDoPadrao || consumo.linhas.length === 0) && (
            <p className="flex items-start gap-2 text-body text-ink-soft bg-surface border border-line rounded-xl px-3 py-2.5">
              <Info className="w-4 h-4 shrink-0 mt-px text-brand" />
              <span>
                {consumo.veioDoPadrao
                  ? `Preenchido com o consumo padrão de ${consumo.nomeDoProcedimento}. Ajuste ao caso desta paciente.`
                  : 'Adicione os produtos e as quantidades estimadas para esta paciente.'}
              </span>
            </p>
          )}
          <EditorDeMateriais
            idBase="consumo-estimado"
            itens={consumo.linhas}
            onChange={consumo.mudarLinhas}
            produtos={consumo.produtos}
            mostrarValores={false}
            mostrarTotais={false}
          />

          {onMontarOrcamento && temLinha && (
            <button
              type="button"
              onClick={onMontarOrcamento}
              disabled={desabilitado}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-ok-line bg-ok-bg text-ok text-body-lg font-semibold hover:border-ok transition-colors disabled:opacity-40"
            >
              <Receipt className="w-4 h-4" />
              Pré-preencher orçamento com este consumo
            </button>
          )}
        </>
      )}
    </div>
  );
};
