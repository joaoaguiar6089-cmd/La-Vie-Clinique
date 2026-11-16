import React, { useRef, useState } from 'react';
import { Plus, Scan } from 'lucide-react';
import { AreaDoProcedimento, Procedure } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { precoDaArea, procedimentoTemMapa } from '../../utils/laserAreas';
import { EscolhaNaJanela, OpcaoDaLista, opcaoCombina } from '../common/JanelaDeEscolha';

interface ProcedureSearchAddProps {
  procedures: Procedure[];
  onAdd: (procedure: Procedure) => void;
  /** Acrescenta uma área de um procedimento vendido por área, achada pelo nome na busca. */
  onAddArea?: (procedure: Procedure, area: AreaDoProcedimento) => void;
  /**
   * Abre o mapa de um procedimento vendido por área. Quando presente, escolher um desses
   * procedimentos abre o mapa dele em vez de acrescentar uma linha.
   *
   * As áreas continuam encontráveis pelo nome: quem sabe o nome prefere digitar. O mapa é um
   * caminho a mais, para quem está com a paciente na frente escolhendo — os dois levam ao mesmo
   * item, e a área é idempotente justamente por isso.
   */
  onAbrirMapa?: (procedure: Procedure) => void;
  /** `id` das áreas já no orçamento — a contagem aparece na entrada do mapa. */
  areasNoOrcamento?: Set<string>;
  /**
   * O botão grande e preto, de largura toda, do orçamento — a ação principal da seção. Sem ele,
   * o botão pequeno do recibo.
   */
  grande?: boolean;
}

/** O que cada linha da janela faz — vai no `valor` da opção, em JSON. */
type Escolha = ['procedimento', string] | ['mapa', string] | ['area', string, string];

/**
 * Botão que abre a busca no catálogo para acrescentar um procedimento. Diferente do
 * ProcedureMultiSelect (que filtra), aqui cada clique adiciona um item novo — o
 * mesmo procedimento pode entrar duas vezes, por exemplo em regiões diferentes.
 *
 * A exceção é o procedimento vendido por área: escolher ele abre o mapa, e cada área entra uma
 * vez só (ver `addArea` em `useOrcamentoEmEdicao`) — "Axilas" duas vezes seria cobrar axilas duas
 * vezes.
 *
 * A busca abre na janela de escolha, no meio da tela (ver `JanelaDeEscolha`).
 */
export const ProcedureSearchAdd: React.FC<ProcedureSearchAddProps> = ({
  procedures,
  onAdd,
  onAddArea,
  onAbrirMapa,
  areasNoOrcamento,
  grande = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);

  const opcoesDaBusca = (busca: string): OpcaoDaLista[] => {
    const comBusca = !!busca.trim();
    const lista: OpcaoDaLista[] = [];
    procedures.forEach((p) => {
      const grupo = p.category || 'Sem categoria';
      const temMapa = procedimentoTemMapa(p);
      // Com busca, as áreas que casam com ela aparecem embaixo do procedimento, para entrar
      // direto; sem busca, o procedimento basta — é o mapa que lista as áreas. "laser axila"
      // acha a área: as palavras valem no nome dela e no do procedimento juntos.
      const areas =
        temMapa && comBusca
          ? (p.areasDoMapa || []).filter((a) => opcaoCombina({ rotulo: `${a.nome} ${p.title}`, grupo }, busca))
          : [];
      if (comBusca && !opcaoCombina({ rotulo: p.title, grupo }, busca) && areas.length === 0) return;

      if (onAbrirMapa && temMapa) {
        // Com cara própria: este não vira linha, abre o mapa.
        const noOrcamento = (p.areasDoMapa || []).filter((a) => areasNoOrcamento?.has(a.id)).length;
        lista.push({
          valor: JSON.stringify(['mapa', p.id] as Escolha),
          rotulo: p.title,
          detalhe: 'Selecionar áreas no mapa',
          lateral: noOrcamento > 0 ? `${noOrcamento} no orçamento` : undefined,
          grupo,
          icone: Scan,
        });
      } else {
        lista.push({
          valor: JSON.stringify(['procedimento', p.id] as Escolha),
          rotulo: p.title,
          lateral: formatBRL(p.promotionalPrice && p.promotionalPrice > 0 ? p.promotionalPrice : p.price),
          grupo,
          icone: Plus,
        });
      }

      if (onAddArea) areas.forEach((area) =>
        lista.push({
          valor: JSON.stringify(['area', p.id, area.id] as Escolha),
          rotulo: area.nome,
          detalhe: areasNoOrcamento?.has(area.id) ? 'Já no orçamento' : undefined,
          lateral: formatBRL(precoDaArea(area)),
          grupo,
          icone: Plus,
          recuo: true,
        })
      );
    });
    return lista;
  };

  const escolher = (o: OpcaoDaLista) => {
    const escolha = JSON.parse(o.valor) as Escolha;
    const proc = procedures.find((p) => p.id === escolha[1]);
    if (!proc) return;
    if (escolha[0] === 'mapa') onAbrirMapa?.(proc);
    else if (escolha[0] === 'area') {
      const area = (proc.areasDoMapa || []).find((a) => a.id === escolha[2]);
      if (area) onAddArea?.(proc, area);
    } else onAdd(proc);
  };

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
            ? 'w-full h-12 px-5 rounded-full bg-ink text-white text-[15px] font-semibold whitespace-nowrap hover:bg-black active:scale-[.99] transition-colors flex items-center justify-center gap-2'
            : 'px-3 py-1.5 bg-white/60 border border-white/80 text-ink text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5'
        }
      >
        <Plus className={grande ? 'w-[18px] h-[18px] shrink-0' : 'w-3.5 h-3.5'} />
        Adicionar procedimento
      </button>

      {isOpen && (
        <EscolhaNaJanela
          titulo="Adicionar procedimento"
          opcoes={opcoesDaBusca}
          onEscolher={escolher}
          onFechar={() => setIsOpen(false)}
          placeholderDaBusca="Buscar no catálogo…"
          vazio="Nenhum procedimento encontrado."
          origem={botaoRef}
        />
      )}
    </div>
  );
};
