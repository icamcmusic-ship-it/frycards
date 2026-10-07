/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { askConfirm, ConfirmHost } from './confirm';

afterEach(cleanup);

test('confirm resolves true, cancel and Escape resolve false', async () => {
  render(<ConfirmHost />);
  let p!: Promise<boolean>;
  act(() => {
    p = askConfirm('Sell it?');
  });
  expect(screen.getByText('Sell it?')).toBeTruthy();
  fireEvent.click(screen.getByText('CONFIRM'));
  await expect(p).resolves.toBe(true);

  act(() => {
    p = askConfirm('Again?');
  });
  fireEvent.click(screen.getByText('CANCEL'));
  await expect(p).resolves.toBe(false);

  act(() => {
    p = askConfirm('Escape?');
  });
  fireEvent.keyDown(document, { key: 'Escape' });
  await expect(p).resolves.toBe(false);
  expect(screen.queryByText('Escape?')).toBeNull();
});

test('a second question declines the first', async () => {
  render(<ConfirmHost />);
  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  act(() => {
    first = askConfirm('One?');
  });
  act(() => {
    second = askConfirm('Two?');
  });
  await expect(first).resolves.toBe(false);
  fireEvent.click(screen.getByText('CONFIRM'));
  await expect(second).resolves.toBe(true);
});
