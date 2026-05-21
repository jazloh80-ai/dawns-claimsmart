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

const COMPANY = 'TAHAN CAPITAL MANAGEMENT PTE. LTD.';
const PAYEE = 'Dawn Koh';
const CODE_EXPENSE = 61340;
const CODE_TRANSPORT = 61700;
const NUM_FMT = '#,##0.00';
const DATE_FMT = 'DD MMM YYYY';

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function calcGst(amount: number, isTransport: boolean) {
  if (isTransport) return { ex: amount, tax: 0, total: amount };
  const ex = r2(amount / 1.09);
  const tax = r2(amount - ex);
  return { ex, tax, total: r2(ex + tax) };
}

function toExcelDate(d: Date): number {
  return Math.floor((d.getTime() - new Date(Date.UTC(1899, 11, 30)).getTime()) / 86400000);
}

function inferMonthYear(receipts: ReceiptRow[]): string {
  for (const r of receipts) {
    const d = r.date ? new Date(r.date) : null;
    if (d && !isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    }
  }
  return new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

type WS = XLSX.WorkSheet;

function sc(ws: WS, r: number, c: number, v: string): void {
  ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v };
}

function nc(ws: WS, r: number, c: number, v: number, z?: string): void {
  const cell: XLSX.CellObject = { t: 'n', v };
  if (z) cell.z = z;
  ws[XLSX.utils.encode_cell({ r, c })] = cell;
}

function buildMainSheet(regular: ReceiptRow[], transport: ReceiptRow[], my: string, ds: number): WS {
  const ws: WS = {};

  // Company header block
  sc(ws, 0, 0, ' ');
  sc(ws, 1, 0, COMPANY);
  sc(ws, 2, 3, 'Reimbursement Voucher');

  // Payee and date (row 5, 0-indexed)
  sc(ws, 5, 0, `Payable to  :         ${PAYEE}`);
  sc(ws, 5, 2, 'Date  :');
  nc(ws, 5, 3, ds, DATE_FMT);

  // Multi-row column headers
  sc(ws, 8, 2, 'Amount ');
  sc(ws, 8, 3, '9%');
  sc(ws, 8, 4, 'Total Amount');
  sc(ws, 9, 2, '( Ex GST )');
  sc(ws, 9, 3, 'GST');
  sc(ws, 9, 4, '( Inc GST )');
  sc(ws, 10, 0, 'Description');
  sc(ws, 10, 1, 'Charged To');
  sc(ws, 10, 2, 'SGD');
  sc(ws, 10, 3, 'SGD');
  sc(ws, 10, 4, 'SGD');
  sc(ws, 11, 0, `Being reimbursement of :  ${my}`);

  // Data rows start at row index 13 (Excel row 14), blank row between each item
  let row = 13;
  let running = 0;

  for (let i = 0; i < regular.length; i++) {
    const { ex, tax, total } = calcGst(regular[i].amount, false);
    running = r2(running + total);
    const desc = `${i + 1}. ${regular[i].merchant}${regular[i].date ? ' ' + regular[i].date : ''}`;
    sc(ws, row, 0, desc);
    nc(ws, row, 1, CODE_EXPENSE);
    nc(ws, row, 2, ex, NUM_FMT);
    nc(ws, row, 3, tax, NUM_FMT);
    nc(ws, row, 4, total, NUM_FMT);
    nc(ws, row, 5, running, NUM_FMT);
    row += 2;
  }

  // Transport section separator
  row += 1;
  sc(ws, row, 0, 'TRANSPORT');
  row++;

  if (transport.length > 0) {
    const tTotal = r2(transport.reduce((acc, r) => acc + r.amount, 0));
    running = r2(running + tTotal);
    const first = regular.length + 1;
    const last = regular.length + transport.length;
    const desc = first === last
      ? `${first}. Transport claims - refer breakdown attached`
      : `${first}-${last}. Transport claims - refer breakdown attached`;
    sc(ws, row, 0, desc);
    nc(ws, row, 1, CODE_TRANSPORT);
    nc(ws, row, 2, tTotal, NUM_FMT);
    nc(ws, row, 3, 0, NUM_FMT);
    nc(ws, row, 4, tTotal, NUM_FMT);
    nc(ws, row, 5, running, NUM_FMT);
    row++;
  }

  row += 4;

  // Grand total row
  sc(ws, row, 0, 'Total  in Singapore Dollars');
  nc(ws, row, 4, r2(running), NUM_FMT);
  row += 3;

  // Amount paid footer
  sc(ws, row, 0, `Amount Paid  :  S$${r2(running)}`);
  sc(ws, row, 3, 'Cheque No.  : Direct Credit');
  row += 3;

  // Signature line
  sc(ws, row, 0, 'Submitted & Received By  :');
  sc(ws, row, 1, 'Authorized & Verified By  :');
  row += 2;

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 13 } });
  ws['!cols'] = [
    { wch: 52 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
  ];

  return ws;
}

