import React, { useState, useEffect } from 'react';
import {
  Settings,
  Syringe,
  ClipboardList,
  ClipboardCheck,
  Share2,
  LogOut,
  Receipt,
  Users,
  Menu,
  X,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { ClinicProfile, AppView } from '../types';
import { ClinicLogo } from './ClinicLogo';

/** Nome da tela atual, exibido sob o nome da clínica no cabeçalho mobile. */
const VIEW_LABEL: Record<AppView, string> = {
  procedures: 'Procedimentos',
  patients: 'Pacientes',
  anamnesis: 'Anamneses',
  evaluations: 'Fichas de Avaliação',
  quotes: 'Orçamentos',
};

interface NavbarProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  clinic: ClinicProfile;
  proceduresCount: number;
  /**
   * Atendimentos que já aconteceram e ainda não foram avaliados. É o único contador do menu além
   * do catálogo, e existe porque é trabalho represado: a ficha de avaliação só pode ser escrita
   * depois da visita, então ninguém a preenche sem ser lembrado de que ela está aberta.
   */
  avaliacoesPendentesCount?: number;
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
  avaliacoesPendentesCount,
  currentProfessionalName,
  onLogout,
}) => {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  
  // No desktop (>= 1024px) inicia expandido; no tablet (640–1023px) inicia recolhido como trilho de ícones
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  // Ajusta automaticamente quando a largura da tela cruza os breakpoints
  useEffect(() => {
    let lastWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      if (lastWidth < 1024 && currentWidth >= 1024) {
        setIsSidebarExpanded(true);
      } else if (lastWidth >= 1024 && currentWidth < 1024 && currentWidth >= 640) {
        setIsSidebarExpanded(false);
      }
      lastWidth = currentWidth;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      id: 'patients' as const,
      label: 'Pacientes',
      icon: Users,
      active: currentView === 'patients',
      count: undefined,
      onClick: () => {
        onSelectView('patients');
        scrollToTop();
      },
    },
    {
      id: 'anamnesis' as const,
      label: 'Anamneses',
      icon: ClipboardList,
      active: currentView === 'anamnesis',
      count: undefined,
      onClick: () => {
        onSelectView('anamnesis');
        scrollToTop();
      },
    },
    {
      id: 'evaluations' as const,
      label: 'Fichas de Avaliação',
      icon: ClipboardCheck,
      active: currentView === 'evaluations',
      // Zero não vira "0" no menu: um selo aceso sem nada para fazer treina a equipe a ignorá-lo.
      count: avaliacoesPendentesCount || undefined,
      onClick: () => {
        onSelectView('evaluations');
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
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="w-10 h-10 -ml-1 rounded-xl shrink-0 flex items-center justify-center text-[#1A1A1A] hover:bg-black/5 active:scale-95 transition-all focus:outline-none"
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
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
            >
              <ClinicLogo
                clinic={clinic}
                className="w-8 h-8 rounded-lg shrink-0"
                monogramClassName="bg-[#1A1A1A] text-[#C49B74] font-serif-luxury text-sm font-semibold"
              />
              <div className="min-w-0 flex-1">
                <span className="font-serif-luxury text-[16px] font-medium text-[#1A1A1A] leading-tight block truncate">
                  {clinic.name}
                </span>
                <span className="text-[11px] text-[#A67C52] font-semibold leading-none block truncate">
                  {VIEW_LABEL[currentView]}
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
            {/* Cabeçalho do menu lateral mobile */}
            <div className="flex items-center justify-between pb-5 border-b border-white/10 gap-2.5">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <ClinicLogo
                  clinic={clinic}
                  className="w-10 h-10 rounded-xl shrink-0"
                  monogramClassName="border border-[rgba(232,205,172,.35)] bg-black/20 text-[#C49B74] font-serif-luxury text-base font-semibold"
                />
                <div className="min-w-0 flex-1">
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
                className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-[rgba(246,239,228,.7)] hover:bg-white/10 hover:text-white transition-colors"
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

      {/* Sidebar para Tablet (640–1023px) e Desktop/PC (≥1024px) */}
      <aside
        className={`hidden sm:flex sm:flex-col sm:h-screen sm:sticky sm:top-0 sm:shrink-0 bg-[#1A1A1A] py-[24px] transition-all duration-300 ${
          isSidebarExpanded
            ? 'sm:w-[268px] px-[18px]'
            : 'sm:w-[68px] px-2.5'
        }`}
      >
        {/* Cabeçalho do menu lateral com proteção anti-sobreposição */}
        {isSidebarExpanded ? (
          /* MODO EXPANDIDO (Desktop padrão ou Tablet expandido):
             Logo e nome à esquerda, botão de recolher à direita — separados e com larguras protegidas */
          <div className="flex items-center justify-between gap-2.5 mb-7 px-1">
            <button
              onClick={() => {
                onSelectView('procedures');
                scrollToTop();
              }}
              className="flex items-center gap-3 min-w-0 flex-1 text-left group"
              title={clinic.name}
            >
              <ClinicLogo
                clinic={clinic}
                className="w-[42px] h-[42px] rounded-xl shrink-0 group-hover:scale-[1.02] transition-transform"
                monogramClassName="border border-[rgba(232,205,172,.35)] bg-black/20 text-[#C49B74] font-serif-luxury text-lg font-semibold"
              />
              <div className="min-w-0 flex-1">
                <span className="font-serif-luxury text-[18px] font-medium text-[#F6EFE4] leading-tight block truncate">
                  {clinic.name}
                </span>
                <span className="text-[11px] text-[rgba(246,239,228,.55)] block truncate">
                  Gestão Clínica
                </span>
              </div>
            </button>

            {/* Botão para recolher o menu lateral */}
            <button
              onClick={() => setIsSidebarExpanded(false)}
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[rgba(246,239,228,.7)] hover:bg-white/10 hover:text-white transition-colors"
              title="Recolher menu lateral"
              aria-label="Recolher menu lateral"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>
        ) : (
          /* MODO RECOLHIDO (Tablet padrão ou PC recolhido):
             Logo centralizado e botão de expandir verticalmente abaixo — SEM NENHUMA SOBREPOSIÇÃO */
          <div className="flex flex-col items-center gap-2.5 mb-6">
            <button
              onClick={() => {
                onSelectView('procedures');
                scrollToTop();
              }}
              className="flex items-center justify-center w-11 h-11 rounded-xl hover:opacity-90 active:scale-95 transition-transform"
              title={clinic.name}
            >
              <ClinicLogo
                clinic={clinic}
                className="w-10 h-10 rounded-xl shrink-0"
                monogramClassName="border border-[rgba(232,205,172,.35)] bg-black/20 text-[#C49B74] font-serif-luxury text-base font-semibold"
              />
            </button>

            {/* Botão para expandir menu lateral posicionado abaixo do logo */}
            <button
              onClick={() => setIsSidebarExpanded(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[rgba(246,239,228,.7)] hover:bg-white/10 hover:text-white transition-colors"
              title="Expandir menu lateral"
              aria-label="Expandir menu lateral"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Itens de navegação */}
        <nav className="flex-1 flex flex-col gap-1.5">
          {railItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                title={!isSidebarExpanded ? item.label : undefined}
                className={`flex items-center rounded-xl transition-colors ${
                  isSidebarExpanded
                    ? 'gap-3 h-[50px] px-3.5 text-left'
                    : 'justify-center h-[48px] px-2'
                } ${
                  item.active
                    ? 'bg-[rgba(232,205,172,.14)] text-[#F6EFE4]'
                    : 'text-[rgba(246,239,228,.7)] hover:bg-white/5 hover:text-[#F6EFE4]'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {isSidebarExpanded && (
                  <>
                    <span className="text-[15px] font-medium truncate flex-1">
                      {item.label}
                    </span>
                    {item.count !== undefined && (
                      <span className="text-[13px] font-semibold text-[#C49B74] shrink-0">
                        {item.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Perfil da profissional logada + sair */}
        <div className="pt-3 mt-2 border-t border-white/10 space-y-1.5">
          {isSidebarExpanded && currentProfessionalName && (
            <p className="px-3.5 text-[12px] font-medium text-[rgba(246,239,228,.6)] truncate">
              {currentProfessionalName}
            </p>
          )}
          <button
            onClick={onLogout}
            title="Sair"
            className={`w-full flex items-center rounded-xl text-[rgba(246,239,228,.7)] hover:bg-white/5 hover:text-[#F6EFE4] transition-colors ${
              isSidebarExpanded
                ? 'gap-3 h-[42px] px-3.5 text-left'
                : 'justify-center h-[42px] px-2'
            }`}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            {isSidebarExpanded && (
              <span className="text-[14px] font-medium">Sair</span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
