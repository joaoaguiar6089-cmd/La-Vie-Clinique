import React, { useMemo, useState } from 'react';
import { X, Move, RotateCcw, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { ClinicProfile, LaserVista, Procedure } from '../../types';
import { areasDoCatalogo, procedimentosSemArea } from '../../utils/laserAreas';
import { LaserBodyMapView, AreaExibida } from './LaserBodyMapView';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';

/**
 * Gestão das áreas já desenhadas: ver o mapa inteiro, reposicionar um botão e remover uma área.
 *
 * O cadastro desenha uma área por vez, com o foco naquele procedimento. Falta a visão do conjunto
 * — e é só nela que dá para perceber que duas regiões se encavalaram ou que dois botões vizinhos
 * cruzaram as linhas guia. Aqui também mora a única forma de **desfazer** um desenho sem passar
 * pelo formulário de cadastro.
 *
 * Remover a área **não apaga o procedimento**: ele continua no catálogo, com preço, buscável no
 * orçamento — só deixa de aparecer no manequim. São coisas diferentes e a tela nunca as mistura.
 */

interface LaserAreasManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  procedures: Procedure[];
  clinic: ClinicProfile;
  /** Grava o procedimento alterado. O chamador é quem republica o espelho público. */
  onSalvarProcedimento: (procedure: Procedure) => Promise<void>;
}

