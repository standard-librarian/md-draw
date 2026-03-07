import { Editor, TLGeoShapeProps, TLShapeId, createBindingId, createShapeId, toRichText } from 'tldraw'
import { layoutDiagram } from '../layout/layoutDiagram'
import { BoxLike, DiagramNode, ImportResult, LayoutedDiagram } from '../model'
import { parseMermaidFlowchart } from '../parser/parseMermaidFlowchart'
import { getCenteredOffset } from './shared'

export function importMermaidFlowchart(editor: Editor, input: string, targetBounds?: BoxLike): ImportResult {
	const parseResult = parseMermaidFlowchart(input)
	const hasImportableContent = parseResult.model.nodes.length > 0
	if (!hasImportableContent) {
		return {
			ok: false,
			warnings: parseResult.warnings,
			errors: parseResult.errors.length ? parseResult.errors : [{ message: 'Nothing importable was found in the Mermaid input.' }],
			createdShapeIds: [],
		}
	}
	const layouted = layoutDiagram(parseResult.model)
	const createdShapeIds = insertDiagramIntoTldraw(editor, layouted, targetBounds)
	return { ok: parseResult.errors.length === 0, warnings: parseResult.warnings, errors: parseResult.errors, createdShapeIds }
}

export function insertDiagramIntoTldraw(editor: Editor, layouted: LayoutedDiagram, targetBounds?: BoxLike): TLShapeId[] {
	const destination = targetBounds ?? pageBoundsToBox(editor.getViewportPageBounds())
	const offset = getCenteredOffset(destination, layouted.nodes.map((node) => ({ x: node.x, y: node.y, w: node.width, h: node.height })))
	const geoDefaultProps = editor.getShapeUtil('geo').getDefaultProps()
	const arrowDefaultProps = editor.getShapeUtil('arrow').getDefaultProps()
	const createdNodeIds = new Map<string, TLShapeId>()
	const createdShapeIds: TLShapeId[] = []

	editor.markHistoryStoppingPoint('import mermaid')
	editor.run(() => {
		editor.createShapes(
			layouted.nodes.map((node) => {
				const shapeId = createShapeId()
				createdNodeIds.set(node.id, shapeId)
				createdShapeIds.push(shapeId)
				return {
					id: shapeId,
					type: 'geo' as const,
					x: node.x + offset.x,
					y: node.y + offset.y,
					props: { ...geoDefaultProps, geo: getGeoForNode(node), w: node.width, h: node.height, richText: toRichText(node.label) },
				}
			})
		)

		const bindings: any[] = []
		editor.createShapes(
			layouted.edges.flatMap((edge) => {
				const fromNode = layouted.nodes.find((node) => node.id === edge.from)
				const toNode = layouted.nodes.find((node) => node.id === edge.to)
				const fromShapeId = createdNodeIds.get(edge.from)
				const toShapeId = createdNodeIds.get(edge.to)
				if (!fromNode || !toNode || !fromShapeId || !toShapeId) return []
				const start = getNodeCenter(fromNode, offset.x, offset.y)
				const end = getNodeCenter(toNode, offset.x, offset.y)
				const arrowId = createShapeId()
				createdShapeIds.push(arrowId)
				bindings.push(
					{ id: createBindingId(), type: 'arrow', fromId: arrowId, toId: fromShapeId, props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } },
					{ id: createBindingId(), type: 'arrow', fromId: arrowId, toId: toShapeId, props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } }
				)
				return [{
					id: arrowId,
					type: 'arrow' as const,
					x: start.x,
					y: start.y,
					props: { ...arrowDefaultProps, kind: 'elbow' as const, start: { x: 0, y: 0 }, end: { x: end.x - start.x, y: end.y - start.y }, richText: toRichText(edge.label ?? '') },
				}]
			})
		)
		if (bindings.length) editor.createBindings(bindings)
	})

	return createdShapeIds
}

function getNodeCenter(node: LayoutedDiagram['nodes'][number], offsetX: number, offsetY: number) {
	return { x: node.x + node.width / 2 + offsetX, y: node.y + node.height / 2 + offsetY }
}

function getGeoForNode(node: DiagramNode): TLGeoShapeProps['geo'] {
	switch (node.kind) {
		case 'decision':
			return 'diamond'
		case 'round':
		case 'terminator':
			return 'oval'
		default:
			return 'rectangle'
	}
}

function pageBoundsToBox(bounds: { minX: number; minY: number; width: number; height: number }) {
	return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
}
