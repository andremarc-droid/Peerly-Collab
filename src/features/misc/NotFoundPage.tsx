import { ArrowLeft, Compass } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Logo } from '../../shared/ui/Logo'

export function NotFoundPage() {
  return (
    <main className="not-found" id="main-content">
      <header className="not-found__header"><Logo /></header>
      <section className="not-found__content">
        <span className="not-found__icon"><Compass size={28} aria-hidden="true" /></span>
        <p className="eyebrow">404 · PAGE NOT FOUND</p>
        <h1>This isn’t the<br />right question.</h1>
        <p>That page seems to have wandered off. Let’s get you back to the good stuff.</p>
        <Button to="/"><ArrowLeft size={17} aria-hidden="true" /> Back to Peerly Collab</Button>
      </section>
    </main>
  )
}
