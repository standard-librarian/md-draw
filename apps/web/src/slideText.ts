import { MarkdownSection } from '@standalone/importer'

export function getSectionsForSlides(sections: MarkdownSection[]) {
	return sections.length > 1 ? sections : sections.slice(0, 1)
}
