import React from 'react';
import { Plus, Share2, Settings, ListOrdered, Loader2 } from 'lucide-react';
import { ClinicProfile } from '../types';

interface NavbarProps {
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onOpenNewProcedure: () => void;
  clinic: ClinicProfile;
  proceduresCount: number;
  syncStatus?: 'syncing' | 'synced' | 'error';
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenExport,
  onOpenSettings,
  onOpenNewProcedure,
  clinic,
  proceduresCount,
  syncStatus = 'synced',
}) => {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <header className="sticky top-0 z-40 glass-nav transition-all duration-300 border-b border-white/60 shadow-xs">
      {/* Main Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
        {/* Brand & Monogram */}
        <div
          onClick={scrollToTop}
          className="flex items-center gap-3 cursor-pointer group"
          id="brand-header-link"
        >
          <div className="w-10 h-10 rounded-sm bg-[#1A1A1A] border border-[#A67C52]/40 flex items-center justify-center text-[#C49B74] font-serif-luxury text-lg font-bold shadow-sm group-hover:border-[#A67C52] transition-colors">
            LV
          </div>
          <div>
            <h1 className="font-serif-luxury text-xl sm:text-2xl font-medium tracking-tight text-[#1A1A1A] leading-none group-hover:text-[#A67C52] transition-colors">
              {clinic.name}
            </h1>
            <p className="text-[10px] tracking-[0.2em] uppercase text-gray-500 mt-1 font-medium line-clamp-1">
              Catálogo de Procedimentos
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-white/40 backdrop-blur-md p-1 rounded-sm border border-white/60 shadow-xs">
          <button
            id="tab-manager-btn"
            onClick={scrollToTop}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xs text-xs uppercase tracking-widest font-medium transition-all bg-[#1A1A1A] text-white shadow-xs"
          >
            <ListOrdered className="w-3.5 h-3.5" />
            Itens
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-[#A67C52]/20 text-[#C49B74] font-bold">
              {proceduresCount}
            </span>
          </button>

          <button
            id="tab-export-btn"
            onClick={onOpenExport}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xs text-xs uppercase tracking-widest font-medium text-gray-600 hover:text-[#1A1A1A] hover:bg-white/60 transition-all"
          >
            <Share2 className="w-3.5 h-3.5 text-[#A67C52]" />
            Exportar PDF
          </button>

          <button
            id="tab-settings-btn"
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xs text-xs uppercase tracking-widest font-medium text-gray-600 hover:text-[#1A1A1A] hover:bg-white/60 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurações
          </button>
        </nav>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2">
          {/* Cloud Sync Status Indicator */}
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/60 backdrop-blur-xs border border-white/80 text-[10px] font-medium text-gray-600 shadow-2xs"
            title={syncStatus === 'syncing' ? 'Sincronizando com o Firebase...' : 'Conectado ao Firebase Cloud'}
          >
            {syncStatus === 'syncing' ? (
              <>
                <Loader2 className="w-3 h-3 text-[#A67C52] animate-spin" />
                <span className="text-[#A67C52]">Gravando...</span>
              </>
            ) : syncStatus === 'error' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>Modo Local</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-gray-700">Firebase Conectado</span>
              </>
            )}
          </div>

          <button
            id="btn-export-quick"
            onClick={onOpenExport}
            className="md:hidden p-2 rounded-sm text-[#1A1A1A] bg-white/50 backdrop-blur-md border border-white/60 hover:bg-white/80"
            title="Exportar Catálogo"
          >
            <Share2 className="w-4 h-4 text-[#A67C52]" />
          </button>

          <button
            id="btn-new-procedure-main"
            onClick={onOpenNewProcedure}
            className="flex items-center gap-2 px-5 py-2 rounded-sm bg-[#A67C52] text-white text-xs tracking-widest uppercase font-semibold hover:bg-[#8e6945] shadow-xs active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Cadastro</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation tab bar */}
      <div className="md:hidden flex border-t border-white/60 bg-white/60 backdrop-blur-md px-2 py-1 justify-around">
        <button
          onClick={scrollToTop}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xs text-xs font-medium uppercase tracking-wider bg-[#1A1A1A] text-white"
        >
          <ListOrdered className="w-3.5 h-3.5" />
          Itens ({proceduresCount})
        </button>
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xs text-xs font-medium uppercase tracking-wider text-gray-600"
        >
          <Share2 className="w-3.5 h-3.5 text-[#A67C52]" />
          PDF
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xs text-xs font-medium uppercase tracking-wider text-gray-600"
        >
          <Settings className="w-3.5 h-3.5" />
          Clínica
        </button>
      </div>
    </header>
  );
};
