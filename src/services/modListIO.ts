import { ModMetadata, ModProfile, ModsConfig } from "../types";

export type ExportFormat = "modsconfig" | "rimsort" | "rimpy" | "txt";

export interface ImportResolution {
  /** Eşleşen modların package_id'leri (dosya sırası korunur) */
  resolved: string[];
  /** Kütüphanede bulunamayan orijinal girdiler (kayıp/dead olarak işaretlenir) */
  missing: string[];
}

const XML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const escapeXml = (s: string): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => XML_ESCAPE[c] || c);

const decodeXml = (s: string): string =>
  String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/**
 * Dosya içeriğini uzantıya ve içeriğe göre esnek şekilde mod girdisi listesine çevirir.
 * Desteklenenler:
 *  - RimSort (.rmod) / RimPy (.json): JSON dizi ya da nesne (loadOrder/activeMods/mods)
 *  - ModsConfig.xml: <li> paket kimlikleri
 *  - Düz metin (.txt / .rws): her satır bir girdi
 */
export function parseModList(content: string, ext: string): string[] {
  const trimmed = (content || "").trim();
  if (!trimmed) return [];

  const isXml = /\.xml$/i.test(ext) || trimmed.startsWith("<?xml") || trimmed.includes("<ModsConfigData");
  const isJson = /\.json$/i.test(ext) || trimmed.startsWith("{") || trimmed.startsWith("[");

  // --- ModsConfig.xml / XML ---
  if (isXml) {
    const out: string[] = [];
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(trimmed))) {
      const val = decodeXml(m[1]).trim();
      if (val) out.push(val);
    }
    return out;
  }

  // --- JSON (RimSort .rmod / RimPy) ---
  if (isJson) {
    try {
      return extractJsonEntries(JSON.parse(trimmed));
    } catch {
      // JSON değilse metin olarak devam et
    }
  }

  // --- Düz metin ---
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));
}

function extractJsonEntries(data: any): string[] {
  const out: string[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "string") out.push(item);
      else if (item && typeof item === "object" && item.packageId) out.push(String(item.packageId));
    }
    return out;
  }
  if (data && typeof data === "object") {
    // RimSort .rmod — loadOrder[].packageId (enabled olanlar)
    if (Array.isArray(data.loadOrder)) {
      for (const it of data.loadOrder) {
        if (it && typeof it === "object" && it.packageId && it.enabled !== false) {
          out.push(String(it.packageId));
        }
      }
    }
    // RimPy / RimSort — activeMods / mods / inactiveMods
    for (const key of ["activeMods", "mods", "inactiveMods"]) {
      if (Array.isArray(data[key])) {
        for (const it of data[key]) {
          if (typeof it === "string") out.push(it);
          else if (it && typeof it === "object" && it.packageId) out.push(String(it.packageId));
        }
      }
    }
  }
  return out;
}


/**
 * Import girdilerini kurulu mod kütüphanesine göre çözer.
 *  - Sayısal girdi → workshop klasör kimliği: dir_path segmenti veya url içinde eşleşir
 *  - Paket kimliği / mod adı / klasör adı → package_id
 *  - Eşleşemeyenler → missing
 */
export function resolveImportEntries(entries: string[], allMods: ModMetadata[]): ImportResolution {
  const resolved: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const candidates = (allMods || []).filter((m) => !m.isDead);

  for (const raw of entries) {
    let entry = String(raw ?? "").trim();
    if (!entry) continue;

    // RimPy tarzı "modAdi:steamid" veya "klasör:steamid" — sayısal parçayı ayır
    let steamId: string | null = null;
    if (/^\d{4,}$/.test(entry)) {
      steamId = entry;
      entry = "";
    } else if (entry.includes(":")) {
      const parts = entry.split(":");
      const tail = parts[parts.length - 1].trim();
      if (/^\d{4,}$/.test(tail)) {
        steamId = tail;
        entry = parts.slice(0, -1).join(":").trim();
      }
    }

    let match: ModMetadata | undefined;
    if (steamId) {
      const id = steamId.toLowerCase();
      match = candidates.find((m) => {
        const segs = (m.dir_path || "").split(/[\\/]/).map((s) => s.toLowerCase());
        return segs.includes(id) || (m.url || "").toLowerCase().includes(`id=${steamId}`);
      });
    }

    const norm = entry.toLowerCase();
    if (!match && norm) {
      match =
        candidates.find((m) => m.package_id.toLowerCase() === norm) ||
        candidates.find((m) => m.name.toLowerCase() === norm) ||
        candidates.find((m) => {
          const base = (m.dir_path || "").split(/[\\/]/).filter(Boolean).pop() || "";
          return base.toLowerCase() === norm;
        });
    }

    if (match) {
      const pid = match.package_id;
      if (!seen.has(pid.toLowerCase())) {
        seen.add(pid.toLowerCase());
        resolved.push(pid);
      }
    } else {
      missing.push(raw.trim());
    }
  }

  return { resolved, missing };
}

/**
 * Profili seçilen formata göre serileştirir.
 */
export function buildExportContent(profile: ModProfile, format: ExportFormat, config?: ModsConfig): string {
  const active = profile.active_mods || [];

  switch (format) {
    case "modsconfig": {
      const modLines = active.length
        ? active.map((id) => `      <li>${escapeXml(id)}</li>`).join("\n")
        : "      <!-- aktif mod yok -->";
      const expansions = config?.known_expansions?.length
        ? config.known_expansions
        : ["ludeon.royalty", "ludeon.ideology", "ludeon.biotech", "ludeon.anomaly"];
      const expLines = expansions.map((id) => `      <li>${escapeXml(id)}</li>`).join("\n");
      return [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<ModsConfigData>",
        `  <version>${escapeXml(config?.version || "1.5.4134")}</version>`,
        "  <activeMods>",
        modLines,
        "  </activeMods>",
        "  <knownExpansions>",
        expLines,
        "  </knownExpansions>",
        "</ModsConfigData>",
        "",
      ].join("\n");
    }

    case "rimsort": {
      const now = new Date();
      const date = now.toISOString().replace("T", " ").slice(0, 19);
      return JSON.stringify(
        {
          date,
          loadOrder: active.map((packageId) => ({ packageId, enabled: true })),
          activeMods: [...active],
          inactiveMods: [],
          customMods: [],
          name: profile.name,
          description: profile.description || "",
        },
        null,
        2
      );
    }

    case "rimpy":
      return JSON.stringify([...active], null, 2);

    case "txt":
    default:
      return [...active, ""].join("\n");
  }
}

/** Seçilen formata göre kayıt diyaloğu için önerilen dosya adı */
export function suggestedFileName(profileName: string, format: ExportFormat): string {
  const safe = (profileName || "preset").replace(/[\\/:*?"<>|]/g, "_");
  switch (format) {
    case "modsconfig":
      return "ModsConfig.xml";
    case "rimsort":
      return `${safe}.rmod`;
    case "rimpy":
      return `${safe}_rimpy.json`;
    case "txt":
      return `${safe}.txt`;
  }
}

export function formatExtension(format: ExportFormat): string {
  switch (format) {
    case "modsconfig":
      return "xml";
    case "rimsort":
      return "rmod";
    case "rimpy":
      return "json";
    case "txt":
      return "txt";
  }
}
