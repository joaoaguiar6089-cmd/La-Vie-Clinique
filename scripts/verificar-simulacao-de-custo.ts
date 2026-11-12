/**
 * Confere as contas da simulação de custo (aba do Financeiro): o procedimento do catálogo chegando
 * com o consumo padrão × sessões, os totais, o que vai para o banco, quem vê qual simulação, a
 * leitura de documento torto e a paginação do PDF.
 *
 * Existe porque a simulação é o número que a profissional usa para acertar a divisão com a
 * clínica: um custo errado aqui vira dinheiro errado, e ninguém confere a conta de novo à mão.
 *
 *   npx tsx scripts/verificar-simulacao-de-custo.ts
 */
import { ConsumoPadrao, Procedure, ProdutoDeEstoque, SimulacaoDeCusto } from '../src/types';
import {
  copiaDosProcedimentos,
  materiaisDoProcedimento,
  montarSimulacao,
  nomeDoArquivoDaSimulacao,
  normalizarSimulacao,
  problemaDaSimulacao,
  procedimentoDoCatalogo,
  procedimentoEmBranco,
  procedimentosParaGravar,
  resumoDosProcedimentos,
  simulacoesVisiveis,
  totaisDaSimulacao,
} from '../src/utils/simulacaoDeCusto';
import { paginarSimulacao, type Alturas } from '../src/components/financeiro/SimulacaoPrintable';
import { ALTURA_UTIL } from '../src/components/documentos/estiloA4';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const produto = (id: string, custo: number, cliente: number, unidade = 'un'): ProdutoDeEstoque => ({
  id,
  nome: id,
  unidade,
  custoUnitario: custo,
  valorCliente: cliente,
  createdAt: '2026-01-01',
});

const toxina = produto('toxina', 12, 25, 'U');
const agulha = produto('agulha', 0.35, 0);
const gel = produto('gel', 0.0035, 0.01, 'ml');
const produtos = [toxina, agulha, gel];

const proc = (id: string, title: string, sessoesInclusas?: number): Procedure =>
  ({
    id,
    title,
    category: 'Injetáveis',
    description: '',
    price: 1000,
    images: [],
    benefits: [],
    order: 1,
    createdAt: '',
    sessoesInclusas,
  }) as Procedure;
const botox = proc('botox', 'Botox');
const laser = proc('laser-axila', 'Depilação a Laser - Axilas', 10);
const catalogo = [botox, laser];

const consumos: ConsumoPadrao[] = [
  {
    id: 'botox',
    procedureId: 'botox',
    itens: [
      { produtoId: 'toxina', quantidade: 20 },
      { produtoId: 'agulha', quantidade: 2 },
    ],
  },
  { id: 'laser-axila', procedureId: 'laser-axila', itens: [{ produtoId: 'gel', quantidade: 30 }] },
];

console.log('== procedimento do catálogo');
const pBotox = procedimentoDoCatalogo(botox, consumos, produtos, catalogo);
ok('botox entra com 1 sessão', pBotox.sessoes === 1);
ok('botox entra com as duas linhas do consumo padrão', pBotox.materiais.length === 2);
ok('o procedimento guarda a origem no catálogo', pBotox.procedureId === 'botox' && pBotox.titulo === 'Botox');
const pLaser = procedimentoDoCatalogo(laser, consumos, produtos, catalogo);
ok('laser de 10 sessões herda as sessões do cadastro', pLaser.sessoes === 10);
ok('e o consumo vem × 10', pLaser.materiais[0]?.quantidade === 300, String(pLaser.materiais[0]?.quantidade));

const tresSessoes = materiaisDoProcedimento({ ...pBotox, sessoes: 3 }, consumos, produtos, catalogo);
ok('recalcular com 3 sessões triplica', tresSessoes[0]?.quantidade === 60 && tresSessoes[1]?.quantidade === 6);
const sessaoInvalida = materiaisDoProcedimento({ ...pBotox, sessoes: 0 }, consumos, produtos, catalogo);
ok('sessões vazias recalculam como 1', sessaoInvalida[0]?.quantidade === 20);
const peloNome = materiaisDoProcedimento({ titulo: 'botox', sessoes: 1 }, consumos, produtos, catalogo);
ok('procedimento digitado com o nome do catálogo acha o consumo', peloNome.length === 2);
ok('procedimento em branco começa sem material', procedimentoEmBranco().materiais.length === 0);

console.log('== totais');
const totais = totaisDaSimulacao([pBotox, pLaser]);
// Botox: 20 × 12 + 2 × 0,35 = 240,70. Laser: 300 × 0,0035 = 1,05.
ok('custo total soma os procedimentos', totais.custo === 241.75, String(totais.custo));
// Botox: 20 × 25 = 500. Laser: 300 × 0,01 = 3.
ok('valor repassado total', totais.valorCliente === 503, String(totais.valorCliente));

