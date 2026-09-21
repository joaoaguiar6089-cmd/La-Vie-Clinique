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
 * A navegação entre as seções de um módulo — a barra que a anamnese e a avaliação compartilham.
 *
 * Mora num componente só porque o requisito é que as duas telas sejam **reconhecíveis uma na
 * outra**: a equipe usa o app em pé, durante o atendimento, e pagar um instante para reparar que
 * "esta tela é parecida mas não igual" é exatamente o custo que a unificação evita. Duas cópias
 * do mesmo JSX divergem no primeiro ajuste que alguém fizer só de um lado.
 *
 * Linha horizontal **sempre**, inclusive no celular. A versão anterior da anamnese empilhava na
 * vertical abaixo de `lg`, e fazia sentido enquanto eram três rótulos longos; com dois rótulos
 * curtos, empilhar só gastava uma faixa de tela. O que o empilhamento dava de bom — o dedo
 * acertar o alvo — fica preservado no `py-3.5`, que é maior que o da barra que a avaliação usava.
 */
export function ModuleTabs<T extends string>({ tabs, active, onSelect }: ModuleTabsProps<T>) {
  return (
    // `overflow-x-auto` é rede de segurança: um rótulo longo demais rola em vez de espremer os
    // outros ou vazar da tela.
    <div
      role="tablist"
      className="flex items-center gap-1 border-b border-[rgba(26,26,26,.07)] overflow-x-auto"
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
            className={`flex items-center gap-2 shrink-0 whitespace-nowrap px-4 py-3.5 text-[14px] font-semibold border-b-2 -mb-px transition-colors ${
              ativa
                ? 'border-[#A67C52] text-[#1A1A1A]'
                : 'border-transparent text-[#8a8578] hover:text-[#1A1A1A]'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${
                  ativa ? 'bg-[#A67C52] text-white' : 'bg-gray-100 text-[#8a8578]'
                }`}
                style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
