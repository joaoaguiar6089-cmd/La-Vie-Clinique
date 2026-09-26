import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  Home,
  LayoutGrid,
  LogOut,
  NotebookPen,
  Package,
  Plus,
  Receipt,
  Settings,
  Share2,
  Syringe,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AppView } from '../types';
import { BottomSheet, ItemDaFolha } from './common/BottomSheet';
import { Avatar } from './common/Tinta';
import { useTravarRolagem, useVoltarFecha } from '../hooks/useVoltarFecha';

/**
 * A navegação do celular.
 *
 * A barra de baixo põe os quatro destinos do dia a um toque, e tudo o mais a dois. No redesign
 * ela deixou de ser uma faixa clara colada na borda e virou um bloco preto flutuante, com o "+"
 * em bronze no meio: a barra clara sumia contra o fundo off-white, e o item ativo — bronze sobre
 * bege — mal se distinguia dos outros.
 *
 * Os dois painéis carregam o resto: o **+** as quatro coisas que se criam do zero, e **Mais** as
 * telas de uso esporádico, agrupadas como a clínica pensa nelas — os documentos da paciente de um
 * lado, a gestão da clínica do outro.
 *
 * Acima de 640px esta barra não existe — lá o trilho lateral manda.
 */

export type AcaoDeCriacao =
  | 'agendamento'
  | 'paciente'
  | 'orcamento'
  | 'anamnese';

interface BottomNavProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  onCriar: (acao: AcaoDeCriacao) => void;
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onLogout: () => void;
  /** Agendamentos vencidos sem desfecho — o selo da Agenda. */
  agendamentosPendentesCount?: number;
  /** O Financeiro só entra no painel para administradoras. */
  ehAdmin?: boolean;
  /** A profissional logada — o cartão do topo do "Mais". */
  profissional?: { name: string; specialty?: string; title?: string } | null;
}

/**
 * Um destino da barra. 68px de barra e alvo de pelo menos 44×44 — o mínimo para o dedo.
 * 12px no rótulo: é o piso da escala da casa, nem numa barra se desce disso.
 */
