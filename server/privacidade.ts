import type { Request, Response } from 'express';
import { firebaseConfig } from '../src/lib/projetoFirebase';
import { caminhoDaColecao, clinicaDoPedido } from './clinicas';
import { CLINICA_DOS_LINKS_ANTIGOS } from '../src/utils/clinicas';
import { documentoEmHtml, escapar } from './documentosLegais';
import { bancoAdmin } from './firebaseAdmin';
import { NOME_DO_CALENDARIO } from './googleAgenda';
import { decodificarCampos } from './previewDosLinks';

/**
 * O aviso de privacidade da clínica para as pacientes, em /privacidade (o texto mora em
 * `public/legal/aviso-da-clinica.md`; a página, em `server/documentosLegais.ts`).
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
 *
 * Na Zulia, o perfil é o da clínica de `/privacidade?c=<clinicaId>`; sem `c`, o da clínica dos
 * links antigos (a La Vie, que é quem usa o Google Agenda).
 */

export interface PerfilParaPrivacidade {
  name?: string;
  phone?: string;
  address?: string;
  cityState?: string;
}

/** Sem perfil (banco fora do ar): o nome da clínica dos links antigos, a La Vie. */
const NOME_PADRAO = 'La Vie Clinique';

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/**
 * O aviso de privacidade da clínica (`public/legal/aviso-da-clinica.md`), com o nome, o endereço e o
 * contato dela. Tudo o que vem do perfil é escapado.
 */
export const paginaDePrivacidade = (perfil: PerfilParaPrivacidade = {}, nomePadrao = NOME_PADRAO): string => {
  const nome = texto(perfil.name) || nomePadrao;
  const endereco = [texto(perfil.address), texto(perfil.cityState)].filter(Boolean).map(escapar).join(' — ');
  const telefone = texto(perfil.phone);
  return documentoEmHtml(
    'aviso-da-clinica',
    { clinica: nome, calendario: NOME_DO_CALENDARIO },
    {
      enderecoDaClinica: endereco ? ` (${endereco})` : '',
      contatoDaClinica: telefone
        ? `pelo telefone/WhatsApp <strong>${escapar(telefone)}</strong> ou pessoalmente na clínica`
        : 'pessoalmente na clínica ou pelos canais de atendimento dela',
    }
  );
};

const RAIZ_DO_BANCO =
  `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
  `/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents`;

const CAMPOS = ['name', 'phone', 'address', 'cityState'];
const GUARDA_POR_MS = 10 * 60 * 1000;
const guardados = new Map<string, { ate: number; perfil: PerfilParaPrivacidade }>();

/** Nome e contato da clínica. Banco fora do ar não derruba a página: sai com o texto padrão. */
const lerPerfil = async (clinicaId: string | null): Promise<PerfilParaPrivacidade> => {
  const chave = clinicaId ?? '';
  const guardado = guardados.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.perfil;
  try {
    const caminho = `${caminhoDaColecao(clinicaId, 'clinic_settings')}/public_profile`;
    // Com a credencial do servidor, lê por ela (vale também nos emuladores); sem, pela leitura
    // pública do perfil, como sempre.
    const db = bancoAdmin();
    if (db) {
      const dados = (await db.doc(caminho).get()).data() || {};
      const perfil = Object.fromEntries(CAMPOS.map((c) => [c, dados[c]])) as PerfilParaPrivacidade;
      if (guardados.size > 500) guardados.clear();
      guardados.set(chave, { ate: Date.now() + GUARDA_POR_MS, perfil });
      return perfil;
    }
    const mascara = CAMPOS.map((c) => `mask.fieldPaths=${c}`).join('&');
    const resposta = await fetch(`${RAIZ_DO_BANCO}/${caminho}?${mascara}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!resposta.ok) throw new Error(`Firestore respondeu ${resposta.status}`);
    const corpo = (await resposta.json()) as { fields?: Record<string, any> };
    const perfil = decodificarCampos(corpo.fields) as PerfilParaPrivacidade;
    if (guardados.size > 500) guardados.clear();
    guardados.set(chave, { ate: Date.now() + GUARDA_POR_MS, perfil });
    return perfil;
  } catch (e) {
    console.warn('[privacidade] sem o perfil da clínica, usando o texto padrão:', e);
    return guardado?.perfil || {};
  }
};

export const servirPrivacidade = async (req: Request, res: Response): Promise<void> => {
  // Na Zulia, `undefined` (um `c` que não presta) sai com o texto padrão, sem ler nada.
  const clinicaId = clinicaDoPedido(req.query.c);
  const perfil = clinicaId === undefined ? {} : await lerPerfil(clinicaId);
  // Sem perfil, o nome padrão só serve para a La Vie (link sem c); para outra clínica, genérico.
  const daLaVie = !clinicaId || clinicaId === CLINICA_DOS_LINKS_ANTIGOS;
  try {
    res.set('Cache-Control', 'public, max-age=600').type('html').send(paginaDePrivacidade(perfil, daLaVie ? NOME_PADRAO : 'Clínica'));
  } catch (erro) {
    console.error('[privacidade]', erro);
    res.status(500).type('text').send('Aviso indisponível no momento. Tente de novo em alguns minutos.');
  }
};
