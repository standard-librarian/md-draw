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

	it('detects Mermaid flowcharts inside fenced code blocks', () => {
		const result = parseStructuredImport("```mermaid\nflowchart TD\nA-->B\n```")
		expect(result.format).toBe('flowchart')
	})

	it('parses the requested fenced Mermaid flowchart example', () => {
		const result = parseStructuredImport(`\`\`\`mermaid
flowchart TD
    A[Two different models]

    A --> B[Centralized IdP model]
    A --> C[Local OS auth model]

    B --> B1[Keycloak]
    B --> B2[ZITADEL]
    B --> B3[Auth0 / Okta]
    B --> B4[OIDC / SAML / OAuth2]

    C --> C1[Local machine user account]
    C --> C2[OS verifies password]
    C --> C3[App issues session token]

    C3 --> C4[VibeTunnel]
\`\`\``)
		if (result.format !== 'flowchart') throw new Error('expected flowchart')
		expect(result.errors).toHaveLength(0)
		expect(result.model.nodes).toHaveLength(11)
		expect(result.model.edges).toHaveLength(10)
		expect(result.model.nodes.find((node) => node.id === 'B4')?.label).toBe('OIDC / SAML / OAuth2')
	})

	it('parses markdown text into sections', () => {
		const result = parseMarkdownText(`# First\n\nHello\n\n# Second\n\nWorld`)
		expect(result.model.sections).toHaveLength(2)
	})
})
