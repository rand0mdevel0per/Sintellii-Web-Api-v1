use futures::stream::{self, Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Error types that can occur during an API call.
#[derive(Debug, thiserror::Error)]
pub enum APIError {
    #[error("API key, prompt, or base URL is missing.")]
    MissingCredentials,
    #[error("model_id is required for a new session.")]
    MissingModelId,
    #[error("HTTP request error: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("API returned an error status code: {0}, Response body: {1}")]
    ApiServerError(reqwest::StatusCode, String),
    #[error("JSON parsing error: {0}")]
    JsonParseError(#[from] serde_json::Error),
    #[error("Stream processing error: {0}")]
    StreamError(String),
}

// --- Data Structure Definitions (Corresponding to API Response and Request Payload) ---

/// Text and/or image data chunk.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Delta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>, // Base64 encoded image string
}

/// Request payload sent to the API.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct Payload {
    #[serde(rename = "type")]
    pub session_type: String, // "new" or "resume"
    pub input: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    pub max_tokens: u32,
    pub timeout: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
}

/// The base structure for the raw JSON response returned by the API.
#[derive(Debug, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum APIResponse {
    #[serde(alias = "resumed")]
    Initialized {
        session_id: String,
    },
    Generating {
        delta: Delta,
        step: u32,
        tokens: u32,
        session: String,
    },
    Completed {
        cost: u32,
        cost_per_mtk: u32,
    },
    Error {
        message: String,
    },
}

// --- Client Generator Return Structure ---

/// Unified data type returned to the user by the client generator (Stream).
#[derive(Debug, Clone)]
pub enum GenerationYield {
    /// Contains the generated text/image data chunk and step information.
    Data {
        delta: Delta,
        step: u32,
        tokens: u32,
    },
    /// Session initialization or resumption information.
    Session { session_id: String },
    /// Final billing information.
    Billing { cost: u32, cost_per_mtk: u32 },
}

// --- API Client ---

/// Sintelli API Client.
pub struct APIClient {
    base_url: String,
    api_key: String,
    http_client: Client,
}

impl APIClient {
    /// Constructor: Initializes the API Client.
    pub fn new(api_key: String, base_url: String) -> Self {
        let client = Client::builder()
            // Set a reasonable total request timeout
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        // Clean up base_url to ensure correct concatenation with '/api/v1/'
        let base_url_clean = base_url.trim_end_matches('/').to_string();

        APIClient {
            base_url: base_url_clean,
            api_key,
            http_client: client,
        }
    }

    /// Core generation method: Interacts with the LLM and processes streaming output.
    ///
    /// It returns a `Stream` that can iterate over the generated data chunks.
    ///
    /// # Arguments
    /// * `prompt` - User's text prompt.
    /// * `img` - Optional Base64 encoded image data.
    /// * `role` - Role (defaults to "user").
    /// * `max_tokens` - Maximum number of tokens to generate.
    /// * `timeout` - API internal processing timeout (seconds).
    /// * `session_id` - Optional, used to resume an existing session.
    /// * `model_id` - Required for a new session, specifies the model ID to use.
    ///
    /// # Returns
    /// A Result, containing a Pin<Box<dyn Stream>> wrapping the asynchronous data stream on success,
    /// or an `APIError` on failure.
    pub async fn generate(
        &self,
        prompt: String,
        img: Option<String>,
        role: Option<String>,
        max_tokens: u32,
        timeout: u32,
        session_id: Option<String>,
        model_id: Option<String>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<GenerationYield, APIError>> + Send>>, APIError>
    {
        // 1. Input Validation
        if self.api_key.is_empty() || prompt.is_empty() || self.base_url.is_empty() {
            return Err(APIError::MissingCredentials);
        }

        // 2. Construct Request Payload
        let (session_type, session_id, model_id) = if let Some(id) = session_id {
            ("resume".to_string(), Some(id), None)
        } else {
            if model_id.is_none() {
                return Err(APIError::MissingModelId);
            }
            ("new".to_string(), None, model_id)
        };

        let payload = Payload {
            session_type,
            input: prompt,
            image: img,
            role: role.or_else(|| Some("user".to_string())),
            max_tokens,
            timeout,
            session_id,
            model_id,
        };

        let url = format!("{}/api/v1/", self.base_url);
        let api_key = &self.api_key;
        let http_client = &self.http_client;

        // 3. Send Request and Get Streaming Response
        let response = http_client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&payload)
            .send()
            .await?;

        // Check for non-streaming errors
        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read response body".to_string());
            return Err(APIError::ApiServerError(status, body));
        }

        // 4. Create a Stream to process the response body
        let stream = response.bytes_stream();
        let buffer = Arc::new(Mutex::new(String::new()));

