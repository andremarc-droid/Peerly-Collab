import { Link } from 'react-router-dom'
import logoUrl from '../../assets/peerly-collab-official-logo.webp'

interface LogoProps {
  light?: boolean
}

export function Logo({ light = true }: LogoProps) {
  return (
    <Link className={`logo${light ? ' logo--light' : ''}`} to="/" aria-label="Peerly Collab home">
      <span className="logo__mark" aria-hidden="true"><img src={logoUrl} alt="" width={28} height={28} draggable={false} /></span>
      <span>peerly-collab</span>
    </Link>
  )
}
