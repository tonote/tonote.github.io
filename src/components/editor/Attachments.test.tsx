import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Attachments } from './Attachments';
import { loadAttachment } from '../../attachments/loadAttachment';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../attachments/loadAttachment', () => ({ loadAttachment: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); });
it('previews an existing image, provides a download, and releases its object URL', async () => {
  vi.mocked(loadAttachment).mockResolvedValue(new Blob(['image']));
  render(<Attachments attachments={[{ id: 'a', name: 'photo.jpg', type: 0 }]} files={new Map()} onAdd={vi.fn()} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'photo.jpg' }));
  const image = await screen.findByRole('img');
  expect(image).toHaveAttribute('src', 'blob:preview');
  expect(screen.getByRole('link', { name: 'attachments.download' })).toHaveAttribute('download', 'photo.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
it('shows a retry after download failure and can recover', async () => {
  vi.mocked(loadAttachment).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Blob(['data']));
  render(<Attachments attachments={[{ id: 'a', name: 'file.txt', type: 1 }]} files={new Map()} onAdd={vi.fn()} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'file.txt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('attachments.load_failed');
  fireEvent.click(screen.getByRole('button', { name: 'attachments.retry' }));
  await waitFor(() => expect(screen.getByRole('link', { name: 'attachments.download' })).toBeInTheDocument());
});