        // Use a helper to process the stream's byte chunks, converting them to newline-separated JSON strings
        let json_line_stream = stream.flat_map(move |chunk_res| {
            let buffer__ = Arc::clone(&buffer);
            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    return stream::once(async move { Err(APIError::RequestError(e)) }).boxed();
                }
            };
            let mut buffer_ = buffer__.lock().unwrap();
            // Convert bytes to string and split into lines
            buffer_.push_str(std::str::from_utf8(&chunk).unwrap_or(""));
            let lines = buffer_
                .split('\n')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>();
            let (complete_lines, incomplete_line) = {
                let parts: Vec<String> = lines;
                let last_idx = parts.len().saturating_sub(1);
                let complete = parts[..last_idx].iter().cloned().collect::<Vec<String>>();
                let incomplete = parts.last().unwrap_or(&"".to_string()).clone();
                (complete, incomplete)
            };
            buffer_.clear();
            buffer_.push_str(&incomplete_line);
            // Convert lines to a Result<String, APIError> stream
            stream::iter(complete_lines).map(Ok).boxed()
        });

        // 5. Convert JSON Line Stream to GenerationYield Stream
        let final_stream = json_line_stream.filter_map(|line_res| {
            async move {
                let line = match line_res {
                    Ok(l) => l,
                    Err(e) => return Some(Err(e)), // Propagate request error
                };

                // Parse JSON
                let api_response: APIResponse = match serde_json::from_str(&line) {
                    Ok(res) => res,
                    Err(e) => {
                        // Ignore malformed line and continue (similar to warn/skip in JS/TS)
                        eprintln!("Skipping malformed JSON line: {} - Error: {}", line, e);
                        return None;
                    }
                };

                // Map API Response to GenerationYield
                match api_response {
                    APIResponse::Error { message } => Some(Err(APIError::StreamError(format!(
                        "API returned an error: {}",
                        message
                    )))),
                    APIResponse::Initialized { session_id } => {
                        Some(Ok(GenerationYield::Session { session_id }))
                    }
                    APIResponse::Generating {
                        delta,
                        step,
                        tokens,
                        ..
                    } => Some(Ok(GenerationYield::Data {
                        delta,
                        step,
                        tokens,
                    })),
                    APIResponse::Completed { cost, cost_per_mtk } => {
                        Some(Ok(GenerationYield::Billing { cost, cost_per_mtk }))
                    }
                }
            }
        });

        // 6. Return Pin<Box<dyn Stream>>
        Ok(Box::pin(final_stream)
            as Pin<
                Box<dyn Stream<Item = Result<GenerationYield, APIError>> + Send>,
            >)
    }
}

// --- Tests ---
// ((also example usages
#[cfg(test)]
mod tests {
    use super::*;

    // Assuming you have a valid API key and Model ID
    const API_KEY: &str = "YOUR_API_KEY";
    const BASE_URL: &str = "https://sintelli.rand0mk4cas.workers.dev";
    const TEST_MODEL_ID: &str = "rand0mdevel0per/l0.sydney@latest";

    #[tokio::test]
    async fn test_generate_new_session() {
        if API_KEY == "YOUR_API_KEY" {
            println!("Skipping test: Please configure a valid API_KEY and BASE_URL");
            return;
        }

        let client = APIClient::new(API_KEY.to_string(), BASE_URL.to_string());

        println!("Starting a new generation session...");
        let stream_result = client
            .generate(
                "Briefly describe the characteristics of the Rust language.".to_string(),
                None,
                None,
                512,
                60,
                None,
                Some(TEST_MODEL_ID.to_string()),
            )
            .await;

        match stream_result {
            Ok(mut stream) => {
                let mut full_text = String::new();
                while let Some(yield_result) = stream.next().await {
                    match yield_result {
                        Ok(yield_data) => {
                            match yield_data {
                                GenerationYield::Session { session_id } => {
                                    println!("Session started, ID: {}", session_id);
                                }
                                GenerationYield::Data {
                                    delta,
                                    step,
                                    tokens,
                                } => {
                                    if let Some(text) = delta.text {
                                        print!("{}", text);
                                        full_text.push_str(&text);
                                    }
                                    // Print other info, e.g., steps, tokens
                                    println!(" (step: {}, tokens: {})", step, tokens);
                                }
                                GenerationYield::Billing { cost, cost_per_mtk } => {
                                    println!(
                                        "\nGeneration complete. Billing info: cost={}, cost_per_mtk={}",
                                        cost, cost_per_mtk
                                    );
                                    assert!(!full_text.is_empty());
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("\nError occurred in stream: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("\nRequest launch failed: {}", e);
            }
        }
    }
}
