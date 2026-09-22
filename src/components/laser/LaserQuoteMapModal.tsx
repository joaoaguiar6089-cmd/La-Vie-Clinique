import React, { useMemo } from 'react';
import { X, Check } from 'lucide-react';
import { ClinicProfile, Procedure } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { montarEspelhoPublico, nomeCurtoDaArea } from '../../utils/laserAreas';
import { isLaserCategory } from '../../utils/templateMatching';
import { LaserAreaPicker } from './LaserAreaPicker';

/**
 * Escolha das áreas de laser durante a montagem de um orçamento.
 *
 * Fica **aberto** enquanto a profissional seleciona, com o total correndo no rodapé: a conta subir
 * a cada área é a razão de o mapa existir aqui, e fechar o modal a cada clique mataria isso. É um
 * controle vivo dos dois lados — marcar acrescenta o item à lista atrás, desmarcar o remove, e um
 * procedimento adicionado pela busca já chega aqui aceso.
 */

interface LaserQuoteMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  procedures: Procedure[];
  clinic: ClinicProfile;
  /** `procedureId` das áreas já no orçamento. */
  selecionadas: Set<string>;
  onToggle: (procedureId: string) => void;
}

export const LaserQuoteMapModal: React.FC<LaserQuoteMapModalProps> = ({
  isOpen,
  onClose,
  procedures,
  clinic,
  selecionadas,
  onToggle,
}) => {
  const mapa = useMemo(() => montarEspelhoPublico(procedures, clinic), [procedures, clinic]);

  /**
   * Preço de venda por área. Aqui ele aparece — ao contrário da ficha da paciente, onde o mesmo
   * componente roda sem preço nenhum.
   */
  const precos = useMemo(() => {
    const mapaDePrecos = new Map<string, number>();
    for (const p of procedures) {
      if (!isLaserCategory(p.category)) continue;
      mapaDePrecos.set(p.id, p.promotionalPrice && p.promotionalPrice > 0 ? p.promotionalPrice : p.price);
    }
    return mapaDePrecos;
  }, [procedures]);

  const escolhidas = useMemo(
    () =>
      procedures
        .filter((p) => selecionadas.has(p.id))
        .map((p) => ({ id: p.id, nome: nomeCurtoDaArea(p.title), preco: precos.get(p.id) || 0 })),
    [procedures, selecionadas, precos]
  );

  const soma = escolhidas.reduce((acc, a) => acc + a.preco, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-surface rounded-sm overflow-hidden shadow-2xl border border-white/60 flex flex-col">
        <div className="bg-ink text-line-soft px-5 py-3.5 flex items-center justify-between shrink-0">
          <div>
            <span className="text-label font-semibold uppercase tracking-widest text-brand-light">
              Depilação a Laser
            </span>
            <h3 className="font-serif-luxury text-lg font-medium text-white">
              Selecionar áreas no mapa
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <LaserAreaPicker
            mapa={mapa}
            selecionadas={selecionadas}
            onToggle={onToggle}
            precos={precos}
            alturaManequim={500}
            vazioMensagem="Nenhum procedimento de laser tem área desenhada no mapa. Desenhe as áreas no cadastro de procedimentos para usar esta tela."
          />
        </div>

        {/* Rodapé com a conta subindo — o motivo de o modal ficar aberto. */}
        <div className="shrink-0 border-t border-[rgba(26,26,26,.1)] bg-white px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="block text-label uppercase tracking-wider text-gray-400 font-semibold">
              {escolhidas.length === 0
                ? 'Nenhuma área'
                : `${escolhidas.length} ${escolhidas.length === 1 ? 'área' : 'áreas'}`}
            </span>
            <span className="block text-[12px] text-ink truncate">
              {escolhidas.map((a) => a.nome).join(', ') || 'Toque nas regiões do manequim'}
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <span className="block text-label uppercase tracking-wider text-gray-400 font-semibold">
                Soma das áreas
              </span>
              <span className="block text-[17px] font-semibold text-ink tabular-nums">
                {formatBRL(soma)}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-widest hover:bg-brand-hover active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
