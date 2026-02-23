// Mapping engine - port of mapping-engine.js
// Applies mappings and rules to determine where GitHub files should be synced

use std::collections::HashMap;
use std::path::Path;

use super::config::{resolve_path_variable, Mapping, RepoConfig, Rule, RuleCondition};
#[cfg(test)]
use super::config::StringOrVec;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitHubFile {
    pub path: String,
    pub folder: String,
    pub filename: String,
    pub extension: String,
    pub size: u64,
    /// sha from the Git tree
    pub sha: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MappedFile {
    #[serde(flatten)]
    pub file: GitHubFile,
    #[serde(rename = "targetPath")]
    pub target_path: Option<String>,
    #[serde(rename = "mappingName")]
    pub mapping_name: Option<String>,
    #[serde(rename = "includeContent")]
    pub include_content: bool,
    #[serde(rename = "isScopeOnly")]
    pub is_scope_only: bool,
    /// The GitHub path from the mapping that matched this file
    #[serde(rename = "matchedGithubPath")]
    pub matched_github_path: Option<String>,
}

// ============================================================================
// Mapping application
// ============================================================================

/// Apply mappings to a list of files
pub fn apply_mappings(files: &[GitHubFile], mappings: &[Mapping]) -> Vec<MappedFile> {
    if mappings.is_empty() {
        return files
            .iter()
            .map(|f| MappedFile {
                file: f.clone(),
                target_path: None,
                mapping_name: None,
                include_content: true,
                is_scope_only: false,
                matched_github_path: None,
            })
            .collect();
    }

    files
        .iter()
        .map(|file| {
            for mapping in mappings {
                let github_paths = mapping.github_path.as_vec();

                // Check if file path matches any of the GitHub paths
                let matched_path = github_paths.iter().find(|gp| {
                    let normalized_file = file.path.trim_start_matches('/');
                    let normalized_gp = gp.trim_start_matches('/');
                    normalized_file.starts_with(normalized_gp)
                });

                if let Some(&matched_path) = matched_path {
                    // Check file type filter
                    if let Some(ref file_types) = mapping.file_types {
                        if !file_types.is_empty() && !file_types.contains(&file.extension) {
                            continue;
                        }
                    }

                    // Calculate relative path
                    let relative_path = if mapping.flatten_structure == Some(true) {
                        file.filename.clone()
                    } else {
                        let normalized_file = file.path.trim_start_matches('/');
                        let normalized_gp = matched_path.trim_start_matches('/');
                        normalized_file
                            .strip_prefix(normalized_gp)
                            .unwrap_or(normalized_file)
                            .trim_start_matches('/')
                            .to_string()
                    };

                    let knowledge_path = resolve_path_variable(&mapping.knowledge_path);
                    let target_path =
                        Path::new(&knowledge_path).join(&relative_path);

                    let is_scope_only = mapping.is_scope_only == Some(true);

                    return MappedFile {
                        file: file.clone(),
                        target_path: Some(target_path.to_string_lossy().to_string()),
                        mapping_name: mapping
                            .name
                            .clone()
                            .or_else(|| Some("Unnamed mapping".to_string())),
                        include_content: mapping.include_content != Some(false),
                        is_scope_only,
                        matched_github_path: Some(matched_path.to_string()),
                    };
                }
            }

            // No mapping matched
            MappedFile {
                file: file.clone(),
                target_path: None,
                mapping_name: None,
                include_content: true,
                is_scope_only: false,
                matched_github_path: None,
            }
        })
        .collect()
}

/// Apply rules to a list of files (after mappings)
pub fn apply_rules(files: Vec<MappedFile>, rules: &[Rule]) -> Vec<MappedFile> {
    if rules.is_empty() {
        return files;
    }

    files
        .into_iter()
        .map(|mut file| {
            // Skip if already mapped with a final target (not scope-only)
            if file.target_path.is_some() && !file.is_scope_only {
                return file;
            }

            // Skip if no targetPath AND no matchedGithubPath
            if file.target_path.is_none() && file.matched_github_path.is_none() {
                return file;
            }

            // Try to find a matching rule
            for rule in rules {
                if matches_condition(&file, &rule.condition) {
                    let knowledge_path = resolve_path_variable(&rule.target_path);

                    let relative_path = if rule.flatten_structure == Some(true) {
                        file.file.filename.clone()
                    } else if let Some(ref matched_gp) = file.matched_github_path {
                        let normalized_file = file.file.path.trim_start_matches('/');
                        let normalized_gp = matched_gp.trim_start_matches('/');
                        normalized_file
                            .strip_prefix(normalized_gp)
                            .unwrap_or(normalized_file)
                            .trim_start_matches('/')
                            .to_string()
                    } else {
                        file.file.path.clone()
                    };

                    let target_path =
                        Path::new(&knowledge_path).join(&relative_path);

                    file.target_path = Some(target_path.to_string_lossy().to_string());
                    file.mapping_name = rule.name.clone();
                    file.include_content = rule.include_content != Some(false);
                    file.is_scope_only = false;
                    return file;
                }
            }

            // No rule matched - clear targetPath if it was just a scope filter
            if file.is_scope_only {
                file.target_path = None;
            }

            file
        })
        .collect()
}

/// Check if a file matches a rule condition
fn matches_condition(file: &MappedFile, condition: &RuleCondition) -> bool {
    let f = &file.file;

    // Check folderExcludes
    if let Some(ref excludes) = condition.folder_excludes {
        let patterns = excludes.as_vec();
        let lower_folder = f.folder.to_lowercase();
        let lower_path = f.path.to_lowercase();

        let mode = condition
            .folder_excludes_mode
            .as_deref()
            .unwrap_or("any");

        let is_excluded = if mode == "all" {
            patterns.iter().all(|p| {
                let lp = p.to_lowercase();
                lower_folder.contains(&lp) || lower_path.contains(&lp)
            })
        } else {
            patterns.iter().any(|p| {
                let lp = p.to_lowercase();
                lower_folder.contains(&lp) || lower_path.contains(&lp)
            })
        };

        if is_excluded {
            return false;
        }
    }

    // Check folderContains
    if let Some(ref contains) = condition.folder_contains {
        let patterns = contains.as_vec();
        let lower_folder = f.folder.to_lowercase();
        let lower_path = f.path.to_lowercase();

        let mode = condition
            .folder_contains_mode
            .as_deref()
            .unwrap_or("any");

        let folder_match = if mode == "all" {
            patterns.iter().all(|p| {
                let lp = p.to_lowercase();
                lower_folder.contains(&lp) || lower_path.contains(&lp)
            })
        } else {
            patterns.iter().any(|p| {
                let lp = p.to_lowercase();
                lower_folder.contains(&lp) || lower_path.contains(&lp)
            })
        };

        if !folder_match {
            return false;
        }
    }

    // Check fileTypes
    if let Some(ref file_types) = condition.file_types {
        if !file_types.is_empty() && !file_types.contains(&f.extension) {
            return false;
        }
    }

    // Check filenameContains
    if let Some(ref contains) = condition.filename_contains {
        let patterns = contains.as_vec();
        let lower_filename = f.filename.to_lowercase();

        let mode = condition
            .filename_contains_mode
            .as_deref()
            .unwrap_or("any");

        let filename_match = if mode == "all" {
            patterns
                .iter()
                .all(|p| lower_filename.contains(&p.to_lowercase()))
        } else {
            patterns
                .iter()
                .any(|p| lower_filename.contains(&p.to_lowercase()))
        };

        if !filename_match {
            return false;
        }
    }

    // Check pathMatches (regex)
    if let Some(ref pattern) = condition.path_matches {
        if let Ok(re) = regex::Regex::new(pattern) {
            if !re.is_match(&f.path) {
                return false;
            }
        }
    }

    // Check folderEquals (exact match on folder components)
    if let Some(ref equals) = condition.folder_equals {
        let patterns = equals.as_vec();
        let path_parts: Vec<&str> = f.path.split('/').collect();
        let folder_parts: Vec<&str> = f.folder.split('/').collect();

        let folder_match = patterns.iter().any(|pattern| {
            let lower_pattern = pattern.to_lowercase();
            path_parts
                .iter()
                .any(|part| part.to_lowercase() == lower_pattern)
                || folder_parts
                    .iter()
                    .any(|part| part.to_lowercase() == lower_pattern)
        });

        if !folder_match {
            return false;
        }
    }

    true
}

/// Apply both mappings and rules to files
pub fn apply_mappings_and_rules(files: &[GitHubFile], repo_config: &RepoConfig) -> Vec<MappedFile> {
    let mapped = apply_mappings(files, &repo_config.mappings);
    apply_rules(mapped, &repo_config.rules)
}

/// Filter to only files with a target path
#[allow(dead_code)]
pub fn filter_mapped_files(files: &[MappedFile]) -> Vec<&MappedFile> {
    files.iter().filter(|f| f.target_path.is_some()).collect()
}

/// Group files by target directory
#[allow(dead_code)]
pub fn group_by_target_directory(files: &[MappedFile]) -> HashMap<String, Vec<&MappedFile>> {
    let mut groups: HashMap<String, Vec<&MappedFile>> = HashMap::new();
    for file in files {
        if let Some(ref target) = file.target_path {
            let dir = Path::new(target)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            groups.entry(dir).or_default().push(file);
        }
    }
    groups
}

/// Generate summary statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct MappingSummary {
    pub total_files: usize,
    pub mapped_files: usize,
    pub unmapped_files: usize,
    pub target_directories: usize,
}

