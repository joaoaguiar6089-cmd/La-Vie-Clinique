import {
  ClinicProfile,
  LaserArea,
  LaserAreaRef,
  LaserBodyMap,
  LaserCategoryDefaults,
  LaserVista,
  Procedure,
} from '../types';
import { isLaserCategory } from './templateMatching';

/**
 * Geometria e regras do mapa corporal da depilação a laser.
 *
 * Tudo aqui trabalha em **coordenadas relativas à imagem** (0–1), nunca em pixels. É o que faz o
 * mesmo desenho servir ao manequim gigante do cadastro, ao médio da ficha impressa e ao pequeno
 * do celular — e é também o que obriga os dois manequins a terem a mesma proporção, já que uma
 * troca por proporção diferente deslocaria todas as áreas de uma vez.
 *
 * Formato de uma forma: array **plano** `[x1,y1,x2,y2,...]`, e não `{x,y}[]`. São ~40 pontos por
 * forma vezes ~20 áreas indo e voltando do Firestore; o array plano gasta menos da metade do JSON
 * de uma lista de objetos, e a cota deste projeto é medida em KB gravados (ver a memória
 * `firestore-free-tier-database`).
 */

/** Lado maior da imagem do manequim, em pixels, depois da redução no envio. */
export const LASER_MANEQUIM_MAX_LADO = 1400;

/**
 * Teto de pontos por forma depois da simplificação. Quarenta pontos descrevem uma coxa ou uma
 * virilha com folga; o que passa disso é tremor de mão, que só engorda o documento.
 */
export const LASER_MAX_PONTOS_POR_FORMA = 40;

/** Casas decimais gravadas. Num manequim de 1000px, 3 casas é precisão sub-pixel. */
const CASAS_DECIMAIS = 3;

/** Mínimo de pontos para um rabisco virar área — abaixo disso foi clique sem querer. */
const MIN_PONTOS_VALIDOS = 3;

/** Fração da diagonal usada como tolerância da simplificação. */
const TOLERANCIA_SIMPLIFICACAO = 0.004;

const arredondar = (n: number): number => {
  const f = 10 ** CASAS_DECIMAIS;
  return Math.round(n * f) / f;
};

const limitar01 = (n: number): number => Math.min(1, Math.max(0, n));

// ==========================================
// NOME CURTO
// ==========================================

/**
 * Prefixos que somem no rótulo do botão. "Depilação a Laser - Virilha Completa" tem 38 caracteres
 * e não cabe num botão ao lado do manequim; e dentro do mapa de laser, dizer "laser" em todos os
 * treze botões não informa nada.
 */
const PREFIXOS_LASER = [
  'depilacao a laser',
  'epilacao a laser',
  'depilacao laser',
  'laser',
];

const semAcento = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Rótulo do botão: o título sem o prefixo da categoria.
 *
 * Corta apenas quando sobra alguma coisa — um procedimento chamado exatamente "Depilação a Laser"
 * mantém o nome inteiro, em vez de virar um botão sem texto.
 */
export const nomeCurtoDaArea = (titulo: string): string => {
  const bruto = (titulo || '').trim();
  const normalizado = semAcento(bruto);

  for (const prefixo of PREFIXOS_LASER) {
    if (!normalizado.startsWith(prefixo)) continue;
    const resto = bruto.slice(prefixo.length).replace(/^\s*[-–—:]\s*/, '').trim();
    if (resto) return resto;
  }
  return bruto;
};

// ==========================================
// SIMPLIFICAÇÃO DO TRAÇO (DOUGLAS–PEUCKER)
// ==========================================

