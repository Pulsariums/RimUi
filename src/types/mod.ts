export interface ModMetadata {
  package_id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  url: string;
  preview_path: string;
  supported_versions: string[];
  dependencies: string[];
  load_before: string[];
  load_after: string[];
  dir_path: string;
  mtime?: number;
  isDlc?: boolean;      // Bu mod bir DLC mi? (ludeon.royalty, ludeon.biotech vs.)
  isExternal?: boolean;  // Harici kaynaktan mı geldi? (FAZ 4 için)
  isDead?: boolean;      // Fiziksel klasörü yok, silinmiş mod
}

export interface ModsConfig {
  active_mods: string[];
  version?: string;
  known_expansions: string[];
}

export interface ModGroup {
  id: string;
  name: string;
  modIds: string[];
  expanded: boolean;
  isSystem?: boolean;  // Sistem grubu (silinemez, sürüklenemez)
}

export interface HistoryEntry {
  type: 'toggle' | 'reorder' | 'batch_toggle' | 'group_move' | 'import' | 'apply' | 'preset_save';
  changed_ids: string[];
  old_active_mods: string[];
  new_active_mods: string[];
  timestamp: number;
}
