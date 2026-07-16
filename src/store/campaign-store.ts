import { create } from 'zustand';

export interface Campaign {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface CampaignState {
  campaigns: Campaign[];
  currentCampaign: Campaign | null;
  isLoading: boolean;
  fetchCampaigns: () => Promise<void>;
  createCampaign: (data: Partial<Campaign>) => Promise<Campaign | null>;
  updateCampaign: (id: string, data: Partial<Campaign>) => Promise<boolean>;
  deleteCampaign: (id: string) => Promise<boolean>;
  sendCampaign: (id: string) => Promise<boolean>;
  setCurrentCampaign: (campaign: Campaign | null) => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  currentCampaign: null,
  isLoading: false,

  fetchCampaigns: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/campaigns');
      if (response.ok) {
        const data = await response.json();
        set({ campaigns: Array.isArray(data) ? data : data.campaigns || [] });
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createCampaign: async (data) => {
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const newCampaign = await response.json();
        set((state) => ({
          campaigns: [newCampaign, ...state.campaigns],
        }));
        return newCampaign;
      }
    } catch (error) {
      console.error('Failed to create campaign:', error);
    }
    return null;
  },

  updateCampaign: async (id, data) => {
    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const updated = await response.json();
        set((state) => ({
          campaigns: state.campaigns.map((c) => (c.id === id ? { ...c, ...updated } : c)),
        }));
        return true;
      }
    } catch (error) {
      console.error('Failed to update campaign:', error);
    }
    return false;
  },

  deleteCampaign: async (id) => {
    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        set((state) => ({
          campaigns: state.campaigns.filter((c) => c.id !== id),
        }));
        return true;
      }
    } catch (error) {
      console.error('Failed to delete campaign:', error);
    }
    return false;
  },

  sendCampaign: async (id) => {
    try {
      const response = await fetch(`/api/campaigns/${id}/send`, {
        method: 'POST',
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to send campaign:', error);
      return false;
    }
  },

  setCurrentCampaign: (campaign) => set({ currentCampaign: campaign }),
}));