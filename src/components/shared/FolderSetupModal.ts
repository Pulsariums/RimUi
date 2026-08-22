import { createElement } from "../../utils/dom";
import { open } from "@tauri-apps/plugin-dialog";

export class FolderSetupModal {
  private element: HTMLElement;
  private onFolderSelected: (path: string) => void;

  constructor(onFolderSelected: (path: string) => void) {
    this.onFolderSelected = onFolderSelected;
    this.element = createElement("div", "modal-overlay");

    this.element.innerHTML = `
      <div class="modal-content">
        <h2>RimWorld Mod Klasörü Bulunamadı</h2>
        <p>Uygulamanın çalışabilmesi için RimWorld modlarınızın bulunduğu klasörü seçmeniz gerekiyor. Genellikle şu yoldadır:</p>
        <code style="display:block; padding: 10px; background: #eee; margin: 10px 0;">C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods</code>
        <div class="modal-actions">
          <button id="btn-select-folder" class="btn btn-primary">Klasörü Seç</button>
        </div>
      </div>
    `;

    this.element.querySelector("#btn-select-folder")?.addEventListener("click", () => this.selectFolder());
  }

  private async selectFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "RimWorld Mods Klasörünü Seçin"
      });

      if (selected && typeof selected === "string") {
        this.onFolderSelected(selected);
        this.close();
      }
    } catch (e) {
      console.error("Failed to open folder dialog", e);
    }
  }

  public open() {
    document.getElementById("modal-container")?.appendChild(this.element);
  }

  public close() {
    this.element.remove();
  }
}
