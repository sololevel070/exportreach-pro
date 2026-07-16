export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth';

// Parse an uploaded CSV/XLSX into { headers, rows } so the client can map +
// import in small batches (with a progress bar) instead of one huge insert.
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    let rows: string[][] = [];

    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());
      rows = lines.map((line) => {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        return values;
      });
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      rows = (sheetData as any[]).map((row: any[]) => row.map((cell: any) => String(cell ?? '')));
    } else {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'File must have a header row and at least one data row' },
        { status: 400 }
      );
    }

    const headers = rows[0].map((h) => h.trim());
    const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell !== '' && cell !== undefined));

    return NextResponse.json({ headers, rows: dataRows, total: dataRows.length });
  } catch (error) {
    console.error('Error parsing import file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
