import React, { useState } from 'react';
import { FormularioDeCadastro } from './CadastroDaClinica';
import { Lock, Mail, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { login, sendResetPasswordEmail } from '../../services/authService';
import { ehZulia } from '../../lib/projetoFirebase';
import { DESCRICAO_DA_PLATAFORMA, MARCA_DA_LA_VIE, MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { CADASTRO_ABERTO } from '../../utils/cadastro';
import { PAGINAS_LEGAIS } from '../../utils/documentosLegais';

/** O cadastro de clínica nova existe só na plataforma, e só com ele aberto. */
const TEM_CADASTRO = ehZulia && CADASTRO_ABERTO;

/** `?cadastro` no endereço abre direto o formulário de criar conta (para mandar por link). */
const pediuCadastro = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('cadastro');
  } catch {
    return false;
  }
};

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe cadastro com este e-mail.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
};

function friendlyError(err: any): string {
  const code = err?.code as string | undefined;
  return (code && FIREBASE_ERROR_MESSAGES[code]) || 'Não foi possível entrar. Verifique seus dados e tente novamente.';
}

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [cadastrando, setCadastrando] = useState(() => TEM_CADASTRO && pediuCadastro());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Informe seu e-mail no campo acima para receber o link de redefinição.');
      return;
    }
    setError(null);
    try {
      await sendResetPasswordEmail(email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 6000);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const marca = ehZulia ? MARCA_DA_PLATAFORMA : MARCA_DA_LA_VIE;

  return (
    <div className="relative min-h-dvh bg-cream">
      {/* O relevo de fundo fica preso à tela (o formulário de cadastro é longo e rola por cima).
          `bg-center` é o que serve ao celular e ao tablet em pé: o recorte do meio da imagem
          guarda a lua em cima e o vão entre as árvores, onde entram os campos. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/login-fundo.webp)' }}
      />

      <div className="relative min-h-dvh flex flex-col">
        {/* Na Zulia a tela de login é da plataforma (várias clínicas entram por ela); no legado,
            a da La Vie, como sempre. */}
        <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-7 lg:px-11 lg:pt-9">
          <h1 className="font-marca marca-em-relevo text-[28px] sm:text-[36px] lg:text-[46px] leading-none text-brand-deep">
            {marca}
          </h1>
          {ehZulia && (
            <p className="font-serif-luxury marca-em-relevo italic font-medium text-[16px] sm:text-[19px] lg:text-[22px] text-ink mt-1.5 lg:mt-2">
              {DESCRICAO_DA_PLATAFORMA}
            </p>
          )}
        </header>

        {/* No celular os campos descem para a metade de baixo, deixando a lua à mostra; do tablet
            em diante ficam no meio, um pouco abaixo do centro (o vão entre as árvores). */}
        <main className="flex-1 flex items-end sm:items-center justify-center px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-8 lg:pt-[20vh]">
          <div className="w-full max-w-[22rem]">
        {cadastrando ? (
          <FormularioDeCadastro onVoltar={() => setCadastrando(false)} />
        ) : (
        <form
          onSubmit={handleSubmit}
          className="cartao-de-vidro rounded-3xl p-5 sm:p-6 space-y-4"
        >
          <p className="text-center text-[12px] font-semibold uppercase tracking-[.18em] text-brand-deep">
            {ehZulia ? 'Acesso da clínica' : 'Acesso da equipe'}
          </p>
          <div>
            <label className="block text-[13px] font-semibold text-ink mb-1.5">E-mail</label>
            <div className="relative">
              <Mail className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-muted-light" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={ehZulia ? 'seu.email@suaclinica.com' : 'seu.email@lavieclinique.com'}
                autoComplete="username"
                required
                className="w-full h-[50px] pl-11 pr-4 text-[14px] rounded-xl bg-white/85 border border-[rgba(110,73,36,.22)] text-ink placeholder:text-muted-light focus:outline-hidden focus:bg-white focus:border-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-ink mb-1.5">Senha</label>
            <div className="relative">
              <Lock className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-muted-light" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full h-[50px] pl-11 pr-4 text-[14px] rounded-xl bg-white/85 border border-[rgba(110,73,36,.22)] text-ink placeholder:text-muted-light focus:outline-hidden focus:bg-white focus:border-brand"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {resetSent && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Enviamos um link de redefinição de senha para {email}.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-[50px] rounded-xl bg-brand text-white text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover active:scale-97 transition-all disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            className="w-full text-center text-[13px] text-ink-soft hover:text-ink font-medium transition-colors"
          >
            Esqueci minha senha
          </button>
        </form>
        )}

            {/* O rodapé vai num vidro próprio: solto sobre o relevo, o texto pequeno se perdia. */}
            {ehZulia && (
              <div className="cartao-de-vidro rounded-2xl mt-3 px-4 py-3 space-y-1.5">
                {TEM_CADASTRO && !cadastrando && (
                  <p className="text-center text-[13px] text-ink-soft">
                    Sua clínica ainda não usa a {MARCA_DA_PLATAFORMA}?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setCadastrando(true);
                      }}
                      className="font-semibold text-brand-deep underline underline-offset-2 hover:text-ink"
                    >
                      Criar conta da clínica
                    </button>
                  </p>
                )}
                <p className="text-center text-[12px] text-ink-soft space-x-3">
                  <a href={PAGINAS_LEGAIS.termos} target="_blank" rel="noopener" className="hover:text-ink underline-offset-2 hover:underline">
                    Termos de Uso
                  </a>
                  <span aria-hidden="true">·</span>
                  <a href={PAGINAS_LEGAIS.politicaDePrivacidade} target="_blank" rel="noopener" className="hover:text-ink underline-offset-2 hover:underline">
                    Política de Privacidade
                  </a>
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
