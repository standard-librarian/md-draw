import * as dagre from 'dagre'
import { DiagramModel, LayoutedDiagram, LayoutedNode } from '../model'

const MIN_WIDTH = 120
const MAX_WIDTH = 360
const MIN_HEIGHT = 72
const MULTILINE_BASE_WIDTH = 220

export function layoutDiagram(model: DiagramModel): LayoutedDiagram {
	const graph = new dagre.graphlib.Graph()
	graph.setGraph({
		rankdir: model.direction === 'LR' ? 'LR' : 'TB',
		nodesep: 48,
		ranksep: 64,
		marginx: 24,
		marginy: 24,
	})
	graph.setDefaultEdgeLabel(() => ({}))

	for (const node of model.nodes) {
		const size = measureNode(node.label, node.kind)
		graph.setNode(node.id, { width: size.width, height: size.height })
	}
	for (const edge of model.edges) {
		graph.setEdge(edge.from, edge.to)
	}

	dagre.layout(graph)

	const nodes: LayoutedNode[] = model.nodes.map((node) => {
		const layoutNode = graph.node(node.id)
		const size = measureNode(node.label, node.kind)
		const width = layoutNode?.width ?? size.width
		const height = layoutNode?.height ?? size.height
		return {
			...node,
			x: (layoutNode?.x ?? width / 2) - width / 2,
			y: (layoutNode?.y ?? height / 2) - height / 2,
			width,
			height,
		}
	})

	return {
		direction: model.direction,
		nodes,
		edges: model.edges.map((edge) => {
			const layoutEdge = graph.edge(edge.from, edge.to)
			return {
				...edge,
				points: layoutEdge?.points?.map((point: { x: number; y: number }) => ({ x: point.x, y: point.y })),
			}
		}),
	}
}

export function measureNode(label: string, kind: DiagramModel['nodes'][number]['kind']) {
	const lines = label.split('\n')
	const longestLine = lines.reduce((longest, line) => Math.max(longest, line.length), 0)
	const lineCount = lines.length
	const baseWidth = lineCount > 1 ? Math.max(MULTILINE_BASE_WIDTH, Math.min(MAX_WIDTH, 120 + longestLine * 6)) : MIN_WIDTH + longestLine * 7
	const width = clamp(baseWidth + (kind === 'decision' ? 24 : 0), MIN_WIDTH, MAX_WIDTH)
	const height = Math.max(MIN_HEIGHT, 48 + lineCount * 22 + Math.max(0, lineCount - 1) * 6 + (kind === 'decision' ? 12 : 0))
	return { width, height }
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}
