export function Logo({ petit = false }: { petit?: boolean }) {
  return <img className={petit ? 'logo petit' : 'logo'} src="/logo-blanc.png" alt="ALL TOITURES" />
}
