// VAL Sync - Core sync pipeline for VAL platform data
// Syncs domain configurations, authenticates, fetches API data,
// and extracts structured definitions to local JSON files.

pub mod ai_package;
pub mod api;
pub mod audit;
pub mod auth;
pub mod claude_runner;
pub mod config;
pub mod dependencies;
pub mod domain_model;
pub mod drive;
pub mod errors;
pub mod extract;
pub mod metadata;
pub mod monitoring;
pub mod recency;
pub mod s3_sync;
pub mod sql;
pub mod sql_gen;
pub mod sync;
pub mod table_pipeline;
