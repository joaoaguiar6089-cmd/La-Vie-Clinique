import React, { useMemo, useState } from 'react';
import { LaserBodyMap, LaserVista } from '../../types';
import { LaserBodyMapView, AreaExibida } from './LaserBodyMapView';

/**
 * Escolha das áreas sobre o manequim, com as abas Frente/Costas.
 *
 * Serve à ficha da paciente e ao orçamento sem saber de qual dos dois se trata: recebe o mapa já
 * resolvido e devolve seleções. É o que garante que a paciente reconheça no orçamento a mesma
 * mancha que marcou na ficha — a diferença entre os dois lugares é só o preço, que aparece no
 * orçamento e **nunca** na anamnese.
 *
 * Uma vista de cada vez porque o manequim precisa ficar grande para as áreas menores (buço,
 * queixo, linha alba) serem distinguíveis; a aba inativa carrega o contador para ninguém esquecer
 * o que marcou do outro lado.
 */

interface LaserAreaPickerProps {
  mapa: LaserBodyMap | null;
  /** `procedureId` das áreas escolhidas. */
  selecionadas: Set<string>;
  onToggle: (procedureId: string) => void;
  /** Preço por `procedureId`. Só o orçamento passa — a ficha da paciente nunca mostra valores. */
  precos?: Map<string, number>;
  alturaManequim?: number;
  /** Mensagem quando a clínica ainda não publicou o mapa. */
  vazioMensagem?: string;
}

export const LaserAreaPicker: React.FC<LaserAreaPickerProps> = ({
  mapa,
  selecionadas,
  onToggle,
  precos,
  alturaManequim = 520,
  vazioMensagem,
}) => {
  const [vista, setVista] = useState<LaserVista>('frente');

  const porVista = useMemo(() => {
    const frente: AreaExibida[] = [];
    const costas: AreaExibida[] = [];
    for (const entrada of mapa?.areas || []) {
      const item: AreaExibida = {
        chave: entrada.procedureId,
        nomeCurto: entrada.nomeCurto,
        area: {
          id: entrada.procedureId,
          vista: entrada.vista,
          formas: entrada.formas,
          ...(entrada.botao ? { botao: entrada.botao } : {}),
        },
        ...(precos?.has(entrada.procedureId) ? { preco: precos.get(entrada.procedureId) } : {}),
      };
      (entrada.vista === 'costas' ? costas : frente).push(item);
    }
    return { frente, costas };
  }, [mapa, precos]);

  const manequins: Record<LaserVista, string | undefined> = {
    frente: mapa?.manequimFrenteUrl,
    costas: mapa?.manequimCostasUrl,
  };

  const contar = (v: LaserVista) =>
    porVista[v].filter((a) => selecionadas.has(a.chave)).length;

  const semMapa = !mapa || mapa.areas.length === 0;

  if (semMapa) {
    return (
      <p className="text-[13px] text-[#8a8578] bg-[#F9F8F6] border border-dashed border-[#d8d2c8] rounded-2xl px-4 py-5 text-center leading-relaxed">
        {vazioMensagem || 'O mapa de áreas ainda não foi configurado pela clínica.'}
      </p>
    );
  }

  // Só oferece a aba que tem manequim E área: uma aba vazia é um beco sem saída que a pessoa
  // abre, não entende e volta.
  const vistasDisponiveis = (['frente', 'costas'] as LaserVista[]).filter(
    (v) => manequins[v] && porVista[v].length > 0
  );

  /**
   * Nenhuma vista serve: há áreas cadastradas, mas nenhuma delas tem manequim onde aparecer —
   * o caso de um mapa publicado antes de a clínica enviar as imagens.
   *
   * Sem esta saída, `vistaAtiva` ficava `undefined`, `porVista[undefined]` também, e o manequim
   * recebia `areas={undefined}` — um `Cannot read properties of undefined (reading 'map')` que
   * apagava a tela inteira.
   */
  if (vistasDisponiveis.length === 0) {
    return (
      <p className="text-[13px] text-[#8a8578] bg-[#F9F8F6] border border-dashed border-[#d8d2c8] rounded-2xl px-4 py-5 text-center leading-relaxed">
        As imagens do manequim ainda não foram enviadas pela clínica, então as áreas não têm onde
        ser mostradas. Você pode seguir normalmente e combinar as regiões no atendimento.
      </p>
    );
  }

  const vistaAtiva = vistasDisponiveis.includes(vista) ? vista : vistasDisponiveis[0];

  return (
    <div>
      {vistasDisponiveis.length > 1 && (
        <div className="flex items-center gap-1 bg-[#F1EDE7] rounded-full p-1 w-fit mx-auto mb-3">
          {vistasDisponiveis.map((v) => {
            const marcadas = contar(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                  vistaAtiva === v ? 'bg-white text-[#1A1A1A] shadow-xs' : 'text-[#8a8578]'
                }`}
              >
                {v === 'frente' ? 'Frente' : 'Costas'}
                {marcadas > 0 && (
                  <span className={vistaAtiva === v ? 'text-[#D6317F]' : 'text-[#D6317F]'}>
                    {' '}· {marcadas}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <LaserBodyMapView
        imagemUrl={manequins[vistaAtiva]}
        areas={porVista[vistaAtiva]}
        selecionadas={selecionadas}
        onToggle={onToggle}
        mostrarPreco={!!precos}
        alturaManequim={alturaManequim}
      />
    </div>
  );
};
