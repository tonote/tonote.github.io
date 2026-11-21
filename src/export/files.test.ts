import { describe, expect, it } from 'vitest';
import { createNoteDraft } from '../domain/noteDraft';
import { createInstance } from 'i18next';
import ru from '../i18n/ru.json';
import { exportFile } from './files';

const i18n = createInstance();
await i18n.init({ lng: 'ru', resources: { ru: { translation: ru } } });

const note = { ...createNoteDraft('rich'), title: 'План <1>', content: '<p><b>Один</b><br>Два</p><ol><li>Три</li><li>Четыре</li></ol>' };
const create = (format: Parameters<typeof exportFile>[1], draft = note) => exportFile(draft, format, i18n.getFixedT('ru'), 'ru');

describe('note export', () => {
  it('keeps Russian text, line breaks and list order', async () => {
    expect(await (await create('txt')).text()).toBe('План <1>\n\nОдин\nДва\n1. Три\n2. Четыре');
    const md = await (await create('md')).text();
    expect(md).toContain('**Один**  \nДва');
    expect(md).toContain('1. Три\n2. Четыре');
  });

  it('preserves checked, unchecked and text-only checklist items', async () => {
    const draft = { ...note, title: '', checkings: '210', content: 'Покупки\nВода\nХлеб' };
    expect(await (await create('md', draft)).text()).toBe('Покупки\n\n[x] Вода  \n[ ] Хлеб');
    expect(await (await create('txt', draft)).text()).toBe('Покупки\n[x] Вода\n[ ] Хлеб');
  });

  it('keeps literal plain text and sanitizes rich HTML before download', async () => {
    const content = '<b>Пример</b>';
    const plain = await (await create('html', { ...note, content, checkings: '' })).text();
    expect(plain).toContain('&lt;b&gt;Пример&lt;/b&gt;');
    const rich = await (await create('html', { ...note, content: '<p style="background:url(example.png)">Пример</p><script>test()</script>' })).text();
    expect(rich).toContain('<h1>План &lt;1&gt;</h1>');
    expect(rich).not.toMatch(/script|example.png/);
  });

  it('creates binary PDF and Office Open XML files', async () => {
    const pdf = await create('pdf');
    expect(pdf.type).toBe('application/pdf');
    expect(await pdf.slice(0, 5).text()).toBe('%PDF-');
    const docx = await create('docx');
    const bytes = new Uint8Array(await docx.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([80, 75, 3, 4]);
    expect(new TextDecoder().decode(bytes)).toContain('word/document.xml');
  });
});
