import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ClinicProfile, Procedure } from '../types';
import { PrintableProcedureCard } from './PrintableProcedureCard';

/** O card é uma folha A4 a 96dpi — o mesmo tamanho que vai para o PDF. */
const LARGURA_DA_FOLHA = 794;
const ALTURA_DA_FOLHA = 1123;
/** Com menos espaço que isto o card fica pequeno demais para ler, e a prévia não aparece. */
const LARGURA_MINIMA = 300;

/** Os campos do cadastro de procedimento que a prévia sabe localizar no card. */
export type CampoDoCard =
  | 'titulo'
  | 'subtitulo'
  | 'categoria'
  | 'destaque'
  | 'mapa'
  | 'profissionais'
  | 'valor'
  | 'valor-promocional'
  | 'sufixo'
  | 'a-partir-de'
  | 'duracao'
  | 'recomendacao'
  | 'intervalo'
  | 'downtime'
  | 'sessoes'
  | 'orientacoes'
  | 'descricao'
  | 'beneficios'
  | 'regioes'
  | 'fotos';

interface OndeNoCard {
  /** Como o campo é chamado na frase acima do card. */
  rotulo: string;
  /**
   * Os `data-campo` do card onde o campo aparece, em ordem de preferência. Só o primeiro é o
   * próprio campo; os outros são onde ele *apareceria* — a seta vai para lá, tracejada, quando o
   * campo está em branco e por isso não está no card.
   */
  alvos: string[];
  /** A frase quando o primeiro alvo não está no card: o campo em branco, ou que nunca aparece. */
  seVazio?: string;
}

const EM_BRANCO_SOME = 'em branco: a linha não aparece no card.';

export const ONDE_NO_CARD: Record<CampoDoCard, OndeNoCard> = {
  titulo: { rotulo: 'Título', alvos: ['titulo'] },
  subtitulo: {
    rotulo: 'Subtítulo',
    alvos: ['subtitulo', 'titulo'],
    seVazio: 'em branco. Preenchido, aparece logo abaixo do título.',
  },
  categoria: { rotulo: 'Categoria', alvos: ['categoria'] },
  destaque: {
    rotulo: 'Destaque',
    alvos: ['destaque', 'categoria'],
    seVazio: 'desmarcado. Marcado, o selo “Destaque” aparece ao lado da categoria.',
  },
  mapa: {
    rotulo: 'Áreas e valores',
    alvos: ['mapa'],
    seVazio: 'entram no card quando o mapa tiver ao menos uma área com nome e valor.',
  },
  profissionais: {
    rotulo: 'Profissional responsável',
    alvos: ['profissionais', 'ficha', 'fotos'],
    seVazio: 'nenhuma escolhida: o card sai sem o nome da profissional.',
  },
  valor: { rotulo: 'Valor', alvos: ['valor-normal', 'investimento'] },
  'valor-promocional': {
    rotulo: 'Valor promocional',
    alvos: ['valor-promocional', 'valor-final'],
    seVazio: 'em branco. Preenchido (e menor que o normal), ele vira o valor em destaque e o normal aparece riscado ao lado.',
  },
  sufixo: { rotulo: 'Condição do valor', alvos: ['sufixo', 'investimento'] },
  'a-partir-de': {
    rotulo: '“A partir de”',
    alvos: ['a-partir-de', 'valor-final'],
    seVazio: 'desmarcado. Marcado, aparece logo antes do valor.',
  },
  duracao: { rotulo: 'Duração', alvos: ['duracao', 'ficha', 'fotos'], seVazio: EM_BRANCO_SOME },
  recomendacao: { rotulo: 'Plano recomendado', alvos: ['recomendacao', 'ficha', 'fotos'], seVazio: EM_BRANCO_SOME },
  downtime: { rotulo: 'Recuperação', alvos: ['downtime', 'ficha', 'fotos'], seVazio: EM_BRANCO_SOME },
  intervalo: {
    rotulo: 'Intervalo entre sessões',
    alvos: [],
    seVazio: 'não aparece no card. A ficha da paciente usa para sugerir a data da próxima sessão.',
  },
  sessoes: {
    rotulo: 'Sessões do pacote',
    alvos: [],
    seVazio: 'não aparecem no card. É o orçamento que usa.',
  },
  orientacoes: {
    rotulo: 'Orientações de preparo',
    alvos: [],
    seVazio: 'não aparecem no card. Vão junto na confirmação pelo WhatsApp.',
  },
  descricao: {
    rotulo: 'Descrição',
    alvos: ['descricao', 'titulo'],
    seVazio: 'em branco. Preenchida, aparece abaixo do título.',
  },
  beneficios: { rotulo: 'Benefícios', alvos: ['beneficios'] },
  regioes: {
    rotulo: 'Regiões aplicadas',
    alvos: ['regioes', 'ficha', 'fotos'],
    seVazio: 'nenhuma região: o bloco não aparece no card.',
  },
  fotos: { rotulo: 'Fotos', alvos: ['fotos'] },
};