const distanciaPerpendicular = (
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const comprimento2 = dx * dx + dy * dy;
  if (comprimento2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / comprimento2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const douglasPeucker = (pontos: number[], tolerancia: number): number[] => {
  const n = pontos.length / 2;
  if (n < 3) return pontos;

  let maiorDistancia = 0;
  let indice = 0;
  const ax = pontos[0];
  const ay = pontos[1];
  const bx = pontos[(n - 1) * 2];
  const by = pontos[(n - 1) * 2 + 1];

  for (let i = 1; i < n - 1; i++) {
    const d = distanciaPerpendicular(pontos[i * 2], pontos[i * 2 + 1], ax, ay, bx, by);
    if (d > maiorDistancia) {
      maiorDistancia = d;
      indice = i;
    }
  }

  if (maiorDistancia <= tolerancia) return [ax, ay, bx, by];

  const esquerda = douglasPeucker(pontos.slice(0, (indice + 1) * 2), tolerancia);
  const direita = douglasPeucker(pontos.slice(indice * 2), tolerancia);
  return [...esquerda.slice(0, -2), ...direita];
};

/**
 * Converte o traço cru do laço (pixels do elemento) numa forma pronta para gravar: normalizada,
 * simplificada e arredondada.
 *
 * Devolve `null` quando o gesto não fecha uma região — dois ou três pontos soltos são um clique
 * trêmulo, não uma área, e deixá-los virar polígono criaria botões apontando para nada.
 */
export const criarFormaAPartirDoTraco = (
  tracoEmPixels: number[],
  largura: number,
  altura: number
): number[] | null => {
  if (!largura || !altura) return null;
  if (tracoEmPixels.length / 2 < MIN_PONTOS_VALIDOS) return null;

  const normalizado: number[] = [];
  for (let i = 0; i < tracoEmPixels.length; i += 2) {
    normalizado.push(limitar01(tracoEmPixels[i] / largura));
    normalizado.push(limitar01(tracoEmPixels[i + 1] / altura));
  }

  let forma = douglasPeucker(normalizado, TOLERANCIA_SIMPLIFICACAO);

  // Se ainda passar do teto, aperta a tolerância até caber. Sobe em degraus em vez de calcular a
  // tolerância exata: o número de pontos não é função contínua dela, então tentar é mais barato.
  let tolerancia = TOLERANCIA_SIMPLIFICACAO;
  while (forma.length / 2 > LASER_MAX_PONTOS_POR_FORMA && tolerancia < 0.1) {
    tolerancia *= 1.6;
    forma = douglasPeucker(normalizado, tolerancia);
  }

  if (forma.length / 2 < MIN_PONTOS_VALIDOS) return null;
  return forma.map(arredondar);
};

/** Espelha a forma no eixo vertical da imagem — como "Axilas" e "Maçã do Rosto" ganham o par. */
export const espelharForma = (forma: number[]): number[] => {
  const espelhada: number[] = [];
  for (let i = 0; i < forma.length; i += 2) {
    espelhada.push(arredondar(1 - forma[i]));
    espelhada.push(forma[i + 1]);
  }
  return espelhada;
};

// ==========================================
// DESENHO
// ==========================================

/** Forma em `d` de um `<path>` SVG, num sistema de coordenadas de `largura` × `altura`. */
export const formaParaPath = (forma: number[], largura = 1, altura = 1): string => {
  if (forma.length < 4) return '';
  let d = `M ${forma[0] * largura} ${forma[1] * altura}`;
  for (let i = 2; i < forma.length; i += 2) {
    d += ` L ${forma[i] * largura} ${forma[i + 1] * altura}`;
  }
  return `${d} Z`;
};

/** Todas as formas de uma área num `d` só — o SVG trata como um caminho composto. */
export const areaParaPath = (area: LaserArea, largura = 1, altura = 1): string =>
  area.formas.map((f) => formaParaPath(f, largura, altura)).filter(Boolean).join(' ');

// ==========================================
// MEDIDAS E TESTE DE PONTO
// ==========================================

/** Área do polígono pela fórmula do cadarço. Em unidades 0–1, então sempre entre 0 e 1. */
export const areaDaForma = (forma: number[]): number => {
  const n = forma.length / 2;
  if (n < 3) return 0;
  let soma = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    soma += forma[i * 2] * forma[j * 2 + 1] - forma[j * 2] * forma[i * 2 + 1];
  }
  return Math.abs(soma) / 2;
};

export const tamanhoDaArea = (area: LaserArea): number =>
  area.formas.reduce((acc, f) => acc + areaDaForma(f), 0);

/**
 * Centro de massa da área, em 0–1 — de onde sai a linha guia e por onde o anel decide a posição
 * do botão.
 *
 * Pondera cada forma pelo seu tamanho: numa área de duas manchas iguais o centro cai no meio das
 * duas (acima do umbigo, para as axilas), que é onde a linha guia faz sentido. Se todas as formas
 * forem degeneradas, cai no centro da caixa envolvente em vez de dividir por zero.
 */
export const centroDaArea = (area: LaserArea): { x: number; y: number } => {
  let somaPeso = 0;
  let somaX = 0;
  let somaY = 0;

  for (const forma of area.formas) {
    const peso = areaDaForma(forma);
    const n = forma.length / 2;
    if (n === 0) continue;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      cx += forma[i * 2];
      cy += forma[i * 2 + 1];
    }
    cx /= n;
    cy /= n;
    if (peso > 0) {
      somaPeso += peso;
      somaX += cx * peso;
      somaY += cy * peso;
    } else {
      somaPeso += 1e-6;
      somaX += cx * 1e-6;
      somaY += cy * 1e-6;
    }
  }

  if (somaPeso === 0) return { x: 0.5, y: 0.5 };
  return { x: somaX / somaPeso, y: somaY / somaPeso };
};

