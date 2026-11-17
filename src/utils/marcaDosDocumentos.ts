import type React from 'react';
import type { ClinicProfile, FontesDosDocumentos } from '../types';

/**
 * A cara dos documentos de cada clínica: a cor de destaque, o par de fontes e o logo no cabeçalho.
 *
 * Os documentos (orçamento, recibo, simulação de custo, fichas e catálogo) foram desenhados com o
 * bronze e o Cormorant da La Vie. Na plataforma, cada clínica entrega à cliente um papel com a cara
 * dela — então a cor e as fontes deixam de ser fixas e passam a ser **variáveis CSS** postas na raiz
 * de cada folha (`estiloDaMarca`). As classes do Tailwind (`text-brand`, `bg-brand/40`,
 * `font-serif-luxury`) já leem `var(--color-brand)` e `var(--font-serif)`, e os estilos inline das
 * folhas A4 passaram a ler as mesmas variáveis (`documentos/estiloA4.ts`). Fora das folhas, o painel
 * continua com o bronze da plataforma: a troca vale só dentro do documento.
 *
 * Sem escolha nenhuma, `estiloDaMarca` devolve um objeto vazio — a folha sai idêntica à de antes.
 *
 * A cor escolhida não entra crua: ela é texto sobre o off-white (os rótulos em caixa alta) e fundo
 * de texto branco (os selos), e precisa de contraste nos dois. Uma cor clara demais é escurecida
 * até passar; a variante clara, usada sobre o preto, é clareada até passar. A tela das
 * configurações mostra a cor que de fato vai para o papel.
 */

/** O bronze de sempre — o padrão quando a clínica não escolheu cor. */
export const COR_PADRAO_DOS_DOCUMENTOS = '#A67C52';

/** Cores prontas, todas com contraste conferido sobre o off-white da folha. */
export const CORES_SUGERIDAS: { nome: string; cor: string }[] = [
  { nome: 'Bronze', cor: '#A67C52' },
  { nome: 'Rosé', cor: '#B0646F' },
  { nome: 'Terracota', cor: '#A85A3A' },
  { nome: 'Vinho', cor: '#7B2D43' },
  { nome: 'Dourado', cor: '#8E7128' },
  { nome: 'Sálvia', cor: '#5F7353' },
  { nome: 'Esmeralda', cor: '#2E6B5B' },
  { nome: 'Petróleo', cor: '#2B5F73' },
  { nome: 'Marinho', cor: '#2C4470' },
  { nome: 'Lavanda', cor: '#74569A' },
  { nome: 'Grafite', cor: '#4A4A4A' },
];

export interface ParDeFontes {
  id: FontesDosDocumentos;
  rotulo: string;
  descricao: string;
  /** A família dos títulos e números grandes (`--font-serif`). */
  titulo: string;
  /** A família do texto corrido (`--font-sans`). */
  texto: string;
  /** O pedaço `family=...` do Google Fonts. Ausente: a fonte já vem com o site. */
  google?: string;
  /** Amostras para `document.fonts.load` — cada peso e estilo que as folhas usam. */
  amostras: string[];
}

export const PARES_DE_FONTES: Record<FontesDosDocumentos, ParDeFontes> = {
  classica: {
    id: 'classica',
    rotulo: 'Clássica',
    descricao: 'Serifa fina e texto limpo',
    titulo: "'Cormorant Garamond', Georgia, serif",
    texto: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    amostras: [],
  },
  editorial: {
    id: 'editorial',
    rotulo: 'Editorial',
    descricao: 'Serifa marcante, de revista',
    titulo: "'Playfair Display', Georgia, serif",
    texto: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    google: 'family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Lato:wght@300;400;700',
    amostras: [
      '400 16px "Playfair Display"',
      '600 16px "Playfair Display"',
      'italic 400 16px "Playfair Display"',
      '400 16px "Lato"',
      '700 16px "Lato"',
    ],
  },
  moderna: {
    id: 'moderna',
    rotulo: 'Moderna',
    descricao: 'Sem serifa, geométrica',
    titulo: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    texto: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    google: 'family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400',
    amostras: ['400 16px "Montserrat"', '600 16px "Montserrat"', '700 16px "Montserrat"', 'italic 400 16px "Montserrat"'],
  },
  delicada: {
    id: 'delicada',
    rotulo: 'Delicada',
    descricao: 'Serifa suave e arredondada',
    titulo: "'Lora', Georgia, serif",
    texto: "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    google: 'family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Nunito+Sans:wght@300;400;600;700',
    amostras: [
      '400 16px "Lora"',
      '600 16px "Lora"',
      'italic 400 16px "Lora"',
      '400 16px "Nunito Sans"',
      '700 16px "Nunito Sans"',
    ],
  },
};

