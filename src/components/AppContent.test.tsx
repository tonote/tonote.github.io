import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AppContent } from './AppContent';

function Harness() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loaded, setLoaded] = useState(false);
  return <AppContent>
    <p>{location.pathname}{location.search}</p>
    <button onClick={() => navigate('/note/one')}>Open</button>
    <button onClick={() => navigate('/search?q=one')}>Close</button>
    <button onClick={() => navigate('/search?q=one')}>Save</button>
    <button onClick={() => navigate('/search?q=two')}>Other list</button>
    <button onClick={() => setLoaded(true)}>Load</button>
    {loaded && <div>Loaded cards</div>}
  </AppContent>;
}
let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;
beforeEach(() => {
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => vi.unstubAllGlobals());
function flushFrames() {
  act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); });
}
function setup() {
  render(<MemoryRouter initialEntries={['/search?q=one']}><Harness /></MemoryRouter>);
  const root = screen.getByRole('main');
  let height = 2400;
  let top = 0;
  Object.defineProperties(root, {
    clientHeight: { configurable: true, get: () => 400 },
    scrollHeight: { configurable: true, get: () => height },
    scrollTop: { configurable: true, get: () => top, set: (value: number) => { top = Math.max(0, Math.min(value, height - 400)); } },
  });
  flushFrames();
  const scroll = (offset: number) => { root.scrollTop = offset; fireEvent.scroll(root); };
  return { root, scroll, setHeight: (value: number) => { height = value; } };
}

it.each(['Close', 'Save'])('restores the saved list position after %s, waiting for cards to load', async button => {
  const { root, scroll, setHeight } = setup();
  scroll(900);
  fireEvent.click(screen.getByText('Open'));
  flushFrames();
  expect(root.scrollTop).toBe(0);
  setHeight(400);
  fireEvent.click(screen.getByText(button));
  flushFrames();
  expect(root.scrollTop).toBe(0);
  setHeight(2400);
  fireEvent.click(screen.getByText('Load'));
  await act(async () => {}); // deliver MutationObserver notification
  flushFrames();
  expect(root.scrollTop).toBe(900);
});

it('keeps offsets independent for different search queries', () => {
  const { root, scroll } = setup();
  scroll(900);
  fireEvent.click(screen.getByText('Other list'));
  flushFrames();
  expect(root.scrollTop).toBe(0);
  scroll(300);
  fireEvent.click(screen.getByText('Close'));
  flushFrames();
  expect(root.scrollTop).toBe(900);
  fireEvent.click(screen.getByText('Other list'));
  flushFrames();
  expect(root.scrollTop).toBe(300);
});

it('does not jump after the user scrolls while the list is still loading', async () => {
  const { root, scroll, setHeight } = setup();
  scroll(900);
  fireEvent.click(screen.getByText('Open'));
  flushFrames();
  setHeight(400);
  fireEvent.click(screen.getByText('Close'));
  flushFrames();
  fireEvent.wheel(root);
  setHeight(2400);
  fireEvent.click(screen.getByText('Load'));
  await act(async () => {});
  flushFrames();
  expect(root.scrollTop).toBe(0);
});
