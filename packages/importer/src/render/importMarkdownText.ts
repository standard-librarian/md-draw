import { Editor, TLShapeId } from 'tldraw'
import { BoxLike, ImportResult, MarkdownSection, MarkdownTextModel } from '../model'
import { clamp, createId, createTextShape, getCenteredOffset, getTextBox, groupImportedShapes } from './shared'

const MAX_TEXT_WIDTH = 680
const MIN_TEXT_WIDTH = 360
const BLOCK_GAP = 18

export function importMarkdownTextModel(editor: Editor, model: MarkdownTextModel, options?: { targetBounds?: BoxLike }): ImportResult {
	const firstSection = model.sections[0]
	if (!firstSection) {
		return { ok: false, warnings: [], errors: [{ message: 'Nothing importable was found in the Markdown text input.' }], createdShapeIds: [] }
	}
	return importMarkdownTextSection(editor, firstSection, { ok: true, warnings: [], errors: [] }, options?.targetBounds)
}

export function importMarkdownTextSection(editor: Editor, section: MarkdownSection, baseResult: Omit<ImportResult, 'createdShapeIds'>, targetBounds?: BoxLike): ImportResult {
	const destination = targetBounds ?? pageBoundsToBox(editor.getViewportPageBounds())
	const maxWidth = clamp(destination.w * 0.78, MIN_TEXT_WIDTH, MAX_TEXT_WIDTH)
	const layoutItems = section.blocks.map((block, index) => {
		const size = getTextBox(editor, block.text, {
			size: getBlockSize(block.kind, block.level),
			maxWidth,
			minWidth: Math.min(maxWidth, block.kind === 'heading' ? 240 : 180),
		})
		return { x: 0, y: index, w: size.w, h: size.h, textW: size.textW, textH: size.textH, kind: block.kind, level: block.level, text: block.text }
	})

	let runningY = 0
	const items = layoutItems.map((item) => {
		const placed = { ...item, y: runningY }
		runningY += item.h + BLOCK_GAP
		return placed
	})
	const offset = getCenteredOffset(destination, items.map((item) => ({ x: item.x, y: item.y, w: item.w, h: item.h })))
	const createdShapeIds: TLShapeId[] = []
	const shapes: any[] = []

	for (const item of items) {
		const id = createId()
		createdShapeIds.push(id)
		shapes.push(
			createTextShape(editor, {
				id,
				x: offset.x,
				y: offset.y + item.y,
				text: item.text,
				props: {
					w: maxWidth,
					autoSize: false,
					textAlign: item.kind === 'blockquote' ? 'start' : 'start',
					size: getBlockSize(item.kind, item.level),
					font: item.kind === 'code' ? 'mono' : 'draw',
				},
			})
		)
	}

	editor.markHistoryStoppingPoint('import markdown text')
	editor.run(() => {
		editor.createShapes(shapes)
		groupImportedShapes(editor, createdShapeIds)
	})
	return { ...baseResult, ok: baseResult.errors.length === 0, createdShapeIds }
}

function getBlockSize(kind: string, level?: number): 's' | 'm' | 'l' | 'xl' {
	if (kind === 'heading') {
		if (level === 1) return 'xl'
		if (level === 2) return 'l'
		return 'm'
	}
	if (kind === 'code') return 's'
	return 'm'
}

function pageBoundsToBox(bounds: { minX: number; minY: number; width: number; height: number }) {
	return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
}
