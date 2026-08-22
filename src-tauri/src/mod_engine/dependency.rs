use petgraph::algo::toposort;
use petgraph::graph::DiGraph;
use std::collections::{HashMap, HashSet};
use crate::mod_engine::xml_parser::ModMetadata;

/// Formats a cycle found in the dependency graph for display to the user.
fn format_cycle(graph: &DiGraph<String, ()>, scc: &[petgraph::graph::NodeIndex]) -> String {
    let cycle_nodes: Vec<String> = scc.iter()
        .map(|idx| graph[*idx].clone())
        .collect();
    cycle_nodes.join(" -> ") + " -> " + &cycle_nodes[0]
}

/// Dynamic topological sorter using petgraph DiGraph.
/// Gracefully handles circular dependencies, returning clear, actionable errors.
pub fn sort_dependencies(mods: &[ModMetadata]) -> Result<Vec<ModMetadata>, String> {
    let mut graph = DiGraph::<String, ()>::new();
    let mut node_map = HashMap::new();
    let mut mod_map = HashMap::new();

    // Map each mod's packageId to its index in the input slice and insert into Graph
    for (i, m) in mods.iter().enumerate() {
        let package_id = m.package_id.to_lowercase();
        let idx = graph.add_node(package_id.clone());
        node_map.insert(package_id.clone(), idx);
        mod_map.insert(package_id, i);
    }

    // Add edges
    for m in mods {
        let from_id = m.package_id.to_lowercase();
        let Some(&from_idx) = node_map.get(&from_id) else { continue };

        // 1. Dependencies (must be loaded before this mod, i.e., dependency -> from_idx)
        for dep in &m.dependencies {
            let dep_id = dep.to_lowercase();
            if let Some(&dep_idx) = node_map.get(&dep_id) {
                if !graph.contains_edge(dep_idx, from_idx) {
                    graph.add_edge(dep_idx, from_idx, ());
                }
            }
        }

        // 2. LoadAfter (must load after target, i.e., target -> from_idx)
        for after in &m.load_after {
            let after_id = after.to_lowercase();
            if let Some(&after_idx) = node_map.get(&after_id) {
                if !graph.contains_edge(after_idx, from_idx) {
                    graph.add_edge(after_idx, from_idx, ());
                }
            }
        }

        // 3. LoadBefore (must load before target, i.e., from_idx -> target)
        for before in &m.load_before {
            let before_id = before.to_lowercase();
            if let Some(&before_idx) = node_map.get(&before_id) {
                if !graph.contains_edge(from_idx, before_idx) {
                    graph.add_edge(from_idx, before_idx, ());
                }
            }
        }
    }

    // Attempt topological sorting
    match toposort(&graph, None) {
        Ok(order) => {
            let mut sorted_mods = Vec::new();
            let mut added = HashSet::new();

            for node_idx in order {
                let pkg_id = &graph[node_idx];
                if let Some(&orig_idx) = mod_map.get(pkg_id) {
                    sorted_mods.push(mods[orig_idx].clone());
                    added.insert(pkg_id.clone());
                }
            }

            // Append any mods that might have been skipped (should not happen, but as a fallback)
            for m in mods {
                let pkg_id = m.package_id.to_lowercase();
                if !added.contains(&pkg_id) {
                    sorted_mods.push(m.clone());
                }
            }

            Ok(sorted_mods)
        }
        Err(err) => {
            // Cycle detected! Find strongly connected components to describe the cycle precisely.
            let scc = petgraph::algo::tarjan_scc(&graph);
            let mut cycle_str = String::new();
            for comp in scc {
                if comp.len() > 1 {
                    cycle_str = format_cycle(&graph, &comp);
                    break;
                }
            }
            if cycle_str.is_empty() {
                cycle_str = graph[err.node_id()].clone();
            }
            Err(format!(
                "Circular dependency detected in mods! Cycle path: {}",
                cycle_str
            ))
        }
    }
}

/// Bir modun tüm bağımlılıklarını recursive olarak bul (DFS)
pub fn get_dependencies_recursive(
    package_id: &str,
    deps_graph: &HashMap<String, Vec<String>>,
) -> HashSet<String> {
    let mut result = HashSet::new();
    let mut stack = vec![package_id.to_string()];
    let mut visited = HashSet::new();

    while let Some(current) = stack.pop() {
        if !visited.insert(current.clone()) {
            continue;
        }
        if let Some(deps) = deps_graph.get(&current) {
            for dep in deps {
                if visited.insert(dep.clone()) {
                    result.insert(dep.clone());
                    stack.push(dep.clone());
                }
            }
        }
    }
    result
}

/// Bir moda bağımlı olan tüm modları recursive olarak bul (reverse DFS)
pub fn get_reverse_dependencies_recursive(
    package_id: &str,
    rev_deps_graph: &HashMap<String, Vec<String>>,
) -> HashSet<String> {
    let mut result = HashSet::new();
    let mut stack = vec![package_id.to_string()];
    let mut visited = HashSet::new();

    while let Some(current) = stack.pop() {
        if !visited.insert(current.clone()) {
            continue;
        }
        if let Some(deps) = rev_deps_graph.get(&current) {
            for dep in deps {
                if visited.insert(dep.clone()) {
                    result.insert(dep.clone());
                    stack.push(dep.clone());
                }
            }
        }
    }
    result
}
