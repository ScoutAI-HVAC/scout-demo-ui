export const features = {
  liveCallControls: false,
  callRecordings: true,
  scoutCallback: false,
  callOutcomes: true,
  callEnrichment: false,
  chatPhotoAttach: true,
  chatDictation: true,
  settingsPricebook: false,
} as const;
export type FeatureName = keyof typeof features;
export function isEnabled(name: FeatureName): boolean {
  return features[name];
}
