import { ModProfile, ModGroup, HistoryEntry } from "../types";
import { settingsStore } from "./settingsStore";

type Listener<T> = (data: T) => void;

const STORAGE_KEY = 'rimwordl_profiles';

class ProfileStore {
  private profiles: ModProfile[] = [];
  /** Son seçili preset adı */
  private lastSelectedName: string | null = null;

  private listeners: Listener<ModProfile[]>[] = [];
  private selectListeners: Listener<string | null>[] = [];

  constructor() {
    this.loadFromStorage();
  }

  // ============================================================
  // ABONELİK
  // ============================================================

  public subscribe(listener: Listener<ModProfile[]>) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  public subscribeSelection(listener: Listener<string | null>) {
    this.selectListeners.push(listener);
    return () => { this.selectListeners = this.selectListeners.filter(l => l !== listener); };
  }

  // ============================================================
  // KALICILIK (localStorage)
  // ============================================================

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { profiles: ModProfile[]; lastSelected: string | null };
        this.profiles = parsed.profiles || [];
        this.lastSelectedName = parsed.lastSelected || null;
        this.ensureProfileIds();
      } else {
        this.profiles = [this.createDefaultProfile()];
        this.lastSelectedName = 'Default';
        this.saveToStorage();
      }
    } catch {
      this.profiles = [this.createDefaultProfile()];
      this.lastSelectedName = 'Default';
    }
  }

  /** Eski kayıtlarda id yoksa isimden kararlı bir id üret (migration) */
  private ensureProfileIds(): void {
    let changed = false;
    this.profiles.forEach(p => {
      if (!p.id) {
        p.id = this.slugId(p.name);
        changed = true;
      }
    });
    if (changed) this.saveToStorage();
  }

  private slugId(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profil';
    return `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  /** Geçmiş (snapshot) adım limiti — ayarlardan okunur */
  public getHistoryLimit(): number {
    return settingsStore.getSettings().historyLimit ?? 30;
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        profiles: this.profiles,
        lastSelected: this.lastSelectedName
      }));
    } catch (err) {
      console.error('[profileStore] Kaydedilemedi:', err);
    }
  }

  // ============================================================
  // DEFAULT PROFİL
  // ============================================================

  private createDefaultProfile(): ModProfile {
    return {
      id: 'default-profile',
      name: 'Default',
      active_mods: [],
      groups: [],
      dead_mods: [],
      health: 'normal',
      history: [],
      isDefault: true,
      created_at: Date.now(),
      updated_at: Date.now()
    };
  }

  public getDefaultName(): string {
    return 'Default';
  }

  // ============================================================
  // GETTERS
  // ============================================================

  public getProfiles(): ModProfile[] {
    return this.profiles;
  }

  public getProfileNames(): string[] {
    return this.profiles.map(p => p.name);
  }

  public getLastSelectedName(): string | null {
    return this.lastSelectedName;
  }

  public getSelectedName(): string | null {
    return this.lastSelectedName;
  }

  /** Seçili profil nesnesini döndür */
  public getActiveProfile(): ModProfile | undefined {
    if (!this.lastSelectedName) return undefined;
    return this.profiles.find(p => p.name === this.lastSelectedName);
  }

  // ============================================================
  // PRESET YÖNETİMİ
  // ============================================================

  /**
   * Yeni preset oluştur — varsayılan olarak şu anki çalışma alanını kopyalar.
   * (Boş preset için activeMods/groups parametresiz çağrılır.)
   */
  public addProfile(name: string, activeMods?: string[], groups?: ModGroup[], description?: string): boolean {
    if (this.profiles.find(p => p.name === name)) return false;
    const now = Date.now();
    this.profiles.push({
      id: this.slugId(name),
      name,
      description: description || "",
      active_mods: activeMods ? [...activeMods] : [],
      groups: groups ? groups.map(g => ({ ...g, modIds: [...g.modIds] })) : [],
      dead_mods: [],
      health: 'normal',
      history: [],
      isDefault: false,
      created_at: now,
      updated_at: now
    });
    this.saveToStorage();
    this.notify();
    return true;
  }

  public removeProfile(name: string): boolean {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile || profile.isDefault) return false;
    this.profiles = this.profiles.filter(p => p.name !== name);
    if (this.lastSelectedName === name) {
      this.lastSelectedName = 'Default';
    }
    this.saveToStorage();
    this.notify();
    return true;
  }

  public renameProfile(oldName: string, newName: string): boolean {
    if (this.profiles.find(p => p.name === newName)) return false;
    const profile = this.profiles.find(p => p.name === oldName);
    if (!profile || profile.isDefault) return false;
    profile.name = newName;
    if (this.lastSelectedName === oldName) {
      this.lastSelectedName = newName;
    }
    this.saveToStorage();
    this.notify();
    return true;
  }

  // ============================================================
  // SEÇİM / KAYDET
  // ============================================================

  /** Preset seç — sadece ismi takip et, mod listesi modStore'dan yönetilir */
  public selectProfile(name: string): boolean {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile) return false;
    this.lastSelectedName = name;
    this.saveToStorage();
    this.notifySelection();
    return true;
  }

  /** Aktif çalışma alanını presete kaydet (auto-save) */
  public saveActiveToProfile(
    name: string,
    activeMods: string[],
    groups?: ModGroup[],
    deadMods?: string[],
    health?: "normal" | "has_kayip" | "bozuk",
    history?: HistoryEntry[]
  ): boolean {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile) return false;
    profile.active_mods = [...activeMods];
    if (groups !== undefined) profile.groups = groups;
    if (deadMods !== undefined) profile.dead_mods = deadMods;
    if (health !== undefined) profile.health = health;
    if (history !== undefined) profile.history = history;
    profile.updated_at = Date.now();
    this.saveToStorage();
    this.notify();
    return true;
  }

  /**
   * Belirtilen profilin geçmişine yeni bir snapshot adımı ekler.
   * Adım sayısı ayarlardaki historyLimit ile sınırlanır (varsayılan 30).
   */
  public recordSnapshot(
    name: string,
    type: HistoryEntry['type'],
    newActiveMods: string[],
    changedIds: string[] = []
  ): boolean {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile) return false;
    const history = profile.history || [];
    const entry: HistoryEntry = {
      type,
      changed_ids: changedIds,
      old_active_mods: [...(profile.active_mods || [])],
      new_active_mods: [...newActiveMods],
      timestamp: Date.now()
    };
    const limit = Math.max(1, this.getHistoryLimit());
    profile.history = [...history, entry].slice(-limit);
    profile.updated_at = Date.now();
    this.saveToStorage();
    this.notify();
    return true;
  }

  /** Profilin geçmiş kaydını temizle */
  public clearHistory(name: string): boolean {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile) return false;
    profile.history = [];
    profile.updated_at = Date.now();
    this.saveToStorage();
    this.notify();
    return true;
  }

  /** Kayıp (dead) modları profilden temizle — health'i normal'e çevirir */
  public cleanMissing(name: string): boolean {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile) return false;
    const deadSet = new Set((profile.dead_mods || []).map(d => d.toLowerCase()));
    profile.active_mods = (profile.active_mods || []).filter(id => !deadSet.has(id.toLowerCase()));
    profile.dead_mods = [];
    profile.health = 'normal';
    profile.updated_at = Date.now();
    this.saveToStorage();
    this.notify();
    return true;
  }

  /** Redo yığınını kalıcı olarak yaz (uygulama kapanınca da korunur) */
  public setRedoHistory(name: string, entries: HistoryEntry[]): boolean {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile) return false;
    profile.redo_history = entries;
    profile.updated_at = Date.now();
    this.saveToStorage();
    return true;
  }

  /** Preset seç ve aktif profile ayarla (compat: ModProfile ile) */
  public setActiveProfile(profile: ModProfile): void {
    // Varolan profili güncelle veya ekle
    const existing = this.profiles.find(p => p.name === profile.name);
    if (existing) {
      Object.assign(existing, profile);
    } else {
      this.profiles.push({ ...profile, isDefault: false });
    }
    this.lastSelectedName = profile.name;
    this.saveToStorage();
    this.notify();
    this.notifySelection();
  }

  /** İsim listesinden profiller oluştur (compat) */
  public setProfiles(names: string[]): void {
    this.profiles = names.map(name => ({
      id: name === 'Default' ? 'default-profile' : this.slugId(name),
      name,
      active_mods: [],
      groups: [],
      dead_mods: [],
      health: 'normal' as const,
      history: [],
      isDefault: name === 'Default'
    }));
    if (!this.lastSelectedName || !names.includes(this.lastSelectedName)) {
      this.lastSelectedName = names[0] || 'Default';
    }
    this.saveToStorage();
    this.notify();
  }

  // ============================================================
  // COMPAT: subscribeList + getProfilesDetailed
  // ============================================================

  private listListeners: Listener<string[]>[] = [];

  public subscribeList(listener: Listener<string[]>) {
    this.listListeners.push(listener);
    return () => { this.listListeners = this.listListeners.filter(l => l !== listener); };
  }

  /** ModProfile[] döndürür (subscribe'dan farklı olarak direkt dizi) */
  public getProfilesDetailed(): ModProfile[] {
    return this.profiles;
  }

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  private notify(): void {
    this.listeners.forEach(l => l(this.profiles));
    this.notifyList();
  }

  private notifySelection(): void {
    this.selectListeners.forEach(l => l(this.lastSelectedName));
  }

  private notifyList(): void {
    const names = this.profiles.map(p => p.name);
    this.listListeners.forEach(l => l(names));
  }
}

export const profileStore = new ProfileStore();
