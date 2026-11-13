import { Placeholder } from "../components/Placeholder";

export function Finance() {
  return (
    <Placeholder
      title="Finance"
      milestone="M9"
      summary="Track cash, margin and runway on the way to a full quarterly P&L, cash-flow statement and balance sheet."
      plans={[
        "Revenue, COGS, gross margin, R&D and SG&A",
        "Cash flow, receivables and inventory holding costs",
        "Loans, investors and bankruptcy warnings",
        "Reconciled ledger: cash change equals the sum of entries",
      ]}
    />
  );
}
