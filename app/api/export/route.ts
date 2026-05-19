import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

interface ReceiptRow {
  filename: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const receipts: ReceiptRow[] = body.receipts ?? [];

    if (!Array.isArray(receipts) || receipts.length === 0) {
      return NextResponse.json({ error: 'No receipts to export' }, { status: 400 });
    }

    const workbook = XLSX.utils.book_new();

    // Build rows: header + data + totals
    const header = ['File', 'Date', 'Merchant', 'Category', 'Amount', 'Currency'];

    const dataRows = receipts.map((r) => [
      r.filename,
      r.date,
      r.merchant,
      r.category,
      r.amount,
      r.currency,
    ]);

    const total = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalRow = ['', '', '', 'TOTAL', total, ''];

    const allRows = [header, ...dataRows, [], totalRow];

    const worksheet = XLSX.utils.aoa_to_sheet(allRows);

    // Column widths
    worksheet['!cols'] = [
      { wch: 28 }, // File
      { wch: 13 }, // Date
      { wch: 28 }, // Merchant
      { wch: 20 }, // Category
      { wch: 12 }, // Amount
      { wch: 10 }, // Currency
    ];

    // Freeze the header row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expense Claims');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="expense-claims.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[export]', err);
    const message = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
