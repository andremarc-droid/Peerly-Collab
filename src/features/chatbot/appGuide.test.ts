import { describe, expect, it } from 'vitest'
import { APP_GUIDE, isAppHelpQuestion, wantsAppGuide } from './appGuide'
import { buildSystemPrompt } from './systemPrompt'
import { estimateTokens } from './tokenEstimate'

describe('isAppHelpQuestion', () => {
  it.each([
    'How do I use this app?',
    'how do i share a canvas with a classmate',
    'Where can I import a PDF for flashcards?',
    'How do I make the graph view full screen?',
    'What is the Graph view for?',
    'Walk me through the learning page',
    'how to use peerly',
  ])('recognises "%s"', (text) => {
    expect(isAppHelpQuestion(text)).toBe(true)
  })

  it.each([
    '',
    '   ',
    'Explain how photosynthesis works',
    'What is the derivative of x squared?',
    'Quiz me on the French Revolution',
  ])('ignores study questions like "%s"', (text) => {
    expect(isAppHelpQuestion(text)).toBe(false)
  })
})

describe('wantsAppGuide', () => {
  it('keeps the guide for a short follow-up', () => {
    expect(wantsAppGuide(['How do I use the graph view?', 'and how do I share it?'])).toBe(true)
  })

  it('drops the guide once the conversation moves on to studying', () => {
    expect(
      wantsAppGuide(['How do I use the graph view?', 'Thanks', 'Explain recursion step by step', 'Give me an example']),
    ).toBe(false)
  })
})

describe('buildSystemPrompt app guide', () => {
  it('adds the guide only when asked to', () => {
    expect(buildSystemPrompt({})).not.toContain('APP GUIDE')
    expect(buildSystemPrompt({ includeAppGuide: true })).toContain(APP_GUIDE)
  })

  it('stays small enough for the token budget', () => {
    // It is only added for app questions, but it still has to leave room under MAX_INPUT_TOKENS (5800).
    expect(estimateTokens(APP_GUIDE)).toBeLessThan(1100)
  })
})
