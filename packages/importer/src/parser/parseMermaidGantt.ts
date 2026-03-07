import { GanttModel, GanttParseResult, ImportMessage } from '../model'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DURATION_RE = /^(\d+)d$/i

export function parseMermaidGantt(input: string): GanttParseResult {
	const lines = input.replace(/\r\n/g, '\n').split('\n')
	const warnings: ImportMessage[] = []
	const errors: ImportMessage[] = []
	const firstMeaningfulLine = lines.find((line) => line.trim() !== '' && !line.trim().startsWith('%%'))

	if (!firstMeaningfulLine || !/^\s*gantt\s*$/i.test(firstMeaningfulLine)) {
		return {
			ok: false,
			format: 'gantt',
			model: { config: {}, sections: [], tasks: [] },
			warnings,
			errors: [{ message: 'Expected Mermaid gantt input.' }],
		}
	}

	const model: GanttModel = { config: {}, sections: [], tasks: [] }
	const sections = new Map<string, GanttModel['sections'][number]>()
	let currentSectionId = 'default'
	sections.set(currentSectionId, { id: currentSectionId, label: 'Tasks', taskIds: [] })

	type PendingTask = {
		id: string
		label: string
		sectionId: string
		startDate?: string
		durationDays: number
		dependsOn?: string
		line: number
	}

	const pendingTasks: PendingTask[] = []

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim()
		const lineNumber = i + 1
		if (!trimmed || trimmed.startsWith('%%') || trimmed === firstMeaningfulLine.trim()) continue

		if (/^title\s+/i.test(trimmed)) {
			model.config.title = trimmed.replace(/^title\s+/i, '').trim()
			continue
		}
		if (/^dateFormat\s+/i.test(trimmed)) {
			model.config.dateFormat = trimmed.replace(/^dateFormat\s+/i, '').trim()
			if (model.config.dateFormat !== 'YYYY-MM-DD') {
				warnings.push({ line: lineNumber, message: 'Only `dateFormat YYYY-MM-DD` is supported.' })
			}
			continue
		}
		if (/^axisFormat\s+/i.test(trimmed)) {
			model.config.axisFormat = trimmed.replace(/^axisFormat\s+/i, '').trim()
			continue
		}
		if (/^section\s+/i.test(trimmed)) {
			const label = trimmed.replace(/^section\s+/i, '').trim() || `Section ${sections.size}`
			currentSectionId = slugify(label, sections.size)
			sections.set(currentSectionId, { id: currentSectionId, label, taskIds: [] })
			continue
		}

		const task = parseTaskLine(trimmed, currentSectionId, lineNumber)
		if (task) {
			pendingTasks.push(task)
			sections.get(currentSectionId)?.taskIds.push(task.id)
			continue
		}

		warnings.push({ line: lineNumber, message: 'Unsupported Mermaid gantt syntax was ignored.' })
	}

	const resolvedTasks = new Map<string, GanttModel['tasks'][number]>()
	for (const task of pendingTasks) {
		let startDate = task.startDate
		if (!startDate && task.dependsOn) {
			const dependency = resolvedTasks.get(task.dependsOn)
			if (!dependency) {
				errors.push({ line: task.line, message: `Task \`${task.id}\` depends on unknown task \`${task.dependsOn}\`.` })
				continue
			}
			startDate = dependency.endDate
		}
		if (!startDate || !DATE_RE.test(startDate) || Number.isNaN(Date.parse(startDate))) {
			errors.push({ line: task.line, message: `Task \`${task.id}\` has an invalid start date.` })
			continue
		}
		const endDate = addDays(startDate, task.durationDays)
		const resolvedTask = {
			id: task.id,
			label: task.label,
			sectionId: task.sectionId,
			startDate,
			durationDays: task.durationDays,
			endDate,
			dependsOn: task.dependsOn,
		}
		resolvedTasks.set(task.id, resolvedTask)
		model.tasks.push(resolvedTask)
	}

	model.sections = Array.from(sections.values()).filter((section) => section.taskIds.length > 0)
	return { ok: model.tasks.length > 0 && errors.length === 0, format: 'gantt', model, warnings, errors }
}

function parseTaskLine(line: string, sectionId: string, lineNumber: number) {
	const parts = line.split(':')
	if (parts.length < 2) return null
	const label = parts[0].trim()
	const remainder = parts.slice(1).join(':').trim()
	const segments = remainder.split(',').map((segment) => segment.trim()).filter(Boolean)
	if (segments.length < 3) return null
	const [taskId, startSegment, durationSegment] = segments
	const durationMatch = DURATION_RE.exec(durationSegment)
	if (!taskId || !durationMatch) return null
	const durationDays = Number(durationMatch[1])
	if (!Number.isFinite(durationDays) || durationDays <= 0) return null

	if (/^after\s+/i.test(startSegment)) {
		return {
			id: taskId,
			label: label || taskId,
			sectionId,
			durationDays,
			dependsOn: startSegment.replace(/^after\s+/i, '').trim(),
			line: lineNumber,
		}
	}
	if (!DATE_RE.test(startSegment)) return null
	return { id: taskId, label: label || taskId, sectionId, startDate: startSegment, durationDays, line: lineNumber }
}

function addDays(dateString: string, days: number) {
	const date = new Date(`${dateString}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function slugify(label: string, index: number) {
	const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
	return slug || `section-${index}`
}
