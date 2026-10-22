import { describe, expect, it } from 'vitest'
import {
  safeHttpsUrl,
  validateBlankBoard,
  validatePrebuiltBoard,
} from './groupQuizCanvasValidation'
import { GroupQuizError } from './groupQuizLogic'

describe('safeHttpsUrl in functions', () => {
  it('accepts valid https URLs and rejects dangerous/invalid ones', () => {
    expect(safeHttpsUrl('https://example.com')).toBe('https://example.com')
    expect(safeHttpsUrl('  https://example.com/path?foo=bar#hash  ')).toBe('https://example.com/path?foo=bar#hash')
    expect(safeHttpsUrl('http://example.com')).toBeNull()
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpsUrl('data:text/html,bad')).toBeNull()
    expect(safeHttpsUrl('https://user:pass@example.com')).toBeNull()
    expect(safeHttpsUrl('https://example.com with spaces')).toBeNull()
    expect(safeHttpsUrl('')).toBeNull()
    expect(safeHttpsUrl(123)).toBeNull()
  })
})

describe('validateBlankBoard', () => {
  const question = { maxCards: 20, maxConnections: 40, allowedCardTypes: ['note', 'paragraph', 'link'] }

  it('accepts valid blank board', () => {
    const board = {
      cards: [
        { id: 'c1', type: 'note', title: 'Note 1', content: 'Details', position: { x: 10, y: 20 } },
        { id: 'c2', type: 'link', title: 'Doc', url: 'https://peerly.app', position: { x: 50, y: 100 } },
      ],
      connections: ['c1->c2'],
    }
    const result = validateBlankBoard(board, question)
    expect(result.cards).toHaveLength(2)
    expect(result.connections).toEqual(['c1->c2'])
  })

  it('rejects board exceeding card limits', () => {
    const q = { maxCards: 2, maxConnections: 5 }
    const board = {
      cards: [
        { id: 'c1', type: 'note', title: '1' },
        { id: 'c2', type: 'note', title: '2' },
        { id: 'c3', type: 'note', title: '3' },
      ],
      connections: [],
    }
    expect(() => validateBlankBoard(board, q)).toThrow(/exceeds the limit of 2 cards/)
  })

  it('rejects disallowed card types', () => {
    const board = {
      cards: [{ id: 'c1', type: 'image', title: 'Image' }],
      connections: [],
    }
    expect(() => validateBlankBoard(board, question)).toThrow(/Card type image is not allowed/)
  })

  it('rejects invalid or unsafe link URL', () => {
    const board = {
      cards: [{ id: 'c1', type: 'link', title: 'Bad', url: 'http://insecure.com' }],
      connections: [],
    }
    expect(() => validateBlankBoard(board, question)).toThrow(/valid https:\/\/ URL/)
  })

  it('rejects duplicate card IDs', () => {
    const board = {
      cards: [
        { id: 'c1', type: 'note', title: '1' },
        { id: 'c1', type: 'note', title: 'Duplicate' },
      ],
      connections: [],
    }
    expect(() => validateBlankBoard(board, question)).toThrow(/Duplicate card ID c1/)
  })

  it('rejects self connections and connections to non-existent cards', () => {
    const boardSelf = {
      cards: [{ id: 'c1', type: 'note', title: '1' }],
      connections: ['c1->c1'],
    }
    expect(() => validateBlankBoard(boardSelf, question)).toThrow(/Self-connections are not allowed/)

    const boardMissing = {
      cards: [{ id: 'c1', type: 'note', title: '1' }],
      connections: ['c1->nonexistent'],
    }
    expect(() => validateBlankBoard(boardMissing, question)).toThrow(/non-existent card/)
  })
})

describe('validatePrebuiltBoard', () => {
  const question = { cards: [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }] }

  it('accepts valid prebuilt connections and filters duplicates / unknown cards', () => {
    const connections = ['k1->k2', 'k2->k3', 'k1->k2', 'k1->unknown', 'k1->k1']
    const result = validatePrebuiltBoard(connections, question)
    expect(result).toEqual(['k1->k2', 'k2->k3'])
  })

  it('rejects invalid syntax', () => {
    expect(() => validatePrebuiltBoard(['not_a_connection'], question)).toThrow(/Invalid connection syntax/)
  })

  it('rejects when exceeding max prebuilt connections limit', () => {
    const big = new Array(85).fill('k1->k2')
    expect(() => validatePrebuiltBoard(big, question)).toThrow(/exceeds the limit of 80 connections/)
  })
})
