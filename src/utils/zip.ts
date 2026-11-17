/**
 * Um arquivo ZIP montado no navegador, sem biblioteca — para a cópia dos dados da clínica.
 *
 * Só o modo "guardado" (sem compressão): quase todo o peso da cópia são fotos JPEG e PNG, que já
 * vêm comprimidas, e o JSON que sobra é pequeno. Assim o formato cabe em poucas linhas, sem trazer
 * uma dependência nova para o site inteiro só por causa de um botão.
 *
 * Limites do ZIP clássico (sem ZIP64): até 65.535 arquivos e 4 GB no total. Acima disso, lança —
 * quem chama oferece a cópia sem as fotos.
 */

export interface ArquivoDoZip {
  /** O caminho dentro do ZIP, com `/` ("dados/pacientes.json"). Aceita acentos (UTF-8). */
  caminho: string;
  dados: Uint8Array;
  data?: Date;
}

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato do MS-DOS, que é o que o ZIP guarda. */
const dataDoDos = (d: Date): { hora: number; dia: number } => ({
  hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  dia: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

export const LIMITE_DO_ZIP_BYTES = 0xffffffff;
export const LIMITE_DO_ZIP_ARQUIVOS = 0xffff;

export class ZipGrandeDemais extends Error {
  constructor() {
    super('A cópia passou do tamanho que um arquivo ZIP comum comporta (4 GB ou 65 mil arquivos).');
    this.name = 'ZipGrandeDemais';
  }
}

export function montarZip(arquivos: ArquivoDoZip[]): Blob {
  if (arquivos.length > LIMITE_DO_ZIP_ARQUIVOS) throw new ZipGrandeDemais();
  const codificador = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let posicao = 0;

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.caminho);
    const tamanho = arquivo.dados.length;
    const crc = crc32(arquivo.dados);
    const { hora, dia } = dataDoDos(arquivo.data || new Date());

    // Cabeçalho local. Bit 11 das opções: o nome está em UTF-8.
    const local = new Uint8Array(30 + nome.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, hora, true);
    l.setUint16(12, dia, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, tamanho, true);
    l.setUint32(22, tamanho, true);
    l.setUint16(26, nome.length, true);
    l.setUint16(28, 0, true);
    local.set(nome, 30);

    // Entrada do diretório central, que aponta para o cabeçalho local.
    const entrada = new Uint8Array(46 + nome.length);
    const c = new DataView(entrada.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, tamanho, true);
    c.setUint32(24, tamanho, true);
    c.setUint16(28, nome.length, true);
    c.setUint16(30, 0, true);
    c.setUint16(32, 0, true);
    c.setUint16(34, 0, true);
    c.setUint16(36, 0, true);
    c.setUint32(38, 0, true);
    c.setUint32(42, posicao, true);
    entrada.set(nome, 46);

    partes.push(local, arquivo.dados);
    central.push(entrada);
    posicao += local.length + tamanho;
    if (posicao > LIMITE_DO_ZIP_BYTES) throw new ZipGrandeDemais();
  }

  const tamanhoDoCentral = central.reduce((soma, e) => soma + e.length, 0);
  if (posicao + tamanhoDoCentral > LIMITE_DO_ZIP_BYTES) throw new ZipGrandeDemais();
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(4, 0, true);
  f.setUint16(6, 0, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoDoCentral, true);
  f.setUint32(16, posicao, true);
  f.setUint16(20, 0, true);

  return new Blob([...partes, ...central, fim] as BlobPart[], { type: 'application/zip' });
}
