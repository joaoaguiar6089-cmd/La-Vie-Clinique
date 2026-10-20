import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronsLeftRight,
  Copy,
  Image as ImageIcon,
  Monitor,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AreaDoProcedimento, DesenhoDaArea, PatientGender, Procedure, VistaDoMapa } from '../../types';
import {
  criarFormaAPartirDoTraco,
  espelharForma,
  fotoDaVista,
  LASER_MANEQUIM_MAX_LADO,
  nomeCurtoDaArea,
  outroSexo,
  precoDaArea,
} from '../../utils/laserAreas';
import { formatBRL } from '../../utils/formatters';
import { LaserBodyMapView, AreaExibida } from './LaserBodyMapView';
import { ImageCropperModal, AspectOption } from '../ImageCropperModal';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { CampoMaisDeUmaSessao } from '../common/CampoMaisDeUmaSessao';

/**
 * O mapa de áreas dentro do cadastro do procedimento — o que abre quando "Exige seleção de área"
 * está marcado.
 *
 * Duas partes, na ordem em que a pessoa precisa delas:
 *
 * 1. **Fotos.** As vistas têm nome livre ("Frente", "Costas", "Rosto"), e cada uma leva uma foto de
 *    mulher e uma de homem.
 * 2. **Áreas.** Contorna-se a região na foto, o painel ao lado pede nome e valor, e "Concluir área"
 *    a põe na lista. O desenho é feito em cada sexo separadamente — as silhuetas são diferentes —,
 *    com "copiar do outro sexo" como ponto de partida.
 *
 * Nada aqui grava: vistas e áreas são estado do formulário e vão para o banco no "Salvar" do
 * procedimento, junto com o resto. O painel lateral já pede confirmação ao fechar com alteração.
 *
 * As áreas vizinhas aparecem em cinza enquanto uma é editada. Sem elas, a segunda região é
 * desenhada por cima da primeira sem ninguém perceber — e o encavalamento só apareceria lá na
 * frente, quando uma paciente tocasse na virilha e selecionasse a linha alba.
 */

/**
 * Abaixo desta largura **de janela** a tela não comporta desenhar um laço à mão livre com precisão.
 *
 * Mede a janela, e não o contêiner: a largura do contêiner é decisão nossa, então usá-la para
 * decidir "cabe ou não cabe" faz o editor diagnosticar como celular um desktop cujo painel por
 * acaso estava estreito. A janela é a única medida que de fato responde "que aparelho é este".
 */
const LARGURA_MINIMA_AUTORIA = 1000;

const ROTULO_DO_SEXO: Record<PatientGender, string> = { feminino: 'Mulher', masculino: 'Homem' };
const SEXOS: PatientGender[] = ['feminino', 'masculino'];

/** A área em edição, com os números ainda como texto digitado. */
interface Rascunho {
  id: string;
  nova: boolean;
  nome: string;
  vistaId: string;
  price: string;
  promotionalPrice: string;
  priceNote: string;
  duration: string;
  maisDeUmaSessao: boolean;
  sessoes: string;
  desenhos: Partial<Record<PatientGender, DesenhoDaArea>>;
}

const rascunhoVazio = (vistaId: string): Rascunho => ({
  id: crypto.randomUUID(),
  nova: true,
  nome: '',
  vistaId,
  price: '',
  promotionalPrice: '',
  priceNote: '',
  duration: '',
  maisDeUmaSessao: false,
  sessoes: '',
  desenhos: {},
});

const rascunhoDaArea = (area: AreaDoProcedimento): Rascunho => ({
  id: area.id,
  nova: false,
  nome: area.nome,
  vistaId: area.vistaId,
  price: String(area.price ?? ''),
  promotionalPrice: area.promotionalPrice ? String(area.promotionalPrice) : '',
  priceNote: area.priceNote || '',
  duration: area.duration || '',
  maisDeUmaSessao: (area.sessoesInclusas || 1) > 1,
  sessoes: (area.sessoesInclusas || 1) > 1 ? String(area.sessoesInclusas) : '',
  desenhos: area.desenhos,
});

const temFormas = (desenho?: DesenhoDaArea): desenho is DesenhoDaArea =>
  !!desenho && desenho.formas.length > 0;

const temAlgumDesenho = (desenhos: Partial<Record<PatientGender, DesenhoDaArea>>) =>
  SEXOS.some((s) => temFormas(desenhos[s]));

/** Proporção (largura / altura) de uma imagem já enviada — a trava da troca. */
const proporcaoDaImagem = (url: string): Promise<number | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });

/** Enter num campo de texto submeteria o cadastro do procedimento inteiro. */
const semEnviarNoEnter = (aoEnter?: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    aoEnter?.();
  }
};

const CLASSE_CAMPO =
  'w-full px-3 py-2 rounded-sm bg-white border border-gray-200 text-xs text-ink focus:outline-hidden focus:border-brand';
