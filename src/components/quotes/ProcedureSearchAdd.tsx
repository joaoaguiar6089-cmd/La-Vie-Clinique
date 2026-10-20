import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Scan } from 'lucide-react';
import { AreaDoProcedimento, Procedure } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { precoDaArea, procedimentoTemMapa } from '../../utils/laserAreas';

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
}

/** Um procedimento na busca e, quando o termo casa com elas, as áreas dele. */
interface EntradaDaBusca {
  proc: Procedure;
  areas: AreaDoProcedimento[];
}

/**
 * Botão que abre a busca no catálogo para acrescentar um procedimento. Diferente do
 * ProcedureMultiSelect (que filtra), aqui cada clique adiciona um item novo — o
 * mesmo procedimento pode entrar duas vezes, por exemplo em regiões diferentes.
 *
 * A exceção é o procedimento vendido por área: escolher ele abre o mapa, e cada área entra uma
 * vez só (ver `addArea` em `useOrcamentoEmEdicao`) — "Axilas" duas vezes seria cobrar axilas duas
 * vezes.
 */
export const ProcedureSearchAdd: React.FC<ProcedureSearchAddProps> = ({
  procedures,
  onAdd,
  onAddArea,
  onAbrirMapa,
  areasNoOrcamento,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const grouped = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const groups: Record<string, EntradaDaBusca[]> = {};
    procedures.forEach((p) => {
      const temMapa = procedimentoTemMapa(p);
      // Com busca, as áreas que casam com o termo aparecem embaixo do procedimento, para entrar
      // direto; sem busca, o procedimento basta — é o mapa que lista as áreas.
      const areas = temMapa && term
        ? (p.areasDoMapa || []).filter((a) => a.nome.toLowerCase().includes(term))
        : [];
      const casa =
        !term ||
        p.title.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        areas.length > 0;
      if (!casa) return;
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push({ proc: p, areas });
    });
    return groups;
  }, [procedures, searchTerm]);

  const fechar = () => {
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setSearchTerm('');
          setIsOpen((v) => !v);
        }}
        className="px-3 py-1.5 bg-white/60 border border-white/80 text-ink text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Adicionar procedimento
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-[min(380px,80vw)] bg-white rounded-sm border border-gray-200 shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar no catálogo..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xs bg-gray-50 border border-gray-200 text-xs text-ink focus:outline-hidden focus:border-brand"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {Object.keys(grouped).length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-5">
                Nenhum procedimento encontrado.
              </p>
            ) : (
              (Object.entries(grouped) as [string, EntradaDaBusca[]][]).map(([category, entradas]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 bg-gray-50 text-label font-semibold uppercase tracking-wider text-gray-400 sticky top-0">
                    {category}
                  </div>

                  {entradas.map(({ proc, areas }) => {
                    const abreMapa = !!onAbrirMapa && procedimentoTemMapa(proc);
                    const noOrcamento = abreMapa
                      ? (proc.areasDoMapa || []).filter((a) => areasNoOrcamento?.has(a.id)).length
                      : 0;
                    return (
                      <React.Fragment key={proc.id}>
                        {abreMapa ? (
                          /* Com cara própria: este não vira linha, abre o mapa. */
                          <button
                            type="button"
                            onClick={() => {
                              onAbrirMapa!(proc);
                              fechar();
                            }}
                            className="w-full text-left px-3 py-2.5 bg-[#FDF3F7] hover:bg-[#FBE7F0] border-b border-[#F3C6DC] transition-colors flex items-center justify-between gap-3"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-[#8E1A54] truncate">
                                {proc.title}
                              </span>
                              <span className="text-body text-[#8E1A54]/80 flex items-center gap-1">
                                <Scan className="w-3 h-3 shrink-0" />
                                Selecionar áreas no mapa
                              </span>
                            </span>
                            {noOrcamento > 0 && (
                              <span className="text-body text-[#8E1A54] shrink-0 tabular-nums">
                                {noOrcamento} no orçamento
                              </span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onAdd(proc);
                              fechar();
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-surface transition-colors flex items-center justify-between gap-3 group"
                          >
                            <span className="text-xs text-ink truncate flex items-center gap-1.5">
                              <Plus className="w-3 h-3 text-brand opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              {proc.title}
                            </span>
                            <span className="text-body text-gray-400 shrink-0 tabular-nums">
                              {formatBRL(
                                proc.promotionalPrice && proc.promotionalPrice > 0
                                  ? proc.promotionalPrice
                                  : proc.price
                              )}
                            </span>
                          </button>
                        )}

                        {onAddArea &&
                          areas.map((area) => (
                            <button
                              key={area.id}
                              type="button"
                              onClick={() => {
                                onAddArea(proc, area);
                                fechar();
                              }}
                              className="w-full text-left pl-7 pr-3 py-2 hover:bg-surface transition-colors flex items-center justify-between gap-3 group"
                            >
                              <span className="text-xs text-ink truncate flex items-center gap-1.5">
                                <Plus className="w-3 h-3 text-brand opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                {area.nome}
                                {areasNoOrcamento?.has(area.id) && (
                                  <span className="text-label text-ok">· no orçamento</span>
                                )}
                              </span>
                              <span className="text-body text-gray-400 shrink-0 tabular-nums">
                                {formatBRL(precoDaArea(area))}
                              </span>
                            </button>
                          ))}
                      </React.Fragment>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
