import React, { useState } from 'react';
import {
  Settings,
  Syringe,
  ClipboardList,
  Share2,
  LogOut,
  Receipt,
  Menu,
  X,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { ClinicProfile, AppView } from '../types';

interface NavbarProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  clinic: ClinicProfile;
  proceduresCount: number;
  currentProfessionalName?: string;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  onOpenExport,
  onOpenSettings,
  clinic,
  proceduresCount,
  currentProfessionalName,
  onLogout,
}) => {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isTabletExpanded, setIsTabletExpanded] = useState(false);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const railItems = [
    {
      id: 'procedures' as const,
      label: 'Procedimentos',
      icon: Syringe,
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
      id: 'quotes' as const,
      label: 'Orçamentos',
      icon: Receipt,
      active: currentView === 'quotes',
      count: undefined,
      onClick: () => {
        onSelectView('quotes');
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
      {/* Mobile header com botão de menu lateral (<640px) */}
      <header className="sm:hidden sticky top-0 z-40 glass-nav">
        <div className="px-4 py-3 flex items-center justify-between gap-2.5">
          {/* Botão que abre a seção lateral + Logotipo */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="w-10 h-10 -ml-1 rounded-xl flex items-center justify-center text-[#1A1A1A] hover:bg-black/5 active:scale-95 transition-all focus:outline-none"
              title="Abrir menu de navegação"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-6 h-6" />
            </button>

            <button
              onClick={() => {
                onSelectView('procedures');
                scrollToTop();
              }}
              className="flex items-center gap-2.5 min-w-0 text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center text-[#C49B74] font-serif-luxury text-sm font-semibold shrink-0">
                LV
              </span>
              <div className="min-w-0">
                <span className="font-serif-luxury text-[17px] font-medium text-[#1A1A1A] leading-tight block truncate">
                  {clinic.name}
                </span>
                <span className="text-[11px] text-[#A67C52] font-semibold leading-none block truncate">
                  {currentView === 'procedures'
                    ? 'Procedimentos'
                    : currentView === 'anamnesis'
                    ? 'Fichas dos pacientes'
                    : 'Orçamentos'}
                </span>
              </div>
            </button>
          </div>

          {/* Ações rápidas no topo */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#1A1A1A] hover:bg-black/5 active:scale-95 transition-all"
              title="Configurações"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onLogout}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#1A1A1A] hover:bg-black/5 active:scale-95 transition-all"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Menu lateral expansível para Mobile (Drawer) */}
      {isMobileDrawerOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          {/* Backdrop escuro com desfoque */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fadeIn"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Painel lateral com nomes dos menus */}
          <aside className="relative w-[285px] max-w-[85vw] h-full bg-[#1A1A1A] text-[#F6EFE4] flex flex-col z-10 shadow-2xl p-5 animate-slideInLeft">
            {/* Cabeçalho do menu lateral */}
            <div className="flex items-center justify-between pb-5 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl border border-[rgba(232,205,172,.35)] bg-black/20 flex items-center justify-center text-[#C49B74] font-serif-luxury text-base font-semibold shrink-0">
                  LV
                </span>
                <div className="min-w-0">
                  <span className="font-serif-luxury text-lg font-medium text-[#F6EFE4] leading-tight block truncate">
                    {clinic.name}
                  </span>
                  <span className="text-[11px] text-[rgba(246,239,228,.6)] block truncate">
                    Menu Principal
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[rgba(246,239,228,.7)] hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista dos menus com nomes, ícones e contadores */}
            <nav className="flex-1 py-5 space-y-2 overflow-y-auto">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#A67C52] mb-2">
                Navegação
              </p>
              {railItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      item.onClick();
                      setIsMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center gap-3.5 h-[52px] px-3.5 rounded-xl text-left transition-all ${
                      item.active
                        ? 'bg-[rgba(232,205,172,.14)] text-[#F6EFE4] font-semibold border-l-2 border-[#C49B74]'
                        : 'text-[rgba(246,239,228,.75)] hover:bg-white/5 hover:text-[#F6EFE4] font-medium'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="text-[15px] truncate flex-1">{item.label}</span>
                    {item.count !== undefined && (
                      <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-[#C49B74]">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Rodapé do menu lateral com profissional conectada e saída */}
            <div className="pt-4 border-t border-white/10 space-y-2">
              {currentProfessionalName && (
                <div className="px-3.5 py-1">
                  <span className="text-[10px] uppercase tracking-wider text-[rgba(246,239,228,.5)] block font-medium">
                    Profissional Conectada
                  </span>
                  <p className="text-[13px] font-medium text-[#F6EFE4] truncate">
                    {currentProfessionalName}
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3.5 h-[44px] px-3.5 rounded-xl text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-colors"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span className="text-[14px] font-medium">Sair da conta</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Tablet icon rail (640–1023px) + Desktop sidebar (≥1024px) */}
      <aside
        className={`hidden sm:flex sm:flex-col sm:h-screen sm:sticky sm:top-0 sm:shrink-0 bg-[#1A1A1A] py-[26px] transition-all duration-300 ${
          isTabletExpanded
            ? 'sm:w-[268px] px-[18px]'
            : 'sm:w-[68px] lg:w-[268px] px-3 lg:px-[18px]'
        }`}
      >
        <div className="flex items-center justify-between mb-8 px-1">
          <button
            onClick={() => onSelectView('procedures')}
            className="flex items-center gap-3 min-w-0"
            title={clinic.name}
          >
            <span className="w-[42px] h-[42px] rounded-xl border border-[rgba(232,205,172,.35)] bg-black/20 flex items-center justify-center text-[#C49B74] font-serif-luxury text-lg font-semibold shrink-0">
              LV
            </span>
            <span
              className={`font-serif-luxury text-[21px] font-medium text-[#F6EFE4] leading-tight text-left truncate ${
                isTabletExpanded ? 'block' : 'hidden lg:block'
              }`}
            >
              La Vie
              <br />
              Clinique
            </span>
          </button>

          {/* Botão para expandir/recolher menu lateral no tablet com nomes */}
          <button
            onClick={() => setIsTabletExpanded((prev) => !prev)}
            className="hidden sm:flex lg:hidden w-8 h-8 rounded-lg items-center justify-center text-[rgba(246,239,228,.7)] hover:bg-white/10 hover:text-white transition-colors"
            title={isTabletExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral com nomes'}
            aria-label={isTabletExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral com nomes'}
          >
            {isTabletExpanded ? (
              <PanelLeftClose className="w-5 h-5" />
            ) : (
              <PanelLeftOpen className="w-5 h-5" />
            )}
          </button>
        </div>

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
                <span
                  className={`text-[16px] font-medium truncate ${
                    isTabletExpanded ? 'inline' : 'hidden lg:inline'
                  }`}
                >
                  {item.label}
                </span>
                {item.count !== undefined && (
                  <span
                    className={`ml-auto text-[13px] font-semibold text-[#C49B74] ${
                      isTabletExpanded ? 'inline' : 'hidden lg:inline'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Perfil da profissional logada + sair */}
        <div className="pt-3 mt-2 border-t border-white/10 space-y-1.5">
          {currentProfessionalName && (
            <p
              className={`px-3 text-[12px] font-medium text-[rgba(246,239,228,.6)] truncate ${
                isTabletExpanded ? 'block' : 'hidden lg:block'
              }`}
            >
              {currentProfessionalName}
            </p>
          )}
          <button
            onClick={onLogout}
            title="Sair"
            className="w-full flex items-center gap-3 h-[42px] px-3 rounded-xl text-[rgba(246,239,228,.7)] hover:bg-white/5 hover:text-[#F6EFE4] transition-colors"
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span
              className={`text-[14px] font-medium ${
                isTabletExpanded ? 'inline' : 'hidden lg:inline'
              }`}
            >
              Sair
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
