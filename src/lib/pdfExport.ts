import { jsPDF } from 'jspdf';
import { BusinessProfile, ChatMessage, Checklist } from '../types/compliance';

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 5.5): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > 276) {
      doc.addPage();
      y = 18;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function exportChecklistToPdf(checklist: Checklist, profile: BusinessProfile | null): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Pakistan Business Compliance AI — Compliance Checklist', 14, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Checklist: ${checklist.title}`, 14, y);
  y += 5;
  if (profile) {
    doc.text(
      `Business Profile: ${profile.business_name || profile.business_type} (${profile.business_type}) · ${profile.city}, ${profile.province}`,
      14,
      y
    );
    y += 5;
  }
  doc.text(`Generated: ${new Date().toLocaleDateString('en-PK')}`, 14, y);
  y += 8;

  doc.setDrawColor(200, 210, 220);
  doc.line(14, y, 196, y);
  y += 6;

  for (const item of checklist.items) {
    if (y > 255) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const prefix = item.is_user_created ? '[Personal Task]' : `[${item.authority_name}]`;
    y = addWrappedText(doc, `${prefix} ${item.title} (${item.status.replace('_', ' ').toUpperCase()})`, 14, y, 180, 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    y = addWrappedText(doc, item.description, 16, y, 178, 4.8);

    if (item.citation_label) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      y = addWrappedText(doc, `Source: ${item.citation_label}`, 16, y, 178, 4.4);
    }
    if (item.notes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      y = addWrappedText(doc, `Notes: ${item.notes}`, 16, y, 178, 4.4);
    }
    y += 4;
  }

  if (y > 266) {
    doc.addPage();
    y = 18;
  }
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  addWrappedText(
    doc,
    'Disclaimer: Informational guidance grounded in indexed Pakistani government publications. Not legal, accounting, or tax advice.',
    14,
    y + 4,
    180,
    4
  );

  const safeFile = checklist.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
  doc.save(`${safeFile || 'compliance-checklist'}.pdf`);
}

export function exportConversationToPdf(title: string, messages: ChatMessage[]): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  y = addWrappedText(doc, `Pakistan Business Compliance AI — Research Export`, 14, y, 180, 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y = addWrappedText(doc, `Topic: ${title}`, 14, y, 180, 5);
  y = addWrappedText(doc, `Exported: ${new Date().toLocaleDateString('en-PK')}`, 14, y, 180, 5);
  y += 4;

  for (const msg of messages) {
    if (y > 260) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    y = addWrappedText(doc, msg.role === 'user' ? 'Question:' : 'Grounded Response:', 14, y, 180, 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const cleanText = msg.content.replace(/\*\*/g, '');
    y = addWrappedText(doc, cleanText, 14, y, 180, 4.8);

    if (msg.citations && msg.citations.length > 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      for (const c of msg.citations) {
        y = addWrappedText(
          doc,
          `Citation: ${c.authority_code} — ${c.document_title} (${c.section_reference}, Page ${c.page_number}) [${c.source_url}]`,
          16,
          y,
          176,
          4.2
        );
      }
    }
    y += 5;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  addWrappedText(
    doc,
    'Disclaimer: Informational assistance grounded in indexed official sources. Verify statutory deadlines directly with SECP, FBR, SRB, or qualified counsel.',
    14,
    Math.min(y + 4, 280),
    180,
    4
  );

  doc.save(`compliance-research-${Date.now()}.pdf`);
}

export function exportComparisonToPdf(comparison: {
  structures: string[];
  rows: Array<{ criterion: string; values: Array<{ structure: string; statement: string }> }>;
  important_limitations: string[];
}): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  y = addWrappedText(doc, `Structure Comparison: ${comparison.structures.join(' vs ')}`, 14, y, 180, 6);
  y += 4;

  for (const row of comparison.rows) {
    if (y > 255) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    y = addWrappedText(doc, row.criterion, 14, y, 180, 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    for (const val of row.values) {
      y = addWrappedText(doc, `• ${val.structure}: ${val.statement}`, 16, y, 176, 4.8);
    }
    y += 3;
  }

  if (comparison.important_limitations?.length) {
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    y = addWrappedText(doc, 'Important Limitations:', 14, y, 180, 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const lim of comparison.important_limitations) {
      y = addWrappedText(doc, `- ${lim}`, 16, y, 176, 4.5);
    }
  }

  doc.save(`structure-comparison-${Date.now()}.pdf`);
}
