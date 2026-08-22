import { ModMetadata } from "../../types";
import { modStore } from "../../store";
import { i18n } from "../../services/i18nService";

export class ModItem {
  private element: HTMLElement;
  private statusLabel: HTMLSpanElement;
  private statusIndicator: HTMLSpanElement;

  constructor(mod: ModMetadata, isActive: boolean, onToggle: (id: string) => void, groupName?: string) {
    this.element = document.createElement("div");
    this.element.className = `mod-card group relative flex items-center justify-between px-3 py-2 min-h-[44px] bg-slate-800 border-l-2 transition-colors duration-150 cursor-pointer select-none hover:bg-slate-700 ${
      isActive
        ? 'border-rust hover:border-rust'
        : 'border-slate-700 hover:border-slate-600'
    }${mod.isDlc ? ' mod-is-dlc' : ''}${mod.isExternal ? ' mod-is-external' : ''}${mod.isDead ? ' mod-is-dead' : ''}`;

    const mainContent = document.createElement("div");
    mainContent.className = "flex items-center gap-2.5 overflow-hidden min-w-0 flex-1";

    // Status göstergesi — küçük nokta
    this.statusIndicator = document.createElement("span");
    this.statusIndicator.className = `shrink-0 w-2 h-2 rounded-full ${
      isActive ? 'bg-rust shadow-[0_0_6px_rgba(179,93,45,0.5)]' : 'bg-slate-600'
    }`;

    // Bilgi alanı
    const info = document.createElement("div");
    info.className = "flex flex-col overflow-hidden min-w-0 flex-1";

    const nameRow = document.createElement("div");
    nameRow.className = "flex items-center gap-2";

    const name = document.createElement("span");
    name.className = `text-[11px] truncate ${
      isActive ? 'text-slate-200 font-medium' : 'text-slate-400'
    }${mod.isDead ? ' text-red-400 line-through' : ''}`;
    name.textContent = mod.name;

    // Silinen mod badge
    if (mod.isDead) {
      const deadBadge = document.createElement("span");
      deadBadge.className = "shrink-0 px-1 py-px rounded-sm text-[7px] font-mono uppercase tracking-wider bg-red-900 text-red-300 border border-red-700";
      deadBadge.textContent = i18n.t('badge_deleted');
      nameRow.appendChild(deadBadge);
    }

    // Status badge
    this.statusLabel = document.createElement("span");
    this.statusLabel.className = `mod-status-badge text-[8px] font-mono uppercase tracking-wider px-1 py-px rounded-sm shrink-0 ${
      isActive
        ? 'bg-rust text-white border border-rust'
        : 'bg-slate-700 text-slate-300 border border-slate-600'
    }`;
    this.statusLabel.textContent = isActive ? i18n.t('badge_active') : i18n.t('badge_inactive');

    // Harici kaynak badge (sadece harici modlarda)
    if (mod.isExternal) {
      const badge = document.createElement('span');
      badge.className = 'mod-source-badge';
      badge.textContent = i18n.t('badge_external');
      nameRow.appendChild(badge);
    }

    nameRow.appendChild(name);
    if (groupName) {
      const badge = document.createElement("span");
      badge.className = "shrink-0 px-1.5 py-px rounded-sm text-[8px] font-mono uppercase tracking-wider bg-slate-700 text-slate-300 border border-slate-600";
      badge.textContent = groupName;
      nameRow.appendChild(badge);
    }
    nameRow.appendChild(this.statusLabel);

    // Versiyon gösterimi - undefined/boş ise em dash
    const versionText = mod.version && mod.version.trim() ? `v${mod.version}` : '\u2014';

    // Meta satırı
    const meta = document.createElement("div");
    meta.className = "flex items-center gap-2 text-[9px] text-slate-500 font-mono";
    meta.innerHTML = `
      <span class="truncate max-w-[120px]">${mod.package_id}</span>
      <span class="shrink-0">${versionText}</span>
      <span class="shrink-0 hidden sm:inline">${mod.author}</span>
    `;

    info.appendChild(nameRow);
    info.appendChild(meta);
    mainContent.appendChild(this.statusIndicator);
    mainContent.appendChild(info);

    // Actions trigger (⋮)
    const actionsTrigger = document.createElement("div");
    actionsTrigger.className = "shrink-0 flex items-center justify-center w-6 h-6 text-slate-500 hover:text-slate-200 rounded-sm hover:bg-slate-700/60 transition-colors duration-100 cursor-pointer";
    actionsTrigger.innerHTML = `
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12 5v.01M12 12v.01M12 19v.01" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    // Dropdown menü — dinamik pozisyon
    const menuContainer = document.createElement("div");
    menuContainer.className = "mod-actions-dropdown fixed min-w-[160px] bg-slate-800 border border-slate-700 rounded-sm shadow-xl z-[1000] py-1 hidden";
    menuContainer.innerHTML = `
      <div class="action-item-toggle px-3 py-2 text-[10px] font-mono text-slate-300 hover:bg-rust hover:text-white cursor-pointer transition-colors flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-red-400' : 'bg-emerald-400'}"></span>
        <span data-i18n="${isActive ? 'mod_deactivate' : 'mod_activate'}">${i18n.t(isActive ? 'mod_deactivate' : 'mod_activate')}</span>
      </div>
      <div class="border-t border-slate-700 my-1"></div>
      <div class="action-item-download px-3 py-2 text-[10px] font-mono text-slate-300 hover:bg-rust hover:text-white cursor-pointer transition-colors flex items-center gap-2">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span data-i18n="mod_download">${i18n.t('mod_download')}</span>
      </div>
      <div class="border-t border-slate-700 my-1"></div>
      <div class="mod-group-section">
        <div class="px-3 py-2 text-[9px] font-mono uppercase tracking-wider text-slate-500 select-none flex items-center gap-2">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="mod_add_group">${i18n.t('mod_add_group')}</span>
        </div>
        <div class="mod-group-list"></div>
        <div class="px-3 py-2 text-[10px] font-mono text-slate-400 hover:bg-rust hover:text-white cursor-pointer transition-colors flex items-center gap-2 action-item-new-group">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span data-i18n="mod_new_group">${i18n.t('mod_new_group')}</span>
        </div>
      </div>
      <div class="border-t border-slate-700 my-1"></div>
      <div class="action-item-delete px-3 py-2 text-[10px] font-mono text-red-400 hover:bg-red-900 hover:text-red-300 cursor-pointer transition-colors flex items-center gap-2">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span data-i18n="mod_delete">${i18n.t('mod_delete')}</span>
      </div>
    `;

    // Dropdown pozisyonunu hesapla (viewport taşmasını önle)
    const positionMenu = (clientX?: number, clientY?: number) => {
      const triggerRect = actionsTrigger.getBoundingClientRect();
      const menuWidth = 160;
      const menuHeight = menuContainer.offsetHeight || 130;

      // Sağ tık (contextmenu) imleç pozisyonunda, ⋮ ise butonun yanında açılır
      let left = clientX !== undefined ? clientX : triggerRect.right - menuWidth;
      let top = clientY !== undefined ? clientY : triggerRect.bottom + 2;

      // Sağdan taşarsa sola kaydır
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      // Soldan taşarsa
      if (left < 8) left = 8;

      // Aşağıdan taşarsa yukarı açıl
      if (top + menuHeight > window.innerHeight - 8) {
        top = clientY !== undefined ? Math.max(8, clientY - menuHeight - 2) : triggerRect.top - menuHeight - 2;
      }
      // Yukarıdan taşarsa
      if (top < 8) top = 8;

      menuContainer.style.left = `${left}px`;
      menuContainer.style.top = `${top}px`;
    };

    // Menü kapatma
    let closeHandler: ((ev: MouseEvent) => void) | null = null;
    let scrollHandler: ((ev: Event) => void) | null = null;

    const populateGroupList = () => {
      const groupListEl = menuContainer.querySelector(".mod-group-list") as HTMLElement;
      if (!groupListEl) return;
      groupListEl.innerHTML = "";
      const groups = modStore.getGroups();
      const normalizedModId = mod.package_id.toLowerCase();
      const currentGroupIds = new Set<string>();
      groups.forEach(g => {
        if (g.modIds.includes(normalizedModId)) {
          currentGroupIds.add(g.id);
        }
      });
      groups.forEach(group => {
        const isInGroup = currentGroupIds.has(group.id);
        const groupItem = document.createElement("div");
        groupItem.className = `px-3 py-1.5 text-[10px] font-mono cursor-pointer transition-colors flex items-center gap-2 ${
          isInGroup
            ? "text-white bg-rust hover:bg-rust-light"
            : "text-slate-400 hover:bg-rust hover:text-white"
        }`;
        groupItem.dataset.groupId = group.id;
        groupItem.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-sm ${isInGroup ? 'bg-rust' : 'bg-slate-600'}"></span>
          <span class="flex-1 truncate">${group.name}</span>
          <span class="text-slate-600 ml-auto">${isInGroup ? '✓' : ''}</span>
        `;
        groupItem.addEventListener("click", (e) => {
          e.stopPropagation();
          if (isInGroup) {
            modStore.removeModFromGroup(group.id, mod.package_id);
          } else {
            modStore.addModToGroup(group.id, mod.package_id);
          }
          closeMenu();
        });
        groupListEl.appendChild(groupItem);
      });
    };

    const closeMenu = () => {
      menuContainer.classList.add("hidden");
      menuContainer.style.display = "none";
      if (closeHandler) {
        document.removeEventListener("mousedown", closeHandler);
        closeHandler = null;
      }
      if (scrollHandler) {
        document.removeEventListener("wheel", scrollHandler, { capture: true } as EventListenerOptions);
        scrollHandler = null;
      }
    };

    const setupMenu = () => {
      closeHandler = (ev: MouseEvent) => {
        const target = ev.target instanceof Node ? ev.target : null;
        if (!target || (!menuContainer.contains(target) && !actionsTrigger.contains(target))) {
          closeMenu();
        }
      };
      scrollHandler = () => closeMenu();

      setTimeout(() => {
        document.addEventListener("mousedown", closeHandler!);
        document.addEventListener("wheel", scrollHandler!, { capture: true, passive: true });
      }, 0);
    };

    const showMenu = (clientX?: number, clientY?: number) => {
      // Önceki dış-tık dinleyicilerini kaldır (tekrar kurulacak)
      if (closeHandler) document.removeEventListener("mousedown", closeHandler);
      if (scrollHandler) document.removeEventListener("wheel", scrollHandler, { capture: true } as EventListenerOptions);

      // Diğer tüm açık menüleri kapat
      document.querySelectorAll<HTMLElement>(".mod-actions-dropdown").forEach(m => {
        if (m !== menuContainer) {
          m.classList.add("hidden");
          m.style.display = "none";
        }
      });

      menuContainer.classList.remove("hidden");
      menuContainer.style.display = "block";
      positionMenu(clientX, clientY); // Pozisyonu hesapla (imleç / ⋮ butonu)
      populateGroupList(); // Grup listesini doldur
      setupMenu();
    };

    // ⋮ tıklanınca menüyü aç/kapa
    actionsTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = menuContainer.style.display === "none" || menuContainer.classList.contains("hidden");
      if (isHidden) {
        showMenu();
      } else {
        closeMenu();
      }
    });

    // Sağ tık → imlecin altında aynı bağlam menüsünü aç (uygulama hissi)
    this.element.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMenu(e.clientX, e.clientY);
    });

    // Toggle
    menuContainer.querySelector(".action-item-toggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      onToggle(mod.package_id);
    });

    // Download
    menuContainer.querySelector(".action-item-download")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      import("../../services/modService").then(({ ModService }) => {
        import("../../components/shared/Toast").then(({ Toast }) => {
          Toast.show(`"${mod.name}" indiriliyor...`, "info");
        });
        ModService.downloadMod(mod.package_id).catch(err => {
          import("../../components/shared/ErrorModal").then(({ ErrorModal }) => {
            new ErrorModal("Hata", "İndirme başarısız: " + err).open();
          });
        });
      });
    });

    // Delete
    menuContainer.querySelector(".action-item-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      if (confirm(i18n.t('mod_delete_confirm').replace('{name}', mod.name))) {
        import("../../services/modService").then(({ ModService }) => {
          ModService.deleteMod(mod.package_id)
            .then(() => {
              import("../../components/shared/Toast").then(({ Toast }) => {
                Toast.show(`"${mod.name}" silindi.`, "success");
              });
            })
            .catch((err) => {
              import("../../components/shared/ErrorModal").then(({ ErrorModal }) => {
                new ErrorModal("Hata", "Mod silinemedi: " + err).open();
              });
            });
        });
      }
    });

    // Yeni Grup Oluştur
    menuContainer.querySelector(".action-item-new-group")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      const name = prompt(i18n.t('mod_new_group_prompt'));
      if (name && name.trim() !== "") {
        modStore.createGroup(name.trim());
        modStore.addModToGroup(modStore.getGroups()[modStore.getGroups().length - 1].id, mod.package_id);
      }
    });

    // Grubu Kaldır (eğer mod bir grubun içindeyse)
    const removeGroupItem = document.createElement("div");
    const normalizedModIdForGroup = mod.package_id.toLowerCase();
    const currentGroupForMod = modStore.getGroups().find(g => g.modIds.includes(normalizedModIdForGroup));
    if (currentGroupForMod) {
      removeGroupItem.className = "px-3 py-2 text-[10px] font-mono text-slate-400 hover:bg-red-900/20 hover:text-red-300 cursor-pointer transition-colors flex items-center gap-2 action-item-remove-group";
      removeGroupItem.innerHTML = `
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Grubu Kaldır
      `;
      removeGroupItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        modStore.removeModFromGroup(currentGroupForMod.id, mod.package_id);
      });
      (menuContainer.querySelector(".mod-group-section") as HTMLElement)?.appendChild(removeGroupItem);
    }

    this.element.appendChild(mainContent);
    this.element.appendChild(actionsTrigger);
    this.element.appendChild(menuContainer);
  }

  public getElement(): HTMLElement {
    return this.element;
  }
}
