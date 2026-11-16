import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { ChecklistBody } from './ChecklistBody';

describe('ChecklistBody', () => {
  it('renders checklist items', () => {
    const onChange = vi.fn();
    render(
      React.createElement(ChecklistBody, {
        content: 'Item 1\nItem 2\nItem 3',
        checkings: '101',
        onChange,
      }),
    );

    expect(screen.getByDisplayValue('Item 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Item 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Item 3')).toBeInTheDocument();

    // Item 2 should have checked state 0 (unchecked)
    // Item 1 and 3 should have checked state 1 (checked)
  });

  it('toggles a checkbox and calls onChange', () => {
    const onChange = vi.fn();
    render(
      React.createElement(ChecklistBody, {
        content: 'Task A\nTask B',
        checkings: '00',
        onChange,
      }),
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const [newContent, newCheckings] = onChange.mock.calls[0];
    expect(newContent).toBe('Task A\nTask B');
    expect(newCheckings).toBe('10');
  });

  it('adds a new item', () => {
    const onChange = vi.fn();
    render(
      React.createElement(ChecklistBody, {
        content: 'Existing',
        checkings: '0',
        onChange,
      }),
    );

    const input = screen.getByPlaceholderText('editor.add_item');
    fireEvent.change(input, { target: { value: 'New item' } });
    fireEvent.click(screen.getByRole('button', { name: 'editor.add_item' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [newContent, newCheckings] = onChange.mock.calls[0];
    expect(newContent).toBe('Existing\nNew item');
    expect(newCheckings).toBe('00');
  });
});

it('keeps text-only items without checkboxes and preserves their state while editing', () => {
  const onChange = vi.fn();
  render(<ChecklistBody content={'Heading\nTask'} checkings="20" onChange={onChange} />);
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  fireEvent.change(screen.getByDisplayValue('Heading'), { target: { value: 'Updated heading' } });
  expect(onChange).toHaveBeenLastCalledWith('Updated heading\nTask', '20');
  fireEvent.click(screen.getByRole('button', { name: 'editor.make_checkable' }));
  expect(onChange).toHaveBeenLastCalledWith('Heading\nTask', '00');
});

it('can create text-only items and convert checked tasks to text', () => {
  const onChange = vi.fn();
  render(<ChecklistBody content="Task" checkings="1" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'editor.make_text' }));
  expect(onChange).toHaveBeenLastCalledWith('Task', '2');
  fireEvent.click(screen.getByRole('button', { name: 'editor.new_checkable_item' }));
  fireEvent.change(screen.getByPlaceholderText('editor.add_item'), { target: { value: 'Heading' } });
  fireEvent.click(screen.getByRole('button', { name: 'editor.add_item' }));
  expect(onChange).toHaveBeenLastCalledWith('Task\nHeading', '12');
});
