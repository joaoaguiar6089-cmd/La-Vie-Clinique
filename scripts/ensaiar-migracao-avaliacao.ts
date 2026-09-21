/**
 * Ensaio da migração das fichas de avaliação, contra um backup real — **sem tocar em banco**.
 *
 * Lê uma pasta de `backup/` (produzida por `exportar-banco.ts`, que só lê) e imprime exatamente o
 * que a migração faria na clínica: quais fichas de avaliação nasceriam, com que vínculo, quantas
 * perguntas cada uma levaria e o que sobraria em cada ficha de anamnese.
 *
 * Por que existe: a migração roda uma vez por clínica, apaga perguntas do documento de origem e
 * não tem botão de desfazer. Isto permite conferir o resultado **antes**, com os dados de verdade,
 * sem gravar nada e sem consumir cota.
 *
 *   npx tsx scripts/ensaiar-migracao-avaliacao.ts                 # usa o backup mais recente
 *   npx tsx scripts/ensaiar-migracao-avaliacao.ts backup/2026-09-16-1743
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AnamnesisQuestion, AnamnesisTemplate, EvaluationTemplate, Procedure } from '../src/types';
import {
  planejarInstalacaoDeFichasPadrao,
  planejarMigracao,
  procedimentosAtendidosPor,
} from '../src/utils/evaluations';
import { FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS } from '../src/data/anamnesisInitialData';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const pastaDoBackup = (): string => {
  const arg = process.argv[2];
  if (arg) return join(raiz, arg);
  const dir = join(raiz, 'backup');
  if (!existsSync(dir)) {
    console.error('Não há pasta `backup/`. Rode antes: npx tsx scripts/exportar-banco.ts');
    process.exit(1);
  }
  const pastas = readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(n)).sort();
  if (pastas.length === 0) {
    console.error('Nenhum backup em `backup/`. Rode antes: npx tsx scripts/exportar-banco.ts');
    process.exit(1);
  }
  return join(dir, pastas[pastas.length - 1]);
};

const lerColecao = <T>(pasta: string, nome: string): T[] => {
  const caminho = join(pasta, `${nome}.json`);
  if (!existsSync(caminho)) return [];
  const bruto = JSON.parse(readFileSync(caminho, 'utf-8'));
  const docs = bruto.documentos || {};
  return Object.entries(docs).map(([id, dados]) => ({ ...(dados as object), id })) as T[];
};

const pasta = pastaDoBackup();
console.log(`Ensaio contra ${pasta.replace(raiz, '.')}\n`);

const templates = lerColecao<AnamnesisTemplate>(pasta, 'anamnesis_templates');
const procedures = lerColecao<Procedure>(pasta, 'procedures');
const gerais = lerColecao<AnamnesisQuestion>(pasta, 'anamnesis_general_questions');

console.log(
  `${templates.length} fichas de anamnese · ${procedures.length} procedimentos · ` +
    `${gerais.length} perguntas gerais\n`
);

const plano = planejarMigracao(templates, procedures);
const semVinculo: string[] = [];

console.log('== fichas de avaliação que seriam criadas');
for (const ficha of plano.fichas) {
  const vinculo = [
    ...(ficha.categorias || []).map((c) => `categoria "${c}"`),
    ...(ficha.procedureIds || []).map((id) => procedures.find((p) => p.id === id)?.title || id),
  ];
  if (vinculo.length === 0) semVinculo.push(ficha.nome);

  const fotos = [
    ficha.fotoModeloFemininoUrl && 'feminina',
    ficha.fotoModeloMasculinoUrl && 'masculina',
    ficha.fotoModeloUrl && 'única',
  ].filter(Boolean);

  console.log(`
  ${ficha.nome}`);
  console.log(`    vínculo ......... ${vinculo.length ? vinculo.join(', ') : '(NENHUM — precisa ser ligado à mão)'}`);
  console.log(`    perguntas ....... ${ficha.perguntas.length}`);
  ficha.perguntas.forEach((q) => console.log(`        · ${q.id}  ${(q.texto || '').slice(0, 48)}`));
  console.log(`    mapa anatômico .. ${fotos.length ? fotos.join(' + ') : '(nenhum cadastrado)'}`);
}
if (plano.fichas.length === 0) console.log('  (nenhuma — nada a migrar neste backup)');

console.log('\n== fichas de anamnese que perdem perguntas');
for (const a of plano.anamneses) {
  const antes = templates.find((t) => t.id === a.id);
  const total = Object.keys((antes as any)?.perguntasEspecificas || {}).length;
  console.log(`  ${a.id}: ${total} -> ${a.perguntasQueFicam.length} perguntas`);
}
if (plano.anamneses.length === 0) console.log('  (nenhuma)');

const geraisDeMedico = gerais.filter((q) => (q.publicoAlvo || 'paciente') === 'medico');
console.log('\n== perguntas gerais que mudam de coleção');
if (geraisDeMedico.length === 0) {
  console.log('  (nenhuma pergunta geral está marcada como do profissional)');
} else {
  geraisDeMedico.forEach((q) => console.log(`  ${q.id} — ${q.texto}`));
}

/**
 * Segundo passo do boot: as fichas dos procedimentos que nunca tiveram perguntas na anamnese.
 * Roda depois da migração e sobre o resultado dela, exatamente como em `databaseService` — o que
 * a migração acabou de criar conta como cobertura e impede a instalação de uma ficha concorrente.
 */