pub fn generate_mapping_summary(all_files: &[MappedFile]) -> MappingSummary {
    let mapped: Vec<_> = all_files.iter().filter(|f| f.target_path.is_some()).collect();
    let dirs: std::collections::HashSet<_> = mapped
        .iter()
        .filter_map(|f| {
            f.target_path
                .as_ref()
                .and_then(|t| Path::new(t).parent().map(|p| p.to_string_lossy().to_string()))
        })
        .collect();

    MappingSummary {
        total_files: all_files.len(),
        mapped_files: mapped.len(),
        unmapped_files: all_files.len() - mapped.len(),
        target_directories: dirs.len(),
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_file(path: &str) -> GitHubFile {
        let parts: Vec<&str> = path.rsplitn(2, '/').collect();
        let (filename, folder) = if parts.len() == 2 {
            (parts[0].to_string(), parts[1].to_string())
        } else {
            (path.to_string(), String::new())
        };
        let ext = filename
            .rfind('.')
            .map(|i| filename[i..].to_string())
            .unwrap_or_default();
        GitHubFile {
            path: path.to_string(),
            folder,
            filename,
            extension: ext,
            size: 100,
            sha: "abc123".to_string(),
        }
    }

    #[test]
    fn test_folder_equals_condition() {
        let file = make_file("src/services/thirdparty-integration-service/integrations/xero/client.ts");
        let mapped = MappedFile {
            file,
            target_path: Some("/tmp/test".to_string()),
            mapping_name: None,
            include_content: true,
            is_scope_only: true,
            matched_github_path: Some("src/services/thirdparty-integration-service/integrations".to_string()),
        };
        let condition = RuleCondition {
            folder_equals: Some(StringOrVec::Single("xero".to_string())),
            folder_contains: None,
            folder_contains_mode: None,
            folder_excludes: None,
            folder_excludes_mode: None,
            filename_contains: None,
            filename_contains_mode: None,
            path_matches: None,
            file_types: None,
        };
        assert!(matches_condition(&mapped, &condition));
    }

    #[test]
    fn test_folder_contains_condition() {
        let file = make_file("src/custom/excel/shared/2c2p-sales/importer.ts");
        let mapped = MappedFile {
            file,
            target_path: Some("/tmp/test".to_string()),
            mapping_name: None,
            include_content: true,
            is_scope_only: true,
            matched_github_path: Some("src/custom/excel/shared".to_string()),
        };
        let condition = RuleCondition {
            folder_contains: Some(StringOrVec::Single("2c2p".to_string())),
            folder_contains_mode: None,
            folder_equals: None,
            folder_excludes: Some(StringOrVec::Single("test".to_string())),
            folder_excludes_mode: None,
            filename_contains: None,
            filename_contains_mode: None,
            path_matches: None,
            file_types: None,
        };
        assert!(matches_condition(&mapped, &condition));
    }

    #[test]
    fn test_folder_excludes_blocks() {
        let file = make_file("src/custom/excel/shared/test-2c2p/importer.ts");
        let mapped = MappedFile {
            file,
            target_path: Some("/tmp/test".to_string()),
            mapping_name: None,
            include_content: true,
            is_scope_only: true,
            matched_github_path: Some("src/custom/excel/shared".to_string()),
        };
        let condition = RuleCondition {
            folder_contains: Some(StringOrVec::Single("2c2p".to_string())),
            folder_contains_mode: None,
            folder_equals: None,
            folder_excludes: Some(StringOrVec::Single("test".to_string())),
            folder_excludes_mode: None,
            filename_contains: None,
            filename_contains_mode: None,
            path_matches: None,
            file_types: None,
        };
        assert!(!matches_condition(&mapped, &condition));
    }

    #[test]
    fn test_folder_contains_multiple_or() {
        let file = make_file("src/custom/excel/shared/azpos-report/importer.ts");
        let mapped = MappedFile {
            file,
            target_path: Some("/tmp/test".to_string()),
            mapping_name: None,
            include_content: true,
            is_scope_only: true,
            matched_github_path: Some("src/custom/excel/shared".to_string()),
        };
        let condition = RuleCondition {
            folder_contains: Some(StringOrVec::Multiple(vec![
                "az-digital".to_string(),
                "azdigital".to_string(),
                "azpos".to_string(),
            ])),
            folder_contains_mode: None,
            folder_equals: None,
            folder_excludes: Some(StringOrVec::Single("test".to_string())),
            folder_excludes_mode: None,
            filename_contains: None,
            filename_contains_mode: None,
            path_matches: None,
            file_types: None,
        };
        assert!(matches_condition(&mapped, &condition));
    }

    #[test]
    fn test_scope_only_mapping() {
        let file = make_file("src/services/thirdparty-integration-service/integrations/xero/client.ts");
        let mapping = Mapping {
            name: Some("Third-party integrations".to_string()),
            github_path: StringOrVec::Single(
                "src/services/thirdparty-integration-service/integrations".to_string(),
            ),
            knowledge_path: "/tmp/connectors".to_string(),
            file_types: Some(vec![".ts".to_string()]),
            flatten_structure: None,
            is_scope_only: Some(true),
            include_content: Some(true),
        };
        let result = apply_mappings(&[file], &[mapping]);
        assert_eq!(result.len(), 1);
        assert!(result[0].is_scope_only);
        assert!(result[0].target_path.is_some());
    }

    #[test]
    fn test_flatten_structure() {
        let file = make_file("src/services/thirdparty-integration-service/integrations/xero/sub/client.ts");
        let mapping = Mapping {
            name: Some("Flat".to_string()),
            github_path: StringOrVec::Single(
                "src/services/thirdparty-integration-service/integrations".to_string(),
            ),
            knowledge_path: "/tmp/connectors".to_string(),
            file_types: None,
            flatten_structure: Some(true),
            is_scope_only: None,
            include_content: None,
        };
        let result = apply_mappings(&[file], &[mapping]);
        assert_eq!(result.len(), 1);
        let tp = result[0].target_path.as_ref().unwrap();
        assert!(tp.ends_with("client.ts"));
        assert!(!tp.contains("sub"));
    }
}
