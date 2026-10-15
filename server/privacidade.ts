import type { Request, Response } from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { decodificarCampos } from './previewDosLinks';

/**
 * A política de privacidade pública do site, em /privacidade.
 *
 * Existe porque o Google só deixa o app do Google Agenda sair do modo "Teste" (em que a
 * autorização das profissionais cai a cada 7 dias) com o link de uma política de privacidade na
 * tela de consentimento. E ela precisa dizer, com todas as letras, o que o sistema faz com os
 * dados que recebe do Google.
 *
 * HTML do servidor, e não uma tela do React, para abrir em qualquer lugar sem JavaScript — o
 * revisor do Google, um leitor de tela, a paciente com internet ruim. Nome, endereço e telefone
 * vêm do espelho público do perfil (`clinic_settings/public_profile`, de leitura aberta), para a
 * página não envelhecer quando a clínica mudar o contato.
 */

export interface PerfilParaPrivacidade {
  name?: string;
  phone?: string;
  address?: string;
  cityState?: string;
}

const PERFIL_PADRAO: Required<PerfilParaPrivacidade> = {
  name: 'La Vie Clinique',
  phone: '',
  address: '',
  cityState: 'Indaiatuba - SP',
};

/** A data desta versão do texto. Mude junto com o texto. */
const ATUALIZADA_EM = '15 de outubro de 2026';

const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

