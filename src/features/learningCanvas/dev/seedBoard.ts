import type {
  LearningCanvasContent,
  LearningCanvasNode,
  LearningCanvasEdge,
  LearningCanvasColor,
  LearningCanvasArrow,
} from '../types'

export type SeedBoardSize = 50 | 150 | 400

const COLORS: LearningCanvasColor[] = ['none', 'tint', 'navy', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']

const MARKDOWN_SNIPPETS = [
  '# Cell Biology\n\n- Nucleus: contains genetic material\n- Mitochondria: energy powerhouse\n- Ribosomes: synthesize proteins',
  '## Key Principles\n\n> "Retrieval before reveal"\n\nActive recall strengthens neural pathways more than passive rereading.',
  '### Photosynthesis\n\nEquation:\n`6CO2 + 6H2O -> C6H12O6 + 6O2`\n\nOccurs inside **chloroplasts** using sunlight.',
  '**Mitosis Stages**\n\n1. Prophase\n2. Metaphase\n3. Anaphase\n4. Telophase\n\nCheck [Reference](https://example.com/mitosis) for details.',
  '## Newton’s Laws\n\n1. *Inertia*: velocity remains constant unless acted upon.\n2. *F = ma*: force equals mass times acceleration.\n3. *Action & Reaction*: equal and opposite.',
  '### Study Check\n\nWhat is the difference between *osmosis* and *diffusion*?\n\n- Osmosis: water across semi-permeable membrane\n- Diffusion: general solute movement down gradient',
  '## Organic Chemistry\n\nFunctional groups:\n- **Hydroxyl**: -OH (alcohols)\n- **Carbonyl**: C=O (ketones/aldehydes)\n- **Carboxyl**: -COOH (acids)',
  '# Quick Reminder\n\nReview flashcards before taking the practice quiz to maximize long-term retention.',
]

const SAMPLE_IMAGE_DATA_URL =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%230f2042"/><rect x="10" y="10" width="280" height="180" fill="%231e3a8a" rx="8"/><circle cx="150" cy="85" r="40" fill="%2338bdf8"/><path d="M70 170 L130 110 L170 150 L200 120 L240 170 Z" fill="%2360a5fa"/><text x="150" y="185" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-size="12" font-weight="bold">DIAGRAM SPECIMEN</text></svg>'

/**
 * Generates a synthetic, deterministic seeded learning canvas board for performance testing.
 *
 * @param cardCount 50, 150, or 400 cards
 * @returns In-memory LearningCanvasContent with nodes, ~1.5x edges, and image cards.
 */
export function generateSeededBoard(cardCount: SeedBoardSize): LearningCanvasContent {
  const nodes: LearningCanvasNode[] = []
  const edges: LearningCanvasEdge[] = []

  const imageCardCount = cardCount === 50 ? 5 : cardCount === 150 ? 8 : 10
  const cols = cardCount <= 50 ? 8 : cardCount <= 150 ? 12 : 16
  const colWidth = 280
  const rowHeight = 220

  const imageCardIndices = new Set<number>()
  const step = Math.floor(cardCount / (imageCardCount + 1))
  for (let i = 1; i <= imageCardCount; i++) {
    imageCardIndices.add(Math.min(cardCount - 1, i * step))
  }

  for (let i = 0; i < cardCount; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * colWidth + 50
    const y = row * rowHeight + 50
    const color = COLORS[i % COLORS.length] ?? 'none'
    const id = `seed-node-${i + 1}`

    if (imageCardIndices.has(i)) {
      nodes.push({
        id,
        type: 'image',
        x,
        y,
        width: 260,
        height: 200,
        color,
        image: {
          dataUrl: SAMPLE_IMAGE_DATA_URL,
          alt: `Specimen ${i + 1}`,
          caption: `Microscopy figure illustrating cellular structure ${i + 1}.`,
        },
      })
    } else {
      const snippet = MARKDOWN_SNIPPETS[i % MARKDOWN_SNIPPETS.length]!
      nodes.push({
        id,
        type: 'text',
        x,
        y,
        width: 260,
        height: 180,
        color,
        text: `### Card #${i + 1}\n\n${snippet}`,
      })
    }
  }

  // Generate ~1.5x edges connecting adjacent or nearby cards
  const targetEdgeCount = Math.round(cardCount * 1.5)
  let edgeIdSeq = 1

  // Connect row neighbors
  for (let i = 0; i < cardCount - 1 && edges.length < targetEdgeCount; i++) {
    if ((i + 1) % cols !== 0) {
      const arrow: LearningCanvasArrow = i % 3 === 0 ? 'both' : i % 3 === 1 ? 'to' : 'none'
      edges.push({
        id: `seed-edge-${edgeIdSeq++}`,
        from: nodes[i]!.id,
        to: nodes[i + 1]!.id,
        arrow,
        label: i % 4 === 0 ? `relates to #${i + 2}` : undefined,
      })
    }
  }

  // Connect column neighbors
  for (let i = 0; i < cardCount - cols && edges.length < targetEdgeCount; i++) {
    const arrow: LearningCanvasArrow = i % 2 === 0 ? 'to' : 'none'
    edges.push({
      id: `seed-edge-${edgeIdSeq++}`,
      from: nodes[i]!.id,
      to: nodes[i + cols]!.id,
      arrow,
      label: i % 5 === 0 ? `derives from` : undefined,
    })
  }

  // Fill remaining edges with forward diagonal connections
  for (let i = 0; i < cardCount - cols - 1 && edges.length < targetEdgeCount; i++) {
    if ((i + 1) % cols !== 0) {
      edges.push({
        id: `seed-edge-${edgeIdSeq++}`,
        from: nodes[i]!.id,
        to: nodes[i + cols + 1]!.id,
        arrow: 'to',
      })
    }
  }

  return {
    version: 1,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.8 },
  }
}
