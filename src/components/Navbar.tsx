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
  PanelLeftOpen,
  PanelLeftClose,
  CalendarDays,
  Home,
  NotebookPen,
  Search,
  Wallet,
} from 'lucide-react';
import { ClinicProfile, AppView } from '../types';
import { ClinicLogo } from './ClinicLogo';

/** Nome da tela atual, exibido sob o nome da clínica no cabeçalho mobile. */
const VIEW_LABEL: Record<AppView, string> = {
  hoje: 'Hoje',
  agenda: 'Agenda',
  procedures: 'Procedimentos',
  patients: 'Pacientes',
  anamnesis: 'Anamneses',
  evaluations: 'Fichas de Avaliação',
  acompanhamento: 'Acompanhamento',
  quotes: 'Orçamentos',
  financeiro: 'Financeiro',
  settings: 'Configurações',
};

interface NavbarProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  clinic: ClinicProfile;
  proceduresCount: number;
  /**
   * Agendamentos cuja data passou sem ninguém marcar o desfecho — trabalho represado que não
   * aparece sozinho. Some quando é zero: um selo aceso sem nada para fazer treina a equipe a
   * ignorá-lo.
   *
   * Avaliação e acompanhamento não têm contador: as duas fichas são opcionais.
   */
  agendamentosPendentesCount?: number;
  /** O Financeiro só aparece no menu para administradoras. */
  ehAdmin?: boolean;
  currentProfessionalName?: string;
  /** Abre a busca global. No desktop o atalho é Cmd/Ctrl+K; aqui é o caminho para o dedo. */
  onOpenBusca: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  onOpenExport,
  onOpenSettings,
  clinic,
  proceduresCount,
  agendamentosPendentesCount,
  ehAdmin,
  currentProfessionalName,
  onOpenBusca,
  onLogout,
}) => {
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
      // O dia começa aqui: o que vem agora, o que ficou represado, como está o mês.
      id: 'hoje' as const,
      label: 'Hoje',
      icon: Home,
      active: currentView === 'hoje',
      count: undefined,
      onClick: () => {
        onSelectView('hoje');
        scrollToTop();
      },
    },
    {
      id: 'agenda' as const,
      label: 'Agenda',
      icon: CalendarDays,
      active: currentView === 'agenda',
      count: agendamentosPendentesCount || undefined,
      onClick: () => {
        onSelectView('agenda');
        scrollToTop();
      },
    },
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
    // Os documentos da paciente, na ordem da jornada: orçamento, anamnese, avaliação (antes do
    // procedimento) e acompanhamento (depois do atendimento).
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
      count: undefined,
      onClick: () => {
        onSelectView('evaluations');
        scrollToTop();
      },
    },
    {
      id: 'acompanhamento' as const,
      label: 'Acompanhamento',
      icon: NotebookPen,
      active: currentView === 'acompanhamento',
      count: undefined,
      onClick: () => {
        onSelectView('acompanhamento');
        scrollToTop();
      },
    },
    ...(ehAdmin
      ? [
          {
            id: 'financeiro' as const,
            label: 'Financeiro',
            icon: Wallet,
            active: currentView === 'financeiro',
            count: undefined,
            onClick: () => {
              onSelectView('financeiro');
              scrollToTop();
            },
          },
        ]
      : []),
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
      active: currentView === 'settings',
      count: undefined,
      onClick: onOpenSettings,
    },
  ];

  return (
    <>
      {/* Cabeçalho do celular (<640px).
          Sem botão de menu: quem navega no celular é a barra de baixo (`BottomNav`). O que
          sobra aqui é identidade — onde estou — mais a lupa, que precisa estar a um toque de
          qualquer tela. */}
      <header className="sm:hidden sticky top-0 z-30 glass-nav">
        <div className="px-4 py-2.5 flex items-center justify-between gap-2.5">
          <button
            onClick={() => {
              onSelectView('hoje');
              scrollToTop();
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
          >
            <ClinicLogo
              clinic={clinic}
              className="w-8 h-8 rounded-lg shrink-0"
              monogramClassName="bg-ink text-brand-light font-serif-luxury text-sm font-semibold"
            />
            <div className="min-w-0 flex-1">
              <span className="font-serif-luxury text-[16px] font-medium text-ink leading-tight block truncate">
                {clinic.name}
              </span>
              <span className="text-label text-brand font-semibold leading-none block truncate">
                {VIEW_LABEL[currentView]}
              </span>
            </div>
          </button>

          <button
            onClick={onOpenBusca}
            className="w-11 h-11 -mr-1.5 shrink-0 rounded-xl flex items-center justify-center text-ink hover:bg-black/5 active:scale-95 transition-all"
            title="Buscar"
            aria-label="Buscar paciente, procedimento ou orçamento"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sidebar para Tablet (640–1023px) e Desktop/PC (≥1024px) */}
      <aside
        className={`hidden sm:flex sm:flex-col sm:h-screen sm:sticky sm:top-0 sm:shrink-0 bg-ink py-[24px] transition-all duration-300 ${
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
                onSelectView('hoje');
                scrollToTop();
              }}
              className="flex items-center gap-3 min-w-0 flex-1 text-left group"
              title={clinic.name}
            >
              <ClinicLogo
                clinic={clinic}
                className="w-[42px] h-[42px] rounded-xl shrink-0 group-hover:scale-[1.02] transition-transform"
                monogramClassName="border border-[rgba(232,205,172,.35)] bg-black/20 text-brand-light font-serif-luxury text-lg font-semibold"
              />
              <div className="min-w-0 flex-1">
                <span className="font-serif-luxury text-[18px] font-medium text-cream leading-tight block truncate">
                  {clinic.name}
                </span>
                <span className="text-body text-[rgba(246,239,228,.55)] block truncate">
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
                onSelectView('hoje');
                scrollToTop();
              }}
              className="flex items-center justify-center w-11 h-11 rounded-xl hover:opacity-90 active:scale-95 transition-transform"
              title={clinic.name}
            >
              <ClinicLogo
                clinic={clinic}
                className="w-10 h-10 rounded-xl shrink-0"
                monogramClassName="border border-[rgba(232,205,172,.35)] bg-black/20 text-brand-light font-serif-luxury text-base font-semibold"
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

        {/* Busca global. É um botão com cara de campo: quem digita aqui digita no palette, e
            duplicar o input traria dois lugares com o mesmo estado. */}
        <button
          onClick={onOpenBusca}
          title="Buscar (Ctrl+K)"
          aria-label="Buscar paciente, procedimento ou orçamento"
          className={`flex items-center rounded-xl mb-3 bg-white/5 hover:bg-white/10 text-[rgba(246,239,228,.7)] hover:text-cream transition-colors ${
            isSidebarExpanded ? 'gap-2.5 h-[42px] px-3' : 'justify-center h-[44px] px-2'
          }`}
        >
          <Search className="w-[18px] h-[18px] shrink-0" />
          {isSidebarExpanded && (
            <>
              <span className="text-body-lg flex-1 text-left">Buscar…</span>
              <kbd className="text-label font-sans font-semibold px-1.5 py-0.5 rounded-sm bg-white/10">
                ⌘K
              </kbd>
            </>
          )}
        </button>

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
                    ? 'bg-[rgba(232,205,172,.14)] text-cream'
                    : 'text-[rgba(246,239,228,.7)] hover:bg-white/5 hover:text-cream'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {isSidebarExpanded && (
                  <>
                    <span className="text-[15px] font-medium truncate flex-1">
                      {item.label}
                    </span>
                    {item.count !== undefined && (
                      <span className="text-[13px] font-semibold text-brand-light shrink-0">
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
            className={`w-full flex items-center rounded-xl text-[rgba(246,239,228,.7)] hover:bg-white/5 hover:text-cream transition-colors ${
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
