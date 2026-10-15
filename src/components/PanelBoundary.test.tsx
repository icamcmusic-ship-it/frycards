/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PanelBoundary } from './PanelBoundary';

function Boom(): React.ReactElement {
  throw new Error('kaboom');
}

afterEach(cleanup);

describe('PanelBoundary: a crash in one part of the table is contained', () => {
  test('an overlay crash shows a dismissable notice; the rest keeps rendering', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    render(
      <div>
        <span>the felt</span>
        <PanelBoundary name="card sheet" onClose={onClose}>
          <Boom />
        </PanelBoundary>
      </div>,
    );
    expect(screen.getByText('the felt')).toBeTruthy();
    expect(document.querySelector('[data-error-boundary="card sheet"]')).toBeTruthy();
    // Never silent: the error is still reported.
    expect(err).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'CLOSE' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  test('an inline crash renders nothing but the marker', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <span>the felt</span>
        <PanelBoundary name="coach">
          <Boom />
        </PanelBoundary>
      </div>,
    );
    expect(screen.getByText('the felt')).toBeTruthy();
    expect(document.querySelector('[data-error-boundary="coach"]')).toBeTruthy();
    err.mockRestore();
  });
});
