/**
 * Confere o cartão que o WhatsApp mostra sobre cada link: o título de cada tipo, o que fica de
 * fora por privacidade, a troca das tags no `index.html` e o comportamento do servidor quando o
 * banco responde mal.
 *
 * O erro que este script caça é o silencioso: um link que sai com o título do site inteiro, um
 * nome de procedimento com `<` ou `"` que quebra a página, um dado da paciente que vai parar no
 * cartão, uma falha do Firestore que derruba o link em vez de só deixar o título genérico.
 *
 *   npx tsx scripts/verificar-link-preview.ts
 */
import { criarResolvedorDePreview, decodificarCampos } from '../server/previewDosLinks';
import {
  aplicarPreviewNoHtml,
  identificarLink,
  previewDeAgendamento,
  previewDeAnamnese,
  previewDeOrcamento,
  previewGenerico,
} from '../src/utils/linkPreview';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const INDEX = `<!doctype html>
<html lang="pt-BR">
  <head>
    <title>La Vie Clinique - Indaiatuba</title>
    <meta name="description" content="Catálogo editorial." />
    <meta property="og:title" content="La Vie Clinique - Indaiatuba" />
    <meta property="og:description" content="Catálogo editorial." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body><div id="root"></div></body>
</html>`;

// ---------- qual link é este ----------
console.log('\nIdentificar o link');
ok('anamnese por modelo', JSON.stringify(identificarLink('?anamnese=tpl-123&paciente=p1')) === '{"fonte":"anamnese-modelo","id":"tpl-123"}');
ok('anamnese por ficha', JSON.stringify(identificarLink('?ficha=abc-1')) === '{"fonte":"anamnese-ficha","id":"abc-1"}');
ok('modelo vence ficha, como na página', identificarLink('?ficha=a&anamnese=b')?.fonte === 'anamnese-modelo');
ok('orçamento', identificarLink('?orcamento=3f2b-77')?.fonte === 'orcamento');
ok('agendamento', identificarLink('?agendamento=3f2b-77')?.fonte === 'agendamento');
ok('catálogo (sem parâmetro) fica de fora', identificarLink('') === null);
ok('parâmetro desconhecido fica de fora', identificarLink('?utm_source=x') === null);
ok('id com barra não vira id', identificarLink('?orcamento=a/b')?.id === '');
ok('id enorme não vira id', identificarLink(`?orcamento=${'a'.repeat(300)}`)?.id === '');

// ---------- títulos ----------
console.log('\nTítulos');
ok('anamnese leva o procedimento', previewDeAnamnese('Botox').titulo === 'Anamnese - Botox');
ok('anamnese sem nome cai no genérico', previewDeAnamnese('  ').titulo === 'Anamnese - La Vie Clinique');

const agendamento = previewDeAgendamento({
  procedimento: { titulo: 'Limpeza de pele' },
  data: '2026-10-16',
  hora: '14:30',
  clinica: { name: 'La Vie Clinique' },
});
ok('agendamento leva o procedimento', agendamento.titulo === 'Confirmação de agendamento - Limpeza de pele');
ok('agendamento diz dia e hora', agendamento.descricao === 'sexta-feira, 16/10 às 14:30 · La Vie Clinique', agendamento.descricao);
ok(
  'agendamento sem hora não inventa horário',
  previewDeAgendamento({ procedimento: { titulo: 'X' }, data: '2026-10-16' }).descricao === 'sexta-feira, 16/10 · La Vie Clinique'
);
ok(
  'agendamento com data estragada não quebra',
  previewDeAgendamento({ procedimento: { titulo: 'X' }, data: 'lixo' }).descricao === previewGenerico('agendamento').descricao
);

ok('orçamento com 1 item', previewDeOrcamento({ numero: '2026-0148', itens: [{ titulo: 'Botox' }] }).titulo === 'Orçamento - Botox');
ok('orçamento com 2 itens', previewDeOrcamento({ itens: [{ titulo: 'Botox' }, { titulo: 'Peeling' }] }).titulo === 'Orçamento - Botox e Peeling');
ok('orçamento com 3 itens', previewDeOrcamento({ itens: [{ titulo: 'A' }, { titulo: 'B' }, { titulo: 'C' }] }).titulo === 'Orçamento - A e mais 2');
ok('orçamento junta itens repetidos', previewDeOrcamento({ itens: [{ titulo: 'Botox' }, { titulo: 'Botox' }] }).titulo === 'Orçamento - Botox');
ok('orçamento sem itens cai no genérico', previewDeOrcamento({ itens: [] }).titulo === 'Orçamento - La Vie Clinique');
ok('orçamento mostra o número', previewDeOrcamento({ numero: '2026-0148', itens: [{ titulo: 'X' }] }).descricao.includes('2026-0148'));

const longo = previewDeAnamnese('x'.repeat(400)).titulo;
ok('título enorme é cortado', longo.length <= 120, `${longo.length} caracteres`);

// ---------- privacidade ----------
console.log('\nPrivacidade');
const orcamentoCompleto = previewDeOrcamento({
  numero: '2026-0148',
  itens: [{ titulo: 'Botox', valorTabela: 1800, pacienteNome: 'Maria Souza' } as any],
  pacienteNome: 'Maria Souza',
  total: 1800,
} as any);
const textoDoCartao = `${orcamentoCompleto.titulo} ${orcamentoCompleto.descricao}`;
ok('orçamento não leva nome da paciente nem valor', !/Maria|1800|1\.800/.test(textoDoCartao), textoDoCartao);
const agendaCompleta = previewDeAgendamento({
  procedimento: { titulo: 'Botox' },
  data: '2026-10-16',
  clientePrimeiroNome: 'Maria',
  profissionalNome: 'Dra. Karoline',
} as any);
ok('agendamento não leva nome da cliente', !/Maria/.test(`${agendaCompleta.titulo} ${agendaCompleta.descricao}`));

