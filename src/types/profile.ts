import { ModGroup, HistoryEntry } from "./mod";

export interface ModProfile {
  /** Kalıcı kimlik — isim değişse de referans kararlı kalır */
  id?: string;
  name: string;
  /** İsteğe bağlı açıklama — preset modalından girilir */
  description?: string;
  active_mods: string[];
  groups?: ModGroup[];
  dead_mods?: string[];
  health?: "normal" | "has_kayip" | "bozuk";
  history?: HistoryEntry[];
  /** Kalıcı redo yığını — uygulama kapanınca da korunur */
  redo_history?: HistoryEntry[];
  isDefault?: boolean;
  created_at?: number;
  updated_at?: number;
}