export const LaserAreasManagerModal: React.FC<LaserAreasManagerModalProps> = ({
  isOpen,
  onClose,
  procedures,
  clinic,
  onSalvarProcedimento,
}) => {
  const [vista, setVista] = useState<LaserVista>('frente');
  const [modoAjuste, setModoAjuste] = useState(false);
  const [emFoco, setEmFoco] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  const manequins: Record<LaserVista, string | undefined> = {
    frente: clinic.laserManequimFrenteUrl,
    costas: clinic.laserManequimCostasUrl,
  };

  const doCatalogo = useMemo(() => areasDoCatalogo(procedures, vista), [procedures, vista]);
  const pendentes = useMemo(() => procedimentosSemArea(procedures), [procedures]);

  const contagem = useMemo(() => {
    const todas = areasDoCatalogo(procedures);
    return {
      frente: todas.filter((a) => a.area.vista === 'frente').length,
      costas: todas.filter((a) => a.area.vista === 'costas').length,
    };
  }, [procedures]);

  const areasNaTela: AreaExibida[] = doCatalogo.map((a) => ({
    chave: a.procedureId,
    nomeCurto: a.nomeCurto,
    area: a.area,
  }));

  const gravar = async (proc: Procedure, mudanca: Partial<Procedure>) => {
    setErro(null);
    setSalvando(proc.id);
    try {
      await onSalvarProcedimento({ ...proc, ...mudanca });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a alteração.');
    } finally {
      setSalvando(null);
    }
  };

  /**
   * Arrastar grava na hora, sem botão de confirmar.
   *
   * São poucos bytes por área, e um "salvar" separado significaria perder o ajuste ao fechar a
   * janela sem clicar nele — o jeito mais fácil de fazer alguém repetir o mesmo trabalho.
   */
  const moverBotao = (procedureId: string, posicao: { x: number; y: number }) => {
    const proc = procedures.find((p) => p.id === procedureId);
    if (!proc) return;
    const arredondado = {
      x: Math.round(posicao.x * 1000) / 1000,
      y: Math.round(posicao.y * 1000) / 1000,
    };
    void gravar(proc, {
      laserAreas: (proc.laserAreas || []).map((a) =>
        a.vista === vista ? { ...a, botao: arredondado } : a
      ),
    });
  };

  const voltarBotaoAoAutomatico = (procedureId: string) => {
    const proc = procedures.find((p) => p.id === procedureId);
    if (!proc) return;
    void gravar(proc, {
      laserAreas: (proc.laserAreas || []).map((a) =>
        a.vista === vista ? { ...a, botao: undefined } : a
      ),
    });
  };

  const pedirRemocao = (procedureId: string, nome: string) => {
    const proc = procedures.find((p) => p.id === procedureId);
    if (!proc) return;
    setConfirmacao({
      titulo: `Remover a área de ${nome} do mapa?`,
      mensagem:
        'O desenho é apagado e o procedimento deixa de aparecer no manequim — na ficha da ' +
        'paciente e no orçamento. Ele continua no catálogo, com preço, e segue buscável pelo ' +
        'nome. Para desenhar de novo, abra o cadastro do procedimento.',
      textoConfirmar: 'Remover do mapa',
      onConfirmar: async () => {
        setConfirmacao(null);
        const restantes = (proc.laserAreas || []).filter((a) => a.vista !== vista);
        await gravar(proc, { laserAreas: restantes.length > 0 ? restantes : undefined });
      },
    });
  };

  if (!isOpen) return null;

  const semManequim = !manequins[vista];

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
      {/* Largo o bastante para o anel de botões engajar: o manequim precisa de 760px, e com a
          lista de 300px ao lado um modal menor empurraria a tela para a grade de chips — onde não
          há botão no anel para arrastar, que é metade do motivo desta tela existir. */}
      <div className="relative w-full max-w-[1280px] max-h-[92vh] bg-[#F9F8F6] rounded-sm overflow-hidden shadow-2xl border border-white/60 flex flex-col">
        <div className="bg-[#1A1A1A] text-[#E5E4E0] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C49B74]">
              Depilação a Laser
            </span>
            <h3 className="font-serif-luxury text-lg font-medium text-white">
              Áreas do mapa corporal
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-sm p-1">
              {(['frente', 'costas'] as LaserVista[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVista(v)}
                  className={`px-3.5 py-1.5 rounded-xs text-[12px] font-semibold transition-colors ${
                    vista === v ? 'bg-[#A67C52] text-white' : 'text-[#1A1A1A] hover:bg-gray-50'
                  }`}
                >
                  {v === 'frente' ? 'Frente' : 'Costas'}
                  <span className={vista === v ? 'opacity-80' : 'text-gray-400'}>
                    {' '}· {contagem[v]}
                  </span>
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[12px] text-[#1A1A1A] cursor-pointer bg-white border border-gray-200 rounded-sm px-3 py-1.5">
              <input
                type="checkbox"
                checked={modoAjuste}
                onChange={(e) => setModoAjuste(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#A67C52]"
              />
              <Move className="w-3.5 h-3.5 text-[#A67C52]" />
              Arrastar botões para reposicionar
            </label>
          </div>

          {erro && (
            <p className="mb-3 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {erro}
            </p>
          )}

          <div className="flex gap-5 items-start">
            <div className="flex-1 min-w-0">
              {semManequim ? (
                <div className="py-12 text-center bg-white border border-dashed border-[#d8d2c8] rounded-sm">
                  <p className="text-[12px] text-[#8a8578]">
                    O manequim de {vista === 'frente' ? 'frente' : 'costas'} ainda não foi enviado.
                  </p>
                </div>
              ) : areasNaTela.length === 0 ? (
                <div className="py-12 text-center bg-white border border-dashed border-[#d8d2c8] rounded-sm">
                  <p className="text-[12px] text-[#8a8578]">
                    Nenhuma área desenhada nesta vista ainda.
                  </p>
                </div>
              ) : (
                <>
                  <LaserBodyMapView
                    imagemUrl={manequins[vista]}
                    areas={areasNaTela}
                    selecionadas={new Set(emFoco ? [emFoco] : [])}
                    onToggle={(chave) => setEmFoco((atual) => (atual === chave ? null : chave))}
                    alturaManequim={520}
                    onMoverBotao={modoAjuste ? moverBotao : undefined}
                  />
                  <p className="text-[11px] text-[#8a8578] text-center mt-2">
                    {modoAjuste
                      ? 'Arraste um botão para onde ele deve ficar. A posição grava sozinha.'
                      : 'Clique numa área para destacá-la na lista ao lado.'}
                  </p>
                </>
              )}
            </div>

            <div className="w-[300px] shrink-0 space-y-3">
              <div className="bg-white border border-gray-200 rounded-sm">
                <p className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-[#A67C52] border-b border-gray-100">
                  Áreas nesta vista ({doCatalogo.length})
                </p>
                {doCatalogo.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] text-[#8a8578]">Nenhuma.</p>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100">
                    {doCatalogo.map((a) => (
                      <div
                        key={a.procedureId}
                        onMouseEnter={() => setEmFoco(a.procedureId)}
                        onMouseLeave={() =>
                          setEmFoco((atual) => (atual === a.procedureId ? null : atual))
                        }
                        className={`px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                          emFoco === a.procedureId ? 'bg-[#FDF3F7]' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="block text-[12px] text-[#1A1A1A] truncate">
                            {a.nomeCurto}
                          </span>
                          <span className="block text-[10px] text-gray-400">
                            {a.area.formas.length}{' '}
                            {a.area.formas.length === 1 ? 'forma' : 'formas'}
                            {a.area.botao ? ' · botão ajustado' : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {salvando === a.procedureId && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A67C52]" />
                          )}
                          {a.area.botao && (
                            <button
                              type="button"
                              title="Voltar o botão à posição automática"
                              onClick={() => voltarBotaoAoAutomatico(a.procedureId)}
                              className="p-1 rounded-xs text-gray-400 hover:text-[#A67C52] hover:bg-gray-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Remover a área do mapa"
                            onClick={() => pedirRemocao(a.procedureId, a.nomeCurto)}
                            className="p-1 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pendentes.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-sm px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-[#A67C52] mb-1">
                    Sem área no mapa ({pendentes.length})
                  </p>
                  <p className="text-[11px] text-[#8a8578] leading-snug">
                    Estes procedimentos de laser existem no catálogo mas não aparecem no manequim.
                    Desenhe a área abrindo o cadastro de cada um.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[rgba(26,26,26,.1)] bg-white px-5 py-3 flex items-center justify-between gap-4">
          <p className="text-[11px] text-[#8a8578] leading-snug">
            Remover a área tira o procedimento do manequim, não do catálogo.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-sm bg-[#1A1A1A] text-white text-xs font-semibold uppercase tracking-widest hover:bg-black transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
