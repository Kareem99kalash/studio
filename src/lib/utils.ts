import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseMarkdownTable(markdown: string): Record<string, string>[] {
  const lines = markdown.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  const headerLine = lines[0];
  const separatorLine = lines[1];
  const dataLines = lines.slice(2);

  if (!headerLine || !separatorLine.includes('|') || !separatorLine.includes('-')) {
    return [];
  }
  
  const headers = headerLine.split('|').map(h => h.trim());
  
  return dataLines.map(line => {
    const values = line.split('|').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if(header) {
        row[header] = values[index];
      }
    });
    return row;
  });
}
