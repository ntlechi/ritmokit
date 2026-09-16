export type IntegrationProvider = "PAYPAL" | "STRIPE" | "RESEND" | "SQUARE";

export type IntegrationStatus =
  | "DISCONNECTED"
  | "TESTING"
  | "CONNECTED"
  | "ERROR";

export type PayPalIntegrationConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  mode: "sandbox" | "live";
};

export type StripeIntegrationConfig = {
  secretKey: string;
  webhookSecret: string;
  mode: "test" | "live";
};

export type ResolvedStripeCredentials = StripeIntegrationConfig & {
  source: "hub" | "env";
  organizationId: string | null;
  status: IntegrationStatus | "env";
};

export type ResolvedPayPalCredentials = PayPalIntegrationConfig & {
  source: "hub" | "env";
  organizationId: string | null;
  status: IntegrationStatus | "env";
};

export const ACTIVE_INTEGRATION_STATUSES: IntegrationStatus[] = [
  "CONNECTED",
  "TESTING",
];
