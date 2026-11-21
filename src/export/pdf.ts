import pdfMake from 'pdfmake/build/pdfmake';
import type { ContentText, Decoration } from 'pdfmake/interfaces';
import { type ExportParagraph, runStyle } from './document';

export async function pdfFile(title: string, blocks: ExportParagraph[]): Promise<Blob> {
  const content: ContentText[] = blocks.map(({ runs, prefix, align, heading }) => ({
    text: [prefix, ...runs.map(run => {
      const s = runStyle(run);
      const decoration: Decoration[] = [];
      if (s.underline) decoration.push('underline');
      if (s.strike) decoration.push('lineThrough');
      return {
        text: run.text, bold: !!heading || s.bold, italics: s.italic,
        sub: s.sub, sup: s.sup, decoration, link: s.link,
        color: s.color && '#' + s.color, background: s.background && '#' + s.background,
        fontSize: (heading === 1 ? 20 : heading === 2 ? 15 : 11) * s.size,
      };
    }), runs.length || prefix ? '' : ' '],
    alignment: align === 'end' ? 'right' : align === 'center' ? 'center' : 'left',
    margin: [0, 0, 0, heading ? 8 : 3],
  }));
  const { default: fonts } = await import('pdfmake/build/vfs_fonts');
  const stream = pdfMake.createPdf({ info: { title }, content, defaultStyle: { preserveLeadingSpaces: true } }, undefined, undefined, fonts).getStream();
  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = [];
    stream.on('data', (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })));
    stream.end();
  });
}