export const LISTA_DE_FONTES: ParDeFontes[] = Object.values(PARES_DE_FONTES);

/** O que as folhas precisam saber da clínica para sair com a cara dela. */
export interface MarcaDosDocumentos {
  cor?: string;
  fontes?: FontesDosDocumentos;
  /** O logo que vai no cabeçalho — já resolvido: ausente quando não há logo ou a clínica desligou. */
  logoUrl?: string;
}

// ==========================================
// COR
// ==========================================

type Rgb = [number, number, number];

/** `#RRGGBB` válido, em maiúsculas, ou `null`. Aceita também `#RGB`. */
export function corValida(valor?: string | null): string | null {
  const v = (valor || '').trim();
  const curta = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (curta) return `#${curta[1]}${curta[1]}${curta[2]}${curta[2]}${curta[3]}${curta[3]}`.toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null;
}

const paraRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const paraHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Mistura `hex` com `outra`, `t` de 0 (só `hex`) a 1 (só `outra`). */
export function misturar(hex: string, outra: string, t: number): string {
  const a = paraRgb(hex);
  const b = paraRgb(outra);
  return paraHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

const luminancia = (hex: string): number => {
  const [r, g, b] = paraRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Razão de contraste da WCAG entre duas cores. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** O off-white da folha e o preto das faixas — os dois fundos em que a cor aparece. */
const FUNDO_CLARO = '#F9F8F6';
const FUNDO_ESCURO = '#1A1A1A';

/**
 * O piso de contraste da cor sobre o off-white. É o do bronze de sempre (3,5:1): os rótulos coloridos
 * são caixa alta, espaçados, e o texto corrido continua preto.
 */
const CONTRASTE_SOBRE_O_CLARO = 3.2;
/** A variante clara sobre o preto (o bronze claro dá 6,9:1). */
const CONTRASTE_SOBRE_O_ESCURO = 5.5;

const paraHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = paraRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h, s, l];
};

const deHsl = ([h, s, l]: [number, number, number]): string => {
  if (s === 0) return paraHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return paraHex([canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255]);
};

/**
 * Escurece (ou clareia) mexendo só na luminosidade, até o contraste passar. Misturar com preto
 * deixaria um rosa claro cinza-terroso; baixando a luminosidade ele continua rosa, só mais fundo.
 */
const ajustarLuzAte = (hex: string, fundo: string, minimo: number, passo: number): string => {
  const [h, s, l0] = paraHsl(hex);
  let l = l0;
  let cor = hex;
  for (let i = 0; i < 40 && contraste(cor, fundo) < minimo; i++) {
    l = Math.max(0, Math.min(1, l + passo));
    cor = deHsl([h, s, l]);
  }
  return cor;
};

const escurecerAte = (hex: string, fundo: string, minimo: number): string => ajustarLuzAte(hex, fundo, minimo, -0.025);

const clarearAte = (hex: string, fundo: string, minimo: number): string => ajustarLuzAte(hex, fundo, minimo, 0.025);

/** A cor que de fato vai para o papel: a escolhida, escurecida se for clara demais para texto. */
export function corNoPapel(cor?: string | null): string {
  const valida = corValida(cor) || COR_PADRAO_DOS_DOCUMENTOS;
  return escurecerAte(valida, FUNDO_CLARO, CONTRASTE_SOBRE_O_CLARO);
}

