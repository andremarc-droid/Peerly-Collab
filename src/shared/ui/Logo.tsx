import { Link } from 'react-router-dom'

interface LogoProps {
  light?: boolean
}

export function Logo({ light = true }: LogoProps) {
  return (
    <Link className={`logo${light ? ' logo--light' : ''}`} to="/" aria-label="Peerly Collab home">
      <span className="logo__mark" aria-hidden="true"><span /><span /><span /></span>
      <span>peerly-collab</span>
    </Link>
  )
}
