import { Plus } from 'lucide-react';
import { useRouter } from './useHashRouter';

/** The "+" beside the wallet: jumps to the Store to get more credits. Hidden on
 * the Store itself and wherever there is no router (tests, the preview harness). */
export function StorePlus() {
  const router = useRouter();
  if (!router || router.route.screen === 'store') return null;
  return (
    <button
      type="button"
      onClick={() => router.navigate('store')}
      aria-label="Get more credits — open the Store"
      title="Get more credits"
      className="btn-pop shrink-0 w-7 h-7 flex items-center justify-center bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
    >
      <Plus className="w-4 h-4" strokeWidth={3} aria-hidden />
    </button>
  );
}