console.log('== conferência antes de salvar');
ok('sem procedimento não salva', problemaDaSimulacao([]) !== null);
ok('procedimento sem nome não salva', problemaDaSimulacao([{ titulo: '  ' }]) !== null);
ok('com nome, salva', problemaDaSimulacao([{ titulo: 'Botox' }]) === null);

const gravados = procedimentosParaGravar([
  {
    ...pBotox,
    titulo: '  Botox testa  ',
    sessoes: 0,
    materiais: [
      ...pBotox.materiais,
      { nome: '', unidade: 'un', quantidade: 1, custoUnitario: 1, valorCliente: 0 },
      { nome: 'Luva', unidade: 'par', quantidade: 0, custoUnitario: 1, valorCliente: 0 },
      { nome: 'Anestésico', unidade: 'g', quantidade: 2, custoUnitario: 4, valorCliente: 0, cadastrarNoEstoque: true },
    ],
  },
]);
ok('nome aparado', gravados[0].titulo === 'Botox testa');
ok('sessões inválidas viram 1', gravados[0].sessoes === 1);
ok('linhas sem nome ou sem quantidade saem', gravados[0].materiais.length === 3, String(gravados[0].materiais.length));
ok(
  'a marca "cadastrar no estoque" não vai para o banco',
  gravados[0].materiais.every((m) => !('cadastrarNoEstoque' in m))
);
const avulso = procedimentosParaGravar([{ ...procedimentoEmBranco(), titulo: 'Peeling' }]);
ok('procedimento fora do catálogo vai sem procedureId', !('procedureId' in avulso[0]));

console.log('== montar a simulação');
const nova = montarSimulacao({
  id: 'sim-1',
  paciente: { id: 'p1', nome: ' Camila ' },
  procedimentos: procedimentosParaGravar([pBotox]),
  autor: { uid: 'u-prof', nome: 'Ana' },
  anterior: null,
  agora: '2026-11-12T10:00:00.000Z',
});
ok('nova fica no nome de quem criou', nova.criadoPorUid === 'u-prof' && nova.criadoPorNome === 'Ana');
ok('nova grava os totais', nova.custoTotal === 240.7 && nova.valorClienteTotal === 500);
ok('nova não tem updatedAt', nova.updatedAt === undefined);
ok('cliente aparada, com o vínculo', nova.pacienteNome === 'Camila' && nova.pacienteId === 'p1');

const editada = montarSimulacao({
  id: 'sim-1',
  paciente: { id: 'p1', nome: '' },
  procedimentos: procedimentosParaGravar([pLaser]),
  autor: { uid: 'u-admin', nome: 'Karoline' },
  anterior: nova,
  agora: '2026-11-13T10:00:00.000Z',
});
ok('a admin que edita não toma a simulação para si', editada.criadoPorUid === 'u-prof' && editada.criadoPorNome === 'Ana');
ok('editar mantém a data de criação', editada.createdAt === nova.createdAt);
ok('editar marca updatedAt', editada.updatedAt === '2026-11-13T10:00:00.000Z');
ok(
  'sem nome de cliente, sai também o vínculo',
  !('pacienteNome' in editada) && !('pacienteId' in editada)
);

console.log('== quem vê o quê');
const daAdmin = { ...nova, id: 'sim-2', criadoPorUid: 'u-admin', createdAt: '2026-11-14T00:00:00.000Z' };
const lista = [nova, daAdmin];
ok('a admin vê todas, das mais novas para as mais antigas', simulacoesVisiveis(lista, 'u-admin', true).map((s) => s.id).join() === 'sim-2,sim-1');
ok('a profissional vê só as dela', simulacoesVisiveis(lista, 'u-prof', false).map((s) => s.id).join() === 'sim-1');
ok('sem login, ninguém vê nada', simulacoesVisiveis(lista, undefined, false).length === 0);

console.log('== documento do banco');
const torto = normalizarSimulacao({
  id: 'sim-x',
  procedimentos: [
    { titulo: 'Botox', sessoes: '2', materiais: [{ nome: 'toxina', quantidade: '20', custoUnitario: 12, valorCliente: 'x' }] },
    { titulo: 'Sem materiais', materiais: 'quebrado' },
  ],
  custoTotal: 99999,
  criadoPorUid: 'u-prof',
  createdAt: '2026-11-12T10:00:00.000Z',
});
ok('lê sessões e quantidades gravadas como texto', torto.procedimentos[0].sessoes === 2 && torto.procedimentos[0].materiais[0].quantidade === 20);
ok('valor inválido vira zero', torto.procedimentos[0].materiais[0].valorCliente === 0);
ok('lista quebrada vira lista vazia', torto.procedimentos[1].materiais.length === 0);
ok('o total sai das linhas, não do número gravado', torto.custoTotal === 240, String(torto.custoTotal));
ok('procedimento sem id ganha um', !!torto.procedimentos[1].id);
ok('documento sem procedimentos não derruba', normalizarSimulacao({ id: 'v' }).procedimentos.length === 0);

