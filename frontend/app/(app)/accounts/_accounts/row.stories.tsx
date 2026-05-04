import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Row } from "./row";
import {
  mockAccounts,
  mockInstitutions,
  mockSnapshots,
  mockPositions,
  getPositionsForAccount,
} from "./mocks";

const meta: Meta<typeof Row> = {
  title: "Accounts/Row",
  component: Row,
  parameters: { layout: "padded" },
  args: {
    // Default these new props for all stories so existing stories don't break.
    isFileDragging: false,
    onFileDragEnd: () => {},
    isFirstInGroup: true,
    isLastInGroup: true,
    institutions: mockInstitutions,
  },
};
export default meta;
type Story = StoryObj<typeof Row>;

function posFor(accountId: string) {
  return getPositionsForAccount(accountId, mockSnapshots, mockPositions);
}

function account(id: string) {
  return mockAccounts.find((a) => a.id === id)!;
}

function institution(institutionId: string) {
  return mockInstitutions.find((i) => i.id === institutionId)!;
}

// ── Stories ───────────────────────────────────────────────────────────────────

const vanguardBrokerage = account("acct-vanguard-brokerage");
const vanguard401k = account("acct-vanguard-401k");
const vanguardPrivate = account("acct-vanguard-private");
const fidelityChecking = account("acct-fidelity-checking");
const fidelityRoth = account("acct-fidelity-roth");
const coinbaseCrypto = account("acct-coinbase-crypto");
const vanguardLegacy = account("acct-vanguard-legacy");

export const Default: Story = {
  args: {
    account: vanguardBrokerage,
    institution: institution(vanguardBrokerage.institutionId),
    positions: posFor("acct-vanguard-brokerage"),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Collapsed: Story = {
  args: {
    account: vanguardBrokerage,
    institution: institution(vanguardBrokerage.institutionId),
    positions: posFor("acct-vanguard-brokerage"),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Expanded: Story = {
  args: {
    account: vanguardBrokerage,
    institution: institution(vanguardBrokerage.institutionId),
    positions: posFor("acct-vanguard-brokerage"),
    isExpanded: true,
    onToggle: () => {},
  },
};

export const Stale: Story = {
  args: {
    account: coinbaseCrypto,
    institution: institution(coinbaseCrypto.institutionId),
    positions: posFor("acct-coinbase-crypto"),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Aging: Story = {
  args: {
    account: fidelityChecking,
    institution: institution(fidelityChecking.institutionId),
    positions: posFor("acct-fidelity-checking"),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Fresh: Story = {
  args: {
    account: vanguard401k,
    institution: institution(vanguard401k.institutionId),
    positions: posFor("acct-vanguard-401k"),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Manual: Story = {
  args: {
    account: vanguardPrivate,
    institution: institution(vanguardPrivate.institutionId),
    positions: posFor("acct-vanguard-private"),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Archived: Story = {
  args: {
    account: vanguardLegacy,
    institution: institution(vanguardLegacy.institutionId),
    positions: posFor("acct-vanguard-legacy"),
    isExpanded: true,
    onToggle: () => {},
  },
};

export const ZeroPositions: Story = {
  args: {
    account: fidelityRoth,
    institution: institution(fidelityRoth.institutionId),
    positions: posFor("acct-fidelity-roth"),
    isExpanded: true,
    onToggle: () => {},
  },
};
