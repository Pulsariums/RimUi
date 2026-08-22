import lottie from "lottie-web";

// lottie-web'i global'e bağla — AnimationService.loadLottie window.lottie bekliyor.
// (index.html'de CDN/script olmadığı için bu modül import'u tek kaynaktır.)
(window as any).lottie = lottie;

export class AnimationService {
  static loadLottie(el: HTMLElement) {
    // Bir kez yükle — render() her çağrıldığında destroy+reload YAPMA (perf)
    if (el.dataset.lottieLoaded === "1") return;
    const path = el.getAttribute("data-lottie-path");
    if (!path || !(window as any).lottie) return;

    const animation = (window as any).lottie.loadAnimation({
      container: el,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: path
    });
    el.dataset.lottieLoaded = "1";
    el.dataset.lottieAnimation = JSON.stringify(animation);
  }

  static loadAll() {
    document.querySelectorAll("[data-lottie-path]").forEach(el => this.loadLottie(el as HTMLElement));
  }
}
