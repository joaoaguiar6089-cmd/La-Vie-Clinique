import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Lock, Mail, UserRound } from 'lucide-react';
import {
  type ProgressoDaCopia,
  type ResumoDaCopia,
  baixarCopiaDaClinica,
  tamanhoLegivel,
} from '../../services/copiaDosDados';
import { ZipGrandeDemais } from '../../utils/zip';
import { PRESTADOR } from '../../utils/documentosLegais';
import { LeitorDeDocumento, type DocumentoDaPlataforma } from '../auth/LeitorDeDocumento';
import { ehZulia } from '../../lib/projetoFirebase';
import { AvisoTinta, BotaoPilula } from '../common/Tinta';

/**
 * Ajustes → Dados e privacidade: a cópia dos dados da clínica (o que os Termos, 15.1, e o Acordo de
 * Tratamento de Dados, 10.1, prometem), o caminho para a cópia de uma paciente, o encerramento da
 * conta e os documentos legais.
 *
 * A cópia é feita aqui mesmo, no navegador, e baixada como ZIP — sem esperar o suporte. Só a
 * administradora: é ela quem responde pela clínica, e só ela lê, por exemplo, as simulações de
 * custo de toda a equipe.
 */

const ETAPAS: Record<ProgressoDaCopia['etapa'], string> = {
  dados: 'Lendo os registros',
  arquivos: 'Baixando as fotos e os arquivos',
  montando: 'Montando o arquivo',
};

const Cartao: React.FC<{ icone: React.ElementType; titulo: string; children: React.ReactNode }> = ({ icone: Icone, titulo, children }) => (
  <section className="rounded-2xl bg-card border border-line p-4 sm:p-5 space-y-3">
    <h3 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
      <Icone className="w-[18px] h-[18px] shrink-0" />
      {titulo}
    </h3>
    {children}
  </section>
);

export const SecaoDados: React.FC<{ nomeDaClinica: string; ehAdmin: boolean; clinicaId: string | null }> = ({
  nomeDaClinica,
  ehAdmin,
  clinicaId,
}) => {
  const [progresso, setProgresso] = useState<ProgressoDaCopia | null>(null);
  const [resumo, setResumo] = useState<ResumoDaCopia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoDaPlataforma | null>(null);

  const copiar = async (comArquivos: boolean) => {
    setErro(null);
    setResumo(null);
    setProgresso({ etapa: 'dados', feito: 0, total: 1 });
    try {
      setResumo(await baixarCopiaDaClinica({ nomeDaClinica, comArquivos, aoProgredir: setProgresso }));
    } catch (e) {
      console.error('Cópia dos dados:', e);
      setErro(
        e instanceof ZipGrandeDemais
          ? 'A cópia com as fotos ficou grande demais para um arquivo só. Baixe só os dados, e peça as fotos ao suporte.'
          : 'Não foi possível montar a cópia agora. Confira a internet e tente de novo — se continuar, escreva para o suporte.'
      );
    } finally {
      setProgresso(null);
    }
  };

  const ocupado = progresso !== null;
  const porcentagem = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Cartao icone={Download} titulo="Cópia dos dados da clínica">
        <p className="text-[14px] text-ink-soft leading-relaxed">
          Um arquivo ZIP com tudo o que a clínica guarda aqui: pacientes, agenda, fichas, orçamentos, recibos, estoque e
          catálogo — em planilhas (abrem no Excel) e em JSON —, mais as fotos e os comprovantes. Guarde em lugar
          protegido: são dados de saúde.
        </p>

        {!ehAdmin ? (
          <AvisoTinta tom="info" icone={Lock}>
            Só a administradora da clínica baixa a cópia completa dos dados.
          </AvisoTinta>
        ) : ocupado ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="text-[14px] font-semibold text-ink flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {ETAPAS[progresso.etapa]}
              {progresso.etapa !== 'montando' && progresso.total > 1 && (
                <span className="font-normal text-ink-soft tabular-nums">
                  {' '}
                  — {progresso.feito} de {progresso.total}
                </span>
              )}
            </p>
            <div className="h-2 rounded-full bg-line-soft overflow-hidden">
              <div className="h-full bg-ink transition-all" style={{ width: `${progresso.etapa === 'montando' ? 100 : porcentagem}%` }} />
            </div>
            <p className="text-[12.5px] text-muted">Deixe esta tela aberta até o arquivo baixar. Com muitas fotos, leva alguns minutos.</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <BotaoPilula tom="preto" icone={Download} onClick={() => void copiar(true)}>
              Baixar a cópia completa
            </BotaoPilula>
            <BotaoPilula tom="contorno" onClick={() => void copiar(false)}>
              Só os dados, sem as fotos
            </BotaoPilula>
          </div>
        )}

        {resumo && (
          <AvisoTinta tom={resumo.faltaram.length ? 'alerta' : 'info'} icone={resumo.faltaram.length ? AlertTriangle : CheckCircle2}>
            Cópia baixada: {resumo.documentos} registros
            {resumo.arquivos ? ` e ${resumo.arquivos} arquivos` : ''}, {tamanhoLegivel(resumo.bytes)}.
            {resumo.faltaram.length > 0 &&
              ` ${resumo.faltaram.length} ${resumo.faltaram.length === 1 ? 'item não pôde' : 'itens não puderam'} ser copiados — a lista está no LEIA-ME, dentro do arquivo.`}
          </AvisoTinta>
        )}
        {erro && (
          <AvisoTinta tom="erro" icone={AlertTriangle}>
            {erro}
          </AvisoTinta>
        )}
      </Cartao>

      <Cartao icone={UserRound} titulo="Dados de uma paciente">
        <p className="text-[14px] text-ink-soft leading-relaxed">
          Quando uma paciente pedir os dados dela (é um direito, pela LGPD), abra o cadastro dela em{' '}
          <strong>Pacientes</strong>, toque em <strong>Dados pessoais</strong> e use <strong>Baixar os dados dela</strong>.
          Sai um ZIP só com o que é dela: cadastro, fichas, atendimentos, orçamentos, recibos e fotos.
        </p>
      </Cartao>

      {ehZulia && (
        <Cartao icone={Mail} titulo="Encerrar a conta">
          <p className="text-[14px] text-ink-soft leading-relaxed">
            Para encerrar, escreva para <strong>{PRESTADOR.email}</strong>
            {clinicaId ? (
              <>
                {' '}
                informando o código da clínica, <strong>{clinicaId}</strong>
              </>
            ) : null}
            . Antes, baixe a cópia completa acima: a guarda do prontuário das pacientes é obrigação da clínica. Depois do
            encerramento, os dados ficam guardados por 90 dias (para pedir a cópia, se faltar) e então são apagados.
          </p>
        </Cartao>
      )}

      {ehZulia && (
        <Cartao icone={FileText} titulo="Documentos">
          <ul className="space-y-1">
            {(
              [
                ['termos-de-uso', 'Termos de Uso'],
                ['politica-de-privacidade', 'Política de Privacidade'],
                ['acordo-de-tratamento-de-dados', 'Acordo de Tratamento de Dados'],
              ] as [DocumentoDaPlataforma, string][]
            ).map(([id, rotulo]) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setDocumento(id)}
                  className="min-h-[40px] text-[14px] font-semibold text-ink underline underline-offset-4 hover:text-brand-deep"
                >
                  {rotulo}
                </button>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {documento && <LeitorDeDocumento documento={documento} onFechar={() => setDocumento(null)} />}
    </div>
  );
};