// ---------- troca no HTML ----------
console.log('\nHTML');
const html = aplicarPreviewNoHtml(INDEX, previewDeAnamnese('Botox'));
ok('troca o <title>', html.includes('<title>Anamnese - Botox</title>'));
ok('troca o og:title', html.includes('<meta property="og:title" content="Anamnese - Botox" />'));
ok('troca a description', html.includes('<meta name="description" content="La Vie Clinique · Preencha sua ficha'));
ok('troca o og:description', /og:description" content="La Vie Clinique · Preencha/.test(html));
ok('acrescenta o og:site_name', html.includes('<meta property="og:site_name" content="La Vie Clinique" />'));
ok('não sobra o título antigo', !html.includes('Indaiatuba'));
ok('o resto da página fica igual', html.includes('<meta name="twitter:card" content="summary_large_image" />') && html.includes('<div id="root">'));

const perigoso = aplicarPreviewNoHtml(INDEX, previewDeAnamnese('Peeling "Pro" <script>alert(1)</script> & $& cia'));
ok('escapa HTML do nome', !perigoso.includes('<script>alert(1)</script>') && perigoso.includes('&lt;script&gt;'));
ok('aspas não fecham o atributo', perigoso.includes('Peeling &quot;Pro&quot;'));
ok('$& do nome não vira trecho do HTML', perigoso.includes('&amp; $&amp; cia'));

const semTags = aplicarPreviewNoHtml('<html><head></head><body>oi</body></html>', previewDeAnamnese('Botox'));
ok('index sem as tags passa sem estragar', semTags === '<html><head></head><body>oi</body></html>');

// ---------- leitura do Firestore ----------
console.log('\nFirestore (REST)');
const doc = decodificarCampos({
  procedimento: { mapValue: { fields: { titulo: { stringValue: 'Botox' } } } },
  itens: { arrayValue: { values: [{ mapValue: { fields: { titulo: { stringValue: 'A' } } } }] } },
  sessoes: { integerValue: '3' },
  ativo: { booleanValue: true },
  nada: { nullValue: null },
});
ok('decodifica texto aninhado', (doc.procedimento as any).titulo === 'Botox');
ok('decodifica lista de objetos', (doc.itens as any)[0].titulo === 'A');
ok('decodifica inteiro (chega como texto)', doc.sessoes === 3);
ok('decodifica booleano e nulo', doc.ativo === true && doc.nada === null);

const resposta = (status: number, corpo: unknown) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } }));

let pedidos: string[] = [];
let relogio = 1_000_000;
const resolver = criarResolvedorDePreview({
  agora: () => relogio,
  buscar: (async (url: string) => {
    pedidos.push(url);
    if (url.includes('/anamnesis_templates/tpl-botox')) {
      return resposta(200, { fields: { procedimentoNome: { stringValue: 'Botox' } } });
    }
    if (url.includes('/quotes/uuid-ok')) {
      return resposta(200, {
        fields: {
          numero: { stringValue: '2026-0148' },
          itens: { arrayValue: { values: [{ mapValue: { fields: { titulo: { stringValue: 'Bioestimulador' } } } }] } },
        },
      });
    }
    if (url.includes('/appointment_links/')) return resposta(403, { error: { status: 'PERMISSION_DENIED' } });
    if (url.includes('/anamnesis_records/boom')) throw new Error('rede caiu');
    return resposta(404, { error: { status: 'NOT_FOUND' } });
  }) as unknown as typeof fetch,
});

const botox = await resolver('?anamnese=tpl-botox&paciente=p1&profissional=x');
ok('modelo existente vira "Anamnese - Botox"', botox?.titulo === 'Anamnese - Botox', botox?.titulo);
ok('pede só o campo necessário', pedidos[0].includes('mask.fieldPaths=procedimentoNome'), pedidos[0]);
ok('usa o banco certo', pedidos[0].includes('/databases/banco-novo/documents/anamnesis_templates/tpl-botox'), pedidos[0]);

await resolver('?anamnese=tpl-botox');
ok('segunda vez sai do cache, sem ir ao banco', pedidos.length === 1);

relogio += 6 * 60 * 1000;
await resolver('?anamnese=tpl-botox');
ok('passados 5 min, lê de novo', pedidos.length === 2);

const orc = await resolver('?orcamento=uuid-ok');
ok('orçamento existente vira "Orçamento - Bioestimulador"', orc?.titulo === 'Orçamento - Bioestimulador', orc?.titulo);

const naoAchado = await resolver('?orcamento=uuid-que-nao-existe');
ok('documento inexistente cai no genérico', naoAchado?.titulo === 'Orçamento - La Vie Clinique', naoAchado?.titulo);
const antes = pedidos.length;
await resolver('?orcamento=uuid-que-nao-existe');
ok('id inventado não vira uma leitura por pedido', pedidos.length === antes);

const negado = await resolver('?agendamento=token-1');
ok('banco negou: cai no genérico, sem lançar', negado?.titulo === 'Confirmação de agendamento - La Vie Clinique', negado?.titulo);

const caiu = await resolver('?ficha=boom');
ok('rede caiu: cai no genérico, sem lançar', caiu?.titulo === 'Anamnese - La Vie Clinique', caiu?.titulo);

const lixo = pedidos.length;
const invalido = await resolver('?orcamento=../../x');
ok('id inválido nem chega ao banco', pedidos.length === lixo && invalido?.titulo === 'Orçamento - La Vie Clinique');

ok('catálogo não tem cartão próprio', (await resolver('')) === null);

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
