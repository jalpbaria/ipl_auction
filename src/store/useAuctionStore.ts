import { create } from 'zustand';

export const RULES_ACCEPTED_STORAGE_KEY = 'ipl_rules_accepted';

function readInitialAccepted(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(RULES_ACCEPTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface AuctionStoreState {
  rulesAccepted: boolean;
  ruleBookOpen: boolean;
  openRuleBook: () => void;
  closeRuleBook: () => void;
  acceptRules: () => void;
}

export const useAuctionStore = create<AuctionStoreState>((set) => ({
  rulesAccepted: readInitialAccepted(),
  ruleBookOpen: false,
  openRuleBook: () => set({ ruleBookOpen: true }),
  closeRuleBook: () => set({ ruleBookOpen: false }),
  acceptRules: () => {
    try {
      window.localStorage.setItem(RULES_ACCEPTED_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage write failure in restricted contexts
    }
    set({ rulesAccepted: true, ruleBookOpen: false });
  },
}));
