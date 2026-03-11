import { ImportMessage, SequenceBlock, SequenceDiagramModel, SequenceParseResult } from '../model'

const PARTICIPANT_PATTERN = /^(participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/i
const MESSAGE_PATTERN = /^([A-Za-z0-9_]+)\s*(-->>|->>|-->|->)\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/
export const DEFAULT_SEQUENCE_ALT_LABEL = 'Condition'

export function parseMermaidSequence(input: string): SequenceParseResult {
	const warnings: ImportMessage[] = []
	const errors: ImportMessage[] = []
	const participants: SequenceDiagramModel['participants'] = []
	const participantLabels = new Map<string, string>()
	const messages: SequenceDiagramModel['messages'] = []
	const blocks: SequenceBlock[] = []
	const blockStack: Array<{ block: SequenceBlock; branchIndex: number }> = []

	const lines = input.replace(/\r\n/g, '\n').split('\n')
	const firstMeaningfulLine = lines.map((line) => line.trim()).find((line) => line && !line.startsWith('%%'))
	if (!firstMeaningfulLine || !/^sequenceDiagram\b/i.test(firstMeaningfulLine)) {
		return {
			ok: false,
			format: 'sequence',
			model: { participants: [], messages: [], blocks: [] },
			warnings,
			errors: [{ message: 'Mermaid sequence diagrams must begin with "sequenceDiagram".' }],
		}
	}

	const ensureParticipant = (id: string, label = id) => {
		if (!participantLabels.has(id)) {
			participantLabels.set(id, label)
			participants.push({ id, label })
			return
		}
		const currentLabel = participantLabels.get(id)
		const nextLabel = label.trim()
		if (nextLabel && currentLabel === id && nextLabel !== id) {
			participantLabels.set(id, nextLabel)
			const participant = participants.find((candidate) => candidate.id === id)
			if (participant) participant.label = nextLabel
		}
	}

	for (let index = 0; index < lines.length; index++) {
		const rawLine = lines[index]
		const line = rawLine.trim()
		if (!line || line.startsWith('%%') || /^sequenceDiagram\b/i.test(line)) continue

		const participantMatch = line.match(PARTICIPANT_PATTERN)
		if (participantMatch) {
			ensureParticipant(participantMatch[2], participantMatch[3]?.trim() || participantMatch[2])
			continue
		}

		const altMatch = line.match(/^alt\b\s*(.*)$/i)
		if (altMatch) {
			const block: SequenceBlock = {
				id: `alt-${blocks.length + 1}`,
				type: 'alt',
				branches: [{ label: altMatch[1].trim() || DEFAULT_SEQUENCE_ALT_LABEL, messageIds: [] }],
			}
			blocks.push(block)
			blockStack.push({ block, branchIndex: 0 })
			continue
		}

		const elseMatch = line.match(/^else\b\s*(.*)$/i)
		if (elseMatch) {
			const current = blockStack[blockStack.length - 1]
			if (!current || current.block.type !== 'alt') {
				errors.push({ line: index + 1, message: 'Found "else" outside of an "alt" block.' })
				continue
			}
			current.block.branches.push({ label: elseMatch[1].trim() || 'Else', messageIds: [] })
			current.branchIndex = current.block.branches.length - 1
			continue
		}

		if (/^end\b/i.test(line)) {
			if (!blockStack.length) {
				errors.push({ line: index + 1, message: 'Found "end" without a matching block opener.' })
				continue
			}
			blockStack.pop()
			continue
		}

		const messageMatch = line.match(MESSAGE_PATTERN)
		if (messageMatch) {
			const [, from, arrowToken, to, label] = messageMatch
			ensureParticipant(from)
			ensureParticipant(to)
			const messageId = `message-${messages.length + 1}`
			messages.push({
				id: messageId,
				from,
				to,
				label: label.trim(),
				style: arrowToken.startsWith('--') ? 'dashed' : 'solid',
			})
			for (const state of blockStack) {
				state.block.branches[state.branchIndex].messageIds.push(messageId)
			}
			continue
		}

		if (/^(autonumber|activate|deactivate|note|rect|loop|par|opt|critical|break)\b/i.test(line)) {
			warnings.push({ line: index + 1, message: `Sequence directive "${line.split(/\s+/, 1)[0]}" is ignored during import.` })
			continue
		}

		errors.push({ line: index + 1, message: `Unsupported Mermaid sequence syntax: ${line}` })
	}

	if (blockStack.length) {
		errors.push({ message: 'One or more Mermaid sequence blocks were not closed with "end".' })
	}

	return {
		ok: errors.length === 0,
		format: 'sequence',
		model: { participants, messages, blocks },
		warnings,
		errors,
	}
}
