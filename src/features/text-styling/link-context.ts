export interface LinkContext {
	from: number;
	to: number;
	mode: 'page' | 'url';
	target: string;
	text: string;
	suffix?: string;
	angleTarget?: boolean;
}

export function findLinkAtRange(source: string, from: number, to: number): LinkContext | null {
	// shortcut: inline links only; add reference-link resolution when that format is supported by the toolbar.
	const openings = /`+|!?\[/g;
	let found: LinkContext | null = null;
	let match: RegExpExecArray | null;
	while ((match = openings.exec(source)) !== null) {
		const start = match.index;
		if (start > to || (from !== to && start === to)) break;
		let backslashes = 0;
		for (let index = start - 1; source[index] === '\\'; index -= 1) backslashes += 1;
		if (backslashes % 2 === 1) continue;
		if (match[0].startsWith('`')) {
			const end = source.indexOf(match[0], openings.lastIndex);
			if (end >= 0) openings.lastIndex = end + match[0].length;
			continue;
		}
		const embedded = match[0].startsWith('!');
		const open = embedded ? start + 1 : start;
		let link: LinkContext;
		if (source.startsWith('[[', open)) {
			const end = source.indexOf(']]', open + 2);
			if (end < 0) continue;
			const inner = source.slice(open + 2, end);
			if (inner.includes('[') || inner.includes(']') || inner.includes('\n')) continue;
			const pipe = inner.indexOf('|');
			const target = pipe < 0 ? inner : inner.slice(0, pipe);
			link = { from: start, to: end + 2, mode: 'page', target, text: pipe < 0 ? target : inner.slice(pipe + 1) };
		} else {
			const labelEnd = closingDelimiter(source, open, '[', ']');
			if (labelEnd < 0 || source[labelEnd + 1] !== '(') continue;
			const end = closingDelimiter(source, labelEnd + 1, '(', ')');
			if (end < 0) continue;
			const destination = /^\s*(?:<([^<>\n]*)>|((?:\\.|[^\s])*?))(\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?\s*$/.exec(source.slice(labelEnd + 2, end));
			if (destination === null) continue;
			link = {
				from: start, to: end + 1, mode: 'url',
				target: destination[1] ?? destination[2] ?? '',
				text: source.slice(open + 1, labelEnd),
				suffix: destination[3] ?? '',
				angleTarget: destination[1] !== undefined,
			};
		}
		openings.lastIndex = link.to;
		const overlaps = from === to
			? from >= link.from && from < link.to
			: from < link.to && to > link.from;
		if (!embedded && overlaps) {
			if (found !== null) return null;
			found = link;
		}
	}
	return found;
}

function closingDelimiter(source: string, start: number, open: string, close: string): number {
	let depth = 1;
	for (let index = start + 1; index < source.length; index += 1) {
		const char = source[index];
		if (char === '\\') {
			index += 1;
			continue;
		}
		if (char === '\n') return -1;
		if (open === '(' && (char === '<' || ((char === '"' || char === "'") && /\s/.test(source[index - 1] ?? '')))) {
			const quote = char === '<' ? '>' : char;
			for (index += 1; index < source.length && source[index] !== quote; index += 1) {
				if (source[index] === '\\') index += 1;
			}
			continue;
		}
		if (char === open) depth += 1;
		if (char === close && --depth === 0) return index;
	}
	return -1;
}
