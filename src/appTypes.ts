import type { KinoItem, PlaybackSession } from "./types";

export interface Section {
  id: string;
  title: string;
  items: KinoItem[];
  mode?: "open" | "continue";
}

export interface PlayerRouteState {
  item: KinoItem;
  session: PlaybackSession;
}
