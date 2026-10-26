export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] as const;

export function isImageExtension(extension: string): boolean {
	return IMAGE_EXTENSIONS.includes(extension.toLowerCase() as typeof IMAGE_EXTENSIONS[number]);
}

export function isImagePath(path: string): boolean {
	const dot = path.lastIndexOf('.');
	return dot >= 0 && isImageExtension(path.slice(dot + 1));
}

export function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
	return file.type.startsWith('image/') ||
		((file.type === '' || file.type === 'application/octet-stream') && isImagePath(file.name));
}
