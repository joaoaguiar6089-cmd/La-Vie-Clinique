import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ModuleTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Zero não é escondido aqui: numa aba de conteúdo, "0" é informação, não ruído. */
  count?: number;
}

interface ModuleTabsProps<T extends string> {
  tabs: ModuleTab<T>[];
  active: T;
  onSelect: (id: T) => void;
}

/**
 * A troca de vista dentro de um módulo — "Preenchidas · Fichas-modelo" na anamnese, na avaliação
 * e no acompanhamento.
 *
 * Mora num componente só porque o requisito é que as telas sejam **reconhecíveis umas nas
 * outras**: a equipe usa o app em pé, durante o atendimento, e pagar um instante para reparar que
 * "esta tela é parecida mas não igual" é exatamente o custo que a unificação evita.
 *
 * No redesign ela virou controle segmentado. As abas sublinhadas do topo escolhem **qual ficha**
 * (anamnese, avaliação, acompanhamento); isto aqui escolhe **o que ver dela** — e dois controles
 * iguais empilhados não diriam qual é qual.
 */
export function ModuleTabs<T extends string>({ tabs, active, onSelect }: ModuleTabsProps<T>) {
  return (
    // `overflow-x-auto` é rede de segurança: um rótulo longo demais rola em vez de espremer os
    // outros ou vazar da tela.
    <div
      role="tablist"
      className="inline-flex max-w-full gap-1 p-1 rounded-xl bg-line-soft overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const ativa = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => onSelect(tab.id)}
            className={`flex items-center gap-2 shrink-0 whitespace-nowrap h-9 px-3.5 rounded-[9px] text-[13px] font-semibold transition-colors ${
              ativa
                ? 'bg-card text-ink shadow-[0_1px_2px_rgba(26,26,26,.08)]'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`tabular-nums ${ativa ? 'text-ink-soft' : 'text-muted'}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
