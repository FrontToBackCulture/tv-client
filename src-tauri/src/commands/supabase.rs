// Supabase REST API Client
// Generic client for making authenticated requests to Supabase

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
            client: reqwest::Client::new(),
        }
    }

    /// Build headers for Supabase requests
    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "apikey",
            HeaderValue::from_str(&self.anon_key).unwrap(),
        );
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.anon_key)).unwrap(),
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("Prefer", HeaderValue::from_static("return=representation"));
        headers
    }

    /// GET request - select from table
    pub async fn select<T: DeserializeOwned>(
        &self,
        table: &str,
        query: &str,
    ) -> Result<Vec<T>, String> {
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
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Supabase error ({}): {}", status, error_text));
        }

        response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))
    }

    /// GET single row
    pub async fn select_single<T: DeserializeOwned>(
        &self,
        table: &str,
        query: &str,
    ) -> Result<Option<T>, String> {
        let results: Vec<T> = self.select(table, query).await?;
        Ok(results.into_iter().next())
    }

    /// POST request - insert into table
    pub async fn insert<T: Serialize, R: DeserializeOwned>(
        &self,
        table: &str,
        data: &T,
    ) -> Result<R, String> {
        let url = format!("{}/rest/v1/{}", self.base_url, table);

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(data)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Supabase error ({}): {}", status, error_text));
        }

        // Response is an array with one item
        let results: Vec<R> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        results
            .into_iter()
            .next()
            .ok_or_else(|| "No data returned from insert".to_string())
    }

    /// PATCH request - update rows
    pub async fn update<T: Serialize, R: DeserializeOwned>(
        &self,
        table: &str,
        query: &str,
        data: &T,
    ) -> Result<R, String> {
        let url = format!("{}/rest/v1/{}?{}", self.base_url, table, query);

        let response = self
            .client
            .patch(&url)
            .headers(self.headers())
            .json(data)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Supabase error ({}): {}", status, error_text));
        }

        let results: Vec<R> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        results
            .into_iter()
            .next()
            .ok_or_else(|| "No data returned from update".to_string())
    }

    /// DELETE request - delete rows
    pub async fn delete(&self, table: &str, query: &str) -> Result<(), String> {
        let url = format!("{}/rest/v1/{}?{}", self.base_url, table, query);

        let response = self
            .client
            .delete(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Supabase error ({}): {}", status, error_text));
        }

        Ok(())
    }

    /// RPC call - call a database function
    #[allow(dead_code)]
    pub async fn rpc<T: Serialize, R: DeserializeOwned>(
        &self,
        function: &str,
        params: &T,
    ) -> Result<R, String> {
        let url = format!("{}/rest/v1/rpc/{}", self.base_url, function);

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(params)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Supabase error ({}): {}", status, error_text));
        }

        response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))
    }
}

/// Helper to get Supabase client from settings
pub async fn get_client() -> Result<SupabaseClient, String> {
    use crate::commands::settings::{settings_get_key, KEY_SUPABASE_ANON_KEY, KEY_SUPABASE_URL};

    let url = settings_get_key(KEY_SUPABASE_URL.to_string())?
        .ok_or("Supabase URL not configured. Go to Settings to add it.")?;
    let anon_key = settings_get_key(KEY_SUPABASE_ANON_KEY.to_string())?
        .ok_or("Supabase anon key not configured. Go to Settings to add it.")?;

    Ok(SupabaseClient::new(&url, &anon_key))
}
