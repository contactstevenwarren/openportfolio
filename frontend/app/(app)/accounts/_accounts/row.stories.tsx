import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Row } from "./row";
import { seedAccounts, seedInstitutions } from "./seed";

const meta: Meta<typeof Row> = {
  title: "Accounts/Row",
  component: Row,
  parameters: { layout: "padded" },
  args: {
    isFileDragging: false,
    onFileDragEnd: () => {},
    isFirstInGroup: true,
    isLastInGroup: true,
    institutions: seedInstitutions,
  },
};
export default meta;
type Story = StoryObj<typeof Row>;

function acct(id: number) {
  return seedAccounts.find((a) => a.id === id)!;
}

function inst(institutionId: number) {
  return seedInstitutions.find((i) => i.id === institutionId)!;
}

// ── Stories ───────────────────────────────────────────────────────────────────

const vanguardBrokerage = acct(1);
const vanguard401k      = acct(2);
const vanguardPrivate   = acct(3);
const fidelityChecking  = acct(4);
const fidelityRoth      = acct(6);
const coinbaseCrypto    = acct(7);
const vanguardLegacy    = acct(8);

export const Default: Story = {
  args: {
    account: vanguardBrokerage,
    institution: inst(vanguardBrokerage.institution_id!),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Collapsed: Story = {
  args: {
    account: vanguardBrokerage,
    institution: inst(vanguardBrokerage.institution_id!),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Expanded: Story = {
  args: {
    account: vanguardBrokerage,
    institution: inst(vanguardBrokerage.institution_id!),
    isExpanded: true,
    onToggle: () => {},
  },
};

export const Stale: Story = {
  args: {
    account: coinbaseCrypto,
    institution: inst(coinbaseCrypto.institution_id!),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Aging: Story = {
  args: {
    account: fidelityChecking,
    institution: inst(fidelityChecking.institution_id!),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Fresh: Story = {
  args: {
    account: vanguard401k,
    institution: inst(vanguard401k.institution_id!),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Manual: Story = {
  args: {
    account: vanguardPrivate,
    institution: inst(vanguardPrivate.institution_id!),
    isExpanded: false,
    onToggle: () => {},
  },
};

export const Archived: Story = {
  args: {
    account: vanguardLegacy,
    institution: inst(vanguardLegacy.institution_id!),
    isExpanded: true,
    onToggle: () => {},
  },
};

export const ZeroPositions: Story = {
  args: {
    account: fidelityRoth,
    institution: inst(fidelityRoth.institution_id!),
    isExpanded: true,
    onToggle: () => {},
  },
};
