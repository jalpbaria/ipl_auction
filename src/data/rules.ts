export interface RuleItem {
  id: string;
  label: string;
  detail: string;
}

export interface RuleSection {
  id: string;
  code: string;
  title: string;
  summary: string;
  items: RuleItem[];
}

export const RULE_BOOK_VERSION = '2026.1';

export const RULE_SECTIONS: RuleSection[] = [
  {
    id: 'purse-and-squad',
    code: 'SEC 01',
    title: 'PURSE AND SQUAD',
    summary: 'Salary cap ceiling, roster boundaries, overseas quota, and mandatory role minimums.',
    items: [
      {
        id: 'starting-purse',
        label: 'Starting Purse',
        detail: 'Each team starts with a ₹120 Cr purse.',
      },
      {
        id: 'squad-size',
        label: 'Squad Size',
        detail: 'Squad size: minimum 11, maximum 15 players.',
      },
      {
        id: 'overseas-limit',
        label: 'Overseas Cap',
        detail: 'Maximum 5 overseas players.',
      },
      {
        id: 'role-composition',
        label: 'Minimum Composition',
        detail:
          'Minimum squad composition: 1 wicketkeeper, 3 batters, 3 bowlers, 1 all-rounder.',
      },
      {
        id: 'rtm-policy',
        label: 'RTM Cards',
        detail: 'No RTM cards.',
      },
    ],
  },
  {
    id: 'bidding',
    code: 'SEC 02',
    title: 'BIDDING',
    summary: 'Player presentation sets, automated bid increments, shot clock, and eligibility.',
    items: [
      {
        id: 'player-sets',
        label: 'Auction Sets',
        detail:
          'Players come up in sets (Legends, Marquee, Batsman, Bowler, Wicketkeeper, Allrounder), chosen by the host.',
      },
      {
        id: 'bid-increments',
        label: 'Bid Increments',
        detail:
          'Bids below ₹1 Cr increase in steps of ₹20 L; from ₹1 Cr upward the step is ₹25 L.',
      },
      {
        id: 'shot-clock',
        label: 'Bid Timer',
        detail: 'The bid timer is 20 seconds and resets on every new bid.',
      },
      {
        id: 'hammer-outcome',
        label: 'Hammer Resolution',
        detail:
          'When the timer ends the player is sold to the highest bidder, or goes unsold if there was no bid.',
      },
      {
        id: 'bid-eligibility',
        label: 'Bid Eligibility',
        detail:
          'A team cannot bid if the bid exceeds its purse or its squad is full.',
      },
    ],
  },
  {
    id: 'conduct-and-fair-play',
    code: 'SEC 03',
    title: 'CONDUCT AND FAIR PLAY',
    summary: 'Fullscreen lock enforcement, single-use credentials, and host authority.',
    items: [
      {
        id: 'fullscreen-lock',
        label: 'Fullscreen Enforcement',
        detail:
          'The auction room must stay in fullscreen. Pressing Esc or switching tabs removes the team immediately.',
      },
      {
        id: 're-entry-protocol',
        label: 'Host Re-Entry Approval',
        detail:
          'A removed team can only re-enter if the host approves, and re-entry uses a new one-time code.',
      },
      {
        id: 'single-use-codes',
        label: 'Single-Use Team Codes',
        detail:
          'Each team code is single-use. Do not share your screen or code with other teams.',
      },
      {
        id: 'host-decision',
        label: 'Final Authority',
        detail: "The host's decision is final.",
      },
    ],
  },
  {
    id: 'scoring',
    code: 'SEC 04',
    title: 'SCORING',
    summary: 'Final squad evaluation and tournament standings calculation.',
    items: [
      {
        id: 'leaderboard-formula',
        label: 'Leaderboard Formula',
        detail:
          'The winner is decided by a leaderboard formula based on the combined stats of the final squad (formula announced by the host).',
      },
    ],
  },
];
