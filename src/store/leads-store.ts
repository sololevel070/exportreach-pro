import { create } from 'zustand';

export interface Lead {
  id: string;
  userId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  country?: string;
  website?: string;
  linkedIn?: string;
  productInterest?: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

interface LeadsState {
  leads: Lead[];
  selectedLeads: string[];
  isLoading: boolean;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  searchQuery: string;
  statusFilter: string;

  setLeads: (leads: Lead[]) => void;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, data: Partial<Lead>) => void;
  removeLead: (id: string) => void;
  toggleSelectLead: (id: string) => void;
  selectAllLeads: () => void;
  deselectAllLeads: () => void;
  setPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string) => void;
  fetchLeads: () => Promise<void>;
}

export const useLeadsStore = create<LeadsState>((set, get) => ({
  leads: [],
  selectedLeads: [],
  isLoading: false,
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
  searchQuery: '',
  statusFilter: '',

  setLeads: (leads) => set({ leads }),

  addLead: (lead) => set((state) => ({ leads: [lead, ...state.leads] })),

  updateLead: (id, data) =>
    set((state) => ({
      leads: state.leads.map((lead) => (lead.id === id ? { ...lead, ...data } : lead)),
    })),

  removeLead: (id) =>
    set((state) => ({
      leads: state.leads.filter((lead) => lead.id !== id),
      selectedLeads: state.selectedLeads.filter((lid) => lid !== id),
    })),

  toggleSelectLead: (id) =>
    set((state) => ({
      selectedLeads: state.selectedLeads.includes(id)
        ? state.selectedLeads.filter((lid) => lid !== id)
        : [...state.selectedLeads, id],
    })),

  selectAllLeads: () =>
    set((state) => ({
      selectedLeads: state.leads.map((lead) => lead.id),
    })),

  deselectAllLeads: () => set({ selectedLeads: [] }),

  setPage: (page) => set({ currentPage: page }),

  setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }),

  setStatusFilter: (status) => set({ statusFilter: status, currentPage: 1 }),

  fetchLeads: async () => {
    const { currentPage, searchQuery, statusFilter } = get();
    set({ isLoading: true });

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });

      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/leads?${params}`);

      if (response.ok) {
        const data = await response.json();
        set({
          leads: data.leads,
          totalPages: data.pagination.pages,
          totalCount: data.pagination.total,
        });
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      set({ isLoading: false });
    }
  },
}));