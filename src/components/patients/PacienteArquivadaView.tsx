import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArchiveRestore, ChevronRight, Trash2 } from 'lucide-react';
import {
  AnamnesisRecord,
  AnamnesisTemplate,
  Attendance,
  ClinicProfile,
  EvaluationRecord,
  Patient,
  Procedure,
  Quote,
  Recibo,
} from '../../types';
import type { DocumentosDoArquivo } from '../../services/databaseService';
import { formatBRL, formatDate, formatDateOnly, formatDateShortYear } from '../../utils/formatters';
import {
  ehRealizado,
  instanteDoAtendimento,
  nomeDosProcedimentos,
  ROTULO_DO_STATUS,
} from '../../utils/attendances';
import { resolveQuoteStatus } from '../../utils/quoteCalc';
import { rotuloCurtoDoPagamento } from '../../utils/recibos';
import { montarMapasPublicos } from '../../utils/laserAreas';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { alvoDoAtendimento, alvoDoRegistro } from '../../utils/fichasClinicas';
import { PrintableAnamnesisSheet } from '../anamnesis/PrintableAnamnesisSheet';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { useAcoesDeOrcamento } from '../quotes/useAcoesDeOrcamento';
import { QUOTE_STATUS_LABEL } from '../quotes/QuoteDesfecho';
import { SkeletonLista } from '../common/Skeleton';
import { Avatar } from '../common/Tinta';

/** A data de atendimento pode estar em "YYYY-MM-DD" ou em ISO completo, conforme a origem. */
const dataDoAtendimento = (valor?: string): string =>
  !valor ? '' : valor.length === 10 ? formatDateOnly(valor) : formatDate(valor);

/** Uma linha de documento: o que é, quando, e o toque que abre. */
const LinhaDoDocumento: React.FC<{
  titulo: string;
  sub: string;
  direita?: React.ReactNode;
  onAbrir?: () => void;
}> = ({ titulo, sub, direita, onAbrir }) => {
  const conteudo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink truncate">{titulo}</span>
        <span className="block text-[13px] text-ink-soft truncate">{sub}</span>
      </span>
      {direita}
      {onAbrir && <ChevronRight className="w-4 h-4 shrink-0 text-ink-soft" />}
    </>
  );
  return (
    <li className="border-b border-ink/8">
      {onAbrir ? (
        <button
          type="button"
          onClick={onAbrir}
          className="w-full min-h-[56px] flex items-center gap-3 py-2.5 text-left hover:bg-ink/[0.02] transition-colors"
        >
          {conteudo}
        </button>
      ) : (
        <div className="min-h-[56px] flex items-center gap-3 py-2.5">{conteudo}</div>
      )}
    </li>
  );
};

const Secao: React.FC<{ titulo: string; total: number; children: React.ReactNode }> = ({
  titulo,
  total,
  children,
}) =>
  total === 0 ? null : (
    <section>
      <h3 className="font-sans text-[16px] font-bold text-ink mb-1">
        {titulo} <span className="font-medium text-ink-soft tabular-nums">{total}</span>
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );

/**
 * A página de uma paciente no arquivo — o único lugar onde os documentos dela ainda aparecem.
 *
 * É uma página de **consulta**: abre cada anamnese, avaliação, relatório e orçamento como nas
 * outras telas, mas não cria nada novo (um atendimento novo para quem está no arquivo cairia
 * invisível na agenda de todo mundo menos aqui). Para voltar a atender, tira-se do arquivo; para
 * sumir de vez — a paciente de teste —, exclui-se permanentemente.
 */

/** A lista do mais recente para o mais antigo, pela data em texto (ISO) que `chave` devolve. */
function porTexto<T>(lista: T[], chave: (x: T) => string): T[] {
  return [...lista].sort((a, b) => chave(b).localeCompare(chave(a)));
}

