import { describe, expect, it } from 'vitest'
import { parseAnkiText, parseQuizletText, splitCardsIntoDecks } from './importParsers'

describe('parseQuizletText', () => {
  it('parses newline and tab-separated terms', () => {
    const result = parseQuizletText('Front\tBack\nSecond\tAnswer', { termSeparator: 'tab', rowSeparator: 'newline' })
    expect(result.cards.map(card => [card.front, card.back])).toEqual([['Front', 'Back'], ['Second', 'Answer']])
    expect(result.skipped).toBe(0)
  })

  it('supports quoted custom separators and semicolon rows', () => {
    const result = parseQuizletText('"Term; one",Definition;Other,Second', { termSeparator: 'comma', rowSeparator: 'semicolon' })
    expect(result.cards.map(card => [card.front, card.back])).toEqual([['Term; one', 'Definition'], ['Other', 'Second']])
  })

  it('counts skipped and truncated rows while enforcing card length bounds', () => {
    const result = parseQuizletText(`good\tanswer\nmissing\n${'F'.repeat(301)}\t${'B'.repeat(601)}`, { termSeparator: 'tab', rowSeparator: 'newline' })
    expect(result.cards).toHaveLength(2)
    expect(result.skipped).toBe(1)
    expect(result.truncated).toBe(1)
    expect(result.cards[1]?.front).toHaveLength(300)
    expect(result.cards[1]?.back).toHaveLength(600)
  })

  it('rejects an empty custom separator', () => {
    expect(parseQuizletText('a,b', { termSeparator: 'custom', customTermSeparator: '', rowSeparator: 'newline' }).warnings).toHaveLength(1)
  })
})

describe('parseAnkiText', () => {
  it('honours separator and columns headers, removes HTML and sound markers', () => {
    const result = parseAnkiText('#separator:Comma\n#html:true\n#columns:Front,Back,Tags\nQuestion,Hello <b>world</b> [sound:voice.mp3],tag')
    expect(result.columns).toEqual(['Front', 'Back', 'Tags'])
    expect(result.cards[0]).toMatchObject({ front: 'Question', back: 'Hello world' })
  })

  it('uses the selected columns and warns when image media is dropped', () => {
    const result = parseAnkiText('#separator:Tab\n#columns:Tags,Prompt,Answer\nbiology\t<img src="picture.jpg">\t42', { frontColumn: 1, backColumn: 2 })
    expect(result.cards).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.warnings[0]).toMatch(/Image media was omitted/)
  })

  it('counts missing rows and field truncation', () => {
    const result = parseAnkiText(`#separator:Tab\n#columns:Front\tBack\n${'x'.repeat(301)}\t${'y'.repeat(601)}\nonly front`)
    expect(result.truncated).toBe(1)
    expect(result.skipped).toBe(1)
  })
})

describe('splitCardsIntoDecks', () => {
  it('splits imports into chunks no larger than 100', () => {
    const cards = Array.from({ length: 205 }, (_, index) => ({ id: `${index}`, front: 'Q', back: 'A' }))
    expect(splitCardsIntoDecks(cards).map(deck => deck.length)).toEqual([100, 100, 5])
  })
})
