import { insforge } from './insforge';

/** The lead columns that physically exist on the `leads` table. */
export const BUILTIN_LEAD_COLUMNS = [
  'company_name',
  'contact_name',
  'email',
  'country',
  'website',
  'linked_in',
  'product_interest',
] as const;

/** Keys an admin cannot use for a custom field (collide with real columns / internals). */
export const RESERVED_FIELD_KEYS = new Set<string>([
  ...BUILTIN_LEAD_COLUMNS,
  'id',
  'user_id',
  'status',
  'source',
  'custom_fields',
  'created_at',
  'updated_at',
  'phone',
]);

export const FIELD_TYPES = ['text', 'number', 'date', 'url', 'email'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface LeadFieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  sortOrder: number;
}

/** Turn a human label into a safe, stable field key. */
export function slugifyKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Fetch a user's custom lead-field definitions, ordered for display. */
export async function getLeadFieldDefs(userId: string): Promise<LeadFieldDef[]> {
  const { data } = await insforge.database
    .from('lead_field_defs')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  return (data || []).map((d: any) => ({
    id: d.id,
    key: d.key,
    label: d.label,
    type: d.type,
    sortOrder: d.sort_order ?? 0,
  }));
}