export const PacienteArquivadaView: React.FC<{
  paciente: Patient;
  /** `null` enquanto as coleções não chegaram. */
  documentos: DocumentosDoArquivo | null;
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  templates: AnamnesisTemplate[];
  todosPacientes: Patient[];
  onVoltar: () => void;
  onTirarDoArquivo: () => void;
  onExcluirDeVez: () => void;
}> = ({
  paciente,
  documentos,
  clinic,
  catalogProcedures,
  templates,
  todosPacientes,
  onVoltar,
  onTirarDoArquivo,
  onExcluirDeVez,
}) => {
  const [anamneseAberta, setAnamneseAberta] = useState<AnamnesisRecord | null>(null);
  const [avaliacaoAberta, setAvaliacaoAberta] = useState<EvaluationRecord | null>(null);
  const [relatorioAberto, setRelatorioAberto] = useState<Attendance | null>(null);
  const mapasDeAreas = useMemo(() => montarMapasPublicos(catalogProcedures).mapas, [catalogProcedures]);
  const acoesDeOrcamento = useAcoesDeOrcamento({
    clinic,
    procedures: catalogProcedures,
    patients: todosPacientes,
  });

  /** Cada grupo na ordem de leitura: o mais recente em cima. */
  const doc = useMemo(() => {
    if (!documentos) return null;
    return {
      fichas: porTexto(documentos.fichas, (f: AnamnesisRecord) => f.dataAtendimento || f.createdAt || ''),
      avaliacoes: porTexto(documentos.avaliacoes, (a: EvaluationRecord) => a.dataAtendimento || a.createdAt || ''),
      atendimentos: [...documentos.atendimentos].sort(
        (a, b) => instanteDoAtendimento(b) - instanteDoAtendimento(a)
      ),
      orcamentos: porTexto(documentos.orcamentos, (q: Quote) => q.dataEmissao || q.createdAt || ''),
      recibos: porTexto(documentos.recibos, (r: Recibo) => r.dataPagamento + r.createdAt),
    };
  }, [documentos]);

  const total = doc
    ? doc.fichas.length + doc.avaliacoes.length + doc.atendimentos.length + doc.orcamentos.length + doc.recibos.length
    : 0;
  const dados = [
    paciente.contato,
    paciente.email,
    paciente.dataNascimento ? `nascida em ${formatDateOnly(paciente.dataNascimento)}` : '',
  ].filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-4 sm:pt-8 pb-8 flex flex-col gap-5">
      <button
        type="button"
        onClick={onVoltar}
        className="self-start inline-flex items-center gap-1.5 min-h-[44px] -ml-1 pr-2 text-[14px] font-semibold text-ink-soft hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        📁 Arquivo
      </button>

      <div className="flex items-start gap-3.5 -mt-3">
        <Avatar nome={paciente.nome} tamanho={60} letras={2} className="opacity-60" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif-luxury text-[30px] sm:text-[38px] font-semibold text-ink break-words leading-[1.1]">
            {paciente.nome}
          </h1>
          <p className="text-[14px] font-semibold text-ink-soft mt-1">
            No arquivo desde {formatDateShortYear(paciente.arquivadoEm)}
          </p>
          {dados.length > 0 && (
            <p className="text-[13px] text-ink-soft mt-0.5 flex flex-wrap gap-x-2">
              {dados.map((d) => (
                <span key={d} className="whitespace-nowrap">
                  {d}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[18px] bg-card border border-ink/8 p-4 flex flex-col gap-3">
        <p className="text-[14px] text-ink leading-relaxed">
          Esta paciente foi excluída. Os documentos dela saíram de todas as seções da plataforma e
          só aparecem aqui.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onTirarDoArquivo}
            className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full border border-ink/15 text-[14px] font-semibold text-ink hover:border-ink/40 transition-colors"
          >
            <ArchiveRestore className="w-4 h-4" />
            Tirar do arquivo
          </button>
          <button
            type="button"
            onClick={onExcluirDeVez}
            className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full border border-danger-line text-[14px] font-semibold text-danger hover:bg-danger-bg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Excluir permanentemente
          </button>
        </div>
      </div>

      {!doc ? (
        <SkeletonLista linhas={4} />
      ) : total === 0 ? (
        <p className="rounded-[18px] bg-card border border-ink/8 py-10 px-5 text-center text-[14px] text-ink-soft">
          Nenhum documento no arquivo com ela.
        </p>
      ) : (
        <>
          <Secao titulo="Anamneses" total={doc.fichas.length}>
            {doc.fichas.map((f) => (
              <LinhaDoDocumento
                key={f.id}
                titulo={f.procedimentoNome}
                sub={[dataDoAtendimento(f.dataAtendimento || f.createdAt), f.profissionalNome]
                  .filter(Boolean)
                  .join(' · ')}
                onAbrir={() => setAnamneseAberta(f)}
              />
            ))}
          </Secao>

          <Secao titulo="Avaliações" total={doc.avaliacoes.length}>
            {doc.avaliacoes.map((a) => (
              <LinhaDoDocumento
                key={a.id}
                titulo={a.procedimentoNome}
                sub={[dataDoAtendimento(a.dataAtendimento), a.profissionalNome].filter(Boolean).join(' · ')}
                onAbrir={() => setAvaliacaoAberta(a)}
              />
            ))}
          </Secao>

          <Secao titulo="Atendimentos e relatórios" total={doc.atendimentos.length}>
            {doc.atendimentos.map((a) => (
              <LinhaDoDocumento
                key={a.id}
                titulo={nomeDosProcedimentos(a)}
                sub={[
                  `${formatDateOnly(a.data)}${a.hora ? ` às ${a.hora}` : ''}`,
                  a.status ? ROTULO_DO_STATUS[a.status] : ehRealizado(a) ? 'Realizado' : '',
                  a.profissionalNome,
                  a.acompanhamentoPreenchidoEm ? 'com relatório' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onAbrir={a.acompanhamentoPreenchidoEm ? () => setRelatorioAberto(a) : undefined}
              />
            ))}
          </Secao>

          <Secao titulo="Orçamentos" total={doc.orcamentos.length}>
            {doc.orcamentos.map((q) => (
              <LinhaDoDocumento
                key={q.id}
                titulo={`Nº ${q.numero}`}
                sub={[formatDate(q.dataEmissao), QUOTE_STATUS_LABEL[resolveQuoteStatus(q)]]
                  .filter(Boolean)
                  .join(' · ')}
                direita={
                  <span className="shrink-0 text-[14px] font-bold text-ink tabular-nums">
                    {formatBRL(q.total)}
                  </span>
                }
                onAbrir={() => acoesDeOrcamento.abrirPrevia(q)}
              />
            ))}
          </Secao>

          <Secao titulo="Recibos" total={doc.recibos.length}>
            {doc.recibos.map((r) => (
              <LinhaDoDocumento
                key={r.id}
                titulo={`Recibo Nº ${r.numero}`}
                sub={`${rotuloCurtoDoPagamento(r)} · pago em ${formatDateOnly(r.dataPagamento)}`}
                direita={
                  <span className="shrink-0 text-[14px] font-bold text-ink tabular-nums">
                    {formatBRL(r.valor)}
                  </span>
                }
              />
            ))}
          </Secao>
        </>
      )}

      {anamneseAberta &&
        (() => {
          const template = templates.find(
            (t) => t.id === (anamneseAberta.templateId || anamneseAberta.procedimentoId)
          );
          return (
            <PrintableAnamnesisSheet
              mapasDeAreas={mapasDeAreas}
              record={doc?.fichas.find((f) => f.id === anamneseAberta.id) || anamneseAberta}
              clinicProfile={clinic}
              onClose={() => setAnamneseAberta(null)}
              viewerRole="staff"
              orientationImage={resolveOrientationImage(template)}
              consentSections={resolveConsentTerm(template)}
            />
          );
        })()}

      {avaliacaoAberta && (
        <FichaFillModal
          tipo="avaliacao"
          isOpen
          onClose={() => setAvaliacaoAberta(null)}
          alvo={alvoDoRegistro(avaliacaoAberta)}
          paciente={paciente}
          catalogo={catalogProcedures}
          professionals={clinic.professionals || []}
          clinicProfile={clinic}
        />
      )}

      {relatorioAberto && (
        <FichaFillModal
          tipo="acompanhamento"
          isOpen
          onClose={() => setRelatorioAberto(null)}
          alvo={alvoDoAtendimento(relatorioAberto)}
          paciente={paciente}
          catalogo={catalogProcedures}
          professionals={clinic.professionals || []}
          clinicProfile={clinic}
        />
      )}

      {acoesDeOrcamento.modais}
    </div>
  );
};
