import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Syringe,
  ClipboardList,
  ClipboardCheck,
  Share2,
  LogOut,
  Receipt,
  Users,
  CalendarDays,
  Home,
  NotebookPen,
  Package,
  Search,
  Wallet,
} from 'lucide-react';
import { ClinicProfile, AppView } from '../types';
import { clinicMonogram } from './ClinicLogo';

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
  /** Abre a busca global. No desktop o atalho é Cmd/Ctrl+K; aqui é o caminho para o mouse. */
  onOpenBusca: () => void;
  onLogout: () => void;
}

interface ItemDoTrilho {
  id: string;
  rotulo: string;
  /** Nome inteiro, para o `title` quando o rótulo precisou encurtar. */
  titulo: string;
  icone: React.ElementType;
  ativo: boolean;
  contador?: number;
  onClick: () => void;
}

/**
 * Um quadro do trilho: ícone em cima, rótulo embaixo. 84×60 — rótulo de 12px, o piso da escala
 * da casa, cabe inteiro até "Orçamentos"; os dois nomes que não cabem ("Procedimentos",
 * "Acompanhamento") encurtam, e o nome inteiro fica no `title`.
 */
const QuadroDoTrilho: React.FC<{ item: ItemDoTrilho; compacto?: boolean }> = ({ item, compacto }) => {
  const Icone = item.icone;
  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-current={item.ativo ? 'page' : undefined}
      aria-label={item.titulo}
      title={item.titulo}
      className={`relative shrink-0 w-[84px] ${
        compacto ? 'h-[52px]' : 'h-[60px]'
      } rounded-[14px] flex flex-col items-center justify-center gap-1 transition-colors ${
        item.ativo
          ? 'bg-brand-light/20 text-brand-pale'
          : 'text-cream/75 hover:bg-white/5 hover:text-cream'
      }`}
    >
      <Icone className="w-5 h-5 shrink-0" strokeWidth={item.ativo ? 2.3 : 1.9} />
      <span className="text-label font-semibold leading-none max-w-full truncate px-1">
        {item.rotulo}
      </span>
      {!!item.contador && (
        <span
          className="absolute top-1.5 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-light text-ink text-[11px] font-bold flex items-center justify-center tabular-nums leading-none"
          aria-label={`${item.contador} pendente${item.contador === 1 ? '' : 's'}`}
        >
          {item.contador > 9 ? '9+' : item.contador}
        </span>
      )}
    </button>
  );
};

