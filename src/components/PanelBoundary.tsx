/**
 * A crash fence for one part of the poker table.
 *
 * The only error boundary used to be the app's: a render error in a sheet,
 * the log, a seat plate or the coach replaced the WHOLE app with "Something
 * broke" — the match, its chips and its clock gone with a menu button. The
 * table wraps its optional parts in this instead, so a crash there costs that
 * part only: an overlay shows a small notice with a CLOSE that dismisses it,
 * an inline part simply disappears, and the match keeps running.
 *
 * It never hides the error: React still reports it (console.error), the
 * fallback carries `data-error-boundary` for the button fuzzer, and the
 * error is logged with the part's name.
 */
import React from 'react';

interface Props {
  /** Which part of the table, for the log line and the notice. */
  name: string;
  /** Overlays (sheets, modals) get a dismissable notice; inline parts vanish. */
  onClose?: () => void;
  children: React.ReactNode;
}

// Typed like App.tsx's boundary: this project's React types expose no
// generic Component props, so they are declared.
export class PanelBoundary extends React.Component {
  declare props: Props;
  declare setState: (s: { error: Error | null }) => void;
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[table] ${this.props.name} crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { onClose, name } = this.props;
    if (!onClose) return <span hidden data-error-boundary={name} />;
    return (
      <div
        className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
        data-error-boundary={name}
      >
        <div
          role="alertdialog"
          aria-label={`${name} failed`}
          className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-4 max-w-sm flex flex-col gap-3"
        >
          <p className="font-bold text-sm">
            The {name} hit a snag and closed. The match is still running.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              onClose();
            }}
            className="btn-pop heading-font text-sm px-4 py-2 min-h-[44px] bg-[var(--c-yellow)] ink-border-sm"
          >
            CLOSE
          </button>
        </div>
      </div>
    );
  }
}