function buildCabsSheet(transport: ReceiptRow[], nRegular: number, my: string): WS {
  const ws: WS = {};

  // Sheet title
  sc(ws, 0, 0, 'Cabs fares');

  // Multi-row column headers (starts at row 3, 0-indexed)
  sc(ws, 3, 2, 'Amount ');
  sc(ws, 3, 3, '9%');
  sc(ws, 3, 4, 'Total Amount');
  sc(ws, 4, 2, '( Ex GST )');
  sc(ws, 4, 3, 'GST');
  sc(ws, 4, 4, '( Inc GST )');
  sc(ws, 5, 0, 'Description');
  sc(ws, 5, 1, 'Charged To');
  sc(ws, 5, 2, 'SGD');
  sc(ws, 5, 3, 'SGD');
  sc(ws, 5, 4, 'SGD');
  sc(ws, 6, 0, `Being reimbursement of :  ${my}`);

  // Data rows start at row index 8 (Excel row 9), blank row between each item
  let row = 8;
  let running = 0;

  for (let i = 0; i < transport.length; i++) {
    const r = transport[i];
    const { ex, tax, total } = calcGst(r.amount, true);
    running = r2(running + total);
    const itemNo = nRegular + i + 1;
    const desc = `${itemNo}. ${r.merchant}${r.date ? ' ' + r.date : ''}`;
    sc(ws, row, 0, desc);
    nc(ws, row, 1, CODE_TRANSPORT);
    nc(ws, row, 2, ex, NUM_FMT);
    nc(ws, row, 3, tax, NUM_FMT);
    nc(ws, row, 4, total, NUM_FMT);
    nc(ws, row, 5, running, NUM_FMT);
    row += 2;
  }

  row += 3;

  // Total row
  sc(ws, row, 0, 'Total  in Singapore Dollars');
  nc(ws, row, 4, r2(running), NUM_FMT);
  row += 3;

  // Amount paid footer
  sc(ws, row, 0, `Amount Paid  :  S$${r2(running)}`);
  sc(ws, row, 4, 'Direct Credit');
  row += 3;

  // Signature line
  sc(ws, row, 0, 'Submitted & Received By  :');
  sc(ws, row, 1, 'Authorized & Verified By  :');
  row += 2;

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 13 } });
  ws['!cols'] = [
    { wch: 52 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
  ];

  return ws;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const receipts: ReceiptRow[] = body.receipts ?? [];

    if (!Array.isArray(receipts) || receipts.length === 0) {
      return NextResponse.json({ error: 'No receipts to export' }, { status: 400 });
    }

    const isTransport = (r: ReceiptRow) => r.category === 'Transportation';
    const regular = receipts.filter((r) => !isTransport(r));
    const transport = receipts.filter(isTransport);
    const my = inferMonthYear(receipts);
    const ds = toExcelDate(new Date());

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildMainSheet(regular, transport, my, ds), 'Blank ');
    if (transport.length > 0) {
      XLSX.utils.book_append_sheet(wb, buildCabsSheet(transport, regular.length, my), 'Cabs');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="reimbursement-voucher.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[export]', err);
    const message = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
