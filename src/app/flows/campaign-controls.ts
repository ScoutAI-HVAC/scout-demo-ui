export const CAMPAIGN_BUTTONS = {
  delete: "Delete",
  deleteArmed: "Really delete?",
  start: "Start",
  stop: "Stop",
  resume: "Resume",
  discardEdits: "Discard",
} as const;
export const DELETE_ARM_MS = 4000;
export const DELETE_MIN_GAP_MS = 600;
const b = CAMPAIGN_BUTTONS;
export const DELETE_DRAFT_HOW_TO =
  `To delete a draft, the owner taps "${b.delete}" at the top of its campaign page, then ` +
  `"${b.deleteArmed}" within ${DELETE_ARM_MS / 1000} seconds. Only a draft that never texted ` +
  `anyone can be deleted; a campaign that has texted people keeps its record and can only be ` +
  `stopped. You cannot delete a campaign yourself. "${b.discardEdits}" only throws away unsaved ` +
  `message edits; never call it a way to remove a campaign.`;
export const CAMPAIGN_CONTROLS_BRIEF =
  `The owner's buttons on this page, by their exact labels: "${b.start}" approves a draft and ` +
  `starts texting; "${b.stop}" pauses a running campaign; "${b.resume}" restarts a paused one. ` +
  `${DELETE_DRAFT_HOW_TO} Those buttons are the owner's, not yours. Name them exactly as ` +
  `written here and never invent a control.`;