/** A cor escolhida precisou ser escurecida para os textos continuarem legíveis? */
export const corFoiAjustada = (cor?: string | null): boolean => {
  const valida = corValida(cor);
  return !!valida && corNoPapel(valida) !== valida;
};

export const ehCorPadrao = (cor?: string | null): boolean => {
  const valida = corValida(cor);
  return !valida || valida === COR_PADRAO_DOS_DOCUMENTOS;
};

/**
 * A paleta inteira a partir de uma cor só, no mesmo desenho das variáveis do tema (`index.css`):
 * `brand` (texto e preenchimento), `hover`/`deep` (mais escuras), `light`/`pale` (sobre o preto) e os
 * beges das tabelas e das faixas, que no bronze eram cremes quentes e aqui viram tintas da cor.
 */
export function paletaDaCor(cor: string): Record<string, string> {
  const base = corNoPapel(cor);
  return {
    '--color-brand': base,
    '--color-brand-hover': misturar(base, '#000000', 0.15),
    '--color-brand-deep': misturar(base, '#000000', 0.35),
    '--color-brand-light': clarearAte(misturar(base, '#FFFFFF', 0.22), FUNDO_ESCURO, CONTRASTE_SOBRE_O_ESCURO),
    '--color-brand-pale': clarearAte(misturar(base, '#FFFFFF', 0.55), FUNDO_ESCURO, 9),
    '--color-brand-bg': misturar(base, '#FFFFFF', 0.9),
    '--bronze-texto': misturar(base, '#000000', 0.15),
    '--doc-creme': misturar(base, '#FFFFFF', 0.88),
    '--doc-bege-linha': misturar(base, '#FFFFFF', 0.91),
    '--doc-bege-total': misturar(base, '#FFFFFF', 0.83),
    '--doc-sobre-escuro': clarearAte(misturar(base, '#FFFFFF', 0.22), FUNDO_ESCURO, CONTRASTE_SOBRE_O_ESCURO),
    '--doc-divisor-escuro': comAlfa(clarearAte(misturar(base, '#FFFFFF', 0.22), FUNDO_ESCURO, CONTRASTE_SOBRE_O_ESCURO), 0.35),
  };
}

/** `rgba(...)` de um hex — para os filetes sobre o preto, que no bronze eram `rgba(196,155,116,.35)`. */
const comAlfa = (hex: string, alfa: number): string => {
  const [r, g, b] = paraRgb(hex);
  return `rgba(${r},${g},${b},${alfa})`;
};

/** As variáveis que `estiloDaMarca` pode pôr numa folha — a exportação copia estas para o clone. */
export const VARIAVEIS_DA_MARCA = [
  '--color-brand',
  '--color-brand-hover',
  '--color-brand-deep',
  '--color-brand-light',
  '--color-brand-pale',
  '--color-brand-bg',
  '--bronze-texto',
  '--doc-creme',
  '--doc-bege-linha',
  '--doc-bege-total',
  '--doc-sobre-escuro',
  '--doc-divisor-escuro',
  '--font-serif',
  '--font-sans',
];

// ==========================================
// ESTILO DA FOLHA
// ==========================================

/**
 * O estilo da raiz de uma folha: as variáveis da cor e das fontes da clínica. Vazio quando ela não
 * escolheu nada — a folha sai como sempre saiu.
 */
export function estiloDaMarca(marca?: MarcaDosDocumentos | null): React.CSSProperties {
  const estilo: Record<string, string> = {};
  const cor = corValida(marca?.cor);
  if (cor && cor !== COR_PADRAO_DOS_DOCUMENTOS) Object.assign(estilo, paletaDaCor(cor));
  const par = marca?.fontes && marca.fontes !== 'classica' ? PARES_DE_FONTES[marca.fontes] : null;
  if (par) {
    estilo['--font-serif'] = par.titulo;
    estilo['--font-sans'] = par.texto;
    // A família herdada do `body` já vem resolvida: sem isto, o texto corrido da folha continuaria
    // na fonte do painel mesmo com a variável trocada.
    estilo.fontFamily = 'var(--font-sans)';
  }
  return estilo as React.CSSProperties;
}