/** O campo do formulário sob o mouse (ou com o foco) — de onde a seta sai. */
export interface CampoEmDestaque {
  campo: CampoDoCard;
  elemento: HTMLElement;
}

interface Retangulo {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Seta {
  /**
   * Ponto de partida: a borda esquerda do painel, na altura do campo. Sair do próprio campo faria
   * a seta de um campo da terceira coluna atravessar os outros dois da mesma linha.
   */
  x1: number;
  y1: number;
  /** O campo do formulário, que ganha um contorno — é ele que diz de onde a seta vem. */
  campo: Retangulo;
  /** A área que rola no painel: o contorno do campo não passa por cima do cabeçalho e do rodapé. */
  limite: Retangulo;
  /** Onde o campo está no card. `null`: não está, nem tem onde estaria. */
  alvo: Retangulo | null;
  /** O alvo é onde o campo apareceria (ele está em branco), não onde ele está. */
  reserva: boolean;
}

/** O retângulo que cobre todos os elementos com aquele `data-campo` — as fotos são duas faixas. */
const retanguloDoCampo = (card: HTMLElement, nome: string): Retangulo | null => {
  let uniao: Retangulo | null = null;
  card.querySelectorAll<HTMLElement>(`[data-campo~="${nome}"]`).forEach((el) => {
    const r = el.getBoundingClientRect();
    // Um parágrafo vazio existe, mas não ocupa lugar nenhum — para a seta, é como se não existisse.
    if (r.width < 1 || r.height < 1) return;
    uniao = uniao
      ? {
          left: Math.min(uniao.left, r.left),
          top: Math.min(uniao.top, r.top),
          right: Math.max(uniao.right, r.right),
          bottom: Math.max(uniao.bottom, r.bottom),
        }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  return uniao;
};

/** O primeiro ancestral que rola — no painel, a área do formulário entre o cabeçalho e o rodapé. */
const areaQueRola = (el: HTMLElement): HTMLElement | null => {
  for (let pai = el.parentElement; pai; pai = pai.parentElement) {
    const { overflowY } = getComputedStyle(pai);
    if (overflowY === 'auto' || overflowY === 'scroll') return pai;
  }
  return null;
};

const arredondar = (n: number) => Math.round(n * 2) / 2;

const retanguloArredondado = (r: Retangulo): Retangulo => ({
  left: arredondar(r.left),
  top: arredondar(r.top),
  right: arredondar(r.right),
  bottom: arredondar(r.bottom),
});

const medirSeta = (
  ativo: CampoEmDestaque,
  card: HTMLElement,
  rolagem: HTMLElement | null
): Seta | null => {
  if (!ativo.elemento.isConnected) return null;
  const origem = ativo.elemento.getBoundingClientRect();
  if (origem.width < 1 || origem.height < 1) return null;
  const limite: Retangulo = rolagem
    ? rolagem.getBoundingClientRect()
    : { left: origem.left, top: 0, right: origem.right, bottom: window.innerHeight };

  let alvo: Retangulo | null = null;
  let reserva = false;
  const { alvos } = ONDE_NO_CARD[ativo.campo];
  for (let i = 0; i < alvos.length && !alvo; i += 1) {
    alvo = retanguloDoCampo(card, alvos[i]);
    reserva = i > 0;
  }

  return {
    x1: arredondar(limite.left),
    // Na altura do rótulo, e não no meio de um bloco alto como o das fotos. Campo meio fora da
    // área visível: a seta sai da beirada dela.
    y1: arredondar(
      Math.min(limite.bottom - 8, Math.max(limite.top + 8, origem.top + Math.min(origem.height / 2, 20)))
    ),
    campo: retanguloArredondado(origem),
    limite: retanguloArredondado(limite),
    alvo: alvo && retanguloArredondado(alvo),
    reserva,
  };
};

const mesmaSeta = (a: Seta | null, b: Seta | null) => JSON.stringify(a) === JSON.stringify(b);

interface PreviaDoCardIndividualProps {
  /** O procedimento como está no formulário agora, ainda não salvo. */
  procedure: Procedure;
  clinic: ClinicProfile;
  /** O campo para o qual apontar. `null`: nenhum — só o card. */
  ativo: CampoEmDestaque | null;
}

/**
 * A prévia do card individual ao lado do cadastro de procedimento, no computador.
 *
 * É o próprio `PrintableProcedureCard` — o mesmo que sai no PDF e no PNG —, montado com o que está
 * digitado no formulário e reduzido para caber na faixa à esquerda do painel. Passar o mouse num
 * campo (ou entrar nele pelo teclado) desenha uma seta do campo até o lugar dele no card, com um
 * contorno em volta. Campo em branco que some do card ganha seta tracejada até onde ele
 * apareceria; campo que nunca vai para o card ganha só a frase dizendo isso.
 */
export const PreviaDoCardIndividual: React.FC<PreviaDoCardIndividualProps> = ({
  procedure,
  clinic,
  ativo,
}) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ largura: 0, altura: 0 });
  const [seta, setSeta] = useState<Seta | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setArea({ largura: el.clientWidth, altura: el.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // Some com a faixa escondida (celular, tablet) e quando o painel largo do mapa deixa pouco lado.
  const visivel = area.largura >= LARGURA_MINIMA && area.altura > 0;
  const escala = visivel
    ? Math.min(area.largura / LARGURA_DA_FOLHA, area.altura / ALTURA_DA_FOLHA, 1)
    : 0;

  // A seta acompanha tudo que mexe nos dois lados — a rolagem do formulário, o card crescendo
  // enquanto se digita, a janela mudando de tamanho. Medir a cada quadro, só enquanto há um campo
  // em destaque, é mais simples e mais certo do que escutar cada uma dessas coisas; o estado só
  // muda quando a geometria muda.
  useEffect(() => {
    if (!ativo || !visivel) {
      setSeta(null);
      return;
    }
    let quadro = 0;
    let anterior: Seta | null = null;
    const rolagem = areaQueRola(ativo.elemento);
    const medir = () => {
      const card = cardRef.current;
      const proxima = card ? medirSeta(ativo, card, rolagem) : null;
      if (!mesmaSeta(proxima, anterior)) {
        anterior = proxima;
        setSeta(proxima);
      }
      quadro = requestAnimationFrame(medir);
    };
    medir();
    return () => cancelAnimationFrame(quadro);
  }, [ativo, visivel]);

  const onde = ativo ? ONDE_NO_CARD[ativo.campo] : null;
  // Antes da primeira medida `seta` ainda é `null`: nesse quadro só o nome do campo aparece.
  const semLugar = !!onde && (onde.alvos.length === 0 || (!!seta && (!seta.alvo || seta.reserva)));
  const achou = !!onde && !semLugar && !!seta?.alvo;

  return (
    /* `pointer-events-none` no que é só moldura: o vazio em volta do card continua sendo o véu do
       painel, e clicar nele fecha o painel como sempre. */
    <div className="flex-1 min-w-0 h-full flex flex-col items-center px-6 py-5 gap-3 pointer-events-none">
      {visivel && (
        <div
          className="w-full shrink-0 h-[68px] rounded-xl bg-ink/90 text-cream px-4 py-2.5 shadow-lg pointer-events-auto"
          style={{ maxWidth: LARGURA_DA_FOLHA * escala }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-light">
            Prévia do card individual
          </p>
          <p className="mt-0.5 text-[13px] leading-snug line-clamp-2" aria-live="polite">
            {!onde ? (
              <span className="text-cream/75">
                Passe o mouse sobre um campo do formulário para ver onde ele fica no card.
              </span>
            ) : semLugar ? (
              <>
                <strong className="font-semibold text-white">{onde.rotulo}</strong>:{' '}
                {onde.seVazio || 'não aparece no card.'}
              </>
            ) : (
              <>
                <strong className="font-semibold text-white">{onde.rotulo}</strong>
                {achou && <span className="text-cream/75"> — está aqui no card.</span>}
              </>
            )}
          </p>
        </div>
      )}

      <div ref={areaRef} className="flex-1 min-h-0 w-full flex justify-center">
        {visivel && (
          <div
            className="relative shrink-0 rounded-lg overflow-hidden shadow-2xl pointer-events-auto"
            style={{ width: LARGURA_DA_FOLHA * escala, height: ALTURA_DA_FOLHA * escala }}
          >
            <div
              ref={cardRef}
              aria-hidden="true"
              className="select-none"
              style={{
                width: LARGURA_DA_FOLHA,
                height: ALTURA_DA_FOLHA,
                transform: `scale(${escala})`,
                transformOrigin: 'top left',
              }}
            >
              <PrintableProcedureCard id="previa-card-individual" procedure={procedure} clinic={clinic} />
            </div>
          </div>
        )}
      </div>

      {seta?.alvo && <SetaAteOCard seta={seta} />}
    </div>
  );
};

/**
 * A seta, por cima do painel e da prévia: sai da borda esquerda do campo, faz uma curva suave e
 * termina na lateral direita do contorno do lugar dele no card.
 */
const SetaAteOCard: React.FC<{ seta: Seta }> = ({ seta }) => {
  const alvo = seta.alvo!;
  const { campo, limite } = seta;
  const folga = 4;
  const caixa = {
    x: alvo.left - folga,
    y: alvo.top - folga,
    largura: alvo.right - alvo.left + folga * 2,
    altura: alvo.bottom - alvo.top + folga * 2,
  };
  const x2 = caixa.x + caixa.largura + 3;
  const y2 = caixa.y + caixa.altura / 2;
  // Sem distância para uma seta (o card colado no campo), basta o contorno.
  const temSeta = seta.x1 - x2 > 24;
  const distancia = seta.x1 - x2;
  const ponta = 10;
  const caminho = `M ${seta.x1} ${seta.y1} C ${seta.x1 - distancia * 0.45} ${seta.y1}, ${x2 + ponta + distancia * 0.45} ${y2}, ${x2 + ponta} ${y2}`;
  const tracejado = seta.reserva ? '6 5' : undefined;

  return (
    <svg className="fixed inset-0 w-full h-full z-10 pointer-events-none animate-fadeIn" aria-hidden="true">
      <defs>
        <clipPath id="previa-card-limite-do-painel">
          <rect
            x={limite.left}
            y={limite.top}
            width={Math.max(0, limite.right - limite.left)}
            height={Math.max(0, limite.bottom - limite.top)}
          />
        </clipPath>
      </defs>
      {/* O campo apontado, no formulário. */}
      <rect
        clipPath="url(#previa-card-limite-do-painel)"
        x={campo.left - 6}
        y={campo.top - 6}
        width={campo.right - campo.left + 12}
        height={campo.bottom - campo.top + 12}
        rx={8}
        fill="var(--color-brand)"
        fillOpacity={0.05}
        stroke="var(--color-brand)"
        strokeOpacity={0.7}
        strokeWidth={1.5}
      />
      <rect
        x={caixa.x}
        y={caixa.y}
        width={caixa.largura}
        height={caixa.altura}
        rx={8}
        fill="var(--color-brand)"
        fillOpacity={seta.reserva ? 0.06 : 0.12}
        stroke="#FFFFFF"
        strokeOpacity={0.9}
        strokeWidth={5}
      />
      <rect
        x={caixa.x}
        y={caixa.y}
        width={caixa.largura}
        height={caixa.altura}
        rx={8}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={2.25}
        strokeDasharray={tracejado}
      />
      {temSeta && (
        <>
          {/* Um traço branco largo por baixo: a seta passa tanto sobre o véu escuro quanto sobre o
              card claro, e precisa ser vista nos dois. */}
          <path d={caminho} fill="none" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={5.5} strokeLinecap="round" />
          <path
            d={caminho}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeDasharray={tracejado}
          />
          <polygon
            points={`${x2},${y2} ${x2 + ponta + 1},${y2 - 6} ${x2 + ponta + 1},${y2 + 6}`}
            fill="var(--color-brand)"
            stroke="#FFFFFF"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <circle cx={seta.x1} cy={seta.y1} r={4} fill="var(--color-brand)" stroke="#FFFFFF" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
};
