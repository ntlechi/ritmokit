export type RentalSettingsView = {
  openHour: number;
  closeHour: number;
  bufferMinutes: number;
  minLeadHours: number;
  b2bRequiresApproval: boolean;
  durationOptions: number[];
  moduleEnabled: boolean;
};

export const DEFAULT_RENTAL_SETTINGS: RentalSettingsView = {
  openHour: 8,
  closeHour: 23,
  bufferMinutes: 15,
  minLeadHours: 24,
  b2bRequiresApproval: true,
  durationOptions: [60, 90, 120, 180, 240],
  moduleEnabled: false,
};
