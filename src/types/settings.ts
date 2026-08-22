export interface AppSettings {
  /** Ayar şeması sürümü — migration sistemi tarafından yönetilir */
  schemaVersion?: number;
  rimworld_mods_path: string;
  rimworld_config_path: string;
  db_path: string;
  rimworld_exe_path: string;
  extraModSources?: ExtraModSource[];
  /** Her profil için tutulacak geçmiş (snapshot) adım sayısı — varsayılan 30 */
  historyLimit?: number;
}

export interface ExtraModSource {
  id: string;           // Benzersiz ID (UUID veya timestamp)
  path: string;         // Klasör yolu
  enabled: boolean;     // Aktif mi?
  name: string;         // Kullanıcı tarafından verilen isim
}