const Destino: React.FC<{
  icone: React.ElementType;
  rotulo: string;
  ativo: boolean;
  contador?: number;
  onClick: () => void;
}> = ({ icone: Icone, rotulo, ativo, contador, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={ativo ? 'page' : undefined}
    className={`relative flex-1 min-w-[44px] h-full flex flex-col items-center justify-center gap-[3px] rounded-2xl transition-colors ${
      ativo ? 'text-brand-pale' : 'text-cream/75 hover:text-cream'
    }`}
  >
    <span className="relative">
      <Icone className="w-[22px] h-[22px]" strokeWidth={ativo ? 2.4 : 1.9} />
      {!!contador && (
        <span
          className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-light text-ink text-[11px] font-bold flex items-center justify-center tabular-nums leading-none ring-2 ring-ink"
          aria-label={`${contador} pendente${contador === 1 ? '' : 's'}`}
        >
          {contador > 9 ? '9+' : contador}
        </span>
      )}
    </span>
    {/* 11px só nos aparelhos mais estreitos (360px), onde "Pacientes" em 12px não cabe. */}
    <span
      className={`text-[11px] min-[380px]:text-label leading-none max-w-full truncate px-0.5 ${
        ativo ? 'font-bold' : 'font-medium'
      }`}
    >
      {rotulo}
    </span>
  </button>
);

/** Linha da lista "Documentos da paciente", no painel escuro. */
const LinhaDoMais: React.FC<{
  icone: React.ElementType;
  titulo: string;
  sub: string;
  ativo: boolean;
  onClick: () => void;
}> = ({ icone: Icone, titulo, sub, ativo, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={ativo ? 'page' : undefined}
    className="w-full min-h-[60px] flex items-center gap-3.5 border-b border-cream/10 text-left group"
  >
    <Icone className={`w-[22px] h-[22px] shrink-0 ${ativo ? 'text-brand-pale' : 'text-cream'}`} />
    <span className="min-w-0 flex-1">
      <span className={`block text-[16px] font-semibold ${ativo ? 'text-brand-pale' : 'text-white'}`}>
        {titulo}
      </span>
      <span className="block text-[12px] text-cream/70">{sub}</span>
    </span>
    <ChevronRight className="w-[18px] h-[18px] shrink-0 text-cream/60 group-hover:text-cream transition-colors" />
  </button>
);

/** Quadro da grade "Clínica". */
const QuadroDoMais: React.FC<{
  icone: React.ElementType;
  titulo: string;
  ativo: boolean;
  onClick: () => void;
}> = ({ icone: Icone, titulo, ativo, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={ativo ? 'page' : undefined}
    className={`rounded-2xl p-3.5 flex flex-col gap-3 text-left transition-colors ${
      ativo ? 'bg-brand-light/20 text-brand-pale' : 'bg-cream/8 text-cream hover:bg-cream/12'
    }`}
  >
    <Icone className="w-[22px] h-[22px]" />
    <span className={`text-[14px] font-semibold truncate ${ativo ? 'text-brand-pale' : 'text-white'}`}>
      {titulo}
    </span>
  </button>
);

/**
 * O "Mais", em tela cheia e escuro. Fecha pelo X, pelo Esc e pelo voltar do celular.
 */
const PainelMais: React.FC<{
  aberto: boolean;
  onFechar: () => void;
  currentView: AppView;
  ir: (view: AppView) => void;
  ehAdmin?: boolean;
  profissional?: BottomNavProps['profissional'];
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onLogout: () => void;
}> = ({
  aberto,
  onFechar,
  currentView,
  ir,
  ehAdmin,
  profissional,
  onOpenSettings,
  onOpenExport,
  onLogout,
}) => {
  useVoltarFecha(aberto, onFechar);
  useTravarRolagem(aberto);

  useEffect(() => {
    if (!aberto) return;
    const noTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', noTeclado);
    return () => document.removeEventListener('keydown', noTeclado);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const especialidade = profissional?.specialty || profissional?.title;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mais"
      className="sm:hidden fixed inset-0 z-[60] bg-ink text-cream overflow-y-auto overscroll-contain animate-fadeIn"
    >
      <div className="px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] flex flex-col gap-5">
        <div className="flex items-center justify-between pt-2">
          <h2 className="font-serif-luxury text-[34px] font-semibold leading-[1.1] text-white">Mais</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="w-10 h-10 rounded-full bg-cream/10 text-cream flex items-center justify-center hover:bg-cream/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* A profissional logada, com o atalho das configurações — antes o engrenagem ficava perdida
            no fim da lista. */}
        <button
          type="button"
          onClick={() => {
            onFechar();
            onOpenSettings();
          }}
          className="flex items-center gap-3 rounded-[18px] bg-cream/8 p-3.5 text-left hover:bg-cream/12 transition-colors"
        >
          <Avatar nome={profissional?.name || 'La Vie'} tom="ouro" letras={2} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-white truncate">
              {profissional?.name || 'Configurações da clínica'}
            </span>
            <span className="block text-[13px] text-cream/75 truncate">
              {especialidade || 'Dados da clínica, equipe e agenda'}
            </span>
          </span>
          <Settings className="w-5 h-5 shrink-0 text-cream" aria-label="Configurações" />
        </button>

        <div>
          <p className="text-[13px] font-semibold text-brand-light">Documentos da paciente</p>
          {/* Na ordem da jornada: orçamento, anamnese, avaliação (antes) e acompanhamento (depois). */}
          <div className="flex flex-col">
            <LinhaDoMais
              icone={Receipt}
              titulo="Orçamentos"
              sub="Preços e pagamentos"
              ativo={currentView === 'quotes'}
              onClick={() => ir('quotes')}
            />
            <LinhaDoMais
              icone={ClipboardList}
              titulo="Anamneses"
              sub="Histórico de saúde"
              ativo={currentView === 'anamnesis'}
              onClick={() => ir('anamnesis')}
            />
            <LinhaDoMais
              icone={ClipboardCheck}
              titulo="Avaliações"
              sub="Antes do procedimento"
              ativo={currentView === 'evaluations'}
              onClick={() => ir('evaluations')}
            />
            <LinhaDoMais
              icone={NotebookPen}
              titulo="Acompanhamento"
              sub="Depois do atendimento"
              ativo={currentView === 'acompanhamento'}
              onClick={() => ir('acompanhamento')}
            />
          </div>
        </div>

        <div>
          <p className="text-[13px] font-semibold text-brand-light mb-2.5">Clínica</p>
          <div className={`grid gap-2.5 ${ehAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <QuadroDoMais
              icone={Syringe}
              titulo="Procedimentos"
              ativo={currentView === 'procedures'}
              onClick={() => ir('procedures')}
            />
            <QuadroDoMais
              icone={Package}
              titulo="Estoque"
              ativo={currentView === 'estoque'}
              onClick={() => ir('estoque')}
            />
            {ehAdmin && (
              <QuadroDoMais
                icone={Wallet}
                titulo="Financeiro"
                ativo={currentView === 'financeiro'}
                onClick={() => ir('financeiro')}
              />
            )}
          </div>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              onFechar();
              onOpenExport();
            }}
            className="flex-1 h-12 rounded-[14px] border border-cream/20 text-[14px] font-semibold text-cream flex items-center justify-center gap-2 hover:border-cream/40 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => {
              onFechar();
              onLogout();
            }}
            className="flex-1 h-12 rounded-[14px] border border-[rgba(254,202,202,.35)] text-[14px] font-semibold text-[#FECACA] flex items-center justify-center gap-2 hover:border-[rgba(254,202,202,.6)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
};

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onSelectView,
  onCriar,
  onOpenSettings,
  onOpenExport,
  onLogout,
  agendamentosPendentesCount,
  ehAdmin,
  profissional,
}) => {
  const [criarAberto, setCriarAberto] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);

  // "Mais" acende quando a tela atual mora lá dentro — senão a barra não diria onde se está.
  const emMais =
    currentView === 'procedures' ||
    currentView === 'anamnesis' ||
    currentView === 'evaluations' ||
    currentView === 'acompanhamento' ||
    currentView === 'estoque' ||
    currentView === 'quotes' ||
    currentView === 'financeiro' ||
    currentView === 'settings';

  const ir = (view: AppView) => {
    onSelectView(view);
    setMaisAberto(false);
    window.scrollTo({ top: 0 });
  };

  const criar = (acao: AcaoDeCriacao) => {
    setCriarAberto(false);
    onCriar(acao);
  };

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="sm:hidden fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 h-[68px] rounded-[24px] bg-ink px-1.5 flex items-center shadow-[0_12px_30px_rgba(26,26,26,.3)]"
      >
        <Destino
          icone={Home}
          rotulo="Hoje"
          ativo={currentView === 'hoje'}
          onClick={() => ir('hoje')}
        />
        <Destino
          icone={CalendarDays}
          rotulo="Agenda"
          ativo={currentView === 'agenda'}
          contador={agendamentosPendentesCount || undefined}
          onClick={() => ir('agenda')}
        />

        {/* O + central. Botão de ação, não destino — por isso o tratamento diferente. */}
        <div className="w-[60px] shrink-0 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setCriarAberto(true)}
            aria-label="Criar"
            aria-haspopup="dialog"
            className="w-12 h-12 rounded-full bg-brand-light text-ink flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus className="w-6 h-6" strokeWidth={2.4} />
          </button>
        </div>

        <Destino
          icone={Users}
          rotulo="Pacientes"
          ativo={currentView === 'patients'}
          onClick={() => ir('patients')}
        />
        <Destino
          icone={LayoutGrid}
          rotulo="Mais"
          ativo={emMais}
          onClick={() => setMaisAberto(true)}
        />
      </nav>

      {/* O que se cria do zero */}
      <BottomSheet
        aberto={criarAberto}
        onFechar={() => setCriarAberto(false)}
        titulo="Criar"
      >
        <ItemDaFolha
          icone={CalendarPlus}
          rotulo="Novo agendamento"
          descricao="Marcar um horário na agenda"
          onClick={() => criar('agendamento')}
        />
        <ItemDaFolha
          icone={UserPlus}
          rotulo="Nova paciente"
          descricao="Cadastrar uma paciente"
          onClick={() => criar('paciente')}
        />
        <ItemDaFolha
          icone={FilePlus2}
          rotulo="Novo orçamento"
          descricao="Montar um orçamento"
          onClick={() => criar('orcamento')}
        />
        <ItemDaFolha
          icone={ClipboardList}
          rotulo="Nova ficha de anamnese"
          descricao="Preencher uma anamnese"
          onClick={() => criar('anamnese')}
        />
      </BottomSheet>

      <PainelMais
        aberto={maisAberto}
        onFechar={() => setMaisAberto(false)}
        currentView={currentView}
        ir={ir}
        ehAdmin={ehAdmin}
        profissional={profissional}
        onOpenSettings={onOpenSettings}
        onOpenExport={onOpenExport}
        onLogout={onLogout}
      />
    </>
  );
};
