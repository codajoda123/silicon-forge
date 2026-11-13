import { Placeholder } from "../components/Placeholder";

export function Market() {
  return (
    <Placeholder
      title="Market & Sales"
      milestone="M9"
      summary="Sell chips into era-specific segments against competitors, using a logit demand model with a real outside option."
      plans={[
        "Segment sizes, weights and requirements by year",
        "Prices, shares, backlog and inventory limits",
        "RFQs, design wins and named contracts",
        "Second-source demands from large customers",
      ]}
    />
  );
}
