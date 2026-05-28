import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType, Header, PageNumber } from "docx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function isSeparatorLine(line?: string): boolean {
  const t = line?.trim();
  if (!t) return false;
  // GFM separator: contains only pipes, dashes, colons, and spaces
  // It must contain at least one dash and at least one pipe
  return t.replace(/[|\s\-:]/g, "") === "" && t.includes("-") && t.includes("|");
}

function parseMarkdownTable(lines: string[], startIndex: number) {
  const tableData: string[][] = [];
  let i = startIndex;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed.includes("|")) break;
    
    // Skip separator line
    if (isSeparatorLine(trimmed)) {
      i++;
      continue;
    }

    let row = trimmed
      .split("|")
      .map((cell) => cell.trim());
    
    // Markdown table rows usually start and end with |
    if (row.length > 0 && row[0] === "") row.shift();
    if (row.length > 0 && row[row.length - 1] === "") row.pop();

    if (row.length > 0) {
      tableData.push(row);
    }
    i++;
  }

  return { tableData, nextIndex: i };
}

function processMarkdownInline(text: string): TextRun[] {
  // Remove math delimiters first but keep content
  let processed = text.replace(/\$\$(.*?)\$\$/g, "$1");
  processed = processed.replace(/\$(.*?)\$/g, "$1");

  // Basic Bold/Italic parsing
  // This is a simplified regex-based approach
  const parts: TextRun[] = [];
  let currentText = processed;

  // regex for **bold** or *italic*
  const combinedRegex = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/g;
  let match;
  let lastIndex = 0;

  while ((match = combinedRegex.exec(processed)) !== null) {
    // Add plain text before match
    if (match.index > lastIndex) {
      parts.push(new TextRun({ text: processed.substring(lastIndex, match.index) }));
    }

    const token = match[0];
    if (token.startsWith("***") && token.endsWith("***")) {
      parts.push(new TextRun({ text: token.substring(3, token.length - 3), bold: true, italics: true }));
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(new TextRun({ text: token.substring(2, token.length - 2), bold: true }));
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(new TextRun({ text: token.substring(1, token.length - 1), italics: true }));
    }

    lastIndex = combinedRegex.lastIndex;
  }

  if (lastIndex < processed.length) {
    parts.push(new TextRun({ text: processed.substring(lastIndex) }));
  }

  if (parts.length === 0 && processed.length > 0) {
    parts.push(new TextRun({ text: processed }));
  }

  return parts;
}

export async function exportToWord(text: string, filename: string = "transcribed_notes.docx") {
  const lines = text.split("\n");
  const children: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Table detection
    const isTableStart = line.includes("|") && (
      isSeparatorLine(lines[i + 1]) || 
      (lines[i + 1]?.trim() === "" && isSeparatorLine(lines[i + 2]))
    );

    if (isTableStart) {
      const { tableData, nextIndex } = parseMarkdownTable(lines, i);
      if (tableData.length > 0) {
        const docxTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableData.map((row) => new TableRow({
            children: row.map((cell) => new TableCell({
              children: [new Paragraph({ children: processMarkdownInline(cell) })],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
              }
            }))
          }))
        });
        children.push(docxTable);
        children.push(new Paragraph({})); // Spacer
      }
      i = nextIndex - 1;
    } else if (line.startsWith("# ")) {
      children.push(new Paragraph({ 
        text: line.substring(2), 
        heading: HeadingLevel.HEADING_1 
      }));
    } else if (line.startsWith("## ")) {
      children.push(new Paragraph({ 
        text: line.substring(3), 
        heading: HeadingLevel.HEADING_2 
      }));
    } else if (line.startsWith("### ")) {
      children.push(new Paragraph({ 
        text: line.substring(4), 
        heading: HeadingLevel.HEADING_3 
      }));
    } else {
      children.push(new Paragraph({ children: processMarkdownInline(lines[i]) }));
    }
  }

  const doc = new Document({
    sections: [{
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  children: ["Page ", PageNumber.CURRENT],
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      properties: {},
      children
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportToPDF(text: string, filename: string = "transcribed_notes.pdf") {
  const doc = new jsPDF();
  const lines = text.split("\n");
  let currentY = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxLineWidth = pageWidth - margin * 2;

  function cleanText(t: string): string {
    return t.replace(/\$\$(.*?)\$\$/g, "$1")
            .replace(/\$(.*?)\$/g, "$1")
            .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .replace(/\*(.*?)\*/g, "$1")
            .replace(/^#+ /g, "");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableStart = line.includes("|") && (
      isSeparatorLine(lines[i + 1]) || 
      (lines[i + 1]?.trim() === "" && isSeparatorLine(lines[i + 2]))
    );

    if (isTableStart) {
      const { tableData, nextIndex } = parseMarkdownTable(lines, i);
      if (tableData.length > 0) {
        autoTable(doc, {
          startY: currentY,
          head: [tableData[0].map(cleanText)],
          body: tableData.slice(1).map(row => row.map(cleanText)),
          margin: { left: margin, right: margin },
          theme: 'grid',
          styles: { fontSize: 10 },
          headStyles: { fillColor: [59, 130, 246] }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }
      i = nextIndex - 1;
    } else {
      const isHeader = line.startsWith("#");
      if (isHeader) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(line.startsWith("##") ? 14 : 16);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
      }

      const txt = cleanText(lines[i]);
      if (!txt && !lines[i]) {
        currentY += 5; // Empty line
      } else {
        const wrappedLines = doc.splitTextToSize(txt, maxLineWidth);
        doc.text(wrappedLines, margin, currentY);
        currentY += (wrappedLines.length * 7);
      }
      
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;
      }
    }
  }

  doc.save(filename);
}
