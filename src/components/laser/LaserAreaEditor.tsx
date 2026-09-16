import React, { useMemo, useState } from 'react';
import { ChevronsLeftRight, Monitor, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import { ClinicProfile, LaserArea, LaserVista, Procedure } from '../../types';
import {
  areasDoCatalogo,
  criarFormaAPartirDoTraco,
  espelharForma,
  nomeCurtoDaArea,
  procedimentosSemArea,
} from '../../utils/laserAreas';
import { LaserBodyMapView, AreaExibida } from './LaserBodyMapView';

/**
 * A etapa de desenho da área, dentro do cadastro de procedimento.
 *
 * O ciclo é serial de propósito: desenha o laço, o painel de campos abre, aplica, o painel fecha e
 * a área vira botão — pronto para o próximo. São treze regiões a mapear numa sentada, e abrir e
 * fechar o modal a cada uma transformaria isso em trabalho de tarde inteira.
 *
 * As áreas dos **outros** procedimentos aparecem em cinza ao mesmo tempo. Sem elas, a segunda
 * região é desenhada por cima da primeira sem ninguém perceber — e o encavalamento só apareceria
 * lá na frente, quando uma paciente tocasse na virilha e selecionasse a linha alba.
 */

/** Abaixo disto a tela não comporta desenhar um laço à mão livre com precisão. */
const LARGURA_MINIMA_AUTORIA = 900;

interface LaserAreaEditorProps {
  procedures: Procedure[];
  clinic: ClinicProfile;
  /** Procedimento carregado no painel agora. Ausente = área nova, ainda sem dono. */
  procedimentoEmEdicao?: Procedure | null;
  laserAreas: LaserArea[];
  onLaserAreasChange: (areas: LaserArea[]) => void;
  /** Clicar num botão do mapa, ou num nome da faixa de pendentes, carrega aquele procedimento. */
  onSelecionarProcedimento: (procedimento: Procedure) => void;
  onAbrirConfiguracoes?: () => void;
  /** O painel de campos essenciais, montado por quem usa este editor. */
  children?: React.ReactNode;
}

export const LaserAreaEditor: React.FC<LaserAreaEditorProps> = ({
  procedures,
  clinic,
  procedimentoEmEdicao,
  laserAreas,
  onLaserAreasChange,
  onSelecionarProcedimento,
  onAbrirConfiguracoes,
  children,
}) => {
  const [vista, setVista] = useState<LaserVista>('frente');
  const [larguraDisponivel, setLarguraDisponivel] = useState(0);
  const medirRef = (el: HTMLDivElement | null) => {
    if (el && !larguraDisponivel) setLarguraDisponivel(el.getBoundingClientRect().width);
  };

  const manequins: Record<LaserVista, string | undefined> = {
    frente: clinic.laserManequimFrenteUrl,
    costas: clinic.laserManequimCostasUrl,
  };

  const semManequim = !manequins[vista];
  const semNenhumManequim = !clinic.laserManequimFrenteUrl && !clinic.laserManequimCostasUrl;

  /** Área do rascunho correspondente à vista aberta. Um procedimento nunca atravessa as duas. */
  const areaDaVista = laserAreas.find((a) => a.vista === vista);

  /** As áreas dos outros procedimentos, para não desenhar por cima sem perceber. */
  const areasAlheias: AreaExibida[] = useMemo(
    () =>
      areasDoCatalogo(procedures, vista)
        .filter((a) => a.procedureId !== procedimentoEmEdicao?.id)
        .map((a) => ({ chave: a.procedureId, nomeCurto: a.nomeCurto, area: a.area })),
    [procedures, vista, procedimentoEmEdicao?.id]
  );

  const chaveEmEdicao = '__rascunho__';

  const areasNaTela: AreaExibida[] = [
    ...areasAlheias,
    ...(areaDaVista
      ? [
          {
            chave: chaveEmEdicao,
            nomeCurto: procedimentoEmEdicao
              ? nomeCurtoDaArea(procedimentoEmEdicao.title)
              : 'Nova área',
            area: areaDaVista,
          },
        ]
      : []),
  ];

  const pendentes = useMemo(() => procedimentosSemArea(procedures), [procedures]);

  const contagem = {
    frente: laserAreas.find((a) => a.vista === 'frente')?.formas.length || 0,
    costas: laserAreas.find((a) => a.vista === 'costas')?.formas.length || 0,
  };

  // ==========================================
  // EDIÇÃO DAS FORMAS
  // ==========================================

  const adicionarForma = (traco: number[], largura: number, altura: number) => {
    const forma = criarFormaAPartirDoTraco(traco, largura, altura);
    if (!forma) return; // Clique trêmulo, não uma região.

    const existente = laserAreas.find((a) => a.vista === vista);
    if (existente) {
      onLaserAreasChange(
        laserAreas.map((a) =>
          a.vista === vista ? { ...a, formas: [...a.formas, forma] } : a
        )
      );
    } else {
      // Uma área nova nasce só nesta vista: as duas vistas têm sistemas de coordenadas próprios,
      // e misturar formas de frente e costas na mesma área desenharia a perna no lugar do ombro.
      onLaserAreasChange([
        ...laserAreas.filter((a) => a.vista !== vista),
        { id: crypto.randomUUID(), vista, formas: [forma] },
      ]);
    }
  };

  const desfazerUltimaForma = () => {
    const alvo = laserAreas.find((a) => a.vista === vista);
    if (!alvo) return;
    const restantes = alvo.formas.slice(0, -1);
    onLaserAreasChange(
      restantes.length > 0
        ? laserAreas.map((a) => (a.vista === vista ? { ...a, formas: restantes } : a))
        : laserAreas.filter((a) => a.vista !== vista)
    );
  };

  /** Espelha a última forma — como "Axilas" e "Maçã do Rosto" ganham o lado oposto sem redesenhar. */
  const espelharUltimaForma = () => {
    const alvo = laserAreas.find((a) => a.vista === vista);
    if (!alvo || alvo.formas.length === 0) return;
    const ultima = alvo.formas[alvo.formas.length - 1];
    onLaserAreasChange(
      laserAreas.map((a) =>
        a.vista === vista ? { ...a, formas: [...a.formas, espelharForma(ultima)] } : a
      )
    );
  };

  const limparVista = () => onLaserAreasChange(laserAreas.filter((a) => a.vista !== vista));

  // ==========================================
  // RENDER
  // ==========================================

  if (larguraDisponivel > 0 && larguraDisponivel < LARGURA_MINIMA_AUTORIA) {
    return (
      <div ref={medirRef} className="py-10 px-6 text-center">
        <Monitor className="w-7 h-7 text-[#A67C52] mx-auto mb-3" />
        <p className="text-[13px] font-semibold text-[#1A1A1A] mb-1">
          Abra no computador para editar o mapa
        </p>
        <p className="text-[12px] text-[#8a8578] leading-relaxed max-w-sm mx-auto">
          Contornar uma região à mão livre e preencher os campos ao lado precisa de tela larga. A
          seleção de áreas na ficha da paciente e no orçamento funciona normalmente no celular.
        </p>
      </div>
    );
  }

  if (semNenhumManequim) {
    return (
      <div ref={medirRef} className="py-8 px-6 text-center bg-[#FDF6E7] border border-[#F0DCB4] rounded-sm">
        <p className="text-[13px] font-semibold text-[#1A1A1A] mb-1">
          Os manequins ainda não foram enviados
        </p>
        <p className="text-[12px] text-[#8a8578] leading-relaxed max-w-md mx-auto mb-3">
          Envie as imagens de corpo frente e corpo costas nas Configurações da clínica para desenhar
          as áreas. O procedimento pode ser cadastrado normalmente enquanto isso — ele só não
          aparece no mapa.
        </p>
        {onAbrirConfiguracoes && (
          <button
            type="button"
            onClick={onAbrirConfiguracoes}
            className="px-3.5 py-2 rounded-sm bg-white border border-gray-200 text-[12px] font-medium text-[#1A1A1A] hover:border-[#A67C52] inline-flex items-center gap-1.5"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Abrir Configurações
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={medirRef} className="space-y-3">
      {/* Abas Frente / Costas — uma vista de cada vez, para o manequim ficar grande. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white/70 border border-white/80 rounded-sm p-1">
          {(['frente', 'costas'] as LaserVista[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={`px-3.5 py-1.5 rounded-xs text-[12px] font-semibold transition-colors ${
                vista === v ? 'bg-[#A67C52] text-white' : 'text-[#1A1A1A] hover:bg-white'
              }`}
            >
              {v === 'frente' ? 'Frente' : 'Costas'}
              {contagem[v] > 0 && (
                <span className={vista === v ? 'opacity-80' : 'text-gray-400'}> · {contagem[v]}</span>
              )}
            </button>
          ))}
        </div>

        {areaDaVista && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={espelharUltimaForma}
              title="Duplicar a última forma no lado oposto"
              className="px-2.5 py-1.5 rounded-xs bg-white border border-gray-200 text-[11px] font-medium text-[#1A1A1A] hover:border-[#A67C52] flex items-center gap-1"
            >
              <ChevronsLeftRight className="w-3.5 h-3.5" />
              Espelhar
            </button>
            <button
              type="button"
              onClick={desfazerUltimaForma}
              className="px-2.5 py-1.5 rounded-xs bg-white border border-gray-200 text-[11px] font-medium text-[#1A1A1A] hover:border-[#A67C52] flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Desfazer
            </button>
            <button
              type="button"
              onClick={limparVista}
              className="px-2.5 py-1.5 rounded-xs text-[11px] font-medium text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
          {semManequim ? (
            <div className="py-10 text-center bg-[#F9F8F6] border border-dashed border-[#d8d2c8] rounded-sm">
              <p className="text-[12px] text-[#8a8578]">
                O manequim de {vista === 'frente' ? 'frente' : 'costas'} ainda não foi enviado.
              </p>
            </div>
          ) : (
            <>
              <LaserBodyMapView
                imagemUrl={manequins[vista]}
                areas={areasNaTela}
                selecionadas={new Set()}
                modoAutoria
                chaveEmEdicao={chaveEmEdicao}
                onLacoConcluido={adicionarForma}
                alturaManequim={620}
              />
              <p className="text-[11px] text-[#8a8578] text-center mt-2">
                Contorne a região com o mouse. As áreas em cinza são de outros procedimentos.
              </p>
            </>
          )}
        </div>

        {/* Painel de campos — só abre depois que existe desenho, como combinado. */}
        <div className="w-[340px] shrink-0">
          {areaDaVista || procedimentoEmEdicao ? (
            children
          ) : (
            <div className="bg-white/70 border border-white/80 rounded-sm p-4">
              <p className="text-[12px] text-[#8a8578] leading-relaxed">
                Destaque uma área no manequim para abrir os campos do procedimento.
              </p>

              {pendentes.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/80">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-[#A67C52] mb-2">
                    Sem área no mapa ({pendentes.length})
                  </p>
                  <p className="text-[11px] text-[#8a8578] leading-relaxed mb-2">
                    Já existem no catálogo, com preço. Escolha um antes de desenhar para aproveitar
                    o cadastro em vez de criar um procedimento repetido.
                  </p>
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {pendentes.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelecionarProcedimento(p)}
                        className="w-full text-left px-2.5 py-1.5 rounded-xs bg-white border border-gray-200 text-[12px] text-[#1A1A1A] hover:border-[#A67C52] transition-colors"
                      >
                        {nomeCurtoDaArea(p.title)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
