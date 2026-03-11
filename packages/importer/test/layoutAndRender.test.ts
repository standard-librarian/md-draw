import { describe, expect, it } from 'vitest'
import { importStructuredContent, parseStructuredImport } from '../src'
import { layoutDiagram } from '../src/layout/layoutDiagram'

describe('layoutDiagram', () => {
	it('sizes multiline nodes taller', () => {
		const layout = layoutDiagram({
			direction: 'TD',
			nodes: [
				{ id: 'A', label: 'Short', kind: 'process' },
				{ id: 'B', label: 'Line 1\nLine 2\nLine 3', kind: 'process' },
			],
			edges: [],
		})
		expect(layout.nodes.find((node) => node.id === 'B')!.height).toBeGreaterThan(layout.nodes.find((node) => node.id === 'A')!.height)
	})
})

describe('importStructuredContent', () => {
	it('imports gantt with dependency arrows', () => {
		const editor = createMockEditor()
		const result = importStructuredContent(
			editor as any,
			`gantt
  title Launch plan
  dateFormat YYYY-MM-DD
  section Build
  Spec :a1, 2026-03-08, 5d
  Ship :a2, after a1, 3d`
		)
		expect(result.createdShapeIds.length).toBeGreaterThan(0)
		expect(editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow')).toHaveLength(1)
	})

	it('imports markdown tables as frame plus grid plus text', () => {
		const editor = createMockEditor()
		const result = importStructuredContent(editor as any, `| Name | Status |\n| --- | --- |\n| Alpha | Done |`)
		expect(result.createdShapeIds.length).toBeGreaterThan(0)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'geo').length).toBeGreaterThanOrEqual(2)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'line').length).toBeGreaterThan(0)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'text').length).toBe(4)
	})

	it('imports markdown text as grouped text blocks', () => {
		const editor = createMockEditor()
		const result = importStructuredContent(editor as any, `# Title\n\nParagraph one.\n\n- One\n- Two`)
		expect(result.createdShapeIds.length).toBeGreaterThan(0)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'text').length).toBeGreaterThanOrEqual(3)
	})

	it('parses the provided flowchart example cleanly', () => {
		const result = parseStructuredImport(`flowchart TD
    A[Need to build HiScholar MVP] --> B{What should come first?}

    B -->|Fastest validation| C[Web MVP first]
    B -->|Everything at once| D[Not recommended for MVP]

    C --> E{Main priority?}

    E -->|Lower cost and faster launch| F[Stack Option A
    Next.js + Supabase]
    E -->|Stronger backend foundation| G[Stack Option B
    Next.js + Go API + PostgreSQL]`)
		expect(result.errors).toHaveLength(0)
	})

	it('imports Mermaid sequence diagrams with participants, messages, and alt branches', () => {
		const editor = createMockEditor()
		const result = importStructuredContent(
			editor as any,
			`sequenceDiagram
    participant U as User
    participant B as Browser UI
    participant V as VibeTunnel
    participant P as PAM / OS auth

    U->>B: Enter system password
    B->>V: Login request
    V->>P: Verify local user credentials
    P-->>V: Success / failure

    alt Success
        V-->>B: Issue JWT
        B-->>U: Authenticated session
    else Failure
        V-->>B: Reject login
    end`
		)

		expect(result.createdShapeIds.length).toBeGreaterThan(0)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'arrow')).toHaveLength(7)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'geo').length).toBeGreaterThanOrEqual(5)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'line').length).toBeGreaterThanOrEqual(5)
		expect(editor.getCurrentPageShapes().filter((shape: any) => shape.type === 'text').length).toBeGreaterThanOrEqual(2)
	})
})

function createMockEditor() {
	const shapes: any[] = []
	const bindings: any[] = []
	const viewport = {
		minX: 0,
		minY: 0,
		width: 1200,
		height: 900,
		center: { x: 600, y: 450 },
	}

	return {
		textMeasure: {
			measureHtml(html: string, opts: { maxWidth: number | null; fontSize: number }) {
				const text = html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '')
				const lines = text.split('\n')
				const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
				const estimatedWidth = longest * (opts.fontSize * 0.58)
				const maxWidth = opts.maxWidth ?? estimatedWidth
				const width = Math.min(maxWidth, Math.max(20, estimatedWidth))
				const wrappedLines = Math.max(lines.length, Math.ceil(estimatedWidth / Math.max(maxWidth, 1)))
				return { w: width, h: wrappedLines * (opts.fontSize * 1.4), scrollWidth: width }
			},
		},
		getViewportPageBounds() {
			return viewport
		},
		getShapeUtil(type: string) {
			return {
				getDefaultProps() {
					if (type === 'geo') return { geo: 'rectangle', w: 100, h: 100, fill: 'none', align: 'middle', verticalAlign: 'middle', richText: { content: [] } }
					if (type === 'text') return { w: 8, autoSize: true, size: 'm', font: 'draw', textAlign: 'start', richText: { content: [] } }
					if (type === 'line') return { points: {} }
					if (type === 'arrow') return { kind: 'elbow', start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, richText: { content: [] } }
					return {}
				},
			}
		},
		markHistoryStoppingPoint() {},
		run(fn: () => void) {
			fn()
		},
		createShapes(newShapes: any[]) {
			shapes.push(...newShapes)
		},
		createBindings(newBindings: any[]) {
			bindings.push(...newBindings)
		},
		groupShapes() {},
		getShape(id: string) {
			return shapes.find((shape) => shape.id === id)
		},
		getShapePageBounds(shapeOrId: any) {
			const shape = typeof shapeOrId === 'string' ? shapes.find((candidate) => candidate.id === shapeOrId) : shapeOrId
			if (!shape) return null
			if (shape.type === 'geo') {
				const w = shape.props.w
				const h = shape.props.h
				return { minX: shape.x, minY: shape.y, maxX: shape.x + w, maxY: shape.y + h, width: w, height: h, center: { x: shape.x + w / 2, y: shape.y + h / 2 } }
			}
			if (shape.type === 'text') {
				const w = shape.props.w ?? 200
				const h = 40
				return { minX: shape.x, minY: shape.y, maxX: shape.x + w, maxY: shape.y + h, width: w, height: h, center: { x: shape.x + w / 2, y: shape.y + h / 2 } }
			}
			if (shape.type === 'line') {
				const points = Object.values(shape.props.points) as Array<{ x: number; y: number }>
				const xs = points.map((point) => point.x + shape.x)
				const ys = points.map((point) => point.y + shape.y)
				const minX = Math.min(...xs)
				const maxX = Math.max(...xs)
				const minY = Math.min(...ys)
				const maxY = Math.max(...ys)
				return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } }
			}
			if (shape.type === 'arrow') {
				const minX = Math.min(shape.x, shape.x + shape.props.end.x)
				const maxX = Math.max(shape.x, shape.x + shape.props.end.x)
				const minY = Math.min(shape.y, shape.y + shape.props.end.y)
				const maxY = Math.max(shape.y, shape.y + shape.props.end.y)
				return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } }
			}
			return null
		},
		getCurrentPageShapes() {
			return shapes
		},
		getBindings() {
			return bindings
		},
	}
}