/** Lançamento de raio: conta cruzamentos com as arestas à direita do ponto. */
const pontoDentroDaForma = (x: number, y: number, forma: number[]): boolean => {
  const n = forma.length / 2;
  let dentro = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = forma[i * 2];
    const yi = forma[i * 2 + 1];
    const xj = forma[j * 2];
    const yj = forma[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
};

export const pontoDentroDaArea = (x: number, y: number, area: LaserArea): boolean =>
  area.formas.some((f) => pontoDentroDaForma(x, y, f));

/**
 * Qual área responde por um toque na anatomia. **A menor vence.**
 *
 * As áreas são desenhadas para não se sobrepor, então na prática há zero ou uma candidata. A
 * regra da menor existe para o encosto acidental de duas bordas: escolher a maior faria "Perna
 * Completa" roubar todo toque na "½ Perna" que estivesse por baixo, e a área pequena viraria
 * inalcançável — o erro que não se descobre sem testar ponto a ponto.
 */
export const areaNoPonto = (
  areas: { area: LaserArea; procedureId: string }[],
  x: number,
  y: number
): { area: LaserArea; procedureId: string } | undefined => {
  const candidatas = areas.filter((c) => pontoDentroDaArea(x, y, c.area));
  if (candidatas.length === 0) return undefined;
  return candidatas.reduce((menor, atual) =>
    tamanhoDaArea(atual.area) < tamanhoDaArea(menor.area) ? atual : menor
  );
};

// ==========================================
// ANEL DE BOTÕES
// ==========================================

export interface EntradaDoAnel {
  chave: string;
  area: LaserArea;
}

export interface PosicaoDoBotao {
  chave: string;
  /** Posição do botão em 0–1 no espaço do contêiner (que é maior que a imagem). */
  x: number;
  y: number;
  /** Ponta da linha guia: o centro da área, em 0–1 no espaço da imagem. */
  ancora: { x: number; y: number };
  lado: 'esquerda' | 'direita';
}

export interface OpcoesDoAnel {
  /** Meia-largura do anel, em fração do contêiner. */
  raioX?: number;
  /** Meia-altura do anel, em fração do contêiner. */
  raioY?: number;
  /**
   * Afastamento horizontal mínimo do centro, em fração do contêiner — normalmente a meia-largura
   * da figura mais uma folga.
   *
   * Sem este piso, os botões do topo e da base do anel (onde a elipse se fecha) pousam **em cima**
   * do manequim: no topo é exatamente onde ficam buço, queixo e maçã do rosto, que são as áreas
   * pequenas e mais difíceis de acertar. A elipse precisa contornar a figura, não atravessá-la.
   */
  raioMinimoX?: number;
  /** Separação vertical mínima entre dois botões do mesmo lado, em fração do contêiner. */
  separacaoMinima?: number;
}

const OPCOES_PADRAO: Required<OpcoesDoAnel> = {
  raioX: 0.44,
  raioY: 0.46,
  raioMinimoX: 0.16,
  separacaoMinima: 0.075,
};

/**
 * Empurra valores vizinhos até respeitarem a separação mínima, mantendo a ordem e o centro de
 * massa do grupo. Uma passada para baixo e outra para cima: sem a segunda, um grupo apertado no
 * fim da lista escorrega todo para fora do contêiner.
 */
const afastarVizinhos = (valores: number[], minimo: number): number[] => {
  const saida = [...valores];
  for (let i = 1; i < saida.length; i++) {
    if (saida[i] - saida[i - 1] < minimo) saida[i] = saida[i - 1] + minimo;
  }
  for (let i = saida.length - 2; i >= 0; i--) {
    if (saida[i + 1] - saida[i] < minimo) saida[i] = saida[i + 1] - minimo;
  }
  return saida;
};

/**
 * Distribui os botões num anel elíptico em volta do manequim.
 *
 * O lado sai do centro horizontal da área (esquerda da imagem → botão à esquerda), e não do
 * ângulo puro em relação ao centro: num manequim alto e estreito quase toda área tem `x` perto de
 * 0,5, e o ângulo cru empilharia treze botões no topo e na base. Já a altura dentro do lado é a
 * da própria área, o que mantém a leitura de cima para baixo acompanhando o corpo.
 *
 * Quando os dois lados ficam desequilibrados, as áreas mais centrais migram para o lado vazio —
 * seis botões de um lado e um do outro ficam apertados à toa.
 *
 * Uma posição gravada à mão (`LaserArea.botao`) sempre vence: o algoritmo acerta a maioria, e o
 * resto é arrastado uma vez e fica.
 */
export const posicionarBotoesDoAnel = (
  entradas: EntradaDoAnel[],
  opcoes: OpcoesDoAnel = {}
): PosicaoDoBotao[] => {
  const { raioX, raioY, raioMinimoX, separacaoMinima } = { ...OPCOES_PADRAO, ...opcoes };

  const comCentro = entradas.map((e) => ({ ...e, centro: centroDaArea(e.area) }));

  const fixos = comCentro.filter((e) => e.area.botao);
  const automaticos = comCentro.filter((e) => !e.area.botao);

  // Divide por lado e reequilibra: as mais centrais do lado cheio vão para o vazio.
  const esquerda = automaticos.filter((e) => e.centro.x < 0.5);
  const direita = automaticos.filter((e) => e.centro.x >= 0.5);

  while (esquerda.length - direita.length > 1) {
    esquerda.sort((a, b) => b.centro.x - a.centro.x);
    direita.push(esquerda.shift()!);
  }
  while (direita.length - esquerda.length > 1) {
    direita.sort((a, b) => a.centro.x - b.centro.x);
    esquerda.push(direita.shift()!);
  }

  const posicionarLado = (
    grupo: typeof automaticos,
    lado: 'esquerda' | 'direita'
  ): PosicaoDoBotao[] => {
    const ordenado = [...grupo].sort((a, b) => a.centro.y - b.centro.y);
    const alvos = afastarVizinhos(
      ordenado.map((e) => e.centro.y),
      separacaoMinima
    );

    return ordenado.map((entrada, i) => {
      const t = Math.min(1, Math.max(0, alvos[i]));
      // t = 0 no topo, 1 na base; o seno abre o anel no meio da altura, que é onde há espaço.
      const y = 0.5 + (t - 0.5) * 2 * raioY;
      // O seno abre o anel no meio da altura; o piso impede que o topo e a base o fechem por cima
      // da figura.
      const deslocamento = Math.max(raioMinimoX, raioX * Math.sin(Math.PI * t));
      const x = lado === 'esquerda' ? 0.5 - deslocamento : 0.5 + deslocamento;
      return { chave: entrada.chave, x, y, ancora: entrada.centro, lado };
    });
  };

  return [
    ...posicionarLado(esquerda, 'esquerda'),
    ...posicionarLado(direita, 'direita'),
    ...fixos.map((e) => ({
      chave: e.chave,
      x: e.area.botao!.x,
      y: e.area.botao!.y,
      ancora: e.centro,
      lado: (e.area.botao!.x < 0.5 ? 'esquerda' : 'direita') as 'esquerda' | 'direita',
    })),
  ];
};

// ==========================================
// CATÁLOGO: LEITURA DAS ÁREAS
// ==========================================

export interface AreaDoCatalogo {
  procedureId: string;
  nomeCurto: string;
  titulo: string;
  preco: number;
  area: LaserArea;
}

/** Preço de venda: o promocional quando existe, como no resto do catálogo. */
const precoDeVenda = (p: Procedure): number =>
  p.promotionalPrice && p.promotionalPrice > 0 ? p.promotionalPrice : p.price;

/** Procedimentos de laser que já ganharam área — os que aparecem no manequim. */
export const areasDoCatalogo = (
  procedures: Procedure[],
  vista?: LaserVista
): AreaDoCatalogo[] => {
  const saida: AreaDoCatalogo[] = [];
  for (const proc of procedures) {
    if (!isLaserCategory(proc.category)) continue;
    for (const area of proc.laserAreas || []) {
      if (vista && area.vista !== vista) continue;
      saida.push({
        procedureId: proc.id,
        nomeCurto: nomeCurtoDaArea(proc.title),
        titulo: proc.title,
        preco: precoDeVenda(proc),
        area,
      });
    }
  }
  return saida;
};

/**
 * Procedimentos de laser ainda sem área. É o que alimenta a faixa "Sem área no mapa" do cadastro.
 *
 * Existe porque um procedimento sem área é invisível no manequim: sem a faixa, a equipe redesenha
 * "Axilas" achando que não tinha, e a clínica fica com dois procedimentos de axila no catálogo.
 */
export const procedimentosSemArea = (procedures: Procedure[]): Procedure[] =>
  procedures.filter(
    (p) => isLaserCategory(p.category) && !(p.laserAreas && p.laserAreas.length > 0)
  );

export const contarAreasPorVista = (procedures: Procedure[]): Record<LaserVista, number> => {
  const contagem: Record<LaserVista, number> = { frente: 0, costas: 0 };
  for (const { area } of areasDoCatalogo(procedures)) contagem[area.vista] += 1;
  return contagem;
};

// ==========================================
// PADRÕES DA CATEGORIA
// ==========================================

const vazio = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Aplica os padrões da categoria por cima de um procedimento de laser, campo a campo.
 *
 * A herança é **viva**: o procedimento só guarda o campo quando alguém o edita ali, e o que está
 * vazio é resolvido aqui na leitura. É o que permite corrigir uma contraindicação clínica errada
 * em um lugar e alcançar as treze áreas — com cópia no momento do cadastro, a correção exigiria
 * abrir treze procedimentos, que é o mesmo que dizer que ela não acontece.
 *
 * Não altera procedimentos de outras categorias, nem grava nada: é só para exibir e imprimir.
 */
export const resolverCamposDoLaser = (
  procedure: Procedure,
  padroes?: LaserCategoryDefaults
): Procedure => {
  if (!padroes || !isLaserCategory(procedure.category)) return procedure;

  const resolvido = { ...procedure };
  (Object.keys(padroes) as (keyof LaserCategoryDefaults)[]).forEach((campo) => {
    if (vazio(resolvido[campo as keyof Procedure])) {
      const valor = padroes[campo];
      if (!vazio(valor)) {
        (resolvido as Record<string, unknown>)[campo] = valor;
      }
    }
  });
  return resolvido;
};

// ==========================================
// ESPELHO PÚBLICO
// ==========================================

/**
 * Monta o documento `clinic_settings/laser_body_map` a partir do catálogo.
 *
 * Leva só o que a página sem login precisa para desenhar e escolher — **nunca preço**. É a mesma
 * tela servindo a dois públicos: a paciente que preenche a ficha não pode ver a tabela da clínica,
 * pelo mesmo motivo que `clinic_settings/public_profile` não leva os e-mails da equipe.
 */
export const montarEspelhoPublico = (
  procedures: Procedure[],
  clinic: Pick<ClinicProfile, 'laserManequimFrenteUrl' | 'laserManequimCostasUrl'>
): LaserBodyMap => ({
  manequimFrenteUrl: clinic.laserManequimFrenteUrl,
  manequimCostasUrl: clinic.laserManequimCostasUrl,
  areas: areasDoCatalogo(procedures).map(({ procedureId, nomeCurto, area }) => ({
    procedureId,
    nomeCurto,
    vista: area.vista,
    formas: area.formas,
    ...(area.botao ? { botao: area.botao } : {}),
  })),
  updatedAt: new Date().toISOString(),
});

// ==========================================
// REFERÊNCIAS (ANAMNESE)
// ==========================================

export const refDaArea = (proc: Procedure): LaserAreaRef => ({
  procedureId: proc.id,
  nomeCurto: nomeCurtoDaArea(proc.title),
});

/**
 * Nomes das áreas para leitura corrida ("Axilas, Virilha Completa e ½ Perna").
 *
 * Lê o nome gravado na própria referência, e não o do catálogo: uma ficha de março precisa
 * continuar dizendo o que foi tratado mesmo que o procedimento tenha sido renomeado ou removido.
 */
export const listarNomesDeAreas = (refs?: LaserAreaRef[]): string => {
  const nomes = (refs || []).map((r) => r.nomeCurto).filter(Boolean);
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
};
