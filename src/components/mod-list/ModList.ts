import { modStore, settingsStore } from "../../store";
import { ModItem } from "./ModItem";
import { ModDetailPanel } from "./ModDetailPanel";
import { i18n } from "../../services/i18nService";
import type { ModMetadata, ModGroup } from "../../types";

interface DragState {
  type: "mod" | "group";
  id: string;
  sourceContainer: HTMLElement;
}

export class ModList {
  private activeShelf: HTMLElement;
  private inactiveShelf: HTMLElement;
  private detailPanel: ModDetailPanel;

  /** DOM element cache — incremental render için modId → HTMLElement */
  private modElements: Map<string, HTMLElement> = new Map();
  /** Grup header element cache — groupId → HTMLElement */
  private groupHeaderElements: Map<string, HTMLElement> = new Map();
  /** ModItem instance cache — yeniden oluşturmamak için */
  private modItemCache: Map<string, ModItem> = new Map();

  /** Sürükleme durumu */
  private dragState: DragState | null = null;

  /** Ghost element (sürüklenen görsel kopya) */
  private ghostElement: HTMLElement | null = null;

  /** Pointer drag state (touch & mouse ortak) */
  private pointerStartPos = { x: 0, y: 0 };
  private pointerTarget: HTMLElement | null = null;
  private isPointerDragging = false;

  /** Çoklu seçim — seçili mod ID'leri */
  private selectedMods: Set<string> = new Set();

  /** Shift seçim için ilk tıklanan mod */
  private shiftSelectAnchor: string | null = null;

  /** Sürükleme bittiğinde bir sonraki click'i bloke et (H8 fix) */
  private blockNextClick = false;

  /** AnimationService throttle */
  private animFrameId: number | null = null;
  private isRendering = false;

  /** Sürükleme görsel güncellemeleri — pointermove frekansında değil, RAF'da */
  private dragRafId: number | null = null;
  private pendingPointerPos: { x: number; y: number } | null = null;

  /** Drop indicator */
  private dropIndicator: HTMLElement | null = null;

  constructor(activeContainerId: string, inactiveContainerId: string, detailPanel: ModDetailPanel) {
    const activeContainer = document.getElementById(activeContainerId) as HTMLElement;
    const inactiveContainer = document.getElementById(inactiveContainerId) as HTMLElement;
    if (!activeContainer) throw new Error(`Container ${activeContainerId} not found`);
    if (!inactiveContainer) throw new Error(`Container ${inactiveContainerId} not found`);

    // HTML'de mod-shelf class'ı yok, runtime'da ekle (drag-drop tespiti için)
    activeContainer.classList.add('mod-shelf');
    inactiveContainer.classList.add('mod-shelf');

    this.activeShelf = activeContainer;
    this.inactiveShelf = inactiveContainer;
    this.detailPanel = detailPanel;

    // Subscribe'ları throttle et
    modStore.subscribe(() => this.scheduleRender());
    modStore.subscribeActiveMods(() => this.scheduleRender());
    modStore.subscribeGroups(() => this.scheduleRender());

    // Event delegation — RAF seviyesinde tek event listener (her mod için ayrı DEĞİL)
    this.setupPointerDrag();

    // Shelf search input'ları
    this.setupSearchInputs();

    // Klavye kısayolları (Delete/Space/Escape/Enter/ok tuşları)
    this.setupKeyboardShortcuts();

    // Focus yönetimi — Ctrl+A ve ok tuşu navigasyonu için shelf'ler odaklanabilir olmalı
    this.activeShelf.tabIndex = 0;
    this.inactiveShelf.tabIndex = 0;
  }

  /** Shelf search input'larına event listener bağla */
  private setupSearchInputs(): void {
    const activeSearch = document.getElementById('active-search') as HTMLInputElement;
    const librarySearch = document.getElementById('library-search') as HTMLInputElement;
    const globalSearch = document.getElementById('mod-search') as HTMLInputElement;

    if (activeSearch) {
      activeSearch.addEventListener('input', () => {
        modStore.setActiveFilter(activeSearch.value);
      });
    }

    if (librarySearch) {
      librarySearch.addEventListener('input', () => {
        modStore.setLibraryFilter(librarySearch.value);
      });
    }

    // Komut merkezindeki global arama — her iki raf filtresini de eşitler
    if (globalSearch) {
      globalSearch.addEventListener('input', () => {
        const q = globalSearch.value;
        modStore.setActiveFilter(q);
        modStore.setLibraryFilter(q);
        if (activeSearch) activeSearch.value = q;
        if (librarySearch) librarySearch.value = q;
      });
    }
  }

  // ============================================================
  // RENDER THROTTLE
  // ============================================================

  private scheduleRender(): void {
    if (this.isRendering) return;
    this.isRendering = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = requestAnimationFrame(() => {
      this.render();
      this.isRendering = false;
      this.animFrameId = null;
    });
  }

  // ============================================================
  // EVENT DELEGATION — SADECE POINTER EVENTS
  // (HTML5 Drag & Drop kullanılmıyor — pointer events her platformda çalışır)
  // ============================================================

  // ============================================================
  // GHOST ELEMENT
  // ============================================================

  private createGhostElement(source: HTMLElement): void {
    this.ghostElement = source.cloneNode(true) as HTMLElement;
    this.ghostElement.style.position = 'fixed';
    this.ghostElement.style.pointerEvents = 'none';
    this.ghostElement.style.width = source.offsetWidth + 'px';
    this.ghostElement.style.zIndex = '100';
    // left/top 0 — hareket transform ile (compositor) yapılır, layout yok
    this.ghostElement.style.left = '0px';
    this.ghostElement.style.top = '0px';
    this.ghostElement.classList.add('mod-drag-ghost');
    document.body.appendChild(this.ghostElement);

    // Çoklu seçim sürükleniyorsa ghost üzerinde adet rozeti göster
    if (this.selectedMods.size > 1) {
      const badge = document.createElement('div');
      badge.className = 'absolute -top-2 -right-2 bg-rust text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-slate-900/60';
      badge.textContent = `${this.selectedMods.size}`;
      this.ghostElement.appendChild(badge);
    }
  }

