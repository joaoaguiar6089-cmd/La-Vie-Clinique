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
  /** Como a equipe chama o lugar — é o nome da aba no editor. */
  rotulo: string;
  /** Onde, no sistema, a usuária vai ver este enquadramento. */
  onde: string;
  /** O formato do frame, em palavras. */
  formato: string;
  /** Largura / altura do frame real — o recorte do editor tem exatamente esse formato. */
  proporcao: number;
  /**
   * Outro tamanho em que o mesmo lugar aparece, mais largo: o card da lista se estica nas telas
   * grandes, e a tela de detalhes usa o ajuste do card individual numa moldura mais baixa. O editor
   * desenha esse trecho tracejado dentro do recorte, para nada importante ficar de fora dele.
   */
  variacao?: { proporcao: number; rotulo: string };
}

export const VISUALIZACOES_DA_FOTO: InfoDaVisualizacao[] = [
  // Faixa de 128–136px de altura no card da lista. A largura acompanha a coluna da grade: ~360px no
  // celular (a faixa mais alta, que é o recorte) e até ~540px nas telas largas (a variação).
  {
    id: 'menu',
    rotulo: 'Procedimentos',
    onde: 'Card da lista de procedimentos',
    formato: 'Faixa larga',
    proporcao: 360 / 136,
    variacao: { proporcao: 4, rotulo: 'Em telas largas' },
  },
  // `HorizontalProcedureCard` do PrintableCatalog: 280x430.
  {
    id: 'catalogo',
    rotulo: 'Catálogo',
    onde: 'Página do catálogo em PDF e PNG',
    formato: 'Retrato',
    proporcao: 280 / 430,
  },
  // Coluna de 5/12 da folha de 794px, menos o padding, por 240px de altura (PrintableProcedureCard).
  // A tela de detalhes usa o mesmo ajuste numa moldura de ~325x212 (e ~390x250 no celular).
  {
    id: 'cartao',
    rotulo: 'Card individual',
    onde: 'Card individual em PDF e PNG, e a tela de detalhes',
    formato: 'Quase quadrado',
    proporcao: 283 / 240,
    variacao: { proporcao: 1.55, rotulo: 'Na tela de detalhes' },
  },
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

/**
 * O recorte de uma visualização, em pixels da foto original: o pedaço que aparece no frame.
 *
 * É outra forma de escrever o mesmo `EnquadramentoDaFoto` — o editor trabalha com o retângulo, que é
 * o que a usuária vê e arrasta, e grava a posição e o zoom, que é o que as telas e as exportações
 * sabem desenhar. As duas contas abaixo são o caminho de ida e volta entre os dois.
 */
export interface RecorteDaFoto {
  left: number;
  top: number;
  largura: number;
  altura: number;
}

export interface TamanhoDaFoto {
  w: number;
  h: number;
}

/** O maior recorte no formato do frame que cabe na foto — é o zoom 1, a foto cobrindo o frame. */
export const recorteMaximo = (foto: TamanhoDaFoto, proporcao: number) => {
  const largura = Math.min(foto.w, foto.h * proporcao);
  return { largura, altura: largura / proporcao };
};

/**
 * O pedaço da foto que um enquadramento mostra num frame de `proporcao`. Mesma conta do
 * `estiloDaFotoEnquadrada`: o zoom encolhe o recorte, e x/y dizem onde ele fica dentro da sobra.
 */
export const recorteDoEnquadramento = (
  enquadramento: Partial<EnquadramentoDaFoto> | null | undefined,
  foto: TamanhoDaFoto,
  proporcao: number
): RecorteDaFoto => {
  const { x, y, zoom } = normalizarEnquadramento(enquadramento);
  const maximo = recorteMaximo(foto, proporcao);
  const largura = maximo.largura / zoom;
  const altura = maximo.altura / zoom;
  return {
    left: ((foto.w - largura) * x) / 100,
    top: ((foto.h - altura) * y) / 100,
    largura,
    altura,
  };
};

/** Recorte no formato do frame, dentro da foto e entre o zoom 1 e o máximo. */
export const limitarRecorte = (
  recorte: RecorteDaFoto,
  foto: TamanhoDaFoto,
  proporcao: number
): RecorteDaFoto => {
  const maximo = recorteMaximo(foto, proporcao);
  const largura = limitar(recorte.largura, maximo.largura / ZOOM_MAXIMO_DA_FOTO, maximo.largura);
  const altura = largura / proporcao;
  return {
    largura,
    altura,
    left: limitar(recorte.left, 0, Math.max(0, foto.w - largura)),
    top: limitar(recorte.top, 0, Math.max(0, foto.h - altura)),
  };
};

/** O caminho de volta: o enquadramento que mostra exatamente este recorte. */
export const enquadramentoDoRecorte = (
  recorte: RecorteDaFoto,
  foto: TamanhoDaFoto,
  proporcao: number
): EnquadramentoDaFoto => {
  const maximo = recorteMaximo(foto, proporcao);
  const sobraX = foto.w - recorte.largura;
  const sobraY = foto.h - recorte.altura;
  return normalizarEnquadramento({
    zoom: maximo.largura / recorte.largura,
    // Sem sobra num eixo, o recorte ocupa a foto inteira nele e a posição não importa.
    x: sobraX > 0.5 ? (recorte.left / sobraX) * 100 : 50,
    y: sobraY > 0.5 ? (recorte.top / sobraY) * 100 : 50,
  });
};
