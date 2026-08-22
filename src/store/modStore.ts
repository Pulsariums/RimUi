import { ModMetadata, ModGroup, ModProfile, HistoryEntry } from "../types";
import { profileStore } from './profileStore';

type Listener<T> = (data: T) => void;

/**
 * SteamCMD penceresi gibi aynı origin'i paylaşan diğer webview'ların
 * mod listesini okuyabilmesi için localStorage önbellek anahtarı.
 */
export const MODS_CACHE_KEY = "rimwordl_mods_cache";

class ModStore {
  constructor() {
    // Gruplar profil-specific'tir; kanonik kaynak profile.groups'tur
    // ve profil seçildiğinde loadWorkspaceFromProfile ile yüklenir.
  }

  /** Mod listesi önbelleğini debounce'lu yazar (chunk'lı yüklemede tek seferlik). */
  private persistTimer: number | null = null;
  private schedulePersistMods(): void {
    if (this.persistTimer !== null) return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      try {
        localStorage.setItem(MODS_CACHE_KEY, JSON.stringify(this.mods));
      } catch (err) {
        console.error("[modStore] Mod önbelleği kaydedilemedi:", err);
      }
    }, 800);
  }

  /**
   * Gelen modları frontend modeline normalize eder.
   * Rust'tan gelen isDlc/isDead/isExternal değerlerini korur ve
   * mevcut state'teki isDead/isExternal bilgisinin üzerine yazılmasını engeller.
   */
  private normalizeMod(mod: ModMetadata): ModMetadata {
    const id = mod.package_id.toLowerCase();
    const existing = this.modIdMap[id];
    return {
      ...mod,
      isDlc: this.DLC_PACKAGE_IDS.includes(id),
      isDead: existing?.isDead ?? mod.isDead ?? false,
      isExternal: existing?.isExternal ?? mod.isExternal ?? false
    };
  }

  private mods: ModMetadata[] = [];
  private loading: boolean = false;
  private error: string | null = null;
  private filterQuery: string = "";
  private statusFilter: "all" | "active" | "inactive" = "all";
  private sortOrder: string = "name_asc";

  /** Çalışma alanı (workspace) — toggle/drag ile değişen aktif mod listesi, oyun sırası */
  private workspaceMods: string[] = [];
  /** Profil-specific gruplar - aktif profil değişince yeniden yüklenir */
  private groups: ModGroup[] = [];
  /** Sistem grupları expand state */
  private systemExpanded: Map<string, boolean> = new Map();

  /** 🔥 OPTİMİZASYON: package_id → ModMetadata hızlı lookup Map'i */
  private modIdMap: Record<string, ModMetadata> = {};
  /** Aktif mod ID'leri Set'i (hızlı includes kontrolü) */
  private activeIdSet: Set<string> = new Set();

  /** 🔥 PERF: Shelf sonuçları + sistem grupları memoize — her render'da yeniden hesaplama yok.
   *  notifyMods/notifyActiveMods/notifyGroups her mutasyonda cacheVersion'ı artırır. */
  private cacheVersion = 0;
  private shelfCacheVersion = -1;
  private shelfCacheActive: ModMetadata[] = [];
  private shelfCacheLibrary: ModMetadata[] = [];
  private systemGroupsCacheVersion = -1;
  private systemGroupsCache: ModGroup[] = [];

  // ============================================================
  // GÖRSEL SIRALAMA — sadece UI düzeni, oyuna etki etmez
  // ============================================================
  /** Aktif raftaki görsel sıra (kullanıcı drag ile değiştirir) */
  private activeVisualOrder: string[] = [];
  /** Kütüphane raftaki görsel sıra */
  private libraryVisualOrder: string[] = [];

  // ============================================================
  // PER-SHELF FİLTRE — her rafın kendi araması
  // ============================================================
  private activeFilter: string = "";
  private libraryFilter: string = "";

  private listeners: Listener<ModMetadata[]>[] = [];
  private activeModsListeners: Listener<string[]>[] = [];
  private loadingListeners: Listener<boolean>[] = [];
  private errorListeners: Listener<string | null>[] = [];

  // Subscriptions
  public subscribe(listener: Listener<ModMetadata[]>) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  public subscribeLoading(listener: Listener<boolean>) {
    this.loadingListeners.push(listener);
    return () => { this.loadingListeners = this.loadingListeners.filter(l => l !== listener); };
  }

  public subscribeError(listener: Listener<string | null>) {
    this.errorListeners.push(listener);
    return () => { this.errorListeners = this.errorListeners.filter(l => l !== listener); };
  }

  public subscribeActiveMods(listener: Listener<string[]>) {
    this.activeModsListeners.push(listener);
    return () => { this.activeModsListeners = this.activeModsListeners.filter(l => l !== listener); };
  }

  private groupsListeners: Listener<ModGroup[]>[] = [];
  public subscribeGroups(listener: Listener<ModGroup[]>) {
    this.groupsListeners.push(listener);
    return () => { this.groupsListeners = this.groupsListeners.filter(l => l !== listener); };
  }

  // Setters
  /** Bilinen RimWorld DLC package ID'leri */
  private readonly DLC_PACKAGE_IDS = [
    'ludeon.royalty',
    'ludeon.ideology',
    'ludeon.biotech',
    'ludeon.anomaly'
  ];

  /** 🔥 Önbellekleri yeniden oluştur (mods/workspaceMods değişince çağrılır) */
  private buildCache(): void {
    const map: Record<string, ModMetadata> = {};
    for (let i = 0; i < this.mods.length; i++) {
      const m = this.mods[i];
      map[m.package_id.toLowerCase()] = m;
    }
    this.modIdMap = map;
    this.activeIdSet = new Set(this.workspaceMods);
  }

  public setMods(newMods: ModMetadata[]) {
    this.mods = newMods.map(mod => this.normalizeMod(mod));
    this.buildCache();
    this.notifyMods();
    this.schedulePersistMods();
  }

  /** Chunked loading için: modları ekle (mevcutları koru) */
  public addModsChunk(newMods: ModMetadata[]) {
    const processedMods = newMods.map(mod => this.normalizeMod(mod));
    this.mods.push(...processedMods);
    this.buildCache();
    this.notifyMods();
    this.schedulePersistMods();
  }

  /** Modu listeden tamamen kaldır (diskten silme sonrası) */
  public removeMod(packageId: string): void {
    const id = packageId.toLowerCase();
    this.mods = this.mods.filter(m => m.package_id.toLowerCase() !== id);
    this.activeVisualOrder = this.activeVisualOrder.filter(x => x !== id);
    this.libraryVisualOrder = this.libraryVisualOrder.filter(x => x !== id);
    this.workspaceMods = this.workspaceMods.filter(x => x !== id);
    this.activeIdSet = new Set(this.workspaceMods);
    // Gruplardan da çıkar
    for (const g of this.groups) {
      g.modIds = g.modIds.filter(x => x !== id);
    }
    this.buildCache();
    this.notifyMods();
    this.notifyActiveMods();
    this.notifyGroups();
    this.schedulePersistMods();
  }

  /** Bir modu ölü olarak işaretle (fiziksel dosyası yok) */
  public markModAsDead(packageId: string) {
    const id = packageId.toLowerCase();
    if (!this.mods.some(m => m.package_id.toLowerCase() === id)) {
      this.mods.push({
        package_id: id,
        name: id,
        author: "Bilinmiyor",
        version: "",
        description: "Bu mod fiziksel olarak silinmiş.",
        url: "",
        preview_path: "",
        supported_versions: [],
        dependencies: [],
        load_before: [],
        load_after: [],
        dir_path: "",
        isDead: true
      });
      this.buildCache();
      this.notifyMods();
    }
  }

  public setActiveProfileMods(mods: string[]) {
    this.workspaceMods = mods.map(m => m.toLowerCase());
    this.activeIdSet = new Set(this.workspaceMods);
    // Aktif görsel sırayı da workspace ile hizala (ModsConfig.xml'den veya
    // RimSort sıralamasından gelen sıra gerçek oyun sırasıdır).
    this.activeVisualOrder = [...this.workspaceMods];
    this.saveVisualOrders();
    this.notifyActiveMods();
  }

  /** Profilden çalışma alanını yükle */
  public loadWorkspaceFromProfile(profile: ModProfile) {
    this.workspaceMods = [...(profile.active_mods || [])].map(m => m.toLowerCase());
    this.activeIdSet = new Set(this.workspaceMods);
    this.loadGroupsFromProfile(profile);
    this.loadVisualOrders();
    this.notifyActiveMods();
    this.notifyGroups();
  }

  // ============================================================
  // GÖRSEL SIRALAMA — localStorage kalıcılığı
  // ============================================================

  private get visualOrderKey(): string {
    const profileName = profileStore.getActiveProfile()?.name || 'default';
    return `rimwordl_visual_order_${profileName}`;
  }

  private saveVisualOrders(): void {
    try {
      localStorage.setItem(this.visualOrderKey, JSON.stringify({
        active: this.activeVisualOrder,
        library: this.libraryVisualOrder
      }));
    } catch (err) {
      console.error('[modStore] Görsel sıralar kaydedilemedi:', err);
    }
  }

  private loadVisualOrders(): void {
    try {
      const saved = localStorage.getItem(this.visualOrderKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { active: string[]; library: string[] };
        this.activeVisualOrder = parsed.active || [];
        this.libraryVisualOrder = parsed.library || [];
      } else {
        // İlk açılış: workspaceMods'tan kopyala
        this.activeVisualOrder = [...this.workspaceMods];
        this.libraryVisualOrder = [];
      }
    } catch {
      this.activeVisualOrder = [...this.workspaceMods];
      this.libraryVisualOrder = [];
    }
  }

  /** Görsel sıraları workspaceMods ile senkronize et (yeni mod toggle'landıysa vs.) */
  private syncVisualOrders(): void {
    const activeSet = new Set(this.activeVisualOrder);
    const libSet = new Set(this.libraryVisualOrder);

    // Yeni active mod'ları active visual order'a ekle
    this.workspaceMods.forEach(id => {
      if (!activeSet.has(id)) {
        this.activeVisualOrder.push(id);
        activeSet.add(id);
      }
    });

    // Kaldırılan active mod'ları active visual order'dan çıkar, library'ye ekle
    const finalActiveSet = new Set(this.workspaceMods);
    this.activeVisualOrder = this.activeVisualOrder.filter(id => finalActiveSet.has(id));

    // Workspace'te olmayan modları library visual order'a ekle
    this.mods.forEach(m => {
      const id = m.package_id.toLowerCase();
      if (!finalActiveSet.has(id) && !libSet.has(id)) {
        this.libraryVisualOrder.push(id);
        libSet.add(id);
      }
    });

    // Library'de olmaması gerekenleri çıkar (active olmuş modlar)
    this.libraryVisualOrder = this.libraryVisualOrder.filter(id => !finalActiveSet.has(id));

    this.saveVisualOrders();
  }

  public getActiveVisualOrder(): string[] {
    return this.activeVisualOrder;
  }

  public getLibraryVisualOrder(): string[] {
    return this.libraryVisualOrder;
  }

  /** Aktif rafta görsel sıralama (sürükle-bırak — tek mod) */
  public reorderActiveVisual(draggedId: string, targetId: string): void {
    this.reorderActiveVisualBatch([draggedId], targetId);
  }

  /** Aktif rafta birden çok modu TEK history adımı olarak hedefe taşı */
  public reorderActiveVisualBatch(draggedIds: string[], targetId: string): void {
    if (draggedIds.length === 0) return;
    this.takeSnapshot();
    const normalizedDragged = draggedIds.map(id => id.toLowerCase());
    const normalizedTarget = targetId.toLowerCase();
    // Sürüklenenleri çıkar (kalan sıra korunur)
    const remaining = this.activeVisualOrder.filter(id => !normalizedDragged.includes(id));
    const targetIdx = remaining.indexOf(normalizedTarget);
    const items = this.activeVisualOrder.filter(id => normalizedDragged.includes(id));
    if (targetIdx > -1 && items.length > 0) {
      remaining.splice(targetIdx, 0, ...items);
      this.activeVisualOrder = remaining;
      this.notifyMods(); // re-render tetikle
      this.saveVisualOrders();
      this.pushHistory('reorder', normalizedDragged);
    }
  }

  /** Kütüphane rafta görsel sıralama (sürükle-bırak) */
  public reorderLibraryVisual(draggedId: string, targetId: string): void {
    const normalizedDragged = draggedId.toLowerCase();
    const normalizedTarget = targetId.toLowerCase();
    const draggedIdx = this.libraryVisualOrder.indexOf(normalizedDragged);
    const targetIdx = this.libraryVisualOrder.indexOf(normalizedTarget);
    if (draggedIdx > -1 && targetIdx > -1) {
      const [item] = this.libraryVisualOrder.splice(draggedIdx, 1);
      const newTargetIdx = this.libraryVisualOrder.indexOf(normalizedTarget);
      this.libraryVisualOrder.splice(newTargetIdx, 0, item);
      this.notifyMods();
      this.saveVisualOrders();
    }
  }

  // ============================================================
  // PER-SHELF FİLTRE
  // ============================================================

  public setActiveFilter(query: string): void {
    this.activeFilter = query.toLowerCase();
    this.notifyMods();
  }

  public setLibraryFilter(query: string): void {
    this.libraryFilter = query.toLowerCase();
    this.notifyMods();
  }

  public getActiveFilter(): string {
    return this.activeFilter;
  }

  public getLibraryFilter(): string {
    return this.libraryFilter;
  }

  /** Belirtilen shelf için filtrelenmiş ve sıralanmış modları döndür (memoize) */
  public getModsForShelf(targetActive: boolean): ModMetadata[] {
    if (this.shelfCacheVersion !== this.cacheVersion) {
      this.shelfCacheActive = this.computeShelfMods(true);
      this.shelfCacheLibrary = this.computeShelfMods(false);
      this.shelfCacheVersion = this.cacheVersion;
    }
    return targetActive ? this.shelfCacheActive : this.shelfCacheLibrary;
  }

  /** Shelf hesabı — sadece cache geçersizken çalışır */
  private computeShelfMods(targetActive: boolean): ModMetadata[] {
    const activeIds = this.workspaceMods;
    const filterQ = targetActive ? this.activeFilter : this.libraryFilter;
    const visualOrder = targetActive ? this.activeVisualOrder : this.libraryVisualOrder;

    // 🔥 OPTİMİZASYON: Map ile O(n), indexOf ile O(n²)'ydi
    const orderMap = new Map<string, number>();
    visualOrder.forEach((id, idx) => orderMap.set(id, idx));

    let filtered: ModMetadata[];

    if (filterQ) {
      const fq = filterQ;
      filtered = [];
      for (let i = 0; i < this.mods.length; i++) {
        const m = this.mods[i];
        const id = m.package_id.toLowerCase();
        const matchesStatus = targetActive
          ? activeIds.includes(id)
          : !activeIds.includes(id);
        if (!matchesStatus) continue;
        if (m.name.toLowerCase().includes(fq) ||
            m.package_id.toLowerCase().includes(fq) ||
            m.author.toLowerCase().includes(fq)) {
          filtered.push(m);
        }
      }
    } else {
      // Hızlı yol: status filtresi için önceden ayrılmış array'ler kullan
      // Aktif raftakiler: workspaceMods sırasıyla
      if (targetActive) {
        filtered = [];
        for (let i = 0; i < this.workspaceMods.length; i++) {
          const id = this.workspaceMods[i];
          const mod = this.modIdMap[id];
          if (mod) filtered.push(mod);
        }
      } else {
        // Kütüphane: workspace'te olmayanlar
        const activeSet = this.activeIdSet;
        filtered = [];
        for (let i = 0; i < this.mods.length; i++) {
          const m = this.mods[i];
          if (!activeSet.has(m.package_id.toLowerCase())) {
            filtered.push(m);
          }
        }
      }
    }

    // Görsel sıraya göre sırala — Map ile O(1) lookup
    filtered.sort((a, b) => {
      const ai = orderMap.get(a.package_id.toLowerCase()) ?? 9999;
      const bi = orderMap.get(b.package_id.toLowerCase()) ?? 9999;
      return ai - bi;
    });

    return filtered;
  }

  /** Profilden grup yükle (profil-specific gruplar) */
  public loadGroupsFromProfile(profile: ModProfile | null) {
    if (profile && profile.groups && profile.groups.length > 0) {
      this.groups = profile.groups;
    } else {
      this.groups = [];
    }
    this.notifyGroups();
  }

  /** Mevcut grupları profile-specific formatta döndür (kaydetmek için) */
  public getGroupsForProfile(): ModGroup[] {
    return this.groups;
  }

  /**
   * Grupları profil kaydına işler (kanonik kaynak: profile.groups).
   * localStorage çift kanalını ortadan kaldırır — profil değiştirilip
   * geri gelindiğinde grupların kaybolması riskini yok eder.
   */
  private persistGroups(): void {
    const profile = profileStore.getActiveProfile();
    if (!profile) return;
    profileStore.saveActiveToProfile(
      profile.name,
      [...this.workspaceMods],
      this.groups.map(g => ({ ...g, modIds: [...g.modIds] })),
      undefined,
      undefined
    );
  }

  public setGroups(groups: ModGroup[]) {
    this.groups = groups;
    this.notifyGroups();
  }

  public createGroup(name: string) {
    const newGroup: ModGroup = {
      id: crypto.randomUUID(),
      name,
      modIds: [],
      expanded: true
    };
    this.groups.push(newGroup);
    this.notifyGroups();
    this.persistGroups();
    return newGroup.id;
  }

  public deleteGroup(groupId: string) {
    this.groups = this.groups.filter(g => g.id !== groupId);
    this.notifyGroups();
    this.persistGroups();
  }

  public updateGroupName(groupId: string, name: string) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.name = name;
      this.notifyGroups();
      this.persistGroups();
    }
  }

  public addModToGroup(groupId: string, modId: string) {
    const group = this.groups.find(g => g.id === groupId);
    const normalizedModId = modId.toLowerCase();
    if (group && !group.modIds.includes(normalizedModId)) {
      group.modIds.push(normalizedModId);
      this.notifyGroups();
      this.persistGroups();
    }
  }

  public removeModFromGroup(groupId: string, modId: string) {
    const group = this.groups.find(g => g.id === groupId);
    const normalizedModId = modId.toLowerCase();
    if (group) {
      group.modIds = group.modIds.filter(id => id !== normalizedModId);
      this.notifyGroups();
      this.persistGroups();
    }
  }

  public toggleGroupExpand(groupId: string) {
    // Sistem grupları
    if (groupId === '__dead__' || groupId === '__dlc__') {
      const current = this.systemExpanded.get(groupId) ?? true;
      this.systemExpanded.set(groupId, !current);
      this.notifyGroups();
      return;
    }
    // Kullanıcı grupları
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.expanded = !group.expanded;
      this.notifyGroups();
      this.persistGroups();
    }
  }

  /** Son workspace yedeği — history entry oluşturmak için */
  private lastWorkspaceSnapshot: string[] = [];

  /** Mutasyon öncesi snapshot al */
  private takeSnapshot(): void {
    this.lastWorkspaceSnapshot = [...this.workspaceMods];
  }

  /** History entry oluştur ve profile'a pushla (birden çok ID değiştiyse batch) */
  private pushHistory(type: HistoryEntry['type'], changedIds: string[]): void {
    const profile = profileStore.getActiveProfile();
    if (!profile) return;
    
    const history = profile.history || [];
    const entry: HistoryEntry = {
      type,
      changed_ids: changedIds,
      old_active_mods: this.lastWorkspaceSnapshot,
      new_active_mods: [...this.workspaceMods],
      timestamp: Date.now()
    };
    
    // Limit — ayarlardan okunur (varsayılan 30), en eskisini kırp
    const limit = Math.max(1, profileStore.getHistoryLimit());
    const trimmed = [...history, entry].slice(-limit);

    // Sağlık durumunu merkezi hesaplayıcıdan al (has_kayip / bozuk / normal)
    const health = this.computeHealth(this.workspaceMods);
    const deadMods = this.getMissingModIds(this.workspaceMods);

    profileStore.saveActiveToProfile(
      profile.name,
      [...this.workspaceMods],
      this.groups,
      deadMods,
      health,
      trimmed
    );
  }

  /** Toggle mod (tek mod — batch versiyonunu kullanır) */
  public toggleMod(packageId: string) {
    this.toggleMods([packageId]);
  }

  /** Birden çok modu TEK history adımı olarak toggle et (30 mod = 1 adım) */
  public toggleMods(packageIds: string[]) {
    if (packageIds.length === 0) return;
    this.takeSnapshot();
    const ids = packageIds.map(id => id.toLowerCase());
    for (const normalizedId of ids) {
      const idx = this.workspaceMods.indexOf(normalizedId);
      if (idx > -1) {
        this.workspaceMods.splice(idx, 1);
      } else if (!this.workspaceMods.includes(normalizedId)) {
        this.workspaceMods.push(normalizedId);
      }
    }
    this.activeIdSet = new Set(this.workspaceMods);
    this.syncVisualOrders();
    this.notifyActiveMods();
    this.pushHistory('toggle', ids);
  }

  public setLoading(state: boolean) {
    this.loading = state;
    this.notifyLoading();
  }

  public setFilter(query: string) {
    this.filterQuery = query.toLowerCase();
    this.notifyMods(); // Re-trigger mod list render
  }

  public setStatusFilter(status: "all" | "active" | "inactive") {
    this.statusFilter = status;
    this.notifyMods();
  }

  public setSortOrder(order: string) {
    this.sortOrder = order;
    this.notifyMods();
  }

  /**
   * Reorder mods within the active profile list (sürükle-bırak sıralama).
   */
  public reorderActiveMods(draggedId: string, targetId: string) {
    this.takeSnapshot();
    const normalizedDragged = draggedId.toLowerCase();
    const normalizedTarget = targetId.toLowerCase();
    const draggedIdx = this.workspaceMods.indexOf(normalizedDragged);
    const targetIdx = this.workspaceMods.indexOf(normalizedTarget);

    if (draggedIdx > -1 && targetIdx > -1) {
      const [draggedMod] = this.workspaceMods.splice(draggedIdx, 1);
      // Splice sonrası targetIdx kayabilir, yeniden hesapla
      const newTargetIdx = this.workspaceMods.indexOf(normalizedTarget);
      this.workspaceMods.splice(newTargetIdx, 0, draggedMod);
      this.notifyActiveMods();
      this.pushHistory('reorder', [normalizedDragged, normalizedTarget]);
    }
  }

  /**
   * Reorder mods in the library (inactive) list (sürükle-bırak sıralama).
   */
  public reorderLibraryMods(draggedId: string, targetId: string) {
    const draggedIdx = this.mods.findIndex(m => m.package_id.toLowerCase() === draggedId.toLowerCase());
    const targetIdx = this.mods.findIndex(m => m.package_id.toLowerCase() === targetId.toLowerCase());

    if (draggedIdx > -1 && targetIdx > -1) {
      const [draggedMod] = this.mods.splice(draggedIdx, 1);
      this.mods.splice(targetIdx, 0, draggedMod);
      this.notifyMods();
    }
  }

  /** Tek modu raflar arası taşı (batch versiyonunu kullanır) */
  public moveModBetweenShelves(modId: string, targetActive: boolean, targetModId?: string) {
    this.moveModsBetweenShelves([modId], targetActive, targetModId);
  }

  /** Birden çok modu TEK history adımı olarak raflar arası taşı */
  public moveModsBetweenShelves(modIds: string[], targetActive: boolean, targetModId?: string) {
    if (modIds.length === 0) return;
    this.takeSnapshot();
    const normalizedIds = modIds.map(id => id.toLowerCase());
    for (const normalizedId of normalizedIds) {
      this.workspaceMods = this.workspaceMods.filter(id => id !== normalizedId);
    }
    if (targetActive) {
      let insertIdx = -1;
      if (targetModId) {
        insertIdx = this.workspaceMods.indexOf(targetModId.toLowerCase());
      }
      if (insertIdx > -1) {
        this.workspaceMods.splice(insertIdx, 0, ...normalizedIds);
      } else {
        this.workspaceMods.push(...normalizedIds);
      }
    }
    this.activeIdSet = new Set(this.workspaceMods);
    this.syncVisualOrders();
    this.notifyActiveMods();
    this.pushHistory('toggle', normalizedIds);
  }

  public moveGroupBetweenShelves(groupId: string, targetActive: boolean) {
    this.takeSnapshot();
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    group.modIds.forEach(modId => {
      const normalizedId = modId.toLowerCase();
      const isActive = this.workspaceMods.includes(normalizedId);
      if (targetActive && !isActive) {
        this.workspaceMods.push(normalizedId);
      } else if (!targetActive && isActive) {
        this.workspaceMods = this.workspaceMods.filter(id => id !== normalizedId);
      }
    });
    this.activeIdSet = new Set(this.workspaceMods);
    this.syncVisualOrders();
    this.notifyActiveMods();
    this.pushHistory('group_move', [...group.modIds]);
  }

  /** Sistem gruplarını döndür (otomatik) — memoize edilmiş */
  public getSystemGroups(): ModGroup[] {
    if (this.systemGroupsCacheVersion !== this.cacheVersion) {
      this.systemGroupsCache = this.computeSystemGroups();
      this.systemGroupsCacheVersion = this.cacheVersion;
    }
    return this.systemGroupsCache;
  }

  /**
   * Verilen aktif mod listesinin sağlık durumunu hesaplar.
   * - 'bozuk': aktif modların HİÇBİRİ diskte mevcut değil (hepsi kayıp/ölü)
   * - 'has_kayip': en az bir aktif mod kayıp (dead)
   * - 'normal': tümü mevcut
   */
  public computeHealth(modIds: string[]): "normal" | "has_kayip" | "bozuk" {
    if (!modIds || modIds.length === 0) return "normal";
    let found = 0;
    let missing = 0;
    for (const id of modIds) {
      const m = this.modIdMap[id.toLowerCase()];
      if (!m || m.isDead) missing++;
      else found++;
    }
    if (found === 0) return "bozuk";
    if (missing > 0) return "has_kayip";
    return "normal";
  }

  /** Kayıp (dead) mod ID'lerini döndür */
  public getMissingModIds(modIds: string[]): string[] {
    return modIds.filter(id => {
      const m = this.modIdMap[id.toLowerCase()];
      return !m || m.isDead;
    });
  }

  private computeSystemGroups(): ModGroup[] {
    const systemGroups: ModGroup[] = [];

    // Silinen modlar grubu
    const deadMods = this.mods.filter(m => m.isDead);
    if (deadMods.length > 0) {
      systemGroups.push({
        id: '__dead__',
        name: 'SİLİNEN MODLAR',
        modIds: deadMods.map(m => m.package_id.toLowerCase()),
        expanded: this.systemExpanded.get('__dead__') ?? true,
        isSystem: true
      });
    }

    // DLC'ler grubu
    const dlcMods = this.mods.filter(m => m.isDlc);
    if (dlcMods.length > 0) {
      systemGroups.push({
        id: '__dlc__',
        name: 'DLC\'LER',
        modIds: dlcMods.map(m => m.package_id.toLowerCase()),
        expanded: this.systemExpanded.get('__dlc__') ?? true,
        isSystem: true
      });
    }

    return systemGroups;
  }

  public setError(msg: string | null) {
    this.error = msg;
    this.notifyError();
  }

  // Getters
  public getMods() {
    let filtered = [...this.mods];

    // 1. Search filter
    if (this.filterQuery) {
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(this.filterQuery) ||
        m.package_id.toLowerCase().includes(this.filterQuery) ||
        m.author.toLowerCase().includes(this.filterQuery)
      );
    }

    // 2. Status filter — lowercase normalize edilmiş karşılaştırma
    const activeIds = this.workspaceMods;
    if (this.statusFilter === "active") {
      filtered = filtered.filter(m => activeIds.includes(m.package_id.toLowerCase()));
    } else if (this.statusFilter === "inactive") {
      filtered = filtered.filter(m => !activeIds.includes(m.package_id.toLowerCase()));
    }

    // 3. Sorting
    filtered.sort((a, b) => {
      switch (this.sortOrder) {
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "version_desc": return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
        default: return 0;
      }
    });

    return filtered;
  }

  public findMod(modId: string): ModMetadata | undefined {
    return this.mods.find(mod => mod.package_id.toLowerCase() === modId.toLowerCase());
  }

  public getActiveProfileMods() { return this.workspaceMods; }
  public getGroups() { return this.groups; }
  public isLoading() { return this.loading; }
  public getError() { return this.error; }

  // ============================================================
  // External Mod (Harici Kaynak) Yönetimi
  // ============================================================

  public addExternalMods(externalMods: ModMetadata[]): void {
    const existingIds = new Set(this.mods.map(m => m.package_id.toLowerCase()));
    const newMods = externalMods.filter(m => !existingIds.has(m.package_id.toLowerCase()));

    this.mods = [
      ...this.mods,
      ...newMods.map(m => ({
        ...m,
        isExternal: true
      }))
    ];

    this.notifyMods();
  }

  public updateModPath(modId: string, newPath: string): void {
    const mod = this.mods.find(m => m.package_id.toLowerCase() === modId.toLowerCase());
    if (mod) {
      mod.dir_path = newPath;
      mod.isExternal = false;
      this.notifyMods();
      this.schedulePersistMods();
    }
  }

  // Notifications
  private notifyMods() {
    this.cacheVersion++;
    this.listeners.forEach(l => l(this.mods));
  }
  private notifyActiveMods() {
    this.cacheVersion++;
    this.activeModsListeners.forEach(l => l(this.workspaceMods));
  }
  private notifyGroups() {
    this.cacheVersion++;
    this.groupsListeners.forEach(l => l(this.groups));
  }
  private notifyLoading() { this.loadingListeners.forEach(l => l(this.loading)); }
  private notifyError() { this.errorListeners.forEach(l => l(this.error)); }
}

export const modStore = new ModStore();
