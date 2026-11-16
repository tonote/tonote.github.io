export type Align = 'normal' | 'start' | 'center' | 'end';

export interface InlineMark {
  type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'subscript' | 'superscript'
      | 'fontSize' | 'textColor' | 'highlight' | 'link';
  value?: number | string;  // fontSize: number(em); textColor/highlight: number(ARGB int); link: string(href)
}

export interface InlineRun {
  text: string;
  marks: InlineMark[];
}

export interface Block {
  type: 'paragraph' | 'bulletList' | 'quote';
  align: Align;
  children?: Block[];        // for lists (list items) and nested quotes
  items?: InlineRun[][];     // for bulletList: array of items, each an array of runs
  runs?: InlineRun[];        // for paragraph/quote
}

export interface KnifeDoc {
  blocks: Block[];
}
