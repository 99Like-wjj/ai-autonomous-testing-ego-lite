/* Generated from schemas; run npm run contracts:write. Runtime validation is still required. */

export interface ExplicitHistoricalRunLocationsV9 {
  schemaVersion: 9;
  locations: {
    runId: string;
    runDir: string;
  }[];
}
