export type ModelAccess = "account" | "backup-key" | "none";
export function readModelAccess(status: {
  signedIn: boolean;
  apiKeyPresent: boolean;
}): ModelAccess {
  if (status.signedIn) {
    return "account";
  }
  return status.apiKeyPresent ? "backup-key" : "none";
}
export const MODEL_ACCESS_COPY: Record<
  Exclude<ModelAccess, "account">,
  {
    title: string;
    detail: string;
  }
> = {
  "backup-key": {
    title: "Running on Scout's backup key",
    detail:
      "Chat and text replies run on it today. Connect your own ScoutAI account and Scout uses yours instead.",
  },
  none: {
    title: "No AI account connected",
    detail:
      "Scout can't answer chat or text messages until one is connected. Phone calls don't depend on it.",
  },
};