/**
 * A navegação do tablet e do desktop: um trilho preto de 96px, com o monograma no topo.
 *
 * Antes havia duas versões — a barra expandida de 268px e o trilho só de ícones — e o trilho
 * sem rótulo obrigava a decorar os ícones. O redesign fica com uma só: ícone **e** nome, sempre,
 * numa largura que não rouba a tela do tablet.
 *
 * No celular não há nada aqui: quem navega é a barra de baixo (`BottomNav`), e cada tela abre com
 * o próprio título grande. O cabeçalho que repetia o nome da clínica, cortado no meio, saiu.
 */
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
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  /*
    No tablet deitado a lista de seções não cabe na altura e rola dentro do menu. Para isso não
    esconder seção nenhuma: o item da tela aberta é trazido para a vista, e um degradê no pé da
    lista avisa que há mais itens abaixo.
  */
  const navRef = useRef<HTMLElement>(null);
  const [temMaisAbaixo, setTemMaisAbaixo] = useState(false);

  const medirMenu = () => {
    const nav = navRef.current;
    if (!nav) return;
    setTemMaisAbaixo(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 4);
  };

  useEffect(() => {
    const nav = navRef.current;
    const ativo = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && ativo) {
      // Conta feita à mão, e não `scrollIntoView`: aquele rolaria também a página.
      const lista = nav.getBoundingClientRect();
      const item = ativo.getBoundingClientRect();
      // A folga de baixo é a altura do degradê: o item ativo não fica debaixo dele.
      if (item.top < lista.top) nav.scrollTop -= lista.top - item.top + 8;
      else if (item.bottom > lista.bottom) nav.scrollTop += item.bottom - lista.bottom + 32;
    }
    medirMenu();
  }, [currentView]);

  useEffect(() => {
    window.addEventListener('resize', medirMenu);
    return () => window.removeEventListener('resize', medirMenu);
  }, []);

  const ir = (view: AppView) => () => {
    onSelectView(view);
    scrollToTop();
  };

  const itens: ItemDoTrilho[] = [
    // O dia começa aqui: o que vem agora, o que ficou represado, como está o mês.
    { id: 'hoje', rotulo: 'Hoje', titulo: 'Hoje', icone: Home, ativo: currentView === 'hoje', onClick: ir('hoje') },
    {
      id: 'agenda',
      rotulo: 'Agenda',
      titulo: 'Agenda',
      icone: CalendarDays,
      ativo: currentView === 'agenda',
      contador: agendamentosPendentesCount || undefined,
      onClick: ir('agenda'),
    },
    {
      id: 'patients',
      rotulo: 'Pacientes',
      titulo: 'Pacientes',
      icone: Users,
      ativo: currentView === 'patients',
      onClick: ir('patients'),
    },
    // Os documentos da paciente, na ordem da jornada: orçamento, anamnese, avaliação (antes do
    // procedimento) e acompanhamento (depois do atendimento).
    {
      id: 'quotes',
      rotulo: 'Orçamentos',
      titulo: 'Orçamentos',
      icone: Receipt,
      ativo: currentView === 'quotes',
      onClick: ir('quotes'),
    },
    {
      id: 'anamnesis',
      rotulo: 'Anamneses',
      titulo: 'Anamneses',
      icone: ClipboardList,
      ativo: currentView === 'anamnesis',
      onClick: ir('anamnesis'),
    },
    {
      id: 'evaluations',
      rotulo: 'Avaliações',
      titulo: 'Fichas de avaliação',
      icone: ClipboardCheck,
      ativo: currentView === 'evaluations',
      onClick: ir('evaluations'),
    },
    {
      id: 'acompanhamento',
      rotulo: 'Acompan.',
      titulo: 'Acompanhamento',
      icone: NotebookPen,
      ativo: currentView === 'acompanhamento',
      onClick: ir('acompanhamento'),
    },
    // A gestão da clínica, depois dos documentos — como no "Mais" do celular.
    {
      id: 'procedures',
      rotulo: 'Procedim.',
      titulo: `Procedimentos (${proceduresCount})`,
      icone: Syringe,
      ativo: currentView === 'procedures',
      onClick: ir('procedures'),
    },
    {
      id: 'estoque',
      rotulo: 'Estoque',
      titulo: 'Estoque',
      icone: Package,
      ativo: currentView === 'estoque',
      onClick: ir('estoque'),
    },
    ...(ehAdmin
      ? [
          {
            id: 'financeiro',
            rotulo: 'Financeiro',
            titulo: 'Financeiro',
            icone: Wallet,
            ativo: currentView === 'financeiro',
            onClick: ir('financeiro'),
          },
        ]
      : []),
    {
      id: 'export',
      rotulo: 'Catálogo',
      titulo: 'Exportar ou compartilhar o catálogo',
      icone: Share2,
      ativo: false,
      onClick: onOpenExport,
    },
  ];

  return (
    /* Altura da tela **visível** (`dvh`, com `vh` de reserva) e só a lista de seções rola por
       dentro. Sem isso, num tablet deitado o menu não cabia na tela: o que sobrava vazava para
       fora da coluna fixa e os últimos itens ficavam fora de alcance. */
    <aside className="hidden sm:flex sm:flex-col sm:items-center sm:w-[96px] sm:h-screen sm:supports-[height:100dvh]:h-dvh sm:overflow-hidden sm:sticky sm:top-0 sm:shrink-0 bg-ink py-5">
      <button
        type="button"
        onClick={ir('hoje')}
        className="shrink-0 w-11 h-11 rounded-xl bg-brand-light text-ink flex items-center justify-center font-serif-luxury text-[18px] font-semibold mb-3 hover:brightness-105 active:scale-95 transition"
        title={clinic.name}
        aria-label={`${clinic.name} — ir para Hoje`}
      >
        {clinicMonogram(clinic.name)}
      </button>

      {/* Busca global. No desktop o atalho é Ctrl+K; o quadro é o caminho do mouse. */}
      <div className="shrink-0 mb-1.5">
        <QuadroDoTrilho
          compacto
          item={{
            id: 'busca',
            rotulo: 'Buscar',
            titulo: 'Buscar paciente, procedimento ou orçamento (Ctrl+K)',
            icone: Search,
            ativo: false,
            onClick: onOpenBusca,
          }}
        />
      </div>

      {/* Itens de navegação — a única parte que rola. O `overscroll-contain` impede que o fim da
          lista arraste a página junto. */}
      <div className="relative flex-1 min-h-0 w-full flex flex-col">
        <nav
          ref={navRef}
          onScroll={medirMenu}
          aria-label="Navegação principal"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col items-center gap-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {itens.map((item) => (
            <QuadroDoTrilho key={item.id} item={item} />
          ))}
        </nav>
        {temMaisAbaixo && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-ink to-transparent"
          />
        )}
      </div>

      {/* Configurações e sair, sempre à vista. */}
      <div className="shrink-0 pt-2 mt-2 border-t border-white/10 flex flex-col items-center gap-1">
        <QuadroDoTrilho
          compacto
          item={{
            id: 'settings',
            rotulo: 'Ajustes',
            titulo: 'Configurações da clínica',
            icone: Settings,
            ativo: currentView === 'settings',
            onClick: onOpenSettings,
          }}
        />
        <QuadroDoTrilho
          compacto
          item={{
            id: 'sair',
            rotulo: 'Sair',
            titulo: currentProfessionalName ? `Sair (${currentProfessionalName})` : 'Sair',
            icone: LogOut,
            ativo: false,
            onClick: onLogout,
          }}
        />
      </div>
    </aside>
  );
};
