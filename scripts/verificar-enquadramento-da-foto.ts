/**
 * Confere o ajuste da foto por visualização (menu, catálogo e cartão): o que vai para o banco, a
 * lista alinhada com as fotos e o estilo que as telas e as exportações desenham.
 *
 * O erro que este script caça é o silencioso: um ajuste desfeito que continua gravado (o `merge`
 * do Firestore preserva campo ausente), uma lista que desalinha das fotos e põe o ajuste de uma
 * na outra, um valor torto do banco que joga a foto para fora do frame.
 *
 *   npx tsx scripts/verificar-enquadramento-da-foto.ts
 */
import {
  compactarEnquadramentos,
  enquadramentoDaCapa,
  enquadramentoDaFoto,
  estiloDaFotoEnquadrada,
  listaDeEnquadramentosParaGravar,
  normalizarEnquadramento,
} from '../src/utils/enquadramentoDaFoto';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nNormalização');
ok('ausente vira centralizado', igual(normalizarEnquadramento(undefined), { x: 50, y: 50, zoom: 1 }));
ok(
  'valores fora da faixa são contidos',
  igual(normalizarEnquadramento({ x: -20, y: 180, zoom: 0.3 }), { x: 0, y: 100, zoom: 1 })
);
ok(
  'lixo do banco não vira NaN',
  igual(normalizarEnquadramento({ x: 'a' as unknown as number, y: NaN, zoom: Infinity }), { x: 50, y: 50, zoom: 1 })
);

console.log('\nO que vai para o banco');
ok('tudo centralizado = null', compactarEnquadramentos({ menu: { x: 50, y: 50, zoom: 1 } }) === null);
ok(
  'só as visualizações que saíram do centro, arredondadas',
  igual(
    compactarEnquadramentos({
      menu: { x: 50, y: 50, zoom: 1 },
      catalogo: { x: 12.345, y: 50, zoom: 1.23456 },
    }),
    { catalogo: { x: 12.3, y: 50, zoom: 1.235 } }
  )
);
ok('nenhuma foto ajustada = lista vazia (nunca undefined)', igual(listaDeEnquadramentosParaGravar(undefined, 3), []));
ok(
  'lista alinhada com as fotos, null nas sem ajuste',
  igual(listaDeEnquadramentosParaGravar([null, { cartao: { x: 0, y: 0, zoom: 2 } }], 3), [
    null,
    { cartao: { x: 0, y: 0, zoom: 2 } },
    null,
  ])
);
ok(
  'ajuste de foto que não existe mais é descartado',
  igual(listaDeEnquadramentosParaGravar([null, { menu: { x: 0, y: 0, zoom: 1 } }], 1), [])
);

console.log('\nLeitura');
const proc = {
  images: ['a.jpg', 'b.jpg'],
  enquadramentosDasFotos: [{ menu: { x: 10, y: 20, zoom: 1 } }, { cartao: { x: 90, y: 50, zoom: 2 } }],
};
ok('capa no menu', igual(enquadramentoDaCapa(proc, 'menu'), { x: 10, y: 20, zoom: 1 }));
ok('capa sem ajuste no catálogo', enquadramentoDaCapa(proc, 'catalogo') === undefined);
ok('segunda foto no cartão', igual(enquadramentoDaFoto(proc, 1, 'cartao'), { x: 90, y: 50, zoom: 2 }));
ok('sem fotos, sem ajuste', enquadramentoDaCapa({ images: [], enquadramentosDasFotos: proc.enquadramentosDasFotos }, 'menu') === undefined);
ok(
  'lista torta do banco não quebra',
  enquadramentoDaCapa({ images: ['a'], enquadramentosDasFotos: 'x' as unknown as [] }, 'menu') === undefined
);

console.log('\nEstilo da foto');
const centro = estiloDaFotoEnquadrada(undefined);
ok(
  'sem ajuste = cobre o frame, centralizada',
  centro.width === '100%' && centro.height === '100%' && centro.left === '0%' && centro.top === '0%' &&
    centro.objectFit === 'cover' && centro.objectPosition === '50% 50%'
);
const canto = estiloDaFotoEnquadrada({ x: 100, y: 0, zoom: 2 });
ok(
  'zoom 2 no canto superior direito: caixa dobra e recua uma largura inteira',
  canto.width === '200%' && canto.left === '-100%' && canto.top === '0%' && canto.objectPosition === '100% 0%',
  JSON.stringify(canto)
);

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
