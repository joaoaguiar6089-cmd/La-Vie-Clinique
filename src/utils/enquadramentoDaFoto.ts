import type { CSSProperties } from 'react';
import {
  EnquadramentoDaFoto,
  EnquadramentosDaFoto,
  Procedure,
  VisualizacaoDaFoto,
} from '../types';

/**
 * A mesma capa aparece em frames de formatos bem diferentes: a faixa larga do card no menu de
 * procedimentos, a coluna em retrato do catálogo e o quadro quase quadrado do cartão. Um corte só
 * nunca fica bom nos três — por isso a foto é guardada inteira e cada visualização guarda a sua
 * posição (ver `EnquadramentoDaFoto`).
 */

export const ZOOM_MAXIMO_DA_FOTO = 4;

export const ENQUADRAMENTO_PADRAO: EnquadramentoDaFoto = { x: 50, y: 50, zoom: 1 };

export interface InfoDaVisualizacao {
  id: VisualizacaoDaFoto;
  rotulo: string;
  /** Onde, no sistema, a usuária vai ver este enquadramento. */
  onde: string;
  /** Largura / altura do frame real — o editor desenha o frame nesse formato. */
  proporcao: number;
}

export const VISUALIZACOES_DA_FOTO: InfoDaVisualizacao[] = [
  // Faixa de 128–136px de altura no card da lista; a largura acompanha a coluna da grade.
  { id: 'menu', rotulo: 'Menu', onde: 'Card da lista de procedimentos', proporcao: 360 / 136 },
  // `HorizontalProcedureCard` do PrintableCatalog: 280x430.
  { id: 'catalogo', rotulo: 'Catálogo', onde: 'Página do catálogo em PDF e PNG', proporcao: 280 / 430 },
  // Coluna de 5/12 da folha de 794px, menos o padding, por 240px de altura (PrintableProcedureCard).
  { id: 'cartao', rotulo: 'Cartão', onde: 'Card individual e tela de detalhes', proporcao: 283 / 240 },
];

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

const numeroOu = (valor: unknown, padrao: number) =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao;

/** Ajuste em forma confiável — tolera o ausente e o que tenha vindo torto do banco. */
export const normalizarEnquadramento = (
  enquadramento?: Partial<EnquadramentoDaFoto> | null
): EnquadramentoDaFoto => ({
  x: limitar(numeroOu(enquadramento?.x, 50), 0, 100),
  y: limitar(numeroOu(enquadramento?.y, 50), 0, 100),
  zoom: limitar(numeroOu(enquadramento?.zoom, 1), 1, ZOOM_MAXIMO_DA_FOTO),
});

export const ehEnquadramentoPadrao = (enquadramento?: Partial<EnquadramentoDaFoto> | null): boolean => {
  const { x, y, zoom } = normalizarEnquadramento(enquadramento);
  return Math.abs(x - 50) < 0.05 && Math.abs(y - 50) < 0.05 && zoom < 1.001;
};

/**
 * Estilo da `<img>` dentro de um recipiente `relative overflow-hidden`.
 *
 * O zoom não usa `transform: scale`: a caixa da foto é que cresce (`zoom` × 100%) e recua para que
 * o ponto (x%, y%) fique parado — o mesmo resultado de um `scale` com `transform-origin` em
 * (x%, y%). Assim a foto exportada depende só de layout e de `object-fit`/`object-position`, que o
 * html2canvas desenha do jeito que o navegador mostra.
 */
export const estiloDaFotoEnquadrada = (enquadramento?: Partial<EnquadramentoDaFoto> | null): CSSProperties => {
  const { x, y, zoom } = normalizarEnquadramento(enquadramento);
  return {
    position: 'absolute',
    width: `${zoom * 100}%`,
    height: `${zoom * 100}%`,
    left: `${-(zoom - 1) * x}%`,
    top: `${-(zoom - 1) * y}%`,
    maxWidth: 'none',
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
  };
};

/** Ajuste de uma foto (pela posição em `images`) numa visualização. */
export const enquadramentoDaFoto = (
  procedure: Pick<Procedure, 'enquadramentosDasFotos'>,
  indiceDaFoto: number,
  visualizacao: VisualizacaoDaFoto
): EnquadramentoDaFoto | undefined => {
  const lista = Array.isArray(procedure.enquadramentosDasFotos) ? procedure.enquadramentosDasFotos : [];
  const daFoto = lista[indiceDaFoto];
  return daFoto && typeof daFoto === 'object' ? daFoto[visualizacao] ?? undefined : undefined;
};

/** Ajuste da capa (primeira foto) — a que o menu, o catálogo e o cartão mostram. */
export const enquadramentoDaCapa = (
  procedure: Pick<Procedure, 'enquadramentosDasFotos' | 'images'>,
  visualizacao: VisualizacaoDaFoto
): EnquadramentoDaFoto | undefined =>
  procedure.images && procedure.images.length > 0
    ? enquadramentoDaFoto(procedure, 0, visualizacao)
    : undefined;

const arredondar = (valor: number, casas: number) => {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
};

/**
 * O que vai para o banco: só as visualizações que saíram do centro, com números curtos; `null`
 * quando nenhuma saiu.
 */
export const compactarEnquadramentos = (
  enquadramentos?: EnquadramentosDaFoto | null
): EnquadramentosDaFoto | null => {
  if (!enquadramentos || typeof enquadramentos !== 'object') return null;
  const resultado: EnquadramentosDaFoto = {};
  VISUALIZACOES_DA_FOTO.forEach(({ id }) => {
    const valor = enquadramentos[id];
    if (!valor || ehEnquadramentoPadrao(valor)) return;
    const { x, y, zoom } = normalizarEnquadramento(valor);
    resultado[id] = { x: arredondar(x, 1), y: arredondar(y, 1), zoom: arredondar(zoom, 3) };
  });
  return Object.keys(resultado).length > 0 ? resultado : null;
};

/**
 * Lista alinhada com as `quantidadeDeFotos` fotos, pronta para gravar. Vazia quando nenhuma foto
 * tem ajuste — e sempre um array, nunca `undefined`: a gravação usa `merge: true`, e um campo
 * ausente deixaria no banco o ajuste antigo que a usuária acabou de desfazer.
 */
export const listaDeEnquadramentosParaGravar = (
  lista: (EnquadramentosDaFoto | null | undefined)[] | undefined,
  quantidadeDeFotos: number
): (EnquadramentosDaFoto | null)[] => {
  const alinhada = Array.from({ length: quantidadeDeFotos }, (_, i) =>
    compactarEnquadramentos(Array.isArray(lista) ? lista[i] : null)
  );
  return alinhada.some(Boolean) ? alinhada : [];
};