  private removeGhost(): void {
    if (this.ghostElement) {
      if (this.ghostElement.parentNode) {
        this.ghostElement.parentNode.removeChild(this.ghostElement);
      }
      this.ghostElement = null;
    }
  }

  // ============================================================
  // DROP INDICATOR
  // ============================================================

  private moveDropIndicator(clientX: number, clientY: number, precomputed?: Element[]): void {
    if (!this.dropIndicator) return;

    // Client koordinatlarına göre en yakın mod-card veya group-header'ı bul.
    // precomputed verilirse (RAF içinde tek hit-test) yeniden elementsFromPoint YAPMA.
    const elementsUnder = precomputed ?? document.elementsFromPoint(clientX, clientY);
    let target: HTMLElement | null = null;
    for (const el of elementsUnder) {
      const card = (el as HTMLElement).closest('.mod-card, .group-header') as HTMLElement;
      if (card) { target = card; break; }
    }

    if (!target) return;

    const rect = target.getBoundingClientRect();
    const parent = target.parentElement;
    if (!parent) return;

    // Farklı parent'a taşınacaksa önce çıkar
    if (this.dropIndicator.parentNode && this.dropIndicator.parentNode !== parent) {
      this.dropIndicator.remove();
    }

    // H4: Bölgeyi 3'e böl — üst %30 = üstüne, orta %40 = içine (sıralama), alt %30 = altına
    const thirdH = rect.height / 3;
    const relY = clientY - rect.top;

    if (relY < thirdH) {
      // Üst %30 → hedefin ÜSTÜNE
      parent.insertBefore(this.dropIndicator, target);
    } else if (relY > rect.height - thirdH) {
      // Alt %30 → hedefin ALTINA
      parent.insertBefore(this.dropIndicator, target.nextSibling);
    }
    // Orta %40 → indikatörü mevcut konumunda bırak (güncelleme yok)
  }

  // ============================================================
  // POINTER EVENTS (TOUCH + MOUSE ORTAK)
  // ============================================================

