import { createElement } from "../../utils/dom";

export class Toast {
  private static container: HTMLElement | null = null;

  private static getContainer() {
    if (!this.container) {
      this.container = document.getElementById("toast-container");
      if (!this.container) {
        // This fallback should ideally not be hit if index.html is properly set up
        this.container = createElement("div", "fixed bottom-8 right-8 flex flex-col space-y-3 z-[1100]", "toast-container");
        document.body.appendChild(this.container);
      }
    }
    return this.container;
  }

  public static show(message: string, type: "success" | "error" | "info" | "warning" = "info", duration: number = 3000) {
    const container = this.getContainer();
    
    const typeClasses = {
      success: "bg-green-600 border-green-700",
      error: "bg-red-600 border-red-700",
      info: "bg-blue-600 border-blue-700",
      warning: "bg-amber-600 border-amber-700",
    };

    const iconClasses = {
      success: "fas fa-check-circle",
      error: "fas fa-times-circle",
      info: "fas fa-info-circle",
      warning: "fas fa-exclamation-triangle",
    };

    const toast = createElement("div", `relative flex items-center space-x-3 p-4 rounded-lg shadow-lg text-white text-sm opacity-0 transform translate-y-2 transition-all duration-300 ease-out ${typeClasses[type]}`);
    
    toast.innerHTML = `
      <i class="${iconClasses[type]} text-lg"></i>
      <span class="font-medium">${message}</span>
    `;
    
    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.classList.remove("opacity-0", "translate-y-2");
      toast.classList.add("opacity-100", "translate-y-0");
    }, 10);

    // Remove after duration
    setTimeout(() => {
      toast.classList.remove("opacity-100", "translate-y-0");
      toast.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}
