export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-symbol">
        <svg width="33" height="26" viewBox="0 0 62 41" fill="none" aria-hidden="true">
          <path
            d="M2.5 16.2 11.5 2.5h39l9 13.7z"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 26.4h55M4.2 37h53.3"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="brand-wordmark">
        <span>TAVO</span>
        <small>Gestão inteligente</small>
      </span>
    </span>
  );
}
