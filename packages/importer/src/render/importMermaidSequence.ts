import { Editor, TLShapeId, createBindingId, toRichText } from 'tldraw'
import { BoxLike, ImportResult, SequenceBlock, SequenceDiagramModel } from '../model'
import { DEFAULT_SEQUENCE_ALT_LABEL, parseMermaidSequence } from '../parser/parseMermaidSequence'
import { clamp, createGeoShape, createId, createLineShape, createTextShape, getCenteredOffset, getTextBox, groupImportedShapes } from './shared'

const PARTICIPANT_PADDING_X = 16
const PARTICIPANT_PADDING_Y = 10
const MIN_LANE_WIDTH = 160
const MAX_LANE_WIDTH = 260
const LANE_GAP = 80
const HEADER_GAP = 44
const MESSAGE_GAP = 74
const BLOCK_PADDING_X = 22
const BLOCK_PADDING_Y = 24
const BLOCK_LABEL_HEIGHT = 24

export function importMermaidSequence(editor: Editor, input: string, targetBounds?: BoxLike): ImportResult {
	const parseResult = parseMermaidSequence(input)
	if (parseResult.model.participants.length === 0 || parseResult.model.messages.length === 0) {
		return {
			ok: false,
			warnings: parseResult.warnings,
			errors: parseResult.errors.length ? parseResult.errors : [{ message: 'Nothing importable was found in the Mermaid sequence input.' }],
			createdShapeIds: [],
		}
	}

	const createdShapeIds = insertSequenceDiagram(editor, parseResult.model, targetBounds)
	return {
		ok: parseResult.errors.length === 0,
		warnings: parseResult.warnings,
		errors: parseResult.errors,
		createdShapeIds,
	}
}

function insertSequenceDiagram(editor: Editor, model: SequenceDiagramModel, targetBounds?: BoxLike) {
	const participantBoxes = model.participants.map((participant) =>
		getTextBox(editor, participant.label, {
			paddingX: PARTICIPANT_PADDING_X,
			paddingY: PARTICIPANT_PADDING_Y,
			minWidth: MIN_LANE_WIDTH,
			maxOuterWidth: MAX_LANE_WIDTH,
		})
	)
	const laneWidth = clamp(Math.max(...participantBoxes.map((box) => box.w)), MIN_LANE_WIDTH, MAX_LANE_WIDTH)
	const participantHeight = Math.max(...participantBoxes.map((box) => box.h))
	const laneCenters = model.participants.map((_, index) => laneWidth / 2 + index * (laneWidth + LANE_GAP))
	const firstMessageY = participantHeight + HEADER_GAP
	const messageYs = model.messages.map((_, index) => firstMessageY + index * MESSAGE_GAP)
	const diagramWidth = laneWidth * model.participants.length + LANE_GAP * Math.max(0, model.participants.length - 1)
	const diagramHeight = (messageYs.at(-1) ?? firstMessageY) + MESSAGE_GAP
	const destination = targetBounds ?? pageBoundsToBox(editor.getViewportPageBounds())
	const offset = getCenteredOffset(destination, [{ x: 0, y: 0, w: diagramWidth, h: diagramHeight }])
	const createdShapeIds: TLShapeId[] = []
	const participantShapeIds = new Map<string, TLShapeId>()
	const arrowDefaultProps = editor.getShapeUtil('arrow').getDefaultProps()
	const shapes: any[] = []

	for (let index = 0; index < model.participants.length; index++) {
		const participant = model.participants[index]
		const box = participantBoxes[index]
		const centerX = offset.x + laneCenters[index]
		const boxId = createId()
		const lifelineId = createId()
		participantShapeIds.set(participant.id, boxId)
		createdShapeIds.push(boxId, lifelineId)
		shapes.push(
			createGeoShape(editor, {
				id: boxId,
				x: centerX - box.w / 2,
				y: offset.y,
				props: { geo: 'rectangle', w: box.w, h: box.h, fill: 'none', richText: toRichText('') },
			}),
			createLineShape(editor, {
				id: lifelineId,
				x: centerX,
				y: offset.y + box.h,
				points: [{ x: 0, y: 0 }, { x: 0, y: diagramHeight - box.h }],
			}),
			createTextShape(editor, {
				id: createId(),
				x: centerX - box.textW / 2,
				y: offset.y + Math.max(PARTICIPANT_PADDING_Y, (box.h - box.textH) / 2),
				text: participant.label,
			})
		)
		createdShapeIds.push(shapes.at(-1).id)
	}

	const blockShapes = getBlockShapes(editor, model, {
		offset,
		laneWidth,
		laneCenters,
		messageYs,
	})
	for (const shape of blockShapes) createdShapeIds.push(shape.id)
	shapes.push(...blockShapes)

	editor.markHistoryStoppingPoint('import mermaid sequence')
	editor.run(() => {
		editor.createShapes(shapes)
		const arrows: any[] = []
		const bindings: any[] = []

		for (let index = 0; index < model.messages.length; index++) {
			const message = model.messages[index]
			const fromIndex = model.participants.findIndex((participant) => participant.id === message.from)
			const toIndex = model.participants.findIndex((participant) => participant.id === message.to)
			const fromId = participantShapeIds.get(message.from)
			const toId = participantShapeIds.get(message.to)
			if (fromIndex === -1 || toIndex === -1 || !fromId || !toId) continue
			const startX = offset.x + laneCenters[fromIndex]
			const endX = offset.x + laneCenters[toIndex]
			const y = offset.y + messageYs[index]
			const arrowId = createId()
			createdShapeIds.push(arrowId)
			arrows.push({
				id: arrowId,
				type: 'arrow' as const,
				x: startX,
				y,
				props: {
					...arrowDefaultProps,
					kind: 'elbow' as const,
					start: { x: 0, y: 0 },
					end: { x: endX - startX, y: 0 },
					dash: message.style === 'dashed' ? 'dashed' : arrowDefaultProps.dash,
					richText: toRichText(message.label),
				},
			})
			bindings.push(
				{
					id: createBindingId(),
					type: 'arrow' as const,
					fromId: arrowId,
					toId: fromId,
					props: { terminal: 'start' as const, normalizedAnchor: { x: 0.5, y: 1 }, isExact: false, isPrecise: false, snap: 'none' as const },
				},
				{
					id: createBindingId(),
					type: 'arrow' as const,
					fromId: arrowId,
					toId: toId,
					props: { terminal: 'end' as const, normalizedAnchor: { x: 0.5, y: 1 }, isExact: false, isPrecise: false, snap: 'none' as const },
				}
			)
		}

		if (arrows.length) {
			editor.createShapes(arrows)
			editor.createBindings(bindings)
		}
		groupImportedShapes(editor, createdShapeIds)
	})

	return createdShapeIds
}

