import { invoke } from "@tauri-apps/api/core";
import { Toast } from "../components/shared/Toast";
import { ErrorModal } from "../components/shared/ErrorModal";

/**
 * Generic wrapper for Tauri invoke to handle common error patterns and logging.
 */
export async function safeInvoke<T>(command: string, args?: any): Promise<T> {
  try {
    console.debug(`[TauriBridge] Invoking ${command}`, args);
    const result = await invoke<T>(command, args);
    return result;
  } catch (error: any) {
    console.error(`[TauriBridge] Error in ${command}:`, error);

    let errorMessage = "Bilinmeyen bir hata oluştu.";
    let errorTitle = "İşlem Başarısız";
    let cycle: string[] | undefined;

    if (typeof error === "string") {
      try {
        const parsedError = JSON.parse(error);
        errorMessage = parsedError.message || errorMessage;
        errorTitle = parsedError.title || errorTitle;
        cycle = parsedError.cycle || undefined;
      } catch (_parseError) {
        errorMessage = error; // Eğer JSON değilse string'i kullan
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === "object" && error.message) {
      errorMessage = error.message;
    }

    if (cycle) {
      new ErrorModal(errorTitle, errorMessage, cycle).open();
    } else {
      Toast.show(`${errorTitle}: ${errorMessage}`, "error");
    }

    throw new Error(errorMessage); // Hata zincirini sürdürmek için tekrar fırlat
  }
}
