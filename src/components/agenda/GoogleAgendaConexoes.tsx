import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck, Link2, Loader2, Unlink } from 'lucide-react';
import { GoogleAgendaConfig, Professional } from '../../types';
import {
  SituacaoDaIntegracao,
  assinarGoogleAgenda,
  conectarGoogleAgenda,
  desconectarGoogleAgenda,
  podeConectarDaqui,
  situacaoDaIntegracao,
} from '../../services/googleAgenda';
import { NOME_DO_CALENDARIO } from '../../utils/googleAgenda';
import { ENDERECO_DO_SITE } from '../../utils/publicLinks';

interface GoogleAgendaConexoesProps {
  /** As profissionais já gravadas no perfil — a conta é guardada pelo id delas. */
  profissionais: Professional[];
}

/**
 * Configurações → Agenda → Google Agenda: cada profissional conecta a conta Google dela, e os
 * agendamentos dela passam a aparecer lá, num calendário "La Vie Clinique".
 *
 * Grava direto no banco, sem esperar o "Salvar" do modal: a autorização acabou de ser dada na
 * janela do Google, e perdê-la por fechar o modal sem salvar obrigaria a repetir tudo.
 */
export const GoogleAgendaConexoes: React.FC<GoogleAgendaConexoesProps> = ({ profissionais }) => {
  const [config, setConfig] = useState<GoogleAgendaConfig>({});
  const [situacao, setSituacao] = useState<SituacaoDaIntegracao | null>(null);
  const [ocupadaId, setOcupadaId] = useState<string | null>(null);
  const [esperandoGoogle, setEsperandoGoogle] = useState(false);
  const [desconectandoId, setDesconectandoId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  useEffect(() => assinarGoogleAgenda(setConfig), []);
  useEffect(() => {
    let vivo = true;
    situacaoDaIntegracao().then((s) => vivo && setSituacao(s));
    return () => {
      vivo = false;
    };
  }, []);

  const daqui = podeConectarDaqui();
  const podeConectar = situacao === 'configurada' && daqui;
  const contas = config.contas || {};

  const conectar = async (profissional: Professional) => {
    setMensagem(null);
    setOcupadaId(profissional.id);
    setEsperandoGoogle(true);
    try {
      const conta = await conectarGoogleAgenda(profissional, contas[profissional.id]);
      setMensagem({
        tipo: 'ok',
        texto: `${profissional.name}: conectado a ${conta.email || 'Google Agenda'}. Os agendamentos de hoje em diante vão aparecer em instantes.`,
      });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupadaId(null);
      setEsperandoGoogle(false);
    }
  };

  const desconectar = async (profissional: Professional) => {
    const conta = contas[profissional.id];
    if (!conta) return;
    setMensagem(null);
    setDesconectandoId(null);
    setOcupadaId(profissional.id);
    try {
      await desconectarGoogleAgenda(profissional.id, conta);
      setMensagem({
        tipo: 'ok',
        texto: `${profissional.name}: desconectada. O calendário "${NOME_DO_CALENDARIO}" continua na conta Google dela e pode ser apagado por lá.`,
      });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupadaId(null);
    }
  };

  return (
    <div className="space-y-2.5 pt-2">
      <h4 className="text-xs font-semibold text-ink flex items-center gap-1.5">
        <CalendarCheck className="w-3.5 h-3.5 text-brand" />
        Google Agenda
      </h4>
      <p className="text-body text-gray-500 leading-relaxed">
        Cada profissional conecta a conta Google dela, e os agendamentos dela aparecem no Google
        Agenda, num calendário chamado <strong>"{NOME_DO_CALENDARIO}"</strong> — com nome da
        paciente e procedimento, sem observações. A agenda oficial continua sendo esta: o que mudar
        aqui vai para o Google; o que for mudado no Google não volta para cá.
      </p>

      {situacao === 'nao-configurada' && (
        <Aviso>
          A ligação com o Google ainda não foi configurada no servidor do site (Secrets
          GOOGLE_AGENDA_CLIENT_ID e GOOGLE_AGENDA_CLIENT_SECRET no AI Studio).
        </Aviso>
      )}
      {situacao === 'indisponivel' && (
        <Aviso>
          O servidor do site não respondeu agora. Se o site acabou de ser publicado, espere um
          minuto e reabra as Configurações.
        </Aviso>
      )}
      {situacao === 'configurada' && !daqui && (
        <Aviso>
          Para conectar, abra o painel pelo endereço do site:{' '}
          <a href={ENDERECO_DO_SITE} target="_blank" rel="noreferrer" className="underline font-semibold">
            {new URL(ENDERECO_DO_SITE).host}
          </a>
          . Depois de conectada, a agenda sincroniza de qualquer lugar.
        </Aviso>
      )}

      <div className="space-y-1.5">
        {profissionais.map((p) => {
          const conta = contas[p.id];
          const ocupada = ocupadaId === p.id;
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 bg-white/60 border border-white/80 rounded-sm px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">{p.name}</p>
                {conta?.erro ? (
                  <p className="text-body text-red-600 leading-snug">
                    Precisa reconectar: {conta.erro}.
                  </p>
                ) : conta ? (
                  <p className="text-body text-emerald-700 leading-snug break-all">
                    Conectada{conta.email ? ` · ${conta.email}` : ''}
                  </p>
                ) : (
                  <p className="text-body text-gray-500 leading-snug">Não conectada</p>
                )}
              </div>

              {desconectandoId === p.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-body text-red-600 font-medium">Desconectar?</span>
                  <button
                    type="button"
                    onClick={() => desconectar(p)}
                    className="px-2 py-1 bg-red-600 text-white rounded-xs text-label font-bold uppercase tracking-wider hover:bg-red-700"
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesconectandoId(null)}
                    className="px-2 py-1 bg-gray-200 text-gray-700 rounded-xs text-label font-medium hover:bg-gray-300"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  {(!conta || conta.erro) && (
                    <button
                      type="button"
                      disabled={!podeConectar || ocupada}
                      onClick={() => conectar(p)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xs bg-ink text-brand-light text-label font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {ocupada ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      {conta ? 'Reconectar' : 'Conectar'}
                    </button>
                  )}
                  {conta && (
                    <button
                      type="button"
                      disabled={ocupada}
                      onClick={() => setDesconectandoId(p.id)}
                      className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Desconectar o Google Agenda"
                    >
                      {ocupada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {esperandoGoogle && (
        <p className="text-body text-gray-500 leading-snug">
          Conclua a autorização na janela do Google. Se aparecer "O Google não verificou este app",
          toque em <strong>Avançado</strong> e depois em <strong>Acessar</strong>.
        </p>
      )}
      {mensagem && (
        <p
          className={`text-body leading-snug ${mensagem.tipo === 'erro' ? 'text-red-600' : 'text-emerald-700'}`}
        >
          {mensagem.texto}
        </p>
      )}
    </div>
  );
};

const Aviso: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-body leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2 flex items-start gap-2">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);