export const paginaDePrivacidade = (perfil: PerfilParaPrivacidade = {}): string => {
  const nome = escapar(texto(perfil.name) || PERFIL_PADRAO.name);
  const endereco = [texto(perfil.address), texto(perfil.cityState) || PERFIL_PADRAO.cityState]
    .filter(Boolean)
    .map(escapar)
    .join(' — ');
  const telefone = escapar(texto(perfil.phone));
  const contato = telefone
    ? `pelo telefone/WhatsApp <strong>${telefone}</strong> ou pessoalmente na clínica`
    : 'pessoalmente na clínica ou pelos canais de atendimento';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de Privacidade · ${nome}</title>
<style>
  :root { color-scheme: light dark; --texto: #2b2420; --fundo: #faf7f4; --suave: #6b5f57; --linha: #e6ddd5; }
  @media (prefers-color-scheme: dark) { :root { --texto: #eee6df; --fundo: #1d1916; --suave: #b3a79e; --linha: #3a322c; } }
  body { margin: 0; background: var(--fundo); color: var(--texto); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 1.7rem; line-height: 1.25; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 32px 0 8px; padding-top: 16px; border-top: 1px solid var(--linha); }
  .data { color: var(--suave); margin: 0 0 24px; }
  ul { padding-left: 1.2rem; }
  li { margin: 4px 0; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
<h1>Política de Privacidade</h1>
<p class="data">${nome} · atualizada em ${ATUALIZADA_EM}</p>

<p>Esta política explica como a <strong>${nome}</strong>${endereco ? ` (${endereco})` : ''} trata os
dados pessoais no seu sistema de atendimento — o painel da clínica, as fichas de anamnese, os
orçamentos e os links de agendamento enviados às pacientes —, de acordo com a Lei Geral de Proteção
de Dados (Lei nº 13.709/2018, LGPD).</p>

<h2>1. Quais dados tratamos</h2>
<ul>
  <li><strong>Pacientes:</strong> nome, CPF, data de nascimento, telefone e demais dados de
  cadastro; respostas da ficha de anamnese e da avaliação, que podem incluir informações de saúde;
  fotos do acompanhamento dos procedimentos; agendamentos, confirmações e orçamentos.</li>
  <li><strong>Equipe da clínica:</strong> nome, função e e-mail de acesso ao painel.</li>
</ul>

<h2>2. Para que usamos</h2>
<p>Para prestar os atendimentos contratados: agendar e confirmar horários, registrar a ficha
clínica e o acompanhamento dos procedimentos, preparar orçamentos e manter o histórico de cada
paciente. Os dados de saúde são tratados para a tutela da saúde, por profissionais da clínica, e
pelo tempo exigido pelas normas profissionais aplicáveis.</p>

<h2>3. Onde os dados ficam e quem acessa</h2>
<p>Os dados ficam armazenados nos serviços do Google Cloud (Firebase), com conexão criptografada.
O painel só abre para a equipe da clínica, com login. A paciente acessa apenas a própria ficha,
orçamento ou agendamento, pelo link exclusivo que recebe da clínica.</p>
<p>Não vendemos dados pessoais e não os compartilhamos para publicidade. Eles só são processados
pelos fornecedores que operam o sistema (como o Google), para essa finalidade.</p>

<h2>4. Integração com o Google Agenda</h2>
<p>Cada profissional da clínica pode, se quiser, conectar a própria conta Google para ver os
agendamentos dela no Google Agenda. Nesse caso:</p>
<ul>
  <li>O sistema pede apenas a permissão de <strong>criar um calendário chamado "La Vie Clinique" e
  gerenciar os eventos desse calendário</strong>
  (<code>https://www.googleapis.com/auth/calendar.app.created</code>), além do e-mail da conta,
  para mostrar qual conta foi conectada. Ele não lê, não altera e não apaga nenhum outro calendário
  ou compromisso da profissional.</li>
  <li>Cada evento contém o nome da paciente, o procedimento, o horário, o endereço da clínica e se a
  paciente confirmou. Observações internas, telefone e respostas da ficha não vão para o Google.</li>
  <li>A autorização dada pelo Google é guardada cifrada, e é usada somente para manter esse
  calendário igual à agenda da clínica.</li>
  <li>O uso e a transferência para qualquer outro aplicativo das informações recebidas das APIs do
  Google seguem a
  <a href="https://developers.google.com/terms/api-services-user-data-policy">Política de Dados do
  Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado. Esses dados
  não são usados para publicidade, não são vendidos e não são lidos por pessoas fora da equipe da
  clínica.</li>
  <li>A profissional pode desconectar a qualquer momento, em Configurações → Agenda → Google Agenda
  no painel, ou removendo o acesso em
  <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>. O
  calendário "La Vie Clinique" permanece na conta dela e pode ser apagado por ela.</li>
</ul>

<h2>5. Seus direitos</h2>
<p>Você pode pedir, a qualquer momento: confirmação de que tratamos seus dados, acesso a eles,
correção, anonimização ou eliminação do que não for necessário, portabilidade, informação sobre
com quem compartilhamos e revogação de consentimento — direitos previstos no art. 18 da LGPD.
Informações de saúde que a lei manda guardar podem ser mantidas pelo prazo obrigatório.</p>

<h2>6. Contato</h2>
<p>Para qualquer pedido sobre seus dados, fale com a ${nome} ${contato}.</p>

<h2>7. Mudanças nesta política</h2>
<p>Esta política pode ser atualizada. A data no topo indica a versão em vigor.</p>
</main>
</body>
</html>`;
};

const RAIZ_DO_BANCO =
  `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
  `/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents`;

const CAMPOS = ['name', 'phone', 'address', 'cityState'];
const GUARDA_POR_MS = 10 * 60 * 1000;
let guardado: { ate: number; perfil: PerfilParaPrivacidade } | null = null;

/** Nome e contato da clínica. Banco fora do ar não derruba a página: sai com o texto padrão. */
const lerPerfil = async (): Promise<PerfilParaPrivacidade> => {
  if (guardado && guardado.ate > Date.now()) return guardado.perfil;
  try {
    const mascara = CAMPOS.map((c) => `mask.fieldPaths=${c}`).join('&');
    const resposta = await fetch(`${RAIZ_DO_BANCO}/clinic_settings/public_profile?${mascara}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!resposta.ok) throw new Error(`Firestore respondeu ${resposta.status}`);
    const corpo = (await resposta.json()) as { fields?: Record<string, any> };
    const perfil = decodificarCampos(corpo.fields) as PerfilParaPrivacidade;
    guardado = { ate: Date.now() + GUARDA_POR_MS, perfil };
    return perfil;
  } catch (e) {
    console.warn('[privacidade] sem o perfil da clínica, usando o texto padrão:', e);
    return guardado?.perfil || {};
  }
};

export const servirPrivacidade = async (_req: Request, res: Response): Promise<void> => {
  res.set('Cache-Control', 'public, max-age=600').type('html').send(paginaDePrivacidade(await lerPerfil()));
};
