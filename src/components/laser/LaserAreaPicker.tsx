import React, { useMemo, useState } from 'react';
import { MapaDeAreasPublico, PatientGender } from '../../types';
import { fotoDaVista, sexoComDesenho } from '../../utils/laserAreas';
import { LaserBodyMapView, AreaExibida } from './LaserBodyMapView';

/**
 * Escolha das áreas sobre a foto do procedimento, com uma aba por vista ("Frente", "Costas"...).
 *
 * Serve à ficha da paciente e ao orçamento sem saber de qual dos dois se trata: recebe o mapa já
 * resolvido e devolve seleções. É o que garante que a paciente reconheça no orçamento a mesma
 * mancha que marcou na ficha — a diferença entre os dois lugares é só o preço, que aparece no
 * orçamento e **nunca** na anamnese.
 *
 * Uma vista de cada vez porque a foto precisa ficar grande para as áreas menores (buço, queixo,
 * linha alba) serem distinguíveis; a aba inativa carrega o contador para ninguém esquecer o que
 * marcou do outro lado.
 *
 * A foto e o desenho são os do sexo pedido. Quando a clínica só preparou um dos dois, cai no que
 * existe — um mapa vazio não ajuda ninguém a escolher.
 */

interface LaserAreaPickerProps {
  mapa: MapaDeAreasPublico | null | undefined;
  /** `id` das áreas escolhidas. */
  selecionadas: Set<string>;
  onToggle: (areaId: string) => void;
  /** Sexo da foto. Ausente = mulher. */
  sexo?: PatientGender;
  /** Quando presente, aparece o alternador Mulher/Homem — e quem chama guarda a escolha. */
  onSexoChange?: (sexo: PatientGender) => void;
  /** Preço por `id` da área. Só o orçamento passa — a ficha da paciente nunca mostra valores. */
  precos?: Map<string, number>;
  alturaManequim?: number;
  /** Mensagem quando a clínica ainda não preparou o mapa. */
  vazioMensagem?: string;
}

const ROTULO_DO_SEXO: Record<PatientGender, string> = { feminino: 'Mulher', masculino: 'Homem' };

export const LaserAreaPicker: React.FC<LaserAreaPickerProps> = ({
  mapa,
  selecionadas,
  onToggle,
  sexo = 'feminino' as PatientGender,
  onSexoChange,
  precos,
  alturaManequim = 520,
  vazioMensagem,
}) => {
  const [vistaId, setVistaId] = useState<string | null>(null);
  const sexoEfetivo = sexoComDesenho(mapa, sexo);

  /** As áreas de cada vista desenhadas neste sexo — a área sem desenho aqui não tem onde aparecer. */
  const porVista = useMemo(() => {
    const saida = new Map<string, AreaExibida[]>();
    for (const area of mapa?.areas || []) {
      const desenho = area.desenhos[sexoEfetivo];
      if (!desenho || desenho.formas.length === 0) continue;
      const item: AreaExibida = {
        chave: area.id,
        nomeCurto: area.nome,
        area: desenho,
        ...(precos?.has(area.id) ? { preco: precos.get(area.id) } : {}),
      };
      saida.set(area.vistaId, [...(saida.get(area.vistaId) || []), item]);
    }
    return saida;
  }, [mapa, precos, sexoEfetivo]);

  if (!mapa || mapa.areas.length === 0) {
    return (
      <p className="text-[13px] text-muted bg-surface border border-dashed border-line rounded-2xl px-4 py-5 text-center leading-relaxed">
        {vazioMensagem || 'O mapa de áreas ainda não foi configurado pela clínica.'}
      </p>
    );
  }

  // Só oferece a aba que tem foto E área: uma aba vazia é um beco sem saída que a pessoa abre,
  // não entende e volta.
  const vistasDisponiveis = mapa.vistas.filter(
    (v) => fotoDaVista(v, sexoEfetivo) && (porVista.get(v.id)?.length || 0) > 0
  );

  /**
   * Nenhuma vista serve: há áreas cadastradas, mas nenhuma tem foto e desenho onde aparecer.
   *
   * Sem esta saída, `vistaAtiva` ficava `undefined` e o manequim recebia `areas={undefined}` — um
   * `Cannot read properties of undefined (reading 'map')` que apagava a tela inteira.
   */
  if (vistasDisponiveis.length === 0) {
    return (
      <p className="text-[13px] text-muted bg-surface border border-dashed border-line rounded-2xl px-4 py-5 text-center leading-relaxed">
        As fotos do mapa ainda não foram preparadas pela clínica, então as áreas não têm onde ser
        mostradas. Você pode seguir normalmente e combinar as regiões no atendimento.
      </p>
    );
  }

  const vistaAtiva = vistasDisponiveis.find((v) => v.id === vistaId) || vistasDisponiveis[0];

  const contar = (id: string) =>
    (porVista.get(id) || []).filter((a) => selecionadas.has(a.chave)).length;

  return (
    <div>
      {(onSexoChange || vistasDisponiveis.length > 1) && (
        <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
          {onSexoChange && (
            <div className="flex items-center gap-1 bg-line-soft rounded-full p-1">
              {(['feminino', 'masculino'] as PatientGender[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSexoChange(s)}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                    sexoEfetivo === s ? 'bg-white text-ink shadow-xs' : 'text-muted'
                  }`}
                >
                  {ROTULO_DO_SEXO[s]}
                </button>
              ))}
            </div>
          )}

          {vistasDisponiveis.length > 1 && (
            <div className="flex items-center gap-1 bg-line-soft rounded-full p-1">
              {vistasDisponiveis.map((v) => {
                const marcadas = contar(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVistaId(v.id)}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                      vistaAtiva.id === v.id ? 'bg-white text-ink shadow-xs' : 'text-muted'
                    }`}
                  >
                    {v.nome || 'Vista'}
                    {marcadas > 0 && <span className="text-[#1D7A45]"> · {marcadas}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <LaserBodyMapView
        imagemUrl={fotoDaVista(vistaAtiva, sexoEfetivo)}
        areas={porVista.get(vistaAtiva.id) || []}
        selecionadas={selecionadas}
        onToggle={onToggle}
        mostrarPreco={!!precos}
        alturaManequim={alturaManequim}
      />
    </div>
  );
};
