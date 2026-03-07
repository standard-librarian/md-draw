import { Editor, TLShapeId, createShapeId, getIndices, toRichText } from 'tldraw'
import { FONT_FAMILIES, FONT_SIZES, TEXT_PROPS } from 'tldraw'
import { BoxLike } from '../model'

const DEFAULT_FONT = 'draw'
const DEFAULT_SIZE = 'm'

export function getCenteredOffset(bounds: BoxLike, items: Array<{ x: number; y: number; w: number; h: number }>) {
	const source = getBounds(items)
	return {
		x: bounds.x + bounds.w / 2 - (source.x + source.w / 2),
		y: bounds.y + bounds.h / 2 - (source.y + source.h / 2),
	}
}

export function getBounds(items: Array<{ x: number; y: number; w: number; h: number }>) {
	if (items.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const item of items) {
		minX = Math.min(minX, item.x)
		minY = Math.min(minY, item.y)
		maxX = Math.max(maxX, item.x + item.w)
		maxY = Math.max(maxY, item.y + item.h)
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

export function measureText(
	editor: Editor,
	text: string,
	{
		size = DEFAULT_SIZE,
		font = DEFAULT_FONT,
		maxWidth,
	}: { size?: 's' | 'm' | 'l' | 'xl'; font?: 'draw' | 'sans' | 'serif' | 'mono'; maxWidth?: number | null } = {}
) {
	const html = escapeHtml(text).replace(/\n/g, '<br>')
	return editor.textMeasure.measureHtml(html, {
		...TEXT_PROPS,
		fontFamily: FONT_FAMILIES[font],
		fontSize: FONT_SIZES[size],
		maxWidth: maxWidth ?? null,
	})
}

export function getTextBox(
	editor: Editor,
	text: string,
	{
		size = DEFAULT_SIZE,
		font = DEFAULT_FONT,
		maxWidth,
		paddingX = 0,
		paddingY = 0,
		minWidth = 0,
		minHeight = 0,
		maxOuterWidth,
	}: {
		size?: 's' | 'm' | 'l' | 'xl'
		font?: 'draw' | 'sans' | 'serif' | 'mono'
		maxWidth?: number | null
		paddingX?: number
		paddingY?: number
		minWidth?: number
		minHeight?: number
		maxOuterWidth?: number
	} = {}
) {
	const measured = measureText(editor, text, { size, font, maxWidth: maxWidth ?? null })
	const width = Math.max(minWidth, measured.w + paddingX * 2)
	const height = Math.max(minHeight, measured.h + paddingY * 2)
	return { w: maxOuterWidth ? Math.min(width, maxOuterWidth) : width, h: height, textW: measured.w, textH: measured.h }
}

export function createGeoShape(editor: Editor, shape: { id: TLShapeId; x: number; y: number; props: Record<string, unknown> }) {
	const defaults = editor.getShapeUtil('geo').getDefaultProps()
	return { ...shape, type: 'geo', props: { ...defaults, ...shape.props } }
}

export function createTextShape(
	editor: Editor,
	shape: { id: TLShapeId; x: number; y: number; text: string; props?: Record<string, unknown> }
) {
	const defaults = editor.getShapeUtil('text').getDefaultProps()
	const { text, ...rest } = shape
	return { ...rest, type: 'text', props: { ...defaults, ...rest.props, richText: toRichText(text) } }
}

export function createLineShape(
	editor: Editor,
	shape: { id: TLShapeId; x: number; y: number; points: Array<{ x: number; y: number }>; props?: Record<string, unknown> }
) {
	const defaults = editor.getShapeUtil('line').getDefaultProps()
	const { points, ...rest } = shape
	const indices = getIndices(points.length)
	return {
		...rest,
		type: 'line',
		props: {
			...defaults,
			...rest.props,
			points: Object.fromEntries(
				points.map((point, index) => [
					indices[index],
					{ id: indices[index], index: indices[index], x: point.x, y: point.y },
				])
			),
		},
	}
}

export function createId() {
	return createShapeId()
}

export function groupImportedShapes(editor: Editor, shapeIds: TLShapeId[]) {
	if (shapeIds.length <= 1) return shapeIds[0]
	const groupId = createShapeId()
	editor.groupShapes(shapeIds, { groupId, select: false })
	return groupId
}

function escapeHtml(text: string) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
