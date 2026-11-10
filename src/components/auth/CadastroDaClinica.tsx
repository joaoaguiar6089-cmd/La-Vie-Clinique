import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Loader2, Lock, LogOut, Mail, MailCheck, RefreshCw, User } from 'lucide-react';
import {
  criarContaDaClinica,
  criarMinhaClinica,
  emailFoiConfirmado,
  enviarConfirmacaoDeEmail,
  ErroDoCadastro,
  lerCadastroPendente,
} from '../../services/cadastroApi';
import { mensagemDoCadastro, nomeLimpo, NOME_MAXIMO, SENHA_MINIMA } from '../../utils/cadastro';
import { MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { PAGINAS_LEGAIS, VERSAO_DOS_DOCUMENTOS } from '../../utils/documentosLegais';

/**
 * As telas do cadastro sozinho de uma clínica (ver `server/cadastro.ts`):
 *   - `FormularioDeCadastro`, dentro da tela de login: nome da clínica, nome, e-mail e senha;
 *   - `ConcluirCadastroView`, para o login que ainda não tem clínica: confirmar o e-mail e criar a
 *     clínica.
 */

const ERROS_DO_LOGIN: Record<string, string> = {
  'auth/email-already-in-use':
    'Este e-mail já tem login. Volte e entre com ele (ou use "Esqueci minha senha").',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/weak-password': `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`,
  'auth/password-does-not-meet-requirements': 'A senha não atende às regras de segurança. Use letras e números.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Sem conexão. Confira a internet e tente de novo.',
  'auth/operation-not-allowed': 'O cadastro de clínicas novas está fechado no momento.',
  'auth/admin-restricted-operation': 'O cadastro de clínicas novas está fechado no momento.',
};

const erroDoLogin = (erro: unknown): string =>
  ERROS_DO_LOGIN[(erro as { code?: string })?.code || ''] || 'Não foi possível criar a conta. Tente de novo.';

const classeDoCampo =
  'w-full h-[50px] pl-11 pr-4 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand';
const classeDoBotao =
  'w-full h-[50px] rounded-xl bg-brand text-white text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover active:scale-97 transition-all disabled:opacity-60';
const classeDoBotaoSecundario =
  'w-full h-[46px] rounded-xl border border-[rgba(26,26,26,.12)] text-ink text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-surface transition-all disabled:opacity-60';

const Campo: React.FC<{
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
  dica?: string;
} & React.InputHTMLAttributes<HTMLInputElement>> = ({ rotulo, icone: Icone, dica, ...props }) => (
  <div>
    <label className="block text-[13px] font-semibold text-ink mb-1.5">
      {rotulo}
      <div className="relative mt-1.5 font-normal">
        <Icone className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-muted-light" />
        <input {...props} className={classeDoCampo} />
      </div>
    </label>
    {dica && <p className="text-[12px] text-muted mt-1">{dica}</p>}
  </div>
);

const Aviso: React.FC<{ tipo: 'erro' | 'ok'; children: React.ReactNode }> = ({ tipo, children }) => (
  <div
    role={tipo === 'erro' ? 'alert' : 'status'}
    className={`flex items-start gap-2 p-3 rounded-xl border text-[13px] ${
      tipo === 'erro' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
    }`}
  >
    {tipo === 'erro' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
    <span>{children}</span>
  </div>
);

/** O que o plano gratuito inclui (docs/zulia-plataforma.md, "Planos"). */
const PLANO_GRATUITO = 'todos os módulos, até 2 procedimentos, 5 clientes e 1 login. Dá para assinar o plano completo depois.';

/** Um link para um documento legal, em outra aba (o formulário não se perde). */
export const LinkDoDocumento: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener"
    onClick={(e) => e.stopPropagation()}
    className="font-semibold text-brand hover:text-brand-hover underline underline-offset-2"
  >
    {children}
  </a>
);

/** A caixa obrigatória de aceite dos Termos, da Política e do Acordo de Tratamento de Dados. */
export const CaixaDeAceite: React.FC<{ marcada: boolean; onMudar: (marcada: boolean) => void }> = ({ marcada, onMudar }) => (
  <label className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-[rgba(26,26,26,.1)] cursor-pointer">
    <input
      type="checkbox"
      checked={marcada}
      onChange={(e) => onMudar(e.target.checked)}
      className="mt-0.5 w-[18px] h-[18px] accent-[var(--color-brand)] shrink-0"
    />
    <span className="text-[12.5px] text-ink-soft leading-relaxed">
      Li e aceito, em nome da clínica, os <LinkDoDocumento href={PAGINAS_LEGAIS.termos}>Termos de Uso</LinkDoDocumento>, a{' '}
      <LinkDoDocumento href={PAGINAS_LEGAIS.politicaDePrivacidade}>Política de Privacidade</LinkDoDocumento> e o{' '}
      <LinkDoDocumento href={PAGINAS_LEGAIS.tratamentoDeDados}>Acordo de Tratamento de Dados</LinkDoDocumento>.
    </span>
  </label>
);

// ==========================================
// CRIAR A CONTA (na tela de login)
// ==========================================

export const FormularioDeCadastro: React.FC<{ onVoltar: () => void }> = ({ onVoltar }) => {
  const [clinica, setClinica] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aceitou, setAceitou] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!nomeLimpo(clinica)) return setErro(mensagemDoCadastro('nome-invalido'));
    if (!nomeLimpo(nome)) return setErro('Informe o seu nome.');
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
    if (!aceitou) return setErro(mensagemDoCadastro('aceite-pendente'));
    setEnviando(true);
    try {
      // Deu certo: o login abre e o painel troca sozinho para a tela de confirmar o e-mail.
      await criarContaDaClinica({ clinica, nome, email, senha, aceitou: VERSAO_DOS_DOCUMENTOS });
    } catch (falha) {
      setErro(erroDoLogin(falha));
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 space-y-4">
      <div>
        <h2 className="font-serif-luxury text-[20px] font-semibold text-ink">Criar conta da clínica</h2>
        <p className="text-[12.5px] text-muted mt-1 leading-relaxed">Plano gratuito: {PLANO_GRATUITO}</p>
      </div>
      <Campo
        rotulo="Nome da clínica"
        icone={Building2}
        value={clinica}
        onChange={(e) => setClinica(e.target.value)}
        placeholder="Ex.: Clínica Bella Pele"
        maxLength={NOME_MAXIMO}
        autoComplete="organization"
        required
      />
      <Campo
        rotulo="Seu nome"
        icone={User}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: Dra. Ana Souza"
        maxLength={NOME_MAXIMO}
        autoComplete="name"
        required
      />
      <Campo
        rotulo="E-mail"
        icone={Mail}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@suaclinica.com"
        autoComplete="email"
        required
      />
      <Campo
        rotulo="Senha"
        icone={Lock}
        type="password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="••••••••"
        autoComplete="new-password"
        minLength={SENHA_MINIMA}
        dica={`Pelo menos ${SENHA_MINIMA} caracteres.`}
        required
      />
      <CaixaDeAceite marcada={aceitou} onMudar={setAceitou} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button type="submit" disabled={enviando} className={classeDoBotao}>
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        {enviando ? 'Criando a conta...' : 'Criar conta'}
      </button>
      <button
        type="button"
        onClick={onVoltar}
        className="w-full text-center text-[13px] text-muted hover:text-ink font-medium transition-colors"
      >
        Já tenho conta — entrar
      </button>
    </form>
  );
};