function getBlockShapes(
	editor: Editor,
	model: SequenceDiagramModel,
	{
		offset,
		laneWidth,
		laneCenters,
		messageYs,
	}: {
		offset: { x: number; y: number }
		laneWidth: number
		laneCenters: number[]
		messageYs: number[]
	}
) {
	const messageIndexById = new Map(model.messages.map((message, index) => [message.id, index]))
	const shapes: any[] = []

	for (const block of model.blocks) {
		const bounds = getBlockBounds(model, block, laneWidth, laneCenters, messageYs, messageIndexById)
		if (!bounds) continue

		shapes.push(
			createGeoShape(editor, {
				id: createId(),
				x: offset.x + bounds.x,
				y: offset.y + bounds.y,
				props: { geo: 'rectangle', w: bounds.w, h: bounds.h, fill: 'none' },
			}),
			createTextShape(editor, {
				id: createId(),
				x: offset.x + bounds.x + 12,
				y: offset.y + bounds.y + 8,
				text: `alt ${block.branches[0]?.label ?? DEFAULT_SEQUENCE_ALT_LABEL}`,
				props: { size: 's' },
			})
		)

		for (let branchIndex = 1; branchIndex < block.branches.length; branchIndex++) {
			const previous = block.branches[branchIndex - 1]
			const current = block.branches[branchIndex]
			const separatorY = getBranchSeparatorY(previous, current, messageYs, messageIndexById)
			if (separatorY === null) continue
			shapes.push(
				createLineShape(editor, {
					id: createId(),
					x: offset.x + bounds.x,
					y: offset.y + separatorY,
					points: [{ x: 0, y: 0 }, { x: bounds.w, y: 0 }],
				}),
				createTextShape(editor, {
					id: createId(),
					x: offset.x + bounds.x + 12,
					y: offset.y + separatorY + 8,
					text: `else ${current.label}`,
					props: { size: 's' },
				})
			)
		}
	}

	return shapes
}

function getBlockBounds(
	model: SequenceDiagramModel,
	block: SequenceBlock,
	laneWidth: number,
	laneCenters: number[],
	messageYs: number[],
	messageIndexById: Map<string, number>
) {
	const messageIndices = block.branches.flatMap((branch) => branch.messageIds.map((messageId) => messageIndexById.get(messageId)).filter((value): value is number => value !== undefined))
	if (!messageIndices.length) return null

	const participants = new Set<number>()
	for (const index of messageIndices) {
		const message = model.messages[index]
		const fromIndex = model.participants.findIndex((participant) => participant.id === message.from)
		const toIndex = model.participants.findIndex((participant) => participant.id === message.to)
		if (fromIndex >= 0) participants.add(fromIndex)
		if (toIndex >= 0) participants.add(toIndex)
	}
	const participantIndices = [...participants].sort((a, b) => a - b)
	const minParticipant = participantIndices[0] ?? 0
	const maxParticipant = participantIndices.at(-1) ?? model.participants.length - 1
	const minMessageY = Math.min(...messageIndices.map((index) => messageYs[index]))
	const maxMessageY = Math.max(...messageIndices.map((index) => messageYs[index]))

	return {
		x: laneCenters[minParticipant] - laneWidth / 2 - BLOCK_PADDING_X,
		y: minMessageY - BLOCK_LABEL_HEIGHT,
		w: laneCenters[maxParticipant] - laneCenters[minParticipant] + laneWidth + BLOCK_PADDING_X * 2,
		h: maxMessageY - minMessageY + BLOCK_PADDING_Y * 2 + BLOCK_LABEL_HEIGHT,
	}
}

function getBranchSeparatorY(
	previousBranch: SequenceBlock['branches'][number],
	currentBranch: SequenceBlock['branches'][number],
	messageYs: number[],
	messageIndexById: Map<string, number>
) {
	const previousIndices = previousBranch.messageIds.map((messageId) => messageIndexById.get(messageId)).filter((value): value is number => value !== undefined)
	const currentIndices = currentBranch.messageIds.map((messageId) => messageIndexById.get(messageId)).filter((value): value is number => value !== undefined)
	if (!previousIndices.length || !currentIndices.length) return null
	const previousBottom = Math.max(...previousIndices.map((index) => messageYs[index]))
	const currentTop = Math.min(...currentIndices.map((index) => messageYs[index]))
	return (previousBottom + currentTop) / 2
}

function pageBoundsToBox(bounds: { minX: number; minY: number; width: number; height: number }) {
	return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
}
