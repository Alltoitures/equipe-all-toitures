export function Logo({ petit = false }: { petit?: boolean }) {
  return (
    <span className={petit ? 'logo petit' : 'logo'}>
      <svg viewBox="0 0 64 40" aria-hidden="true">
        <path d="M4 22 32 4l28 18" fill="none" stroke="#01A9E1" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 20v16h36V20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <span className="logo-txt">ALL TOITURES</span>
    </span>
  )
}
