import { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { type ExportParagraph, runStyle } from './document';

export function wordFile(title: string, blocks: ExportParagraph[]) {
  const children = blocks.map(({ runs, align, heading, prefix }) => new Paragraph({
    heading: heading === 1 ? HeadingLevel.HEADING_1 : heading === 2 ? HeadingLevel.HEADING_2 : undefined,
    alignment: align === 'end' ? 'right' : align === 'center' ? 'center' : 'left',
    children: [new TextRun(prefix), ...runs.flatMap<TextRun | ExternalHyperlink>(run => {
      const s = runStyle(run);
      const parts = run.text.split(/\r\n?|\n/).map((text, index) => new TextRun({
        text, break: index ? 1 : undefined, bold: !!heading || s.bold, italics: s.italic,
        underline: s.underline ? {} : undefined, strike: s.strike, superScript: s.sup, subScript: s.sub,
        color: s.color, shading: s.background ? { fill: s.background } : undefined,
        size: s.size === 1 ? undefined : Math.round(22 * s.size),
      }));
      return s.link ? [new ExternalHyperlink({ link: s.link, children: parts })] : parts;
    })],
  }));
  return Packer.toBlob(new Document({ title, sections: [{ children }] }));
}