  private setupPointerDrag(): void {
    [this.activeShelf, this.inactiveShelf].forEach(shelf => {
      if (!shelf) return;
      shelf.addEventListener('pointerdown', (e) => this.handlePointerDown(e as PointerEvent));
    });

    // Ctrl+A — odaklı raftaki (ya da tüm görünür) modları seç (input odaktayken devre dışı)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
        e.preventDefault();
        // Odak hangi raftaysa onu seç; hiçbiri odakta değilse tüm görünür modları seç
        const focusedShelf = (activeEl?.closest?.('.mod-shelf') as HTMLElement | null) ?? null;
        const targetMods =
          focusedShelf === this.activeShelf ? modStore.getModsForShelf(true) :
          focusedShelf === this.inactiveShelf ? modStore.getModsForShelf(false) :
          modStore.getMods();
        targetMods.forEach(m => this.selectedMods.add(m.package_id.toLowerCase()));
        if (targetMods.length > 0) this.shiftSelectAnchor = targetMods[0].package_id.toLowerCase();
        this.scheduleRender();
      }
    });
  }

  /** Klavye kısayolları — uygulama hissi (Escape/Delete/Space/Enter/ok tuşları) */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const inInput = !!activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable);

      // Escape
      if (e.key === 'Escape') {
        // Arama kutusu odaktaysa önce onu temizle/kapat
        if (inInput) {
          (activeEl as HTMLInputElement).blur();
          const elId = activeEl.id;
          if (elId === 'active-search' || elId === 'library-search' || elId === 'mod-search') {
            (activeEl as HTMLInputElement).value = '';
            modStore.setActiveFilter('');
            modStore.setLibraryFilter('');
          }
          this.clearSelection();
          return;
        }

        // Aktif sürüklemeyi iptal et
        if (this.isPointerDragging || this.dragState) {
          this.isPointerDragging = false;
          if (this.pointerTarget) this.pointerTarget.classList.remove('mod-being-dragged');
          this.pointerTarget = null;
          this.clearDragState();
          document.removeEventListener('pointermove', this.handlePointerMove);
          document.removeEventListener('pointerup', this.handlePointerUp);
          return;
        }

        // Açık menüleri kapat + seçimi temizle
        document.querySelectorAll<HTMLElement>('.mod-actions-dropdown, .group-context-menu, .industrial-context-menu').forEach(m => m.remove());
        this.clearSelection();
        return;
      }

      if (inInput || e.ctrlKey || e.metaKey || e.altKey) return;

      // Delete/Backspace → seçili modları işle
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedMods.size === 0) return;
        e.preventDefault();
        this.handleDeleteSelected();
        return;
      }

      // Space → seçili modları toggle et
      if (e.key === ' ' || e.code === 'Space') {
        if (this.selectedMods.size === 0) return;
        e.preventDefault();
        this.handleSpaceToggle();
        return;
      }

      // Enter → seçili ilk modun detayını göster
      if (e.key === 'Enter') {
        if (this.selectedMods.size === 0) return;
        e.preventDefault();
        const first = this.selectedMods.values().next().value as string;
        const meta = modStore.findMod(first);
        if (meta) this.detailPanel.showMod(meta);
        return;
      }

      // Ok tuşları → seçim navigasyonu (Shift ile aralık genişletme)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.handleArrowSelection(e.key === 'ArrowDown' ? 1 : -1, e.shiftKey);
        return;
      }
    });
  }

  /** Delete: seçili aktif modları pasifleştir, kütüphane modlarını onay sorarak sil */
  private handleDeleteSelected(): void {
    const selected = Array.from(this.selectedMods);
    const activeSet = new Set(modStore.getActiveProfileMods().map(id => id.toLowerCase()));
    const toDeactivate = selected.filter(id => activeSet.has(id));
    const toDelete = selected.filter(id => !activeSet.has(id));

    if (toDeactivate.length > 0) {
      modStore.moveModsBetweenShelves(toDeactivate, false);
      this.detailPanel.clear();
      import("../shared/Toast").then(({ Toast }) => {
        Toast.show(`${toDeactivate.length} mod pasifleştirildi.`, "info");
      });
    }

    if (toDelete.length > 0) {
      import("../../services/modService").then(async ({ ModService }) => {
        const { Toast } = await import("../shared/Toast");
        if (confirm(i18n.t('mod_delete_multi_confirm').replace('{n}', String(toDelete.length)))) {
          let ok = 0;
          for (const id of toDelete) {
            try {
              await ModService.deleteMod(id);
              modStore.removeMod(id);
              ok++;
            } catch (err) {
              Toast.show(`"${id}" silinemedi: ${err}`, "error");
            }
          }
          if (ok > 0) Toast.show(`${ok} mod silindi.`, "success");
        } else {
          Toast.show("Silme iptal edildi.", "info");
        }
      });
    }

    this.clearSelection();
  }

  /** Space: seçili tüm modları aktif/pasif çevir (tek history adımı) */
  private handleSpaceToggle(): void {
    const selected = Array.from(this.selectedMods);
    if (selected.length === 0) return;
    modStore.toggleMods(selected);
    this.detailPanel.clear();
    import("../shared/Toast").then(({ Toast }) => {
      Toast.show(`${selected.length} mod çevrildi.`, "info");
    });
  }

  /** Ok tuşları ile seçim navigasyonu */
  private handleArrowSelection(direction: 1 | -1, extend: boolean): void {
    const activeEl = document.activeElement as HTMLElement | null;
    const shelf = (activeEl?.closest?.('.mod-shelf') as HTMLElement) || this.activeShelf;
    const isActive = shelf === this.activeShelf;
    const shelfMods = modStore.getModsForShelf(isActive);
    if (shelfMods.length === 0) return;
    const ids = shelfMods.map(m => m.package_id.toLowerCase());

    // Mevcut konum: anchor veya son seçili
    let currentIdx = this.shiftSelectAnchor ? ids.indexOf(this.shiftSelectAnchor) : -1;
    if (currentIdx === -1) {
      for (let i = ids.length - 1; i >= 0; i--) {
        if (this.selectedMods.has(ids[i])) { currentIdx = i; break; }
      }
    }
    if (currentIdx === -1) currentIdx = 0;

    const nextIdx = Math.max(0, Math.min(ids.length - 1, currentIdx + direction));

    if (extend) {
      // Shift+ok: anchor → yeni konum aralığını seç
      const anchorIdx = this.shiftSelectAnchor ? ids.indexOf(this.shiftSelectAnchor) : currentIdx;
      if (anchorIdx === -1) return;
      const start = Math.min(anchorIdx, nextIdx);
      const end = Math.max(anchorIdx, nextIdx);
      this.selectedMods.clear();
      for (let i = start; i <= end; i++) this.selectedMods.add(ids[i]);
    } else {
      // Düz ok: tek seçim, anchor'ı güncelle
      this.selectedMods.clear();
      this.selectedMods.add(ids[nextIdx]);
      this.shiftSelectAnchor = ids[nextIdx];
    }

    const meta = modStore.findMod(ids[nextIdx]);
    if (meta) this.detailPanel.showMod(meta);

    const el = this.modElements.get(ids[nextIdx]);
    el?.scrollIntoView({ block: 'nearest' });

    this.scheduleRender();
  }

  // Tüm seçimi temizle
  private clearSelection(): void {
    this.selectedMods.clear();
    this.shiftSelectAnchor = null;
    this.scheduleRender();
  }

  private handlePointerDown(e: PointerEvent): void {
    // Sadece sol tık (mouse) veya dokunma (touch)
    if (e.button !== 0) return;

    // ⋮ menü gibi elementlerde sürükleme başlatma
    if ((e.target as HTMLElement).closest('.mod-actions-dropdown, .mod-actions-trigger, .group-context-menu')) return;

    const target = (e.target as HTMLElement).closest('.mod-card, .group-header') as HTMLElement;
    if (!target) return;

    // Ctrl+Click: seçime ekle/çıkar
    if (e.ctrlKey || e.metaKey) {
      const modId = target.dataset.packageId?.toLowerCase();
      if (modId) {
        e.preventDefault();
        if (this.selectedMods.has(modId)) {
          this.selectedMods.delete(modId);
        } else {
          this.selectedMods.add(modId);
        }
        this.shiftSelectAnchor = modId;
        this.scheduleRender();
        return; // sürükleme başlatma
      }
    }

    // Shift+Click: aralık seç — hem aktif hem pasif rafta çalışır
    if (e.shiftKey && this.shiftSelectAnchor) {
      const modId = target.dataset.packageId?.toLowerCase();
      if (modId) {
        e.preventDefault();
        // İçinde bulunulan raftaki sırayı al
        const shelf = target.closest('.mod-shelf');
        const isActiveShelf = shelf === this.activeShelf;
        const shelfMods = modStore.getModsForShelf(isActiveShelf);
        const shelfIds = shelfMods.map(m => m.package_id.toLowerCase());
        const anchorIdx = shelfIds.indexOf(this.shiftSelectAnchor);
        const targetIdx = shelfIds.indexOf(modId);
        if (anchorIdx > -1 && targetIdx > -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          this.selectedMods.clear();
          for (let i = start; i <= end; i++) {
            this.selectedMods.add(shelfIds[i]);
          }
          this.scheduleRender();
        }
        return;
      }
    }

    // Normal tık: seçili olmayan bir moda tıklandıysa seçimi temizle
    // (seçili modlardan birine tıklayıp sürüklemek çoklu taşımayı korur)
    if (!e.ctrlKey && !e.shiftKey) {
      const modId = target.dataset.packageId?.toLowerCase();
      if (!modId || !this.selectedMods.has(modId)) {
        this.clearSelection();
      }
    }

    this.pointerStartPos = { x: e.clientX, y: e.clientY };
    this.pointerTarget = target;

    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.pointerTarget) return;

    const dx = e.clientX - this.pointerStartPos.x;
    const dy = e.clientY - this.pointerStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 10px'den fazla hareket = sürükleme başladı (anında, RAF'sız — gecikme hissi olmaz)
    if (distance > 10 && !this.isPointerDragging) {
      this.beginDrag();
    }

    if (this.isPointerDragging) {
      // Görsel güncellemeleri RAF'a al — pointermove 60-120Hz'de koşar,
      // elementsFromPoint+layout her event'te çalışırsa jank olur.
      this.pendingPointerPos = { x: e.clientX, y: e.clientY };
      if (this.dragRafId === null) {
        this.dragRafId = requestAnimationFrame(() => this.processDragFrame());
      }
    }
  };

  /** Sürükleme başlangıcı — ghost + dragState + drop indicator kurulumu */
  private beginDrag(): void {
    if (!this.pointerTarget) return;
    this.isPointerDragging = true;
    this.pointerTarget.classList.add('mod-being-dragged');

    // Ghost element oluştur
    this.createGhostElement(this.pointerTarget);

    // DragState'i ayarla — closest('.mod-shelf') ile güvenilir shelf tespiti
    const isGroup = this.pointerTarget.classList.contains('group-header');
    const id = (this.pointerTarget.dataset.groupId || this.pointerTarget.dataset.packageId || '').toLowerCase();
    const sourceShelf = this.pointerTarget.closest('.mod-shelf') as HTMLElement;
    this.dragState = {
      type: isGroup ? 'group' : 'mod',
      id,
      sourceContainer: sourceShelf || this.activeShelf
    };

    // Drop indicator oluştur
    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'drop-indicator';
  }

  /** RAF'ta çalışan sürükleme görsel güncellemesi — frame başına TEK elementsFromPoint */
  private processDragFrame(): void {
    this.dragRafId = null;
    const pos = this.pendingPointerPos;
    if (!pos) return;

    // Ghost element'in pozisyonunu güncelle — transform (compositor-only, layout YOK)
    if (this.ghostElement) {
      this.ghostElement.style.transform = `translate(${pos.x - 20}px, ${pos.y - 20}px) rotate(2deg) scale(1.02)`;
    }

    // H5: Auto-scroll — fare görünür alanın alt/üst %5'ine yaklaşınca scroll et
    const scrollSpeed = 12;
    const scrollZone = 50; // px
    const shelves = [this.activeShelf, this.inactiveShelf];
    for (const shelf of shelves) {
      if (!shelf) continue;
      const sRect = shelf.getBoundingClientRect();
      if (pos.y < sRect.top + scrollZone) {
        shelf.scrollTop -= scrollSpeed;
      } else if (pos.y > sRect.bottom - scrollZone) {
        shelf.scrollTop += scrollSpeed;
      }
    }

    // Tek hit-test — hem drop zone highlight hem drop indicator için paylaşılır
    const elementsUnder = document.elementsFromPoint(pos.x, pos.y);

    // Drop zone highlight (önceki highlight'ı temizle — çoklu highlight olmasın)
    this.clearDragHighlights();
    for (const el of elementsUnder) {
      const shelf = (el as HTMLElement).closest('.mod-shelf') as HTMLElement;
      if (shelf) {
        shelf.classList.add('shelf-drag-over');
        break;
      }
    }

    // Drop indicator'ı tek hit-test sonucuyla taşı
    this.moveDropIndicator(pos.x, pos.y, elementsUnder);
  }

  private handlePointerUp = (e: PointerEvent): void => {
    // Yerel referans — forEach closure'ında this.dragState null-daraltması kaybolur (TS2531)
    const dragState = this.dragState;
    if (this.isPointerDragging && dragState) {
      // Drop işlemini gerçekleştir — pointer'ın gerçek konumundan hedef tespiti
      const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);

      let targetShelf: HTMLElement | null = null;
      let targetMod: HTMLElement | null = null;

      for (const el of elementsUnder) {
        const shelf = (el as HTMLElement).closest('.mod-shelf') as HTMLElement;
        if (shelf && !targetShelf) targetShelf = shelf;
        const modCard = (el as HTMLElement).closest('.mod-card') as HTMLElement;
        if (modCard && !targetMod) targetMod = modCard;
      }

      // Hedef shelf bulunamazsa, görünürdeki tüm shelf'leri dene (fallback)
      if (!targetShelf) {
        const allShelves = document.querySelectorAll('.mod-shelf');
        for (const shelf of allShelves) {
          const rect = shelf.getBoundingClientRect();
          if (
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom
          ) {
            targetShelf = shelf as HTMLElement;
            break;
          }
        }
      }

      if (targetShelf) {
        const targetShelfIsActive = targetShelf === this.activeShelf;
        const sourceShelfIsActive = dragState.sourceContainer === this.activeShelf;
        const sameShelf = targetShelfIsActive === sourceShelfIsActive;
        const targetModId = targetMod?.dataset?.packageId;

        // 🔥 ÇOKLU SÜRÜKLEME: selectedMods > 1 ise tüm seçili modları taşı
        const idsToMove = this.selectedMods.size > 1
          ? Array.from(this.selectedMods)
          : [dragState.id];

        if (sameShelf && targetModId && targetModId !== dragState.id) {
          // Aynı rafta sürükleme — çoklu seçim TEK history adımı
          if (targetShelfIsActive) {
            if (idsToMove.length > 1) {
              modStore.reorderActiveVisualBatch(idsToMove, targetModId);
            } else {
              modStore.reorderActiveVisual(idsToMove[0], targetModId);
            }
          } else {
            // Kütüphane sıralama: reorderLibraryMods çağrılsın (visual + kalıcı)
            idsToMove.forEach(id => modStore.reorderLibraryMods(id, targetModId));
          }
        } else {
          // Farklı rafa sürükleme — çoklu seçim TEK history adımı
          if (dragState.type === 'group') {
            modStore.moveGroupBetweenShelves(dragState.id, targetShelfIsActive);
          } else {
            modStore.moveModsBetweenShelves(idsToMove, targetShelfIsActive, targetModId);
          }
        }

        // Detay panelini güncelle (sadece tek mod için)
        if (idsToMove.length === 1) {
          const targetMeta = modStore.findMod(dragState.id);
          if (targetMeta) this.detailPanel.showMod(targetMeta);
        }
      }
    }

    // Pointer state'i temizle
    this.isPointerDragging = false;
    if (this.pointerTarget) {
      this.pointerTarget.classList.remove('mod-being-dragged');
    }

    // 🔥 H8 FIX: Sürükleme gerçekten başlamışsa (distance > 10px) bir sonraki click'i bloke et
    if (this.pointerTarget) {
      const dx = e.clientX - this.pointerStartPos.x;
      const dy = e.clientY - this.pointerStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 10) {
        this.blockNextClick = true;
        // 200ms sonra kilidi kaldır (click event'i bu sürede gelir)
        setTimeout(() => { this.blockNextClick = false; }, 200);
      }
    }

    this.pointerTarget = null;
    this.clearDragState();
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
  };

  // ============================================================
  // DRAG STATE CLEANUP
  // ============================================================

  private clearDragState(): void {
    if (this.dragRafId !== null) {
      cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }
    this.pendingPointerPos = null;
    document.querySelectorAll('.mod-being-dragged').forEach(el => el.classList.remove('mod-being-dragged'));
    this.removeGhost();
    this.clearDragHighlights();
    this.clearDropIndicator();
    this.dragState = null;
  }

  private clearDragHighlights(): void {
    document.querySelectorAll('.shelf-drag-over').forEach(el => el.classList.remove('shelf-drag-over'));
  }

  private clearDropIndicator(): void {
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    this.dropIndicator = null;
  }

  // ============================================================
  // INCREMENTAL RENDER — innerHTML = "" KULLANMA
  // ============================================================

  public render(): void {
    const allMods = modStore.getMods(); // tüm modlar (önbellek temizliği için)
    const activeIds = modStore.getActiveProfileMods();
    const userGroups = modStore.getGroups();
    const systemGroups = modStore.getSystemGroups();

    // Per-shelf filtrelenmiş+sıralanmış mod listeleri
    const activeMods = modStore.getModsForShelf(true);
    const libraryMods = modStore.getModsForShelf(false);

    // Sistem grupları + kullanıcı grupları birleştir (sistem grupları önce)
    const allGroups = [...systemGroups, ...userGroups];

    // Önbellek temizliği
    this.cleanupCache(allMods, allGroups);

    // Incremental render — her shelf kendi filtrelenmiş+sıralanmış listesini kullanır
    this.renderShelf(this.activeShelf, true, activeMods, activeIds, allGroups, false);
    this.renderShelf(this.inactiveShelf, false, libraryMods, activeIds, allGroups, true);

    // Sayıları güncelle
    const selCount = this.selectedMods.size;
    const selSuffix = selCount > 0 ? ` · ${selCount} SEÇİLİ` : '';
    const libEl = document.getElementById('library-count');
    if (libEl) {
      libEl.innerText = `${libraryMods.length} MOD${selSuffix}`;
    }
    const actEl = document.getElementById('active-count');
    if (actEl) {
      actEl.innerText = `${activeMods.length} MOD${selSuffix}`;
    }

    // Seçim durum çubuğu (aktif raf toolbar'ı) — toplu işlem ipuçları
    document.querySelectorAll('.shelf-toolbar').forEach(tb => {
      tb.textContent = '';
      if (selCount > 0) {
        const hint = i18n.t('selected_hint').replace('{n}', String(selCount));
        tb.innerHTML = `
          <span class="text-[9px] font-mono uppercase tracking-wider text-rust-light flex items-center gap-2">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            ${hint}
          </span>`;
      }
    });

    // Not: AnimationService.loadAll() buraya çağrılmaz — Lottie ikonları render
    // frekansında yeniden yüklenmemeli; bir kez yüklenir (bknz. AnimationService).
  }

  /** Store'da artık olmayan modları ve grupları cache'ten temizle */
  private cleanupCache(mods: ModMetadata[], groups: ModGroup[]): void {
    const validModIds = new Set(mods.map(m => m.package_id.toLowerCase()));
    const validGroupIds = new Set(groups.map(g => g.id));

    for (const [modId] of this.modElements) {
      if (!validModIds.has(modId)) {
        this.modElements.delete(modId);
        this.modItemCache.delete(modId);
      }
    }

    for (const [groupId] of this.groupHeaderElements) {
      if (!validGroupIds.has(groupId)) {
        this.groupHeaderElements.delete(groupId);
      }
    }
  }

  private renderShelf(
    container: HTMLElement,
    targetActive: boolean,
    shelfMods: ModMetadata[],  // zaten filtrelenmiş+sıralanmış (getModsForShelf ile)
    activeIds: string[],
    groups: ModGroup[],
    _isLibShelf: boolean
  ): void {
    // Empty state kontrol
    if (shelfMods.length === 0 && groups.length === 0) {
      this.renderEmptyState(container, targetActive);
      return;
    }

    // 2. Olması gereken tüm element'leri sıralı şekilde belirle
    const orderedElements: Array<{ type: 'mod' | 'group' | 'other-header' | 'toolbar'; id: string; el: HTMLElement }> = [];

    // Toolbar (sadece aktif raf)
    if (targetActive) {
      const toolbar = container.querySelector('.shelf-toolbar') as HTMLElement;
      if (toolbar) {
        orderedElements.push({ type: 'toolbar', id: '__toolbar__', el: toolbar });
      } else {
        const newToolbar = this.createToolbar();
        orderedElements.push({ type: 'toolbar', id: '__toolbar__', el: newToolbar });
      }
    }

    // Grupları işle — modId → grup eşlemesini ve raftaki mod map'ini BİR KEZ kur.
    // Eski kod her grup için shelfMods.filter(group.modIds.includes(...)) yapıyordu
    // (O(grup × mod × includes)). Yeni: O(mod + toplam grup üyeliği).
    const groupedIds = new Set<string>();
    const modToGroup = new Map<string, ModGroup>();
    for (const group of groups) {
      for (const id of group.modIds) {
        if (!modToGroup.has(id)) modToGroup.set(id, group);
        groupedIds.add(id);
      }
    }
    const shelfModById = new Map<string, ModMetadata>();
    for (const m of shelfMods) shelfModById.set(m.package_id.toLowerCase(), m);

    groups.forEach(group => {
      // Bu gruba ait VE bu rafta görünen modlar
      const groupMods: ModMetadata[] = [];
      for (const id of group.modIds) {
        if (modToGroup.get(id) !== group) continue; // bir mod birden çok gruba yazılamaz
        const mod = shelfModById.get(id);
        if (mod) groupMods.push(mod);
      }
      if (groupMods.length === 0) {
        return;
      }

      // Grup header elementi
      let groupEl = this.groupHeaderElements.get(group.id);
      if (!groupEl) {
        groupEl = this.createGroupHeaderElement(group, targetActive, container);
        this.groupHeaderElements.set(group.id, groupEl);
      } else {
        // Cache'ten alınan header'ın arrow rotation'ını güncelle
        const arrow = groupEl.querySelector('span') as HTMLElement;
        if (arrow) {
          arrow.className = `text-[10px] font-mono text-slate-500 transition-transform duration-150 ${group.expanded ? 'rotate-90' : ''}`;
        }
      }
      orderedElements.push({ type: 'group', id: group.id, el: groupEl });

      // Grup içi modlar (genişletilmişse) — sıra içeride korunur (zaten getModsForShelf ile sıralı)
      if (group.expanded) {
        groupMods.forEach(m => {
          const modEl = this.getOrCreateModElement(m, targetActive, activeIds);
          orderedElements.push({ type: 'mod', id: m.package_id.toLowerCase(), el: modEl });
          groupedIds.add(m.package_id.toLowerCase());
        });
      }
    });

    // Grup dışı modlar — sıra zaten korunuyor
    const ungroupedMods = shelfMods.filter(m => !groupedIds.has(m.package_id.toLowerCase()));

    if (groups.length > 0 && ungroupedMods.length > 0) {
      // "Diğer Modlar" başlığı
      const existingOtherHeader = container.querySelector('.other-header') as HTMLElement;
      if (existingOtherHeader) {
        orderedElements.push({ type: 'other-header', id: '__other__', el: existingOtherHeader });
        const countSpan = existingOtherHeader.querySelector('span:last-child');
        if (countSpan) countSpan.textContent = `(${ungroupedMods.length})`;
      } else {
        const otherHeader = this.createOtherHeader(ungroupedMods.length);
        orderedElements.push({ type: 'other-header', id: '__other__', el: otherHeader });
      }
    }

    ungroupedMods.forEach(m => {
      const modEl = this.getOrCreateModElement(m, targetActive, activeIds);
      orderedElements.push({ type: 'mod', id: m.package_id.toLowerCase(), el: modEl });
    });

    // 3. Mevcut DOM child'larını al
    const currentChildren = Array.from(container.children);

    // 4. DOM'u güncelle — sadece farklılıkları uygula
    this.syncDOM(container, currentChildren, orderedElements);
  }

  /** DOM ile olması gereken element listesini senkronize et — ters sırada insertBefore ile index kayması yok */
  private syncDOM(
    container: HTMLElement,
    _currentChildren: Element[],
    orderedElements: Array<{ type: string; id: string; el: HTMLElement }>
  ): void {
    // Olması gereken key'lerin Set'i
    const requiredKeySet = new Set(orderedElements.map(o => `${o.type}:${o.id}`));

    // Gereksiz elementleri kaldır (ters sırada)
    const existing = Array.from(container.children);
    for (let i = existing.length - 1; i >= 0; i--) {
      const child = existing[i] as HTMLElement;
      const key =
        child.dataset.packageId ? `mod:${child.dataset.packageId}` :
        child.dataset.groupId ? `group:${child.dataset.groupId}` :
        child.classList.contains('shelf-toolbar') ? 'toolbar:__toolbar__' :
        child.classList.contains('other-header') ? 'other-header:__other__' :
        child.classList.contains('shelf-empty-state') ? '__empty__' :
        null;
      
      if (key && !requiredKeySet.has(key)) {
        container.removeChild(child);
      }
    }

    // Ters sırada yerleştir (index kayması olmaz)
    let reference: Node | null = null;
    for (let i = orderedElements.length - 1; i >= 0; i--) {
      const { el } = orderedElements[i];
      if (el.parentNode !== container) {
        container.insertBefore(el, reference);
      }
      reference = el;
    }
  }

  /** Cache'ten mod elementi al, yoksa oluştur */
  private getOrCreateModElement(mod: ModMetadata, isActive: boolean, _activeIds: string[]): HTMLElement {
    const modId = mod.package_id.toLowerCase();
    let el = this.modElements.get(modId);

    if (!el) {
      // Yeni ModItem oluştur
      const group = modStore.getGroups().find(g => g.modIds.includes(modId));
      const groupName = group ? group.name : undefined;

      const modItem = new ModItem(mod, isActive, (id) => this.handleToggle(id), groupName);
      const modElement = modItem.getElement();
      modElement.dataset.packageId = mod.package_id;

      // Click → detay paneli
      modElement.addEventListener('click', (e) => {
        // Sağ tık click'ini yok say (contextmenu ayrıca açılır)
        if ((e as MouseEvent).button !== 0) return;
        // H8: Sürükleme sonrası click'i bloke et
        if (this.blockNextClick) {
          this.blockNextClick = false;
          return;
        }
        if (this.isPointerDragging || this.dragState !== null) return;
        e.stopPropagation();
        const meta = modStore.findMod(mod.package_id);
        if (meta) this.detailPanel.showMod(meta);
      });

      this.modElements.set(modId, modElement);
      this.modItemCache.set(modId, modItem);
      el = modElement;
    } else {
      // Mevcut elementi güncelle (isActive değişmiş olabilir)
      this.updateModElementVisuals(el, mod, isActive);
    }

    // Seçili durum göstergesi
    if (this.selectedMods.has(modId)) {
      el.classList.add('mod-is-selected');
    } else {
      el.classList.remove('mod-is-selected');
    }

    return el;
  }

  /** Mod elementinin görsel durumunu güncelle (isActive) */
  private updateModElementVisuals(el: HTMLElement, _mod: ModMetadata, isActive: boolean): void {
    // Border/Link rengi
    if (isActive) {
      el.className = el.className
        .replace(/border-slate-\d+/g, 'border-rust')
        .replace(/hover:border-slate-\d+/g, 'hover:border-rust');
      if (!el.className.includes('border-rust')) {
        el.className += ' border-rust hover:border-rust';
      }
    } else {
      el.className = el.className
        .replace(/border-rust/g, 'border-slate-700')
        .replace(/hover:border-rust/g, 'hover:border-slate-600');
      if (!el.className.includes('border-slate')) {
        el.className += ' border-slate-700 hover:border-slate-600';
      }
    }

    // Status indicator (nokta)
    const indicator = el.querySelector('span:first-child') as HTMLElement;
    if (indicator) {
      indicator.className = `shrink-0 w-2 h-2 rounded-full ${
        isActive ? 'bg-rust shadow-[0_0_6px_rgba(179,93,45,0.5)]' : 'bg-slate-600'
      }`;
    }

    // Status badge
    const badge = el.querySelector('.mod-status-badge') as HTMLElement;
    if (badge) {
      badge.className = `mod-status-badge text-[8px] font-mono uppercase tracking-wider px-1 py-px rounded-sm shrink-0 ${
        isActive
          ? 'bg-rust text-white border border-rust'
          : 'bg-slate-700 text-slate-300 border border-slate-600'
      }`;
      badge.textContent = isActive ? i18n.t('badge_active') : i18n.t('badge_inactive');
      badge.setAttribute('data-i18n', isActive ? 'badge_active' : 'badge_inactive');
    }
    
    // Çoklu seçim göstergesini koru
    const modId = _mod.package_id.toLowerCase();
    if (this.selectedMods.has(modId)) {
      el.classList.add('mod-is-selected');
    }
  }

  // ============================================================
  // STATIC ELEMENT CREATORS
  // ============================================================

  private renderEmptyState(container: HTMLElement, targetActive: boolean): void {
    // Önce container'da empty state var mı kontrol et
    const existingEmpty = container.querySelector('.shelf-empty-state');
    if (existingEmpty) return; // Zaten varsa hiçbir şey yapma

    // Tüm mevcut child'ları temizle (sadece ilk empty state oluşumunda)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const emptyEl = document.createElement('div');
    emptyEl.className = 'shelf-empty-state flex flex-col items-center justify-center p-12 text-gray-500 h-full border-2 border-dashed border-slate-700 rounded-sm bg-slate-900';
    emptyEl.innerHTML = `
      <p class="text-[10px] font-mono tracking-wider text-center uppercase">${
        targetActive
          ? i18n.t('drag_hint')
          : i18n.t('empty_library')
      }</p>
    `;

    container.appendChild(emptyEl);
  }

  private createToolbar(): HTMLElement {
    // Grup Oluştur butonu kaldırıldı — boş toolbar sadece layout dengesi için
    const toolbarDiv = document.createElement('div');
    toolbarDiv.className = 'shelf-toolbar flex items-center gap-2 px-3 py-2 mb-1 bg-slate-900 border-l-2 border-rust';
    return toolbarDiv;
  }

  private createGroupHeaderElement(group: ModGroup, targetActive: boolean, _container: HTMLElement): HTMLElement {
    const isSystem = group.isSystem === true;
    const borderColor = targetActive ? 'border-rust/60' : 'border-blue-500/40';
    
    // Sistem grupları farklı renk
    const bgColor = isSystem
      ? (group.id === '__dead__' ? 'bg-red-900' : 'bg-blue-900')
      : 'bg-slate-800';
    const cursorClass = isSystem ? 'cursor-default' : 'cursor-pointer';

    const groupHeader = document.createElement('div');
    groupHeader.className = `group-header flex items-center gap-2 px-3 py-2 mb-px ${bgColor} border-l-2 ${borderColor} ${cursorClass} select-none transition-colors duration-150 ${isSystem ? '' : 'hover:bg-slate-700'}`;
    groupHeader.dataset.groupId = group.id;
    
    // Sistem grupları sürüklenemez
    if (isSystem) {
      groupHeader.style.cursor = 'default';
    }

    // Aç/kapa oku
    const arrow = document.createElement('span');
    arrow.className = `text-[10px] font-mono text-slate-500 transition-transform duration-150 ${group.expanded ? 'rotate-90' : ''}`;
    arrow.innerText = '▶';

    // Grup adı
    const nameSpan = document.createElement('span');
    nameSpan.className = 'text-[10px] font-mono font-bold uppercase tracking-widest text-slate-300 flex-1';
    nameSpan.innerText = group.name;

    // Sistem grubu badge
    if (isSystem) {
      const badge = document.createElement('span');
      badge.className = 'text-[7px] font-mono uppercase px-1 py-px rounded-sm bg-slate-700/50 text-slate-500 border border-slate-600/20';
      badge.textContent = 'SISTEM';
      nameSpan.appendChild(badge);
    }

    // Sayı
    const countSpan = document.createElement('span');
    countSpan.className = 'text-[9px] font-mono text-slate-500';
    countSpan.innerText = `${group.modIds.length}`;

    groupHeader.appendChild(arrow);
    groupHeader.appendChild(nameSpan);
    groupHeader.appendChild(countSpan);

    // Tıkla — genişlet/daralt
    groupHeader.addEventListener('click', (e) => {
      if ((e as MouseEvent).button !== 0) return; // Sağ tık click'ini yok say
      if (this.dragState && this.dragState.id === group.id) return;
      e.stopPropagation();
      modStore.toggleGroupExpand(group.id);
    });

    // Sağ tık — menü (sadece kullanıcı grupları için)
    if (!isSystem) {
      groupHeader.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showGroupContextMenu(e, group);
      });
    }

    return groupHeader;
  }

  private createOtherHeader(count: number): HTMLElement {
    const otherHeader = document.createElement('div');
    otherHeader.className = 'other-header flex items-center gap-2 px-3 py-1.5 mt-2 mb-1 bg-slate-800 border-l-2 border-slate-600 cursor-default select-none';
    otherHeader.innerHTML = `
      <span data-i18n="other_mods" class="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">${i18n.t('other_mods')}</span>
      <span class="text-[9px] font-mono text-slate-600">(${count})</span>
    `;
    return otherHeader;
  }

  // ============================================================
  // GROUP CONTEXT MENU
  // ============================================================

  private showGroupContextMenu(e: MouseEvent, group: ModGroup): void {
    document.querySelectorAll('.group-context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'group-context-menu fixed min-w-[150px] bg-slate-800 border border-slate-700 rounded-sm shadow-xl z-[1000] py-1';
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 160)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 100)}px`;

    // Yeniden adlandır
    const renameItem = document.createElement('div');
    renameItem.className = 'px-3 py-2 text-[10px] font-mono text-slate-300 hover:bg-rust hover:text-white cursor-pointer transition-colors flex items-center gap-2';
    renameItem.innerHTML = `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke-linecap="round" stroke-linejoin="round"/></svg> Yeniden Adlandır`;
    renameItem.addEventListener('click', () => {
      menu.remove();
      const name = prompt(i18n.t('group_rename_prompt'), group.name);
      if (name && name.trim() !== '') {
        modStore.updateGroupName(group.id, name.trim());
      }
    });

    // Sil
    const deleteItem = document.createElement('div');
    deleteItem.className = 'px-3 py-2 text-[10px] font-mono text-red-400 hover:bg-red-900 hover:text-red-300 cursor-pointer transition-colors flex items-center gap-2';
    deleteItem.innerHTML = `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg> Grubu Sil`;
    deleteItem.addEventListener('click', () => {
      menu.remove();
      if (confirm(i18n.t('group_delete_confirm').replace('{name}', group.name))) {
        modStore.deleteGroup(group.id);
      }
    });

    menu.appendChild(renameItem);
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    const closeHandler = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
  }

  // ============================================================
  // UTILITY
  // ============================================================

  private async handleToggle(packageId: string): Promise<void> {
    const mod = modStore.findMod(packageId);
    
    // Harici mod aktifleştiriliyor → dosyayı RimWorld/Mods klasörüne taşı
    if (mod?.isExternal) {
      const isCurrentlyActive = modStore.getActiveProfileMods().includes(packageId.toLowerCase());
      
      // Sadece pasifken aktifleştiriliyorsa (library → active) taşı
      if (!isCurrentlyActive) {
        try {
          const { ModService } = await import("../../services/modService");
          const rimworldModsPath = settingsStore.getSettings().rimworld_mods_path;
          if (!rimworldModsPath) {
            throw new Error("RimWorld Mods yolu ayarlı değil.");
          }

          // Modun geçerli bir path'i var mı kontrol et
          if (!mod.dir_path || mod.dir_path.trim() === '') {
            console.error("[ModList] Harici modun yolu boş:", mod.package_id);
            return;
          }

          const newPath = await ModService.moveModToRimworld(mod.dir_path, rimworldModsPath);

          // Modun path'ini güncelle ve harici bayrağını kaldır
          modStore.updateModPath(packageId, newPath);
          
          // Toast göster
          const { Toast } = await import("../shared/Toast");
          Toast.show(`"${mod.name}" RimWorld/Mods klasörüne taşındı.`, "success");
        } catch (err) {
          console.error("[ModList] Harici mod taşınamadı:", err);
          const { Toast } = await import("../shared/Toast");
          const errMsg = err instanceof Error ? err.message : String(err);
          Toast.show(`"${mod.name}" taşınamadı: ${errMsg}`, "error");
          return; // Taşıma başarısız → toggle'ı iptal et
        }
      }
    }

    // Normal toggle
    modStore.toggleMod(packageId);
  }
}