const jaNoBanco = lerColecao<EvaluationTemplate>(pasta, 'evaluation_templates');
const existentes = [...jaNoBanco, ...plano.fichas];
const aInstalar = planejarInstalacaoDeFichasPadrao(
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
  existentes,
  procedures
);

console.log('\n== fichas padrão que seriam instaladas em seguida');
if (jaNoBanco.length > 0) {
  console.log(`  (a coleção já tem ${jaNoBanco.length} ficha(s) neste backup)`);
}
for (const ficha of aInstalar) {
  const alvos = procedimentosAtendidosPor(ficha, procedures);
  console.log(`
  ${ficha.nome}`);
  console.log(
    `    vínculo ......... ${[
      ...(ficha.categorias || []).map((c) => `categoria "${c}"`),
      ...(ficha.procedureIds || []).map((id) => procedures.find((p) => p.id === id)?.title || id),
    ].join(', ')}`
  );
  console.log(`    atende .......... ${alvos.length} procedimento(s)`);
  console.log(`    perguntas ....... ${ficha.perguntas.length}`);
  console.log(`    foto da sessão .. ${ficha.temFotoSessao ? 'sim' : 'não'}`);
}
if (aInstalar.length === 0) console.log('  (nenhuma — tudo já coberto neste backup)');

const depoisDeTudo = [...existentes, ...aInstalar];
const descobertos = procedures.filter(
  (p) =>
    !depoisDeTudo.some((f) => procedimentosAtendidosPor(f, procedures).some((x) => x.id === p.id))
);
console.log('\n== procedimentos que ficariam sem ficha de avaliação');
if (descobertos.length === 0) {
  console.log('  (nenhum — o catálogo inteiro fica coberto)');
} else {
  descobertos.forEach((p) => console.log(`  ${p.id} — ${p.title} [${p.category}]`));
}

console.log('\n== resumo');
console.log(`  fichas de avaliação criadas ...... ${plano.fichas.length}`);
console.log(`  fichas padrão instaladas ......... ${aInstalar.length}`);
console.log(
  `  perguntas movidas ................ ${plano.fichas.reduce((n, f) => n + f.perguntas.length, 0)}`
);
console.log(`  perguntas gerais movidas ......... ${geraisDeMedico.length}`);
console.log(`  fichas de anamnese alteradas ..... ${plano.anamneses.length}`);
if (semVinculo.length > 0) {
  console.log(`\n  ATENÇÃO — ${semVinculo.length} ficha(s) nasceriam sem vínculo e não abririam`);
  console.log('  em atendimento nenhum até alguém ligá-las na aba Fichas-modelo:');
  semVinculo.forEach((n) => console.log(`    · ${n}`));
}
console.log('\nNada foi gravado. Este script só lê o backup.');
