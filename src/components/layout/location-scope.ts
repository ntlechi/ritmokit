export type LocationSwitcherOption = {
  id: string;
  name: string;
  city: string | null;
};

export type LocationScope = {
  activeId: string;
  activeName: string;
  locations: LocationSwitcherOption[];
};