console.log('== textos');
ok('resumo dos procedimentos', resumoDosProcedimentos(nova) === 'Botox');
ok('resumo sem procedimento', resumoDosProcedimentos({ procedimentos: [] }) === 'Sem procedimento');
ok(
  'nome do arquivo com a cliente e a data',
  nomeDoArquivoDaSimulacao(nova) === 'Simulação de custo - Camila - 12-11-2026.pdf',
  nomeDoArquivoDaSimulacao(nova)
);
ok(
  'sem cliente, o arquivo leva o procedimento',
  nomeDoArquivoDaSimulacao({ ...nova, pacienteNome: undefined, procedimentos: [{ ...nova.procedimentos[0], titulo: 'Botox / testa' }] }) ===
    'Simulação de custo - Botox testa - 12-11-2026.pdf'
);
const copia = copiaDosProcedimentos(nova.procedimentos);
ok('a cópia ganha ids novos', copia[0].id !== nova.procedimentos[0].id);
copia[0].materiais[0].quantidade = 999;
ok('e mexer na cópia não mexe no original', nova.procedimentos[0].materiais[0].quantidade === 20);

console.log('== paginação do PDF');
const alturasBase = (procedimentos: Alturas['procedimentos'], totais = 120): Alturas => ({
  cabecalho: 90,
  cabecalhoCompacto: 30,
  identificacao: 130,
  procedimentos,
  totais,
  rodape: 30,
});
const procAlt = (linhas: number) => ({ cabecalho: 50, linhas: Array(linhas).fill(28), vazio: 30, total: 30 });

const curta = paginarSimulacao(alturasBase([procAlt(3), procAlt(2)]));
ok('simulação curta cabe numa folha', curta.length === 1 && curta[0].final && curta[0].pedacos.length === 2);

const longa = paginarSimulacao(alturasBase([procAlt(60)]));
ok('procedimento com 60 materiais continua na folha seguinte', longa.length >= 2, `${longa.length} folhas`);
const linhasNasFolhas = longa.flatMap((p) => p.pedacos.flatMap((x) => x.linhas));
ok('nenhuma linha some nem se repete', linhasNasFolhas.length === 60 && new Set(linhasNasFolhas).size === 60);
ok('o pedaço da folha seguinte é marcado como continuação', longa[1].pedacos[0].continuacao === true);
ok('só o último pedaço leva o total', longa.flatMap((p) => p.pedacos).filter((x) => x.total).length === 1);

// Nenhuma folha passa da altura útil, somando como a folha soma.
const GAP = 13;
const alturas = alturasBase([procAlt(60), procAlt(5), procAlt(0)]);
const varias = paginarSimulacao(alturas);
const estourou = varias.some((pagina, i) => {
  let usado = (i === 0 ? alturas.cabecalho + GAP + alturas.identificacao : alturas.cabecalhoCompacto) + GAP;
  pagina.pedacos.forEach((pd) => {
    const p = alturas.procedimentos[pd.procedimento];
    usado += p.cabecalho + pd.linhas.reduce((s, l) => s + p.linhas[l], 0);
    if (pd.total) usado += p.total + (p.linhas.length === 0 ? p.vazio : 0);
    usado += GAP;
  });
  if (pagina.final) usado += alturas.totais + GAP;
  usado += alturas.rodape;
  return usado > ALTURA_UTIL + 0.5;
});
ok('nenhuma folha passa da altura útil', !estourou);
ok('procedimento sem material sai com o total', varias.flatMap((p) => p.pedacos).some((x) => x.procedimento === 2 && x.total));

// 22 linhas enchem a primeira folha (sobram ~5 px), e os totais de 300 px não cabem mais nela.
const quaseCheia = paginarSimulacao(alturasBase([procAlt(22)], 300));
ok(
  'os totais que não cabem vão para a folha seguinte',
  quaseCheia.length === 2 && quaseCheia[1].pedacos.length === 0 && quaseCheia[1].final,
  `${quaseCheia.length} folhas`
);

const _tipo: SimulacaoDeCusto = nova;
void _tipo;

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
