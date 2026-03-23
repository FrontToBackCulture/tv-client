// Supabase REST API Client
// Generic client for making authenticated requests to Supabase

use crate::commands::error::{CmdResult, CommandError};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{de::DeserializeOwned, Serialize};

/// Supabase client for making REST API requests
pub struct SupabaseClient {
    base_url: String,
    anon_key: String,
    client: reqwest::Client,
}

impl SupabaseClient {
    /// Create a new Supabase client
    pub fn new(url: &str, anon_key: &str) -> Self {
        Self {
            base_url: url.trim_end_matches('/').to_string(),
            anon_key: anon_key.to_string(),
            client: crate::HTTP_CLIENT.clone(),
        }
    }

    /// Build headers for Supabase requests
    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Ok(val) = HeaderValue::from_str(&self.anon_key) {
            headers.insert("apikey", val);
        }
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", self.anon_key)) {
            headers.insert(AUTHORIZATION, val);
        }
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("Prefer", HeaderValue::from_static("return=representation"));
        headers
    }

    /// Check response status and return typed error if not success
    async fn check_response(&self, response: reqwest::Response) -> CmdResult<reqwest::Response> {
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(CommandError::Http { status, body });
        }
        Ok(response)
    }

    /// GET request - select from table
    pub async fn select<T: DeserializeOwned>(
        &self,
        table: &str,
        query: &str,
    ) -> CmdResult<Vec<T>> {
        let url = if query.is_empty() {
            format!("{}/rest/v1/{}", self.base_url, table)
        } else {
            format!("{}/rest/v1/{}?{}", self.base_url, table, query)
        };

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await?;

        let response = self.check_response(response).await?;
        Ok(response.json().await?)
    }

    /// GET single row
    pub async fn select_single<T: DeserializeOwned>(
        &self,
        table: &str,
        query: &str,
    ) -> CmdResult<Option<T>> {
        let results: Vec<T> = self.select(table, query).await?;
        Ok(results.into_iter().next())
    }

    /// POST request - insert into table
    pub async fn insert<T: Serialize, R: DeserializeOwned>(
        &self,
        table: &str,
        data: &T,
    ) -> CmdResult<R> {
        let url = format!("{}/rest/v1/{}", self.base_url, table);

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(data)
            .send()
            .await?;

        let response = self.check_response(response).await?;

        let results: Vec<R> = response.json().await?;

        results
            .into_iter()
            .next()
            .ok_or_else(|| CommandError::Internal("No data returned from insert".into()))
    }

    /// PATCH request - update rows
    pub async fn update<T: Serialize, R: DeserializeOwned>(
        &self,
        table: &str,
        query: &str,
        data: &T,
    ) -> CmdResult<R> {
        let url = format!("{}/rest/v1/{}?{}", self.base_url, table, query);

        let response = self
            .client
            .patch(&url)
            .headers(self.headers())
            .json(data)
            .send()
            .await?;

        let response = self.check_response(response).await?;

        let results: Vec<R> = response.json().await?;

        results
            .into_iter()
            .next()
            .ok_or_else(|| CommandError::Internal("No data returned from update".into()))
    }

    /// POST request with upsert - insert or update on conflict
    #[allow(dead_code)]
    pub async fn upsert<T: Serialize, R: DeserializeOwned>(
        &self,
        table: &str,
        data: &T,
    ) -> CmdResult<R> {
        self.upsert_on(table, data, None).await
    }

    /// POST request with upsert on a specific conflict column
    pub async fn upsert_on<T: Serialize, R: DeserializeOwned>(
        &self,
        table: &str,
        data: &T,
        on_conflict: Option<&str>,
    ) -> CmdResult<R> {
        let mut url = format!("{}/rest/v1/{}", self.base_url, table);
        if let Some(col) = on_conflict {
            url.push_str(&format!("?on_conflict={}", col));
        }

        let mut headers = self.headers();
        // Override Prefer header for upsert
        headers.insert("Prefer", reqwest::header::HeaderValue::from_static("return=representation,resolution=merge-duplicates"));

        let response = self
            .client
            .post(&url)
            .headers(headers)
            .json(data)
            .send()
            .await?;

        let response = self.check_response(response).await?;

        let results: Vec<R> = response.json().await?;

        results
            .into_iter()
            .next()
            .ok_or_else(|| CommandError::Internal("No data returned from upsert".into()))
    }

    /// DELETE request - delete rows
    pub async fn delete(&self, table: &str, query: &str) -> CmdResult<()> {
        let url = format!("{}/rest/v1/{}?{}", self.base_url, table, query);

        let response = self
            .client
            .delete(&url)
            .headers(self.headers())
            .send()
            .await?;

        self.check_response(response).await?;
        Ok(())
    }

    /// RPC call - call a database function
    #[allow(dead_code)]
    pub async fn rpc<T: Serialize, R: DeserializeOwned>(
        &self,
        function: &str,
        params: &T,
    ) -> CmdResult<R> {
        let url = format!("{}/rest/v1/rpc/{}", self.base_url, function);

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(params)
            .send()
            .await?;

        let response = self.check_response(response).await?;
        Ok(response.json().await?)
    }
}

/// Helper to get Supabase client from settings
pub async fn get_client() -> CmdResult<SupabaseClient> {
    use crate::commands::settings::{settings_get_key, KEY_SUPABASE_ANON_KEY, KEY_SUPABASE_URL};

    let url = settings_get_key(KEY_SUPABASE_URL.to_string())?
        .ok_or_else(|| CommandError::Config("Supabase URL not configured. Go to Settings to add it.".into()))?;
    let anon_key = settings_get_key(KEY_SUPABASE_ANON_KEY.to_string())?
        .ok_or_else(|| CommandError::Config("Supabase anon key not configured. Go to Settings to add it.".into()))?;

    Ok(SupabaseClient::new(&url, &anon_key))
}