/**
 * A marca dos documentos a partir do perfil. O logo vem cru (`logoUrl`) — quem resolve o logo de
 * exemplo do seed é `marcaDosDocumentosDaClinica`, em `components/documentos/MarcaDosDocumentos`.
 */
export const marcaDoPerfil = (
  perfil?: Pick<ClinicProfile, 'corDosDocumentos' | 'fontesDosDocumentos' | 'logoNosDocumentos' | 'logoUrl'> | null
): MarcaDosDocumentos => ({
  cor: corValida(perfil?.corDosDocumentos) || undefined,
  fontes: perfil?.fontesDosDocumentos && PARES_DE_FONTES[perfil.fontesDosDocumentos] ? perfil.fontesDosDocumentos : undefined,
  logoUrl: perfil?.logoNosDocumentos === false ? undefined : perfil?.logoUrl?.trim() || undefined,
});

/**
 * Copia as variáveis da marca do elemento original para o clone que a exportação desenha.
 *
 * `captureElementFullHeight` clona só o elemento exportado e o pendura no `body`: se a marca estiver
 * num ancestral dele (a raiz da folha acima do trecho exportado), o clone perderia a cor e as fontes.
 */
export function copiarVariaveisDaMarca(origem: HTMLElement, destino: HTMLElement): void {
  if (typeof getComputedStyle !== 'function') return;
  const calculado = getComputedStyle(origem);
  for (const nome of VARIAVEIS_DA_MARCA) {
    if (destino.style.getPropertyValue(nome)) continue;
    const valor = calculado.getPropertyValue(nome).trim();
    if (valor) destino.style.setProperty(nome, valor);
  }
  if (!destino.style.fontFamily && calculado.fontFamily) destino.style.fontFamily = calculado.fontFamily;
}

// ==========================================
// FONTES
// ==========================================

const fontesPedidas = new Map<FontesDosDocumentos, Promise<void>>();

/**
 * Carrega o par de fontes (uma vez por aba) e resolve quando os pesos que as folhas usam estão
 * prontos. Nunca rejeita: sem a fonte, a folha sai na alternativa, e isso não pode travar um PDF.
 *
 * Só o par escolhido é baixado, e só quando uma folha precisa dele — o site não fica mais pesado
 * para quem usa as fontes de sempre.
 */
export function carregarFontesDosDocumentos(id?: FontesDosDocumentos | null): Promise<void> {
  const par = id ? PARES_DE_FONTES[id] : undefined;
  if (!par?.google || typeof document === 'undefined') return Promise.resolve();
  let pedido = fontesPedidas.get(par.id);
  if (!pedido) {
    pedido = new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${par.google}&display=swap`;
      link.dataset.fontesDosDocumentos = par.id;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    }).then(async () => {
      if (!document.fonts?.load) return;
      await Promise.all(par.amostras.map((amostra) => document.fonts.load(amostra).catch(() => [])));
    });
    fontesPedidas.set(par.id, pedido);
  }
  return pedido;
}

/**
 * Espera as fontes dos documentos antes de medir ou desenhar uma folha: as do par pedido (ou de
 * todos os que esta aba já pediu) e, por fim, `document.fonts.ready`.
 *
 * `document.fonts.ready` sozinho não basta: uma fonte cuja folha de estilo ainda não chegou não está
 * "carregando", e ele resolveria na hora — a medição sairia com a fonte alternativa, e a paginação
 * do orçamento cortaria um item ao meio.
 */
export async function esperarFontesDosDocumentos(id?: FontesDosDocumentos | null): Promise<void> {
  if (id) await carregarFontesDosDocumentos(id);
  else await Promise.all(fontesPedidas.values());
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
}
