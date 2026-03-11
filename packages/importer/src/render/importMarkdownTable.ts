import { Editor, TLShapeId } from 'tldraw'
import { BoxLike, ImportResult, MarkdownTableModel } from '../model'
import { clamp, createGeoShape, createId, createLineShape, createTextShape, getCenteredOffset, getTextBox, groupImportedShapes, measureText } from './shared'

const CELL_PADDING_X = 16
const CELL_PADDING_Y = 12
const MIN_COLUMN_WIDTH = 120
const MAX_COLUMN_WIDTH = 260
const MIN_ROW_HEIGHT = 48

export function importMarkdownTableModel(editor: Editor, model: MarkdownTableModel, baseResult: Omit<ImportResult, 'createdShapeIds'>, targetBounds?: BoxLike): ImportResult {
	if (model.rows.length < 2 || model.columns.length === 0) {
		return { ...baseResult, ok: false, errors: baseResult.errors.length ? baseResult.errors : [{ message: 'Nothing importable was found in the Markdown table input.' }], createdShapeIds: [] }
	}

	const columnWidths = model.columns.map((_, columnIndex) =>
		clamp(Math.max(...model.rows.map((row) => getTextBox(editor, row[columnIndex] ?? '', { paddingX: CELL_PADDING_X, paddingY: CELL_PADDING_Y, minWidth: MIN_COLUMN_WIDTH }).w)), MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH)
	)

	// ⚡ Bolt Optimization: Cache text measurements to avoid redundant DOM reads during render
	// Markdown tables measure O(rows * cols) text boxes. We compute these once here and store
	// both the outer height (for row sizing) and the inner text dimensions (for alignment).
	const cellMeasures: { w: number; h: number }[][] = []
	const rowHeights = model.rows.map((row, rowIndex) => {
		const rowMeasures: { w: number; h: number }[] = []
		const measuredCells: number[] = []
		for (let columnIndex = 0; columnIndex < model.columns.length; columnIndex++) {
			const cell = row[columnIndex] ?? ''
			const box = getTextBox(editor, cell, { maxWidth: columnWidths[columnIndex] - CELL_PADDING_X * 2, paddingX: CELL_PADDING_X, paddingY: CELL_PADDING_Y, minHeight: MIN_ROW_HEIGHT })
			rowMeasures.push({ w: box.textW, h: box.textH })
			measuredCells.push(box.h)
		}
		cellMeasures.push(rowMeasures)
		return Math.max(MIN_ROW_HEIGHT, ...measuredCells, rowIndex === model.headerRowIndex ? 54 : MIN_ROW_HEIGHT)
	})

	const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0)
	const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0)
	const destination = targetBounds ?? pageBoundsToBox(editor.getViewportPageBounds())
	const offset = getCenteredOffset(destination, [{ x: 0, y: 0, w: totalWidth, h: totalHeight }])
	const createdShapeIds: TLShapeId[] = []
	const shapes: any[] = []

	const outerId = createId()
	createdShapeIds.push(outerId)
	shapes.push(createGeoShape(editor, { id: outerId, x: offset.x, y: offset.y, props: { geo: 'rectangle', w: totalWidth, h: totalHeight, fill: 'none' } }))
	const headerBgId = createId()
	createdShapeIds.push(headerBgId)
	shapes.push(createGeoShape(editor, { id: headerBgId, x: offset.x, y: offset.y, props: { geo: 'rectangle', w: totalWidth, h: rowHeights[0], fill: 'solid' } }))

	let runningX = 0
	for (let columnIndex = 0; columnIndex < columnWidths.length - 1; columnIndex++) {
		runningX += columnWidths[columnIndex]
		const id = createId()
		createdShapeIds.push(id)
		shapes.push(createLineShape(editor, { id, x: offset.x + runningX, y: offset.y, points: [{ x: 0, y: 0 }, { x: 0, y: totalHeight }] }))
	}

	let runningY = 0
	for (let rowIndex = 0; rowIndex < rowHeights.length - 1; rowIndex++) {
		runningY += rowHeights[rowIndex]
		const id = createId()
		createdShapeIds.push(id)
		shapes.push(createLineShape(editor, { id, x: offset.x, y: offset.y + runningY, points: [{ x: 0, y: 0 }, { x: totalWidth, y: 0 }] }))
	}

	let y = offset.y
	for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex++) {
		let x = offset.x
		for (let columnIndex = 0; columnIndex < model.columns.length; columnIndex++) {
			const text = model.rows[rowIndex][columnIndex] ?? ''
			const cellWidth = columnWidths[columnIndex]
			const cellHeight = rowHeights[rowIndex]
			const textMeasure = cellMeasures[rowIndex][columnIndex]
			let textX = x + CELL_PADDING_X
			if (model.columns[columnIndex]?.align === 'middle') textX = x + (cellWidth - textMeasure.w) / 2
			else if (model.columns[columnIndex]?.align === 'end') textX = x + cellWidth - CELL_PADDING_X - textMeasure.w
			const textY = y + Math.max(CELL_PADDING_Y, (cellHeight - textMeasure.h) / 2)
			const id = createId()
			createdShapeIds.push(id)
			shapes.push(createTextShape(editor, { id, x: textX, y: textY, text, props: { w: cellWidth - CELL_PADDING_X * 2, autoSize: false, textAlign: model.columns[columnIndex]?.align ?? 'start', size: rowIndex === 0 ? 'm' : 's' } }))
			x += cellWidth
		}
		y += rowHeights[rowIndex]
	}

	editor.markHistoryStoppingPoint('import markdown table')
	editor.run(() => {
		editor.createShapes(shapes)
		groupImportedShapes(editor, createdShapeIds)
	})
	return { ...baseResult, ok: baseResult.errors.length === 0, createdShapeIds }
}

function pageBoundsToBox(bounds: { minX: number; minY: number; width: number; height: number }) {
	return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
}
