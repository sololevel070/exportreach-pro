export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { BUILTIN_LEAD_COLUMNS, getLeadFieldDefs } from '@/lib/lead-fields';

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
      const lines = text.split('\n').filter(line => line.trim());
      rows = lines.map(line => {
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
      rows = sheetData.map((row: any[]) => row.map((cell: any) => String(cell ?? '')));
    } else {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    if (rows.length < 2) {
      return NextResponse.json({ error: 'File must have a header row and at least one data row' }, { status: 400 });
    }

    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1).filter(row => row.some(cell => cell !== '' && cell !== undefined));

    const mappingStr = formData.get('mapping') as string;
    let headerMapping: Record<string, string> = {};
    if (mappingStr) {
      try {
        const clientMapping = JSON.parse(mappingStr);
        Object.entries(clientMapping).forEach(([dbField, sheetHeader]) => {
          if (sheetHeader && typeof sheetHeader === 'string') {
            headerMapping[sheetHeader.toLowerCase().trim()] = dbField;
          }
        });
      } catch (e) {
        console.error('Error parsing custom mapping:', e);
      }
    }

    if (Object.keys(headerMapping).length === 0) {
      // Direct column mapping - fallback match with headers
      const defaultMapping: Record<string, string> = {
        'company name': 'company_name',
        'company_name': 'company_name',
        'company': 'company_name',
        'contact person': 'contact_name',
        'contact_name': 'contact_name',
        'contact name': 'contact_name',
        'contact': 'contact_name',
        'email': 'email',
        'email address': 'email',
        'email_address': 'email',
        'phone': 'phone',
        'phone number': 'phone',
        'phone_number': 'phone',
        'country': 'country',
        'website': 'website',
        'website url': 'website',
        'linkedin': 'linked_in',
        'linked_in': 'linked_in',
        'product description': 'product_interest',
        'product_interest': 'product_interest',
        'hs code': 'product_interest',
        'hscode': 'product_interest',
      };
      headerMapping = defaultMapping;
    }

    // Built-in columns go on the row; everything else (admin-defined custom
    // fields, or legacy keys like phone) goes into the custom_fields JSONB.
    const builtinSet = new Set<string>(BUILTIN_LEAD_COLUMNS as readonly string[]);
    const customDefs = await getLeadFieldDefs(userId);
    const customKeys = new Set(customDefs.map((d) => d.key));

    const leads = [];
    for (const row of dataRows) {
      const lead: any = {
        user_id: userId,
        source: 'import',
        status: 'pending',
      };
      const customFields: Record<string, string> = {};

      headers.forEach((header, index) => {
        const normalizedHeader = header.toLowerCase().trim();
        const dbField = headerMapping[normalizedHeader];

        if (!dbField) return;

        const raw = row[index];
        const value = raw === undefined || raw === null ? '' : String(raw).trim();

        if (builtinSet.has(dbField)) {
          lead[dbField] = value;
        } else if (customKeys.has(dbField)) {
          // Only persist values for fields the admin actually defined.
          if (value !== '') customFields[dbField] = value;
        }
      });

      lead.custom_fields = customFields;


      // Accept leads that have at least one built-in or custom field populated
      const hasAnyField =
        lead.company_name || lead.contact_name || lead.email || lead.country ||
        lead.website || lead.linked_in || lead.product_interest ||
        Object.keys(customFields).length > 0;
      if (hasAnyField) {
        // Only check for duplicates if email exists
        if (lead.email) {
          const { data: existingLead } = await insforge.database
            .from('leads')
            .select('id')
            .eq('email', lead.email)
            .eq('user_id', userId)
            .single();

          if (existingLead) {
            continue; // Skip this lead, duplicate email
          }
        }
        leads.push(lead);
      }
    }

    if (leads.length === 0) {
      return NextResponse.json(
        { error: 'No valid leads found in file. Please use the sample Excel template with columns: Company Name, Contact Person, Email, Phone, Country.' },
        { status: 400 }
      );
    }

    const { error } = await insforge.database
      .from('leads')
      .insert(leads);

    if (error) {
      console.error('Error importing leads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Successfully imported ${leads.length} leads`,
      count: leads.length,
    });
  } catch (error) {
    console.error('Error importing leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
