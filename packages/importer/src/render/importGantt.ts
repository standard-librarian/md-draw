import { Editor, TLShapeId, createBindingId, toRichText } from 'tldraw'
import { BoxLike, GanttModel, ImportResult } from '../model'
import { clamp, createGeoShape, createId, createTextShape, getCenteredOffset, getTextBox, groupImportedShapes, measureText } from './shared'

const MIN_TIMELINE_WIDTH = 520
const MAX_TIMELINE_WIDTH = 860
const MIN_DAY_WIDTH = 14
const MAX_DAY_WIDTH = 30
const MIN_ROW_HEIGHT = 56
const BAR_HEIGHT = 28
const LABEL_PADDING_X = 12
const LABEL_PADDING_Y = 10
const SECTION_GAP = 18
const TITLE_GAP = 18
const HEADER_GAP = 16

/**
 * Import a GanttModel into the editor by creating text, bar, and arrow shapes (and bindings) to represent sections, tasks, timeline, and dependencies.
 *
 * This mutates the given editor by creating shapes and grouping them; the result describes the created shape IDs and import status.
 *
 * @returns An `ImportResult` containing `createdShapeIds` for all shapes added and `ok` indicating whether no errors were reported; `errors` contains any validation or parsing messages from the import.
 */
export function importGanttModel(editor: Editor, model: GanttModel, baseResult: Omit<ImportResult, 'createdShapeIds'>, targetBounds?: BoxLike): ImportResult {
	if (model.tasks.length === 0) {
		return { ...baseResult, ok: false, errors: baseResult.errors.length ? baseResult.errors : [{ message: 'Nothing importable was found in the Mermaid gantt input.' }], createdShapeIds: [] }
	}

	const timelineStart = model.tasks.reduce((min, task) => (task.startDate < min ? task.startDate : min), model.tasks[0].startDate)
	const timelineEnd = model.tasks.reduce((max, task) => (task.endDate > max ? task.endDate : max), model.tasks[0].endDate)
	const totalDays = Math.max(1, daysBetween(timelineStart, timelineEnd))
	const timelineWidth = clamp(totalDays * 22, MIN_TIMELINE_WIDTH, MAX_TIMELINE_WIDTH)
	const dayWidth = clamp(timelineWidth / totalDays, MIN_DAY_WIDTH, MAX_DAY_WIDTH)
	const normalizedTimelineWidth = totalDays * dayWidth
	const labelTexts = [...model.sections.map((section) => section.label), ...model.tasks.map((task) => task.label)]
	const leftColumnWidth = clamp(Math.max(220, ...labelTexts.map((text) => getTextBox(editor, text, { paddingX: LABEL_PADDING_X, paddingY: LABEL_PADDING_Y, minWidth: 180 }).w)), 220, 340)

	type Row =
		| { type: 'section'; label: string; y: number; h: number }
		| { type: 'task'; task: GanttModel['tasks'][number]; y: number; h: number; barX: number; barW: number; labelTextHeight: number }

	const rows: Row[] = []
	let currentY = 0
	const titleHeight = model.config.title ? getTextBox(editor, model.config.title, { size: 'l', minHeight: 28 }).h : 0
	if (titleHeight) currentY += titleHeight + TITLE_GAP
	const axisHeight = getTextBox(editor, timelineStart, { size: 's', minHeight: 18 }).h
	currentY += axisHeight + HEADER_GAP

	for (const section of model.sections) {
		const sectionTasks = model.tasks.filter((task) => task.sectionId === section.id)
		if (!sectionTasks.length) continue
		const sectionHeight = getTextBox(editor, section.label, { minHeight: 24 }).h
		rows.push({ type: 'section', label: section.label, y: currentY, h: sectionHeight })
		currentY += sectionHeight + 8
		for (const task of sectionTasks) {
			const labelBox = getTextBox(editor, task.label, { maxWidth: leftColumnWidth - LABEL_PADDING_X * 2, paddingX: LABEL_PADDING_X, paddingY: LABEL_PADDING_Y, minHeight: MIN_ROW_HEIGHT })
			const rowHeight = Math.max(MIN_ROW_HEIGHT, labelBox.h)
			const startOffsetDays = daysBetween(timelineStart, task.startDate)

			// ⚡ Bolt Optimization: Cache textH so we don't have to call measureText() again
			// in the secondary drawing loop for this task's label.
			rows.push({ type: 'task', task, y: currentY, h: rowHeight, barX: leftColumnWidth + startOffsetDays * dayWidth, barW: Math.max(dayWidth, task.durationDays * dayWidth), labelTextHeight: labelBox.textH })
			currentY += rowHeight
		}
		currentY += SECTION_GAP
	}

	const destination = targetBounds ?? pageBoundsToBox(editor.getViewportPageBounds())
	const offset = getCenteredOffset(destination, [{ x: 0, y: 0, w: leftColumnWidth + normalizedTimelineWidth, h: currentY }])
	const createdShapeIds: TLShapeId[] = []
	const taskShapeIds = new Map<string, TLShapeId>()
	const arrowDefaultProps = editor.getShapeUtil('arrow').getDefaultProps()
	const shapes: any[] = []

	if (model.config.title) {
		const id = createId()
		createdShapeIds.push(id)
		shapes.push(createTextShape(editor, { id, x: offset.x, y: offset.y, text: model.config.title, props: { size: 'l', textAlign: 'start' } }))
	}

	const axisY = offset.y + titleHeight + (titleHeight ? TITLE_GAP : 0)
	for (let day = 0; day <= totalDays; day += getAxisTickStep(totalDays)) {
		const id = createId()
		createdShapeIds.push(id)
		shapes.push(createTextShape(editor, { id, x: offset.x + leftColumnWidth + day * dayWidth, y: axisY, text: addDays(timelineStart, day), props: { size: 's', textAlign: 'start' } }))
	}

	for (const row of rows) {
		if (row.type === 'section') {
			const id = createId()
			createdShapeIds.push(id)
			shapes.push(createTextShape(editor, { id, x: offset.x, y: offset.y + row.y, text: row.label, props: { size: 'm', textAlign: 'start' } }))
			continue
		}
		const labelId = createId()
		const barId = createId()
		createdShapeIds.push(labelId, barId)
		taskShapeIds.set(row.task.id, barId)
		const rowTop = offset.y + row.y
		const labelTextHeight = row.labelTextHeight
		const labelY = rowTop + Math.max(0, (row.h - labelTextHeight) / 2)
		const barY = rowTop + Math.max(0, (row.h - BAR_HEIGHT) / 2)
		const shouldLabelBar = row.barW >= 170
		shapes.push(
			createTextShape(editor, { id: labelId, x: offset.x + LABEL_PADDING_X, y: labelY, text: row.task.label, props: { w: leftColumnWidth - LABEL_PADDING_X * 2, autoSize: false, textAlign: 'start' } }),
			createGeoShape(editor, { id: barId, x: offset.x + row.barX, y: barY, props: { geo: 'rectangle', w: row.barW, h: BAR_HEIGHT, fill: 'solid', align: 'middle', verticalAlign: 'middle', richText: shouldLabelBar ? toRichText(row.task.label) : toRichText('') } })
		)
	}

	editor.markHistoryStoppingPoint('import gantt')
	editor.run(() => {
		editor.createShapes(shapes)
		const arrowShapes: any[] = []
		const bindings: any[] = []
		for (const task of model.tasks) {
			if (!task.dependsOn) continue
			const fromId = taskShapeIds.get(task.dependsOn)
			const toId = taskShapeIds.get(task.id)
			if (!fromId || !toId) continue
			const fromBounds = editor.getShapePageBounds(fromId)
			const toBounds = editor.getShapePageBounds(toId)
			if (!fromBounds || !toBounds) continue
			const arrowId = createId()
			createdShapeIds.push(arrowId)
			arrowShapes.push({ id: arrowId, type: 'arrow' as const, x: fromBounds.maxX, y: fromBounds.center.y, props: { ...arrowDefaultProps, kind: 'elbow' as const, start: { x: 0, y: 0 }, end: { x: toBounds.minX - fromBounds.maxX, y: toBounds.center.y - fromBounds.center.y } } })
			bindings.push(
				{ id: createBindingId(), type: 'arrow' as const, fromId: arrowId, toId: fromId, props: { terminal: 'start' as const, normalizedAnchor: { x: 1, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' as const } },
				{ id: createBindingId(), type: 'arrow' as const, fromId: arrowId, toId: toId, props: { terminal: 'end' as const, normalizedAnchor: { x: 0, y: 0.5 }, isExact: false, isPrecise: true, snap: 'none' as const } }
			)
		}
		if (arrowShapes.length) {
			editor.createShapes(arrowShapes)
			editor.createBindings(bindings)
		}
		groupImportedShapes(editor, createdShapeIds)
	})

	return { ...baseResult, ok: baseResult.errors.length === 0, createdShapeIds }
}

function daysBetween(startDate: string, endDate: string) {
	return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000)
}

function addDays(dateString: string, days: number) {
	const date = new Date(`${dateString}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function getAxisTickStep(totalDays: number) {
	if (totalDays <= 14) return 2
	if (totalDays <= 40) return 7
	if (totalDays <= 120) return 14
	return 30
}

function pageBoundsToBox(bounds: { minX: number; minY: number; width: number; height: number }) {
	return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
}
