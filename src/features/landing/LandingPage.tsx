import { ArrowDown, ArrowRight, ArrowUpRight, BookOpenCheck, Brain, Check, Clock3, Layers3, Lightbulb, Menu, Sparkles, UsersRound, X } from 'lucide-react'
import { useState } from 'react'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { useUserProfile } from '../profile/useUserProfile'
import { dashboardPath } from '../../app/returnTo'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Container } from '../../shared/ui/Container'
import { Logo } from '../../shared/ui/Logo'
import { Reveal } from '../../shared/ui/Reveal'
import { Section } from '../../shared/ui/Section'
import { StripeBackground } from '../../shared/ui/StripeBackground'

const modes = ['Multiple choice', 'Fill in the blank', 'Identification', 'Flashcards', 'Timed', 'Solo or group', 'Wait for everyone']

const features = [
  { icon: Brain, title: 'Practice that sticks', text: 'Strengthen recall by reaching for the answer before it appears.' },
  { icon: Lightbulb, title: 'Feedback that teaches', text: 'Understand why an answer works, right when it matters.' },
  { icon: UsersRound, title: 'Learn together', text: 'Think out loud, compare ideas, and solve questions as a team.' },
  { icon: Clock3, title: 'Your pace, your way', text: 'Move freely, set a timer, or wait until everyone is ready.' },
]

const instructorSteps = [
  ['Create', 'Build a quiz around what your learners need to know.'],
  ['Configure', 'Choose question types, pacing, and solo or group practice.'],
  ['Share & review', 'Invite your class, then see where understanding grows.'],
]

const studentSteps = [
  ['Join', 'Open your class quiz and bring your curiosity.'],
  ['Answer', 'Recall what you know alone or work through it together.'],
  ['Learn', 'Get useful explanations and another chance at what you missed.'],
]
const copyrightYear = new Date().getFullYear()

function ProductPreview() {
  return (
    <div className="preview-wrap" aria-label="Preview of a Peerly Collab quiz question">
      <div className="preview-orbit preview-orbit--one" aria-hidden="true" />
      <div className="preview-orbit preview-orbit--two" aria-hidden="true" />
      <Card className="quiz-preview" elevated>
        <div className="quiz-preview__top"><span className="quiz-preview__course">COMPUTER SCIENCE · ALGORITHMS</span><span className="quiz-preview__counter">04 <span>/ 12</span></span></div>
        <div className="quiz-progress" aria-label="4 of 12 questions"><span /></div>
        <p className="quiz-preview__eyebrow">MULTIPLE CHOICE</p>
        <h2>What is the worst-case time complexity of binary search?</h2>
        <ul className="answer-list" aria-label="Answer choices">
          <li><span className="answer-key">A</span><span>O(1) — Constant time</span></li>
          <li className="answer-option--correct"><span className="answer-key">B</span><span>O(log n) — Logarithmic time</span><Check size={17} aria-label="Correct answer" /></li>
          <li><span className="answer-key">C</span><span>O(n) — Linear time</span></li>
          <li><span className="answer-key">D</span><span>O(n log n) — Linearithmic time</span></li>
        </ul>
        <div className="preview-feedback"><span className="feedback-icon"><Check size={15} /></span><div><strong>Exactly right</strong><span>Binary search cuts the search space in half with every step, running in O(log n) time.</span></div></div>
      </Card>
      <div className="group-chip"><span className="group-chip__avatars" aria-hidden="true"><i>A</i><i>M</i><i>J</i></span><span><strong>Group of 3</strong><small>answering together</small></span><span className="group-chip__live" aria-label="Live" /></div>
      <div className="preview-note"><Sparkles size={16} aria-hidden="true" /><span>Practice that builds mastery</span></div>
    </div>
  )
}

function BrandHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { status } = useAuth()
  const { profile, loading } = useUserProfile()
  const waitingForProfile = status === 'loading' || (status === 'signedIn' && loading)
  return (
    <header className="site-header">
      <Container className="site-header__inner">
        <Logo />
        <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav id="primary-navigation" className={`site-nav${menuOpen ? ' site-nav--open' : ''}`} aria-label="Main navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          {waitingForProfile ? <Skeleton className="site-nav__account-skeleton" label="Loading account" /> : status === 'signedIn' ? <Button to={profile?.role ? dashboardPath(profile.role) : '/role?mode=continue'} className="site-nav__start">Open dashboard <ArrowUpRight size={16} aria-hidden="true" /></Button> : <><Button to="/role?mode=signin" variant="ghost" className="site-nav__signin">Sign in</Button><Button to="/role?mode=signup" className="site-nav__start">Get started <ArrowUpRight size={16} aria-hidden="true" /></Button></>}
        </nav>
      </Container>
    </header>
  )
}