// ==========================================
// CONCLUIR (login sem clínica)
// ==========================================

export const ConcluirCadastroView: React.FC<{
  email: string | null;
  emailVerificado: boolean;
  nomeNoLogin: string | null;
  onConcluido: () => void;
  onSair: () => void;
}> = ({ email, emailVerificado, nomeNoLogin, onConcluido, onSair }) => {
  const [etapa, setEtapa] = useState<'confirmar' | 'clinica'>(emailVerificado ? 'clinica' : 'confirmar');
  const pendente = lerCadastroPendente(email);
  const [clinica, setClinica] = useState(pendente?.clinica || '');
  const [nome, setNome] = useState(pendente?.nome || nomeNoLogin || '');
  // Marcado no formulário (mesmo navegador, mesma versão): já vem marcado; senão, a pessoa marca aqui.
  const [aceitou, setAceitou] = useState(pendente?.aceitou === VERSAO_DOS_DOCUMENTOS);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reenvioLiberadoEm, setReenvioLiberadoEm] = useState(0);

  /** Confere a confirmação. `calado`: sem mensagem quando ainda não confirmou (conferência automática). */
  const conferir = useCallback(async (calado = false) => {
    try {
      if (await emailFoiConfirmado()) {
        setErro(null);
        setAviso(null);
        setEtapa('clinica');
      } else if (!calado) {
        setErro('O e-mail ainda não aparece como confirmado. Abra o link do e-mail e tente de novo.');
      }
    } catch {
      if (!calado) setErro('Sem conexão. Confira a internet e tente de novo.');
    }
  }, []);

  // Quem confirma no celular ou em outra aba volta para esta: confere sozinho ao voltar.
  useEffect(() => {
    if (etapa !== 'confirmar') return;
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void conferir(true);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [etapa, conferir]);

  const reenviar = async () => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await enviarConfirmacaoDeEmail();
      setAviso(`Enviamos de novo para ${email}. Confira também a caixa de spam.`);
      // Um reenvio a cada 30 segundos: o Firebase bloqueia o login por um tempo se forem muitos.
      setReenvioLiberadoEm(Date.now() + 30_000);
      setTimeout(() => setReenvioLiberadoEm(0), 30_000);
    } catch (falha) {
      setErro(erroDoLogin(falha));
    } finally {
      setOcupado(false);
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!nomeLimpo(clinica)) return setErro(mensagemDoCadastro('nome-invalido'));
    if (!aceitou) return setErro(mensagemDoCadastro('aceite-pendente'));
    setOcupado(true);
    try {
      await criarMinhaClinica(clinica, nome);
      onConcluido();
    } catch (falha) {
      const codigo = falha instanceof ErroDoCadastro ? falha.codigo : '';
      if (codigo === 'ja-tem-clinica') {
        // Criada num clique anterior: é só entrar.
        onConcluido();
        return;
      }
      if (codigo === 'email-nao-confirmado') setEtapa('confirmar');
      setErro(codigo === 'rede' ? 'Sem conexão. Confira a internet e tente de novo.' : mensagemDoCadastro(codigo));
      setOcupado(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 space-y-4">
        {etapa === 'confirmar' ? (
          <>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-surface border border-[rgba(26,26,26,.1)] flex items-center justify-center mx-auto">
                <MailCheck className="w-6 h-6 text-brand" />
              </div>
              <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Confirme seu e-mail</h1>
              <p className="text-[13px] text-muted leading-relaxed">
                Enviamos um link de confirmação para {email ? <strong className="text-ink">{email}</strong> : 'o seu e-mail'}.
                Abra o e-mail (confira também o spam), clique no link e volte aqui.
              </p>
            </div>
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
            <button type="button" onClick={() => void conferir()} disabled={ocupado} className={classeDoBotao}>
              <CheckCircle2 className="w-4 h-4" />
              Já confirmei
            </button>
            <button
              type="button"
              onClick={reenviar}
              disabled={ocupado || Date.now() < reenvioLiberadoEm}
              className={classeDoBotaoSecundario}
            >
              <RefreshCw className="w-4 h-4" />
              Reenviar o e-mail
            </button>
          </>
        ) : (
          <form onSubmit={criar} className="space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-surface border border-[rgba(26,26,26,.1)] flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6 text-brand" />
              </div>
              <h1 className="font-serif-luxury text-[22px] font-semibold text-ink">Crie sua clínica</h1>
              <p className="text-[13px] text-muted leading-relaxed">
                E-mail confirmado. Falta só o nome da clínica para abrir o painel da {MARCA_DA_PLATAFORMA}.
              </p>
            </div>
            <Campo
              rotulo="Nome da clínica"
              icone={Building2}
              value={clinica}
              onChange={(e) => setClinica(e.target.value)}
              placeholder="Ex.: Clínica Bella Pele"
              maxLength={NOME_MAXIMO}
              autoComplete="organization"
              required
            />
            <Campo
              rotulo="Seu nome"
              icone={User}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Dra. Ana Souza"
              maxLength={NOME_MAXIMO}
              autoComplete="name"
            />
            <p className="text-[12.5px] text-muted leading-relaxed">Plano gratuito: {PLANO_GRATUITO}</p>
            <CaixaDeAceite marcada={aceitou} onMudar={setAceitou} />
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <button type="submit" disabled={ocupado} className={classeDoBotao}>
              {ocupado && <Loader2 className="w-4 h-4 animate-spin" />}
              {ocupado ? 'Criando a clínica...' : 'Criar minha clínica'}
            </button>
          </form>
        )}
        <p className="text-[12px] text-muted leading-relaxed text-center">
          Faz parte da equipe de uma clínica que já usa a {MARCA_DA_PLATAFORMA}? Não crie outra: peça à
          administradora o seu acesso em Configurações → Equipe.
        </p>
        <button type="button" onClick={onSair} className={classeDoBotaoSecundario}>
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );
};