const CLASSE_BOTAO_LEVE =
  'px-2.5 py-1.5 rounded-xs bg-white border border-gray-200 text-body font-medium text-ink hover:border-brand flex items-center gap-1 transition-colors disabled:opacity-40 disabled:hover:border-gray-200';

interface MapaDeAreasEditorProps {
  vistas: VistaDoMapa[];
  onVistasChange: (vistas: VistaDoMapa[]) => void;
  areas: AreaDoProcedimento[];
  onAreasChange: (areas: AreaDoProcedimento[]) => void;
  /** Avisa quem chama que há uma área aberta e não concluída — o "Salvar" precisa saber. */
  onEmEdicaoChange?: (emEdicao: boolean) => void;
  /** Procedimentos de área antigos que podem virar áreas deste. */
  paraConverter?: Procedure[];
  onConverter?: () => void;
  /** Erro da validação do formulário, sobre o mapa. */
  erro?: string;
}

export const MapaDeAreasEditor: React.FC<MapaDeAreasEditorProps> = ({
  vistas,
  onVistasChange,
  areas,
  onAreasChange,
  onEmEdicaoChange,
  paraConverter = [],
  onConverter,
  erro,
}) => {
  const [vistaId, setVistaId] = useState<string | null>(vistas[0]?.id ?? null);
  const [sexo, setSexo] = useState<PatientGender>('feminino');
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [errosDoRascunho, setErrosDoRascunho] = useState<Record<string, string>>({});
  const [modoAjuste, setModoAjuste] = useState(false);
  const [emFoco, setEmFoco] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [recorte, setRecorte] = useState<{
    vistaId: string;
    sexo: PatientGender;
    source: File;
    opcoes: AspectOption[];
    substituindo: boolean;
  } | null>(null);

  // Acompanha o redimensionamento em vez de medir uma vez só: a medição única travava o
  // diagnóstico para sempre, e nem girar o aparelho nem maximizar a janela o desfaziam.
  const [larguraDaJanela, setLarguraDaJanela] = useState(() =>
    typeof window === 'undefined' ? LARGURA_MINIMA_AUTORIA : window.innerWidth
  );
  useEffect(() => {
    const aoRedimensionar = () => setLarguraDaJanela(window.innerWidth);
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  useEffect(() => {
    onEmEdicaoChange?.(!!rascunho);
  }, [rascunho, onEmEdicaoChange]);

  const vistaAtiva = vistas.find((v) => v.id === vistaId) || vistas[0];
  const fotoAtiva = vistaAtiva ? fotoDaVista(vistaAtiva, sexo) : undefined;
  const areasDaVista = useMemo(
    () => (vistaAtiva ? areas.filter((a) => a.vistaId === vistaAtiva.id) : []),
    [areas, vistaAtiva]
  );

  const desenhoDoRascunho = rascunho?.desenhos[sexo];
  const desenhoDoOutroSexo = rascunho?.desenhos[outroSexo(sexo)];
  const rascunhoNestaVista = !!rascunho && !!vistaAtiva && rascunho.vistaId === vistaAtiva.id;

  // ==========================================
  // FOTOS
  // ==========================================

  const adicionarVista = () => {
    const nova: VistaDoMapa = { id: crypto.randomUUID(), nome: vistas.length === 0 ? 'Frente' : '' };
    onVistasChange([...vistas, nova]);
    if (!rascunho) setVistaId(nova.id);
  };

  const renomearVista = (id: string, nome: string) =>
    onVistasChange(vistas.map((v) => (v.id === id ? { ...v, nome } : v)));

  const removerVista = (vista: VistaDoMapa) => {
    const daVista = areas.filter((a) => a.vistaId === vista.id);
    const remover = () => {
      onVistasChange(vistas.filter((v) => v.id !== vista.id));
      if (daVista.length > 0) onAreasChange(areas.filter((a) => a.vistaId !== vista.id));
      if (rascunho?.vistaId === vista.id) setRascunho(null);
      if (vistaId === vista.id) setVistaId(null);
    };
    if (daVista.length === 0 && !fotoDaVista(vista, 'feminino') && !fotoDaVista(vista, 'masculino')) {
      remover();
      return;
    }
    setConfirmacao({
      titulo: `Remover a vista "${vista.nome || 'sem nome'}"?`,
      mensagem:
        daVista.length > 0
          ? `As fotos e ${daVista.length === 1 ? 'a área' : `as ${daVista.length} áreas`} desta vista (${daVista
              .map((a) => a.nome)
              .join(', ')}) saem do procedimento ao salvar.`
          : 'As fotos desta vista saem do procedimento ao salvar.',
      textoConfirmar: 'Remover vista',
      tom: 'perigo',
      onConfirmar: remover,
    });
  };

  /** Áreas desta vista com desenho neste sexo — o que a troca de foto deslocaria. */
  const desenhosNaFoto = (idDaVista: string, s: PatientGender) =>
    areas.filter((a) => a.vistaId === idDaVista && temFormas(a.desenhos[s]));

  /**
   * Troca de foto é travada na proporção da que já está lá — mas só quando há desenho sobre ela.
   *
   * As áreas guardam coordenadas relativas à imagem (0–1). Substituir por um arquivo mais largo ou
   * mais alto não moveria um número sequer, mas jogaria a virilha na coxa em todas as áreas daquela
   * foto de uma vez — um estrago silencioso, que só aparece quando alguém abre o mapa.
   */
  const escolherFoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    vista: VistaDoMapa,
    s: PatientGender
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    const atual = fotoDaVista(vista, s);
    const travar = !!atual && desenhosNaFoto(vista.id, s).length > 0;
    const proporcao = travar && atual ? await proporcaoDaImagem(atual) : null;

    setRecorte({
      vistaId: vista.id,
      sexo: s,
      source: file,
      opcoes: proporcao
        ? [{ id: 'atual', label: 'Proporção atual', ratio: proporcao }]
        : [
            { id: 'original', label: 'Original', ratio: null },
            { id: 'corpo', label: 'Corpo inteiro', ratio: 1 / 2.2 },
            { id: 'quadrado', label: 'Quadrado', ratio: 1 },
          ],
      substituindo: !!proporcao,
    });
  };

  const definirFoto = (idDaVista: string, s: PatientGender, url: string | undefined) =>
    onVistasChange(
      vistas.map((v) =>
        v.id === idDaVista
          ? s === 'masculino'
            ? { ...v, fotoMasculinaUrl: url }
            : { ...v, fotoFemininaUrl: url }
          : v
      )
    );

  /** Tirar a foto apaga os desenhos dela: sem a imagem, eles não têm onde se apoiar. */
  const removerFoto = (vista: VistaDoMapa, s: PatientGender) => {
    const afetadas = desenhosNaFoto(vista.id, s);
    const remover = () => {
      definirFoto(vista.id, s, undefined);
      if (afetadas.length > 0) {
        onAreasChange(
          areas.map((a) => {
            if (a.vistaId !== vista.id || !a.desenhos[s]) return a;
            const { [s]: _apagado, ...resto } = a.desenhos;
            return { ...a, desenhos: resto };
          })
        );
      }
    };
    if (afetadas.length === 0) {
      remover();
      return;
    }
    setConfirmacao({
      titulo: `Remover a foto de ${ROTULO_DO_SEXO[s].toLowerCase()}?`,
      mensagem: `O desenho de ${afetadas.length === 1 ? '1 área' : `${afetadas.length} áreas`} nesta foto é apagado junto. As áreas continuam, com nome e valor, e podem ser desenhadas de novo na foto nova.`,
      textoConfirmar: 'Remover foto',
      tom: 'perigo',
      onConfirmar: remover,
    });
  };

  // ==========================================
  // ÁREA EM EDIÇÃO
  // ==========================================

  const abrirArea = (area: AreaDoProcedimento) => {
    setRascunho(rascunhoDaArea(area));
    setErrosDoRascunho({});
    setVistaId(area.vistaId);
    setModoAjuste(false);
  };

  const mudarRascunho = (mudanca: Partial<Rascunho>) =>
    setRascunho((atual) => (atual ? { ...atual, ...mudanca } : atual));

  const definirDesenho = (s: PatientGender, desenho: DesenhoDaArea | undefined) =>
    setRascunho((atual) => {
      if (!atual) return atual;
      const { [s]: _antigo, ...resto } = atual.desenhos;
      return { ...atual, desenhos: desenho && desenho.formas.length > 0 ? { ...resto, [s]: desenho } : resto };
    });

  /** Um laço solto na foto: vira forma da área aberta, ou abre uma área nova com ele. */
  const adicionarForma = (traco: number[], largura: number, altura: number) => {
    if (!vistaAtiva) return;
    const forma = criarFormaAPartirDoTraco(traco, largura, altura);
    if (!forma) return; // Clique trêmulo, não uma região.

    setRascunho((atual) => {
      const base = atual ?? rascunhoVazio(vistaAtiva.id);
      const desenho = base.desenhos[sexo];
      return {
        ...base,
        desenhos: {
          ...base.desenhos,
          [sexo]: { ...(desenho || {}), formas: [...(desenho?.formas || []), forma] },
        },
      };
    });
    if (!rascunho) setErrosDoRascunho({});
  };

  const desfazerUltimaForma = () => {
    if (!temFormas(desenhoDoRascunho)) return;
    definirDesenho(sexo, { ...desenhoDoRascunho, formas: desenhoDoRascunho.formas.slice(0, -1) });
  };

  /** Espelha a última forma — como "Axilas" e "Maçã do Rosto" ganham o lado oposto sem redesenhar. */
  const espelharUltimaForma = () => {
    if (!temFormas(desenhoDoRascunho)) return;
    const ultima = desenhoDoRascunho.formas[desenhoDoRascunho.formas.length - 1];
    definirDesenho(sexo, {
      ...desenhoDoRascunho,
      formas: [...desenhoDoRascunho.formas, espelharForma(ultima)],
    });
  };

  const limparDesenho = () => definirDesenho(sexo, undefined);

  /** O desenho do outro sexo como ponto de partida — as formas, sem a posição do botão. */
  const copiarDoOutroSexo = () => {
    if (!temFormas(desenhoDoOutroSexo)) return;
    definirDesenho(sexo, { formas: desenhoDoOutroSexo.formas.map((f) => [...f]) });
  };

  const concluirArea = () => {
    if (!rascunho) return;
    const erros: Record<string, string> = {};
    if (!rascunho.nome.trim()) erros.nome = 'Dê um nome à área.';
    const preco = Number(rascunho.price);
    if (rascunho.price.trim() === '' || isNaN(preco) || preco < 0) erros.price = 'Informe o valor.';
    if (Object.keys(erros).length > 0) {
      setErrosDoRascunho(erros);
      return;
    }

    const promocional = Number(rascunho.promotionalPrice);
    const sessoes = rascunho.maisDeUmaSessao
      ? Math.max(2, Math.floor(Number(rascunho.sessoes)) || 2)
      : undefined;
    const area: AreaDoProcedimento = {
      id: rascunho.id,
      nome: rascunho.nome.trim(),
      vistaId: rascunho.vistaId,
      price: preco,
      ...(promocional > 0 ? { promotionalPrice: promocional } : {}),
      ...(rascunho.priceNote.trim() ? { priceNote: rascunho.priceNote.trim() } : {}),
      ...(rascunho.duration.trim() ? { duration: rascunho.duration.trim() } : {}),
      ...(sessoes ? { sessoesInclusas: sessoes } : {}),
      desenhos: rascunho.desenhos,
    };

    onAreasChange(
      rascunho.nova ? [...areas, area] : areas.map((a) => (a.id === area.id ? area : a))
    );
    setRascunho(null);
    setErrosDoRascunho({});
  };

  const excluirArea = (area: Pick<AreaDoProcedimento, 'id' | 'nome'>) =>
    setConfirmacao({
      titulo: `Excluir a área "${area.nome || 'sem nome'}"?`,
      mensagem:
        'Ela sai do mapa e do procedimento ao salvar. Orçamentos e fichas já gravados com ela não mudam.',
      textoConfirmar: 'Excluir área',
      tom: 'perigo',
      onConfirmar: () => {
        onAreasChange(areas.filter((a) => a.id !== area.id));
        if (rascunho?.id === area.id) setRascunho(null);
      },
    });

  /** Trocar de vista com a área aberta só vale enquanto ela não tem desenho: uma área é de uma vista. */
  const escolherVista = (id: string) => {
    if (rascunho && rascunho.vistaId !== id) {
      if (temAlgumDesenho(rascunho.desenhos)) return;
      mudarRascunho({ vistaId: id });
    }
    setVistaId(id);
  };

  // ==========================================
  // BOTÕES DO ANEL
  // ==========================================

  const moverBotao = (areaId: string, posicao: { x: number; y: number }) => {
    const arredondado = {
      x: Math.round(posicao.x * 1000) / 1000,
      y: Math.round(posicao.y * 1000) / 1000,
    };
    onAreasChange(
      areas.map((a) => {
        const desenho = a.desenhos[sexo];
        if (a.id !== areaId || !desenho) return a;
        return { ...a, desenhos: { ...a.desenhos, [sexo]: { ...desenho, botao: arredondado } } };
      })
    );
  };

  const voltarBotaoAoAutomatico = (areaId: string) =>
    onAreasChange(
      areas.map((a) => {
        const desenho = a.desenhos[sexo];
        if (a.id !== areaId || !desenho?.botao) return a;
        return { ...a, desenhos: { ...a.desenhos, [sexo]: { formas: desenho.formas } } };
      })
    );

  /** Áreas desta vista desenhadas no outro sexo mas ainda não neste. */
  const faltamNesteSexo = areasDaVista.filter(
    (a) => !temFormas(a.desenhos[sexo]) && temFormas(a.desenhos[outroSexo(sexo)])
  );

  const copiarOsQueFaltam = () =>
    onAreasChange(
      areas.map((a) =>
        faltamNesteSexo.some((f) => f.id === a.id)
          ? {
              ...a,
              desenhos: {
                ...a.desenhos,
                [sexo]: { formas: a.desenhos[outroSexo(sexo)]!.formas.map((f) => [...f]) },
              },
            }
          : a
      )
    );

  // ==========================================
  // RENDER
  // ==========================================

  const areasNaTela: AreaExibida[] = [
    ...areasDaVista
      .filter((a) => a.id !== rascunho?.id && temFormas(a.desenhos[sexo]))
      .map((a) => ({ chave: a.id, nomeCurto: a.nome, area: a.desenhos[sexo]! })),
    ...(rascunhoNestaVista && temFormas(desenhoDoRascunho)
      ? [{ chave: rascunho!.id, nomeCurto: rascunho!.nome || 'Nova área', area: desenhoDoRascunho }]
      : []),
  ];

  const podeDesenhar = larguraDaJanela >= LARGURA_MINIMA_AUTORIA;

  const statusDoDesenho = (desenhos: Partial<Record<PatientGender, DesenhoDaArea>>) => (
    <span className="flex items-center gap-1.5">
      {SEXOS.map((s) => (
        <span
          key={s}
          className={`text-label px-1.5 py-px rounded-xs border ${
            temFormas(desenhos[s])
              ? 'bg-ok-bg border-[#C8E6C9] text-ok'
              : 'bg-surface border-line text-gray-400'
          }`}
        >
          {ROTULO_DO_SEXO[s]} {temFormas(desenhos[s]) ? '✓' : '—'}
        </span>
      ))}
    </span>
  );

  const painelDaArea = rascunho && (
    <div className="bg-white/70 border border-white/80 rounded-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-label uppercase tracking-wider font-semibold text-brand">
          {rascunho.nova ? 'Nova área' : 'Editando área'}
        </p>
        {statusDoDesenho(rascunho.desenhos)}
      </div>

      {!temFormas(desenhoDoRascunho) && (
        <p className="text-body text-muted leading-snug">
          Contorne a região na foto de {ROTULO_DO_SEXO[sexo].toLowerCase()} para desenhar esta área.
        </p>
      )}

      <div>
        <label className="block text-body font-medium text-ink mb-1">Nome da área *</label>
        <input
          type="text"
          value={rascunho.nome}
          onChange={(e) => mudarRascunho({ nome: e.target.value })}
          onKeyDown={semEnviarNoEnter(concluirArea)}
          placeholder="Ex.: Axilas"
          className={`${CLASSE_CAMPO} ${errosDoRascunho.nome ? 'border-red-400' : ''}`}
        />
        {errosDoRascunho.nome && <p className="text-label text-red-600 mt-1">{errosDoRascunho.nome}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-body font-medium text-ink mb-1">Valor (R$) *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rascunho.price}
            onChange={(e) => mudarRascunho({ price: e.target.value })}
            onKeyDown={semEnviarNoEnter(concluirArea)}
            className={`${CLASSE_CAMPO} ${errosDoRascunho.price ? 'border-red-400' : ''}`}
          />
          {errosDoRascunho.price && (
            <p className="text-label text-red-600 mt-1">{errosDoRascunho.price}</p>
          )}
        </div>
        <div>
          <label className="block text-body font-medium text-ink mb-1">Promocional</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rascunho.promotionalPrice}
            onChange={(e) => mudarRascunho({ promotionalPrice: e.target.value })}
            onKeyDown={semEnviarNoEnter(concluirArea)}
            className={CLASSE_CAMPO}
          />
        </div>
      </div>

      <div>
        <label className="block text-body font-medium text-ink mb-1">Observação de preço</label>
        <input
          type="text"
          value={rascunho.priceNote}
          onChange={(e) => mudarRascunho({ priceNote: e.target.value })}
          onKeyDown={semEnviarNoEnter(concluirArea)}
          placeholder="por sessão"
          className={CLASSE_CAMPO}
        />
      </div>

      <div>
        <label className="block text-body font-medium text-ink mb-1">Duração</label>
        <input
          type="text"
          value={rascunho.duration}
          onChange={(e) => mudarRascunho({ duration: e.target.value })}
          onKeyDown={semEnviarNoEnter(concluirArea)}
          placeholder="20 min"
          className={CLASSE_CAMPO}
        />
      </div>

      <CampoMaisDeUmaSessao
        marcado={rascunho.maisDeUmaSessao}
        quantidade={rascunho.sessoes}
        onMarcar={(marcado) =>
          mudarRascunho({
            maisDeUmaSessao: marcado,
            ...(marcado && !(Number(rascunho.sessoes) >= 2) ? { sessoes: '2' } : {}),
          })
        }
        onQuantidade={(sessoes) => mudarRascunho({ sessoes })}
        inputClassName="px-2.5 py-1.5 rounded-sm bg-white border border-gray-200 text-xs text-ink focus:outline-hidden focus:border-brand"
      />

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={concluirArea}
          className="flex-1 px-4 py-2.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-widest hover:bg-brand-hover active:scale-95 transition-all flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          Concluir área
        </button>
        <button
          type="button"
          onClick={() => {
            setRascunho(null);
            setErrosDoRascunho({});
          }}
          className="px-3 py-2.5 rounded-sm border border-line text-xs font-medium text-muted hover:text-ink"
        >
          Cancelar
        </button>
      </div>

      {!rascunho.nova && (
        <button
          type="button"
          onClick={() => excluirArea(rascunho)}
          className="w-full text-body text-red-500 hover:text-red-700 font-medium flex items-center justify-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Excluir área
        </button>
      )}
    </div>
  );

  /** A lista das áreas de uma vista. No desktop, a da aba aberta; no celular, uma por vista. */
  const listaDeAreas = (vista: VistaDoMapa) => {
    const daVista = areas.filter((a) => a.vistaId === vista.id);
    const ehAtiva = vista.id === vistaAtiva?.id;
    return (
      <div key={vista.id} className="bg-white/70 border border-white/80 rounded-sm">
        <p className="px-3 py-2 text-label uppercase tracking-wider font-semibold text-brand border-b border-white/80">
          Áreas {vista.nome ? `em ${vista.nome}` : 'desta vista'} ({daVista.length})
        </p>
        {daVista.length === 0 ? (
          <p className="px-3 py-3 text-body text-muted leading-relaxed">
            Nenhuma ainda.{podeDesenhar && ehAtiva && fotoAtiva ? ' Contorne uma região na foto para criar a primeira.' : ''}
          </p>
        ) : (
          <div className="max-h-[380px] overflow-y-auto divide-y divide-white/80">
            {daVista.map((a) => (
              <div
                key={a.id}
                onMouseEnter={() => setEmFoco(a.id)}
                onMouseLeave={() => setEmFoco((atual) => (atual === a.id ? null : atual))}
                className={`px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                  emFoco === a.id ? 'bg-[#FDF3F7]' : ''
                }`}
              >
                <div className="min-w-0">
                  <span className="block text-[12px] text-ink truncate">{a.nome || 'Sem nome'}</span>
                  <span className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-label text-gray-500 tabular-nums">{formatBRL(precoDaArea(a))}</span>
                    {statusDoDesenho(a.desenhos)}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {podeDesenhar && a.desenhos[sexo]?.botao && (
                    <button
                      type="button"
                      title="Voltar o botão à posição automática"
                      onClick={() => voltarBotaoAoAutomatico(a.id)}
                      className="p-1 rounded-xs text-gray-400 hover:text-brand hover:bg-white"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {podeDesenhar && (
                    <button
                      type="button"
                      title="Editar a área"
                      onClick={() => abrirArea(a)}
                      className="p-1 rounded-xs text-gray-400 hover:text-brand hover:bg-white"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Excluir a área"
                    onClick={() => excluirArea(a)}
                    className="p-1 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {podeDesenhar && ehAtiva && fotoAtiva && faltamNesteSexo.length > 0 && (
          <div className="px-3 py-2.5 border-t border-white/80">
            <button type="button" onClick={copiarOsQueFaltam} className={`${CLASSE_BOTAO_LEVE} w-full justify-center`}>
              <Copy className="w-3.5 h-3.5" />
              Copiar para {ROTULO_DO_SEXO[sexo].toLowerCase()} os desenhos que faltam ({faltamNesteSexo.length})
            </button>
            <p className="text-label text-muted leading-snug mt-1.5">
              Usa o desenho de {ROTULO_DO_SEXO[outroSexo(sexo)].toLowerCase()} como ponto de partida.
              Confira cada um: as silhuetas mudam.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {erro && (
        <p className="text-[12px] text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {erro}
        </p>
      )}

      {/* Os procedimentos de área antigos, um por região: vêm para dentro deste de uma vez. */}
      {paraConverter.length > 0 && onConverter && (
        <div className="bg-warn-bg border border-[#F0DCB4] rounded-sm px-3.5 py-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              {paraConverter.length === 1
                ? 'Há 1 procedimento de depilação a laser cadastrado como área separada'
                : `Há ${paraConverter.length} procedimentos de depilação a laser cadastrados um a um`}
            </p>
            <p className="text-body text-muted leading-relaxed mt-0.5">
              {paraConverter
                .slice(0, 6)
                .map((p) => nomeCurtoDaArea(p.title))
                .join(', ')}
              {paraConverter.length > 6 ? '…' : ''}. Traga-os para dentro deste procedimento como
              áreas, com preços e desenhos. Ao salvar, eles saem do catálogo — continuam guardados,
              e fichas e orçamentos antigos seguem abrindo.
            </p>
          </div>
          <button
            type="button"
            onClick={onConverter}
            className="px-3.5 py-2 rounded-sm bg-brand text-white text-[12px] font-semibold hover:bg-brand-hover transition-colors shrink-0"
          >
            Trazer {paraConverter.length === 1 ? 'como área' : `as ${paraConverter.length} áreas`}
          </button>
        </div>
      )}

      {/* ==========================================
          1. FOTOS
          ========================================== */}
      <div className="space-y-3">
        <div>
          <h4 className="text-label font-semibold uppercase tracking-wider text-brand">
            Fotos para marcar as áreas
          </h4>
          <p className="text-body text-gray-500 leading-relaxed mt-0.5">
            Dê um nome a cada vista ("Frente", "Costas", "Rosto") e envie a foto de mulher e a de
            homem. PNG com fundo transparente fica melhor.
          </p>
        </div>

        {vistas.map((vista) => (
          <div key={vista.id} className="bg-white/70 border border-white/80 rounded-sm p-3 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={vista.nome}
                onChange={(e) => renomearVista(vista.id, e.target.value)}
                onKeyDown={semEnviarNoEnter()}
                placeholder="Nome da vista — ex.: Costas"
                aria-label="Nome da vista"
                className={`${CLASSE_CAMPO} font-medium`}
              />
              <button
                type="button"
                onClick={() => removerVista(vista)}
                title="Remover esta vista"
                className="p-2 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SEXOS.map((s) => {
                const url = fotoDaVista(vista, s);
                return (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <span className="text-label font-semibold text-ink uppercase tracking-wider">
                      {ROTULO_DO_SEXO[s]}
                    </span>
                    <div className="h-36 flex items-center justify-center w-full bg-surface rounded-xs border border-dashed border-line overflow-hidden">
                      {url ? (
                        <img src={url} alt={`${vista.nome} — ${ROTULO_DO_SEXO[s]}`} className="h-full w-auto object-contain" />
                      ) : (
                        <span className="text-label text-gray-400">Nenhuma foto</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <label className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-body font-medium text-ink hover:border-brand cursor-pointer transition-colors flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {url ? 'Trocar' : 'Enviar'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => void escolherFoto(e, vista, s)}
                          className="hidden"
                        />
                      </label>
                      {url && (
                        <button
                          type="button"
                          onClick={() => removerFoto(vista, s)}
                          className="text-body text-red-500 hover:text-red-700 font-medium"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <button type="button" onClick={adicionarVista} className={CLASSE_BOTAO_LEVE}>
          <Plus className="w-3.5 h-3.5" />
          Adicionar vista
        </button>

        {aviso && (
          <p className="text-body text-warn bg-warn-bg border border-[#F0DCB4] rounded-sm px-3 py-2 leading-relaxed">
            {aviso}
          </p>
        )}
      </div>

      {/* ==========================================
          2. ÁREAS
          ========================================== */}
      {vistaAtiva && (
        <div className="space-y-3">
          <div>
            <h4 className="text-label font-semibold uppercase tracking-wider text-brand">
              Áreas e valores
            </h4>
            <p className="text-body text-gray-500 leading-relaxed mt-0.5">
              Contorne cada região na foto e dê nome e valor a ela. Cada área é desenhada na foto de
              mulher e na de homem.
            </p>
          </div>

          {!podeDesenhar ? (
            <>
              <div className="py-6 px-6 text-center bg-white/70 border border-white/80 rounded-sm">
                <Monitor className="w-6 h-6 text-brand mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-ink mb-1">
                  Abra no computador para desenhar as áreas
                </p>
                <p className="text-[12px] text-muted leading-relaxed max-w-sm mx-auto">
                  Contornar uma região à mão livre e preencher os campos ao lado precisa de tela
                  larga. A seleção de áreas na ficha da paciente e no orçamento funciona normalmente
                  no celular.
                </p>
              </div>
              {vistas.map(listaDeAreas)}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {vistas.length > 1 && (
                    <div className="flex items-center gap-1 bg-white/70 border border-white/80 rounded-sm p-1">
                      {vistas.map((v) => {
                        const quantas = areas.filter((a) => a.vistaId === v.id).length;
                        const bloqueada =
                          !!rascunho && rascunho.vistaId !== v.id && temAlgumDesenho(rascunho.desenhos);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => escolherVista(v.id)}
                            disabled={bloqueada}
                            title={bloqueada ? 'Uma área fica numa vista só. Conclua ou cancele a área aberta.' : undefined}
                            className={`px-3.5 py-1.5 rounded-xs text-[12px] font-semibold transition-colors disabled:opacity-40 ${
                              vistaAtiva.id === v.id ? 'bg-brand text-white' : 'text-ink hover:bg-white'
                            }`}
                          >
                            {v.nome || 'Sem nome'}
                            {quantas > 0 && (
                              <span className={vistaAtiva.id === v.id ? 'opacity-80' : 'text-gray-400'}>
                                {' '}· {quantas}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-1 bg-white/70 border border-white/80 rounded-sm p-1">
                    {SEXOS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSexo(s)}
                        className={`px-3.5 py-1.5 rounded-xs text-[12px] font-semibold transition-colors ${
                          sexo === s ? 'bg-ink text-white' : 'text-ink hover:bg-white'
                        }`}
                      >
                        {ROTULO_DO_SEXO[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {rascunhoNestaVista ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {temFormas(desenhoDoOutroSexo) && !temFormas(desenhoDoRascunho) && (
                      <button type="button" onClick={copiarDoOutroSexo} className={CLASSE_BOTAO_LEVE}>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar de {ROTULO_DO_SEXO[outroSexo(sexo)].toLowerCase()}
                      </button>
                    )}
                    {temFormas(desenhoDoRascunho) && (
                      <>
                        <button
                          type="button"
                          onClick={espelharUltimaForma}
                          title="Duplicar a última forma no lado oposto"
                          className={CLASSE_BOTAO_LEVE}
                        >
                          <ChevronsLeftRight className="w-3.5 h-3.5" />
                          Espelhar
                        </button>
                        <button type="button" onClick={desfazerUltimaForma} className={CLASSE_BOTAO_LEVE}>
                          <RotateCcw className="w-3.5 h-3.5" />
                          Desfazer
                        </button>
                        <button
                          type="button"
                          onClick={limparDesenho}
                          className="px-2.5 py-1.5 rounded-xs text-body font-medium text-red-500 hover:text-red-700 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Limpar
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  areasNaTela.length > 0 && (
                    <label className="flex items-center gap-2 text-[12px] text-ink cursor-pointer bg-white/70 border border-white/80 rounded-sm px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={modoAjuste}
                        onChange={(e) => setModoAjuste(e.target.checked)}
                        className="w-3.5 h-3.5 accent-brand"
                      />
                      <Move className="w-3.5 h-3.5 text-brand" />
                      Arrastar botões
                    </label>
                  )
                )}
              </div>

              <div className="flex gap-5 items-start">
                <div className="flex-1 min-w-0">
                  {!fotoAtiva ? (
                    <div className="py-12 px-6 text-center bg-surface border border-dashed border-line rounded-sm">
                      <p className="text-[12px] text-muted">
                        Envie acima a foto de {ROTULO_DO_SEXO[sexo].toLowerCase()} de{' '}
                        {vistaAtiva.nome ? `"${vistaAtiva.nome}"` : 'esta vista'} para desenhar as áreas
                        nela.
                      </p>
                    </div>
                  ) : modoAjuste && !rascunho ? (
                    <>
                      <LaserBodyMapView
                        imagemUrl={fotoAtiva}
                        areas={areasNaTela}
                        selecionadas={new Set(emFoco ? [emFoco] : [])}
                        onToggle={(chave) => setEmFoco((atual) => (atual === chave ? null : chave))}
                        onMoverBotao={moverBotao}
                        alturaManequim={620}
                      />
                      <p className="text-body text-muted text-center mt-2">
                        Arraste um botão para onde ele deve ficar. Vale para a foto de{' '}
                        {ROTULO_DO_SEXO[sexo].toLowerCase()}; os botões só aparecem em volta da foto
                        com a janela bem larga.
                      </p>
                    </>
                  ) : (
                    <>
                      <LaserBodyMapView
                        imagemUrl={fotoAtiva}
                        areas={areasNaTela}
                        selecionadas={new Set()}
                        modoAutoria
                        chaveEmEdicao={rascunhoNestaVista ? rascunho!.id : undefined}
                        onLacoConcluido={adicionarForma}
                        onToggle={(chave) => {
                          if (rascunho) return;
                          const area = areas.find((a) => a.id === chave);
                          if (area) abrirArea(area);
                        }}
                        alturaManequim={620}
                      />
                      <p className="text-body text-muted text-center mt-2">
                        {rascunho
                          ? 'Contorne a região com o mouse. As áreas em cinza são as outras deste procedimento.'
                          : 'Contorne uma região com o mouse para criar uma área, ou clique numa área da lista para editá-la.'}
                      </p>
                    </>
                  )}
                </div>

                <div className="w-[320px] shrink-0 space-y-3">
                  {painelDaArea || listaDeAreas(vistaAtiva)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* PNG para preservar o fundo transparente, e lado maior generoso: as áreas desenhadas por
          cima precisam ficar nítidas. */}
      <ImageCropperModal
        isOpen={recorte !== null}
        source={recorte?.source ?? null}
        title="Enquadrar foto do mapa"
        description={
          recorte?.substituindo
            ? 'A proporção está travada na da foto atual: as áreas já desenhadas nela usam coordenadas relativas à imagem e sairiam do lugar com outra proporção.'
            : 'A região inteira precisa caber no quadro. Deixe uma folga em volta do corpo.'
        }
        aspectOptions={recorte?.opcoes}
        maxOutputDim={LASER_MANEQUIM_MAX_LADO}
        quality={0.92}
        outputMimeType="image/png"
        confirmLabel="Usar esta foto"
        onCancel={() => setRecorte(null)}
        onConfirm={(dataUrl) => {
          if (recorte) {
            definirFoto(recorte.vistaId, recorte.sexo, dataUrl);
            setAviso(
              recorte.substituindo
                ? `Foto de ${ROTULO_DO_SEXO[recorte.sexo].toLowerCase()} substituída. Confira se as áreas dela continuam no lugar certo.`
                : null
            );
          }
          setRecorte(null);
        }}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};
