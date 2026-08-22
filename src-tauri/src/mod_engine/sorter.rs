use crate::mod_engine::xml_parser::ModMetadata;
use crate::mod_engine::dependency::sort_dependencies;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CommunityRules {
    /// Mapping of packageId -> ideal index or load order category
    pub rules: HashMap<String, i32>,
}

/// Ultimate Sorter that applies community-based rules,
/// categories, and alphabetical rules as fallbacks.
/// Finally passes to `sort_dependencies` for micro-ordering of dependencies.
pub fn ultimate_sort(
    mut mods: Vec<ModMetadata>,
    community_rules: Option<&CommunityRules>,
) -> Result<Vec<ModMetadata>, String> {
    // 1. Initial rough sort based on core / standard loading categories or community rules
    // Standard RimWorld load order conventions:
    // Core (ludeon.rimworld) always first.
    // Royalty (ludeon.rimworld.royalty) second.
    // Ideology (ludeon.rimworld.ideology) third.
    // Biotech (ludeon.rimworld.biotech) fourth.
    // Anomaly (ludeon.rimworld.anomaly) fifth.
    // HugsLib next if present.
    // Rest of the mods sorted alphabetically as fallback or by community rules index.

    let get_mod_weight = |pkg_id: &str| -> i32 {
        match pkg_id {
            "ludeon.rimworld" => -100,
            "ludeon.rimworld.royalty" => -90,
            "ludeon.rimworld.ideology" => -80,
            "ludeon.rimworld.biotech" => -70,
            "ludeon.rimworld.anomaly" => -60,
            "unlimitedhugs.hugslib" => -50,
            other => {
                if let Some(rules) = community_rules {
                    if let Some(&weight) = rules.rules.get(other) {
                        return weight;
                    }
                }
                0 // Default weight
            }
        }
    };

    mods.sort_by(|a, b| {
        let weight_a = get_mod_weight(&a.package_id.to_lowercase());
        let weight_b = get_mod_weight(&b.package_id.to_lowercase());

        if weight_a != weight_b {
            weight_a.cmp(&weight_b)
        } else {
            // Alphabetical fallback
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    // 2. Perform DAG topological sort for precise dependency/before/after rules
    sort_dependencies(&mods)
}

/// RimSort hardcoded Tier 0 modları (RimWorld Core + DLC'ler + Harmony)
pub const TIER_ZERO_MODS: [&str; 8] = [
    "ludeon.rimworld",
    "ludeon.rimworld.royalty",
    "ludeon.rimworld.ideology",
    "ludeon.rimworld.biotech",
    "ludeon.rimworld.anomaly",
    "ludeon.rimworld.odyssey",
    "brrainz.harmony",
    "zetrith.prepatcher",
];

/// RimSort hardcoded Tier 1 modları (Framework'ler)
pub const TIER_ONE_MODS: [&str; 6] = [
    "unlimitedhugs.hugslib",
    "smashphil.vehicleframework",
    "adaptive.storage.framework",
    "aoba.framework",
    "ebsg.framework",
    "imranfish.xmlextensions",
];

/// Kahn's Algorithm ile topolojik sıralama
/// Başarılı olursa Ok(sorted), döngü varsa Err((from, to) pair'leri)
pub fn topological_sort(
    graph: &HashMap<String, Vec<String>>,
) -> Result<Vec<String>, Vec<(String, String)>> {
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    let mut adjacency: HashMap<String, Vec<String>> = HashMap::new();

    // Tüm node'ları topla ve in_degree hesapla
    for (node, deps) in graph {
        in_degree.entry(node.clone()).or_insert(0);
        adjacency.entry(node.clone()).or_default();
        for dep in deps {
            in_degree.entry(dep.clone()).or_insert(0);
            adjacency.entry(dep.clone()).or_default().push(node.clone());
            *in_degree.entry(node.clone()).or_insert(0) += 1;
        }
    }

    // in_degree=0 olanları queue'ya ekle
    let mut queue: VecDeque<String> = VecDeque::new();
    for (node, deg) in &in_degree {
        if *deg == 0 {
            queue.push_back(node.clone());
        }
    }

    // Kahn's Algorithm
    let mut sorted = Vec::new();
    while let Some(node) = queue.pop_front() {
        sorted.push(node.clone());
        if let Some(neighbors) = adjacency.get(&node) {
            for neighbor in neighbors {
                if let Some(deg) = in_degree.get_mut(neighbor) {
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(neighbor.clone());
                    }
                }
            }
        }
    }

    // Cycle kontrolü
    if sorted.len() != in_degree.len() {
        let mut cycles = Vec::new();
        for (node, deg) in &in_degree {
            if *deg > 0 {
                if let Some(deps) = graph.get(node) {
                    for dep in deps {
                        if in_degree.get(dep).copied().unwrap_or(0) > 0 {
                            cycles.push((dep.clone(), node.clone()));
                        }
                    }
                }
            }
        }
        return Err(cycles);
    }

    Ok(sorted)
}

// ===== YARDIMCI FONKSİYONLAR =====

/// Grafı sadece aktif modlara göre filtrele
fn filter_graph_to_active(
    graph: &HashMap<String, Vec<String>>,
    active_ids: &HashSet<String>,
) -> HashMap<String, Vec<String>> {
    graph
        .iter()
        .filter(|(k, _)| active_ids.contains(*k))
        .map(|(k, v)| {
            (
                k.clone(),
                v.iter().filter(|d| active_ids.contains(*d)).cloned().collect(),
            )
        })
        .collect()
}

/// Bilinen tier modlarını topla (kendisi + bağımlılıkları)
fn collect_tier_mods(
    known: &[&str],
    active: &HashSet<String>,
    deps: &HashMap<String, Vec<String>>,
) -> HashSet<String> {
    let mut result = HashSet::new();
    for known_id in known {
        if active.contains(*known_id) {
            result.insert(known_id.to_string());
            // Bağımlılıklarını da ekle
            if let Some(deps_list) = deps.get(*known_id) {
                for dep in deps_list {
                    if active.contains(dep) {
                        result.insert(dep.clone());
                    }
                }
            }
        }
    }
    result
}

/// Tier 3 modları: Hiçbir modun bağımlılık listesinde olmayan (leaf) modlar
fn collect_tier_three_mods(
    active: &HashSet<String>,
    rev_deps: &HashMap<String, Vec<String>>,
) -> HashSet<String> {
    active
        .iter()
        .filter(|id| {
            // Hiçbir mod bu moda bağımlı değilse → Tier 3
            !rev_deps.contains_key(*id) || rev_deps[*id].is_empty()
        })
        .cloned()
        .collect()
}

/// Bir tier seti için alt-graf çıkar
fn extract_tier_subgraph(
    full: &HashMap<String, Vec<String>>,
    tier: &HashSet<String>,
) -> HashMap<String, Vec<String>> {
    full
        .iter()
        .filter(|(k, _)| tier.contains(*k))
        .map(|(k, v)| {
            (
                k.clone(),
                v.iter().filter(|d| tier.contains(*d)).cloned().collect(),
            )
        })
        .collect()
}

/// Ana RimWorld 4-Tier sıralama
pub fn rimworld_sort(
    active_package_ids: &HashSet<String>,
    deps_graph: &HashMap<String, Vec<String>>,
    rev_deps_graph: &HashMap<String, Vec<String>>,
) -> Result<Vec<String>, Vec<(String, String)>> {
    // 1. Sadece aktif modları filtrele
    let active_deps = filter_graph_to_active(deps_graph, active_package_ids);

    // 2. Tier'ları oluştur
    let tier0 = collect_tier_mods(&TIER_ZERO_MODS, active_package_ids, &active_deps);
    let tier1 = collect_tier_mods(&TIER_ONE_MODS, active_package_ids, &active_deps);

    let mut all_tiered: HashSet<String> = tier0.union(&tier1).cloned().collect();
    let tier3 = collect_tier_three_mods(active_package_ids, rev_deps_graph);
    all_tiered.extend(tier3.clone());

    let tier2: HashSet<String> = active_package_ids
        .difference(&all_tiered)
        .cloned()
        .collect();

    // 3. Her tier'ı sırayla sırala (Tier 0 → 1 → 2 → 3)
    let mut result = Vec::new();
    for tier_set in [&tier0, &tier1, &tier2, &tier3] {
        let tier_graph = extract_tier_subgraph(&active_deps, tier_set);
        match topological_sort(&tier_graph) {
            Ok(sorted) => result.extend(sorted),
            Err(cycles) => return Err(cycles),
        }
    }

    Ok(result)
}
