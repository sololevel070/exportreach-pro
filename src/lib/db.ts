import { insforge, TEMP_USER_ID } from './insforge';

export type DbProvider = 'insforge' | 'electron';

let currentProvider: DbProvider = 'insforge';

export function setDatabaseProvider(provider: DbProvider): void {
  currentProvider = provider;
}

export function getDatabaseProvider(): DbProvider {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return 'electron';
  }
  return currentProvider;
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

interface QueryOptions {
  eq?: Record<string, unknown>;
  like?: Record<string, string>;
  order?: string;
  ascending?: boolean;
  range?: [number, number];
  limit?: number;
}

export async function query<T = unknown>(
  table: string,
  options: QueryOptions = {}
): Promise<{ data: T[]; error: string | null; count?: number }> {
  const provider = getDatabaseProvider();

  if (provider === 'electron' && window.electronAPI) {
    try {
      const result = await window.electronAPI.dbQuery(table, options.eq);
      return { data: result.data as T[], error: result.error, count: result.data.length };
    } catch (error) {
      return { data: [], error: String(error), count: 0 };
    }
  }

  try {
    let query = insforge.database.from(table).select('*', { count: 'exact' });

    if (options.eq) {
      Object.entries(options.eq).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    if (options.order) {
      query = query.order(options.order, { ascending: options.ascending ?? true });
    }

    if (options.range) {
      query = query.range(options.range[0], options.range[1]);
    } else if (options.limit) {
      query = query.limit(options.limit);
    }

    const result = await query;

    if (result.error) {
      return { data: [], error: result.error.message, count: 0 };
    }

    return {
      data: result.data as T[],
      error: null,
      count: result.count || result.data.length,
    };
  } catch (error) {
    return { data: [], error: String(error), count: 0 };
  }
}

export async function insert<T = unknown>(
  table: string,
  data: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const provider = getDatabaseProvider();

  if (provider === 'electron' && window.electronAPI) {
    try {
      const result = await window.electronAPI.dbInsert(table, data);
      return { data: result.data as T, error: result.error };
    } catch (error) {
      return { data: null, error: String(error) };
    }
  }

  try {
    const result = await insforge.database.from(table).insert([data]).select().single();

    if (result.error) {
      return { data: null, error: result.error.message };
    }

    return { data: result.data as T, error: null };
  } catch (error) {
    return { data: null, error: String(error) };
  }
}

export async function update(
  table: string,
  filters: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  const provider = getDatabaseProvider();

  if (provider === 'electron' && window.electronAPI) {
    const id = filters.id as string;
    if (!id) return { success: false, error: 'ID required' };

    try {
      const result = await window.electronAPI.dbUpdate(table, id, data);
      return { success: result.success, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  try {
    let query = insforge.database.from(table).update(data);

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const result = await query;

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function remove(
  table: string,
  filters: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  const provider = getDatabaseProvider();

  if (provider === 'electron' && window.electronAPI) {
    const id = filters.id as string;
    if (!id) return { success: false, error: 'ID required' };

    try {
      const result = await window.electronAPI.dbDelete(table, id);
      return { success: result.success, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  try {
    let query = insforge.database.from(table).delete();

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const result = await query;

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}