/** Decorative 16×16 player icons; buttons carry the accessible names. */
export type PlayerIconName = 'first' | 'prev' | 'play' | 'pause' | 'next' | 'last';

const PATHS: Readonly<Record<PlayerIconName, string>> = {
  first: 'M3 3h2v10H3zM13 3v10L6 8z',
  prev: 'M12 3v10L5 8z',
  play: 'M4 3v10l9-5z',
  pause: 'M4 3h3v10H4zM9 3h3v10H9z',
  next: 'M4 3v10l7-5z',
  last: 'M3 3v10l7-5zM11 3h2v10h-2z',
};

export function PlayerIcon({ name }: { name: PlayerIconName }) {
  return (
    <svg className="cv-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}