function StepsTrack({ title, steps }: { title: string; steps: string[][] }) {
  return (
    <div className="steps-track">
      <h3>{title}</h3>
      <ol>{steps.map(([step, text], index) => <li key={step}><span className="step-number">0{index + 1}</span><div><strong>{step}</strong><p>{text}</p></div></li>)}</ol>
    </div>
  )
}

export function LandingPage() {
  return (
    <>
      <BrandHeader />
      <main id="main-content">
        <section className="hero-section">
          <StripeBackground variant="fade" />
          <Container className="hero-grid">
            <div className="hero-copy">
              <Badge className="hero-badge"><span className="badge-dot" /> LEARN IT. OWN IT. TOGETHER.</Badge>
              <h1>Good learning<br />happens <em>together.</em></h1>
              <p>Quizzes that turn practice into progress—for classrooms, study groups, and curious minds everywhere.</p>
              <div className="hero-actions"><Button to="/role?mode=signup">Get started <ArrowRight size={18} aria-hidden="true" /></Button><Button to="/role?mode=signin" variant="secondary">Sign in</Button></div>
              <div className="hero-proof"><span className="proof-mark"><Check size={15} aria-hidden="true" /></span><span>Built for classrooms, study groups and self-paced learners</span></div>
              <a className="hero-scroll" href="#modes"><span>See what you can do</span><ArrowDown size={15} aria-hidden="true" /></a>
            </div>
            <ProductPreview />
          </Container>
          <span className="hero-stripe-band" aria-hidden="true" />
        </section>

        <section className="mode-strip" id="modes" aria-label="Quiz modes">
          <Container className="mode-strip__inner"><span className="mode-strip__label">MAKE IT YOURS</span><div className="mode-list">{modes.map((mode) => <span className="mode-chip" key={mode}>{mode}</span>)}</div></Container>
        </section>

        <Section id="features" className="features-section">
          <div className="section-heading"><Badge>WHY PEERLY COLLAB</Badge><h2>Practice with a purpose.</h2><p>Every part of the experience is designed to make learning last longer than the lesson.</p></div>
          <div className="feature-grid">{features.map(({ icon: Icon, title, text }, index) => <Reveal key={title} delay={index % 2 ? 'short' : 'none'}><Card className="feature-card"><span className="feature-icon"><Icon size={22} aria-hidden="true" /></span><span className="feature-index">0{index + 1}</span><h3>{title}</h3><p>{text}</p><span className="feature-arrow" aria-hidden="true"><ArrowRight size={18} /></span></Card></Reveal>)}</div>
          <div className="feature-footnote"><BookOpenCheck size={18} aria-hidden="true" /><span>Missed a question? It comes back when you’re ready.</span></div>
        </Section>

        <Section id="how-it-works" tone="navy" className="how-section">
          <StripeBackground variant="pinstripe" />
          <div className="how-heading"><Badge>ONE PLATFORM, TWO PERSPECTIVES</Badge><h2>Learning works<br /><em>both ways.</em></h2><p>Thoughtful tools for the people teaching—and the people learning.</p></div>
          <div className="tracks-grid"><StepsTrack title="For instructors" steps={instructorSteps} /><StepsTrack title="For students" steps={studentSteps} /></div>
          <div className="how-note"><Layers3 size={18} aria-hidden="true" /><span>Made for a class of many or a study group of two.</span></div>
        </Section>

        <section className="closing-section">
          <StripeBackground variant="band" />
          <Container className="closing-inner"><div><Badge>READY WHEN YOU ARE</Badge><h2>Make your next<br />practice count.</h2><p>Start a quiz, join your group, and see what you can learn.</p></div><div className="closing-actions"><Button to="/role?mode=signup">Get started <ArrowRight size={18} aria-hidden="true" /></Button><Button to="/role?mode=signin" variant="secondary">Sign in</Button></div><span className="closing-spark" aria-hidden="true"><Sparkles size={25} /></span></Container>
        </section>
      </main>
      <footer className="site-footer"><Container className="site-footer__inner"><Logo /><span className="footer-copy">© {copyrightYear} Peerly Collab. Learn boldly.</span><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="mailto:hello@peerly-collab.example">Contact</a></nav></Container></footer>
    </>
  )
}
