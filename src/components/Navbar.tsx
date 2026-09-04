import React from 'react';
import { Settings, ListOrdered, ClipboardList, Share2 } from 'lucide-react';
import { ClinicProfile } from '../types';

interface NavbarProps {
  currentView: 'procedures' | 'anamnesis';
  onSelectView: (view: 'procedures' | 'anamnesis') => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  clinic: ClinicProfile;
  proceduresCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  onOpenExport,
  onOpenSettings,
  clinic,
  proceduresCount,
}) => {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const railItems = [
    {
      id: 'procedures' as const,
      label: 'Procedimentos',
      icon: ListOrdered,
      active: currentView === 'procedures',
      count: proceduresCount,
      onClick: () => {
        onSelectView('procedures');
        scrollToTop();
      },
    },
    {
      id: 'anamnesis' as const,
      label: 'Fichas dos pacientes',
      icon: ClipboardList,
      active: currentView === 'anamnesis',
      count: undefined,
      onClick: () => {
        onSelectView('anamnesis');
        scrollToTop();
      },
    },
    {
      id: 'export' as const,
      label: 'Exportar catálogo',
      icon: Share2,
      active: false,
      count: undefined,
      onClick: onOpenExport,
    },
    {
      id: 'settings' as const,
      label: 'Configurações',
      icon: Settings,
      active: false,
      count: undefined,
      onClick: onOpenSettings,
    },
  ];

  return (
    <>
      {/* Mobile header + text nav (<640px) */}
      <header className="sm:hidden sticky top-0 z-40 glass-nav">
        <div className="px-5 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onSelectView('procedures');
              scrollToTop();
            }}
            className="flex items-center gap-3 min-w-0"
          >
            <span className="w-[38px] h-[38px] rounded-[10px] bg-[#1A1A1A] flex items-center justify-center text-[#C49B74] font-serif-luxury text-base font-semibold shrink-0">
              LV
            </span>
            <span className="font-serif-luxury text-[22px] font-medium text-[#1A1A1A] leading-none truncate">
              {clinic.name}
            </span>
          </button>
          <button
            onClick={onOpenSettings}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[#1A1A1A] hover:bg-white/60 active:scale-95 transition-all shrink-0"
            title="Configurações"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
        <nav className="px-5 flex items-center gap-6 border-t border-[rgba(26,26,26,.07)]">
          <button
            onClick={() => onSelectView('procedures')}
            className={`py-3 text-[16px] transition-colors ${
              currentView === 'procedures'
                ? 'font-semibold text-[#1A1A1A]'
                : 'font-medium text-[#8a8578] hover:text-[#1A1A1A]'
            }`}
            style={
              currentView === 'procedures'
                ? { boxShadow: 'inset 0 -2px 0 #A67C52' }
                : undefined
            }
          >
            Procedimentos
          </button>
          <button
            onClick={() => onSelectView('anamnesis')}
            className={`py-3 text-[16px] transition-colors ${
              currentView === 'anamnesis'
                ? 'font-semibold text-[#1A1A1A]'
                : 'font-medium text-[#8a8578] hover:text-[#1A1A1A]'
            }`}
            style={
              currentView === 'anamnesis'
                ? { boxShadow: 'inset 0 -2px 0 #A67C52' }
                : undefined
            }
          >
            Fichas dos pacientes
          </button>
        </nav>
      </header>

      {/* Tablet icon rail (640–1023px) + Desktop sidebar (≥1024px) */}
      <aside className="hidden sm:flex sm:flex-col sm:w-[68px] lg:w-[268px] sm:h-screen sm:sticky sm:top-0 sm:shrink-0 bg-[#1A1A1A] px-3 lg:px-[18px] py-[26px]">
        <button
          onClick={() => onSelectView('procedures')}
          className="flex items-center gap-3 mb-8 px-1"
        >
          <span className="w-[42px] h-[42px] rounded-xl border border-[rgba(232,205,172,.35)] bg-black/20 flex items-center justify-center text-[#C49B74] font-serif-luxury text-lg font-semibold shrink-0">
            LV
          </span>
          <span className="hidden lg:block font-serif-luxury text-[21px] font-medium text-[#F6EFE4] leading-tight text-left">
            La Vie
            <br />
            Clinique
          </span>
        </button>

        <nav className="flex-1 flex flex-col gap-1.5">
          {railItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                title={item.label}
                className={`flex items-center gap-3 h-[50px] px-3 rounded-xl transition-colors ${
                  item.active
                    ? 'bg-[rgba(232,205,172,.14)] text-[#F6EFE4]'
                    : 'text-[rgba(246,239,228,.7)] hover:bg-white/5 hover:text-[#F6EFE4]'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="hidden lg:inline text-[16px] font-medium truncate">
                  {item.label}
                </span>
                {item.count !== undefined && (
                  <span className="hidden lg:inline ml-auto text-[13px] font-semibold text-[#C49B74]">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Reservado para o perfil do profissional quando existir login */}
        <div className="h-2" />
      </aside>
    </>
  );
};
