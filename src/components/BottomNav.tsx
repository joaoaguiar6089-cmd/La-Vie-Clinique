import React, { useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  Home,
  LogOut,
  MoreHorizontal,
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
} from 'lucide-react';
import { AppView } from '../types';
import { BottomSheet, ItemDaFolha } from './common/BottomSheet';

/**
 * A navegação do celular.
 *
 * Antes tudo passava por um menu gaveta: dois toques para qualquer coisa — abrir a gaveta,
 * escolher o destino — e nenhuma pista de onde se estava. A barra de baixo põe os quatro
 * destinos do dia a um toque, e tudo o mais a dois, que é o teto que a tarefa pede.
 *
 * Os dois sheets carregam o resto: o **+** as quatro coisas que se criam do zero, e **Mais** as
 * telas de uso esporádico. Configurações e Sair foram para lá porque estavam ocupando o canto
 * superior direito do cabeçalho, que é onde o polegar menos alcança.
 *
 * Acima de 640px esta barra não existe — lá a sidebar continua mandando.
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
  /** O Financeiro só entra no sheet para administradoras. */
  ehAdmin?: boolean;
}

/**
 * Um destino da barra. Altura de 56px e largura mínima de 44px: o mínimo de alvo de toque é
 * 44×44, e a barra inteira tem 64px de altura com a área segura por baixo.
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
    className={`relative flex-1 min-w-[44px] h-[56px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
      ativo ? 'text-brand' : 'text-muted hover:text-ink'
    }`}
  >
    <span className="relative">
      <Icone className="w-[22px] h-[22px]" strokeWidth={ativo ? 2.4 : 1.8} />
      {!!contador && (
        <span
          className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-label font-bold flex items-center justify-center tabular-nums leading-none"
          aria-label={`${contador} pendente${contador === 1 ? '' : 's'}`}
        >
          {contador > 9 ? '9+' : contador}
        </span>
      )}
    </span>
    {/* 12px é o piso da escala tipográfica da casa: nada abaixo disso, nem num rótulo de
        barra. Cinco rótulos a 12px cabem em 375px porque a barra é `flex-1` com `truncate`. */}
    <span
      className={`text-label leading-none max-w-full truncate px-0.5 ${
        ativo ? 'font-semibold' : 'font-medium'
      }`}
    >
      {rotulo}
    </span>
  </button>
);

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onSelectView,
  onCriar,
  onOpenSettings,
  onOpenExport,
  onLogout,
  agendamentosPendentesCount,
  ehAdmin,
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
    currentView === 'financeiro';

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
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 glass-bottom-nav pb-area-segura"
      >
        <div className="flex items-stretch gap-0.5 px-1.5 h-[64px]">
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
          <div className="flex-1 min-w-[44px] flex items-center justify-center">
            <button
              type="button"
              onClick={() => setCriarAberto(true)}
              aria-label="Criar"
              aria-haspopup="dialog"
              className="w-[52px] h-[52px] rounded-2xl bg-brand text-white flex items-center justify-center shadow-lg shadow-brand/25 active:scale-95 transition-transform"
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
            icone={MoreHorizontal}
            rotulo="Mais"
            ativo={emMais}
            onClick={() => setMaisAberto(true)}
          />
        </div>
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

      {/* O resto do sistema */}
      <BottomSheet aberto={maisAberto} onFechar={() => setMaisAberto(false)} titulo="Mais">
        <ItemDaFolha
          icone={Syringe}
          rotulo="Procedimentos"
          onClick={() => ir('procedures')}
        />
        {/* Os documentos da paciente, na ordem da jornada. */}
        <ItemDaFolha icone={Receipt} rotulo="Orçamentos" onClick={() => ir('quotes')} />
        <ItemDaFolha
          icone={ClipboardList}
          rotulo="Anamneses"
          onClick={() => ir('anamnesis')}
        />
        <ItemDaFolha
          icone={ClipboardCheck}
          rotulo="Fichas de avaliação"
          descricao="Antes do procedimento"
          onClick={() => ir('evaluations')}
        />
        <ItemDaFolha
          icone={NotebookPen}
          rotulo="Acompanhamento"
          descricao="Depois do atendimento"
          onClick={() => ir('acompanhamento')}
        />
        <ItemDaFolha
          icone={Package}
          rotulo="Estoque"
          descricao="Produtos e consumo por procedimento"
          onClick={() => ir('estoque')}
        />
        {ehAdmin && (
          <ItemDaFolha
            icone={Wallet}
            rotulo="Financeiro"
            descricao="Faturamento, ticket médio e conversão"
            onClick={() => ir('financeiro')}
          />
        )}

        <div className="my-1.5 mx-3 border-t border-line" />

        <ItemDaFolha
          icone={Settings}
          rotulo="Configurações"
          onClick={() => {
            setMaisAberto(false);
            onOpenSettings();
          }}
        />
        <ItemDaFolha
          icone={Share2}
          rotulo="Compartilhar catálogo"
          onClick={() => {
            setMaisAberto(false);
            onOpenExport();
          }}
        />
        <ItemDaFolha
          icone={LogOut}
          rotulo="Sair"
          tom="perigo"
          onClick={() => {
            setMaisAberto(false);
            onLogout();
          }}
        />
      </BottomSheet>
    </>
  );
};
