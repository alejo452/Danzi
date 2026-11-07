/** Moneda antigua china (铜钱): redonda, con un hueco cuadrado en el centro. Decorativa. */
export function Coin({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={`coin-svg${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path className="coin-body" fillRule="evenodd" d="M12 1a11 11 0 1 1 0 22a11 11 0 1 1 0-22ZM9.4 9.4v5.2h5.2V9.4Z" />
      <circle className="coin-line" cx="12" cy="12" r="8.2" />
      <rect className="coin-line" x="9.4" y="9.4" width="5.2" height="5.2" />
    </svg>
  );
}
