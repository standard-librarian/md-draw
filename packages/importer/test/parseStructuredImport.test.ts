import { describe, expect, it } from 'vitest'
import { parseMarkdownText, parseStructuredImport } from '../src'

describe('parseStructuredImport', () => {
	it('detects flowcharts', () => {
		expect(parseStructuredImport(`flowchart TD\nA-->B`).format).toBe('flowchart')
	})

	it('detects gantt', () => {
		expect(parseStructuredImport(`gantt\nsection Build\nTask :a1, 2026-03-08, 2d`).format).toBe('gantt')
	})

	it('detects markdown tables before markdown text', () => {
		expect(parseStructuredImport(`| A | B |\n| --- | --- |\n| 1 | 2 |`).format).toBe('markdown-table')
	})

	it('detects markdown text', () => {
		expect(parseStructuredImport(`# Title\n\nParagraph`).format).toBe('markdown-text')
	})

	it('parses multiline flowchart nodes', () => {
		const result = parseStructuredImport(`flowchart TD
  E --> F[Core MVP Features
    - Onboarding and auth
    - Student dashboard]
  F --> G[Next]`)
		if (result.format !== 'flowchart') throw new Error('expected flowchart')
		expect(result.errors).toHaveLength(0)
		expect(result.model.nodes.find((node) => node.id === 'F')?.label).toContain('Student dashboard')
	})

	it('parses markdown text into sections', () => {
		const result = parseMarkdownText(`# First\n\nHello\n\n# Second\n\nWorld`)
		expect(result.model.sections).toHaveLength(2)
	})
})
