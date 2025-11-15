# Sintellii Web API v1

The official repository of the Sintelli platform API. Version 1.

## Table of Contents
- [Introduction](#introduction)
- [Installation](#installation)
  - [Python](#python)
  - [JavaScript](#javascript)
  - [TypeScript](#typescript)
  - [Rust](#rust)
- [API Client](#api-client)
  - [Initialization](#initialization)
  - [Parameters](#parameters)
- [Usage Examples](#usage-examples)
  - [Python Examples](#python-examples)
  - [JavaScript Examples](#javascript-examples)
  - [TypeScript Examples](#typescript-examples)
  - [Rust Examples](#rust-examples)
- [Response Format](#response-format)
- [Error Handling](#error-handling)

## Introduction

The Sintellii Web API v1 provides programmatic access to Sintelli's advanced AI capabilities. This repository contains client libraries for multiple programming languages, allowing developers to easily integrate AI functionality into their applications.

The API supports:
- Text generation with streaming responses
- Multi-modal input (text and images)
- Session management for conversation continuity
- Token and cost tracking

## Installation

### Python

```bash
pip install sintelli_api_client
```

### JavaScript

```html
<script src="https://cdn.jsdelivr.net/gh/rand0mdevel0per/Sintellii-Web-Api-v1@main/JavaScript/sintelli_api.js"></script>
```

Or import directly in your project:
```javascript
import { APIClient } from 'https://cdn.jsdelivr.net/gh/rand0mdevel0per/Sintellii-Web-Api-v1@main/JavaScript/sintelli_api.js';
```

### TypeScript

Copy the `sintelli_api.ts` file to your project directory.

### Rust

Add the following to your `Cargo.toml`:

```toml
[dependencies]
sintelli_api_client = "0.1.0"
```

### JavaScript

```bash
# No additional dependencies required
```

Copy the `sintelli_api.js` file to your project directory.

### TypeScript

```bash
# No additional dependencies required
```

Copy the `sintelli_api.ts` file to your project directory.

### Rust

Add the following to your `Cargo.toml`:

```toml
[dependencies]
reqwest = { version = "0.11", features = ["stream"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
futures = "0.3"
tokio = { version = "1.0", features = ["full"] }
thiserror = "1.0"
```

## API Client

### Initialization

All clients require an API key and can optionally accept a base URL.

#### Python
```python
from sintelli_api_client import APIClient

client = APIClient(api_key="your_api_key_here")
```

#### JavaScript
```javascript
import { APIClient } from './sintelli_api.js';

const client = new APIClient("your_api_key_here");
```

#### TypeScript
```typescript
import { APIClient } from './sintelli_api.ts';

const client = new APIClient("your_api_key_here");
```

#### Rust
```rust
use sintelli_api::APIClient;

let client = APIClient::new("your_api_key_here".to_string(), "https://sintelli.rand0mk4cas.workers.dev".to_string());
```

### Parameters

The core method for all clients is `generate`, which accepts the following parameters:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | The user's text prompt |
| `img` | string | No | null | Base64 encoded image data for multi-modal input |
| `role` | string | No | "user" | Role (user/system/assistant) |
| `max_tokens` | integer | No | 16234 | Maximum number of tokens to generate |
| `timeout` | integer | No | 5 | Request timeout in seconds |
| `session_id` | string | No | null | Used to resume an existing session |
| `model_id` | string | No* | null | Required for new sessions, specifies the model ID |

*Note: `model_id` is required when starting a new session (when `session_id` is not provided).

## Usage Examples

### Python Examples

#### Basic Usage
```python
from sintelli_api_client import APIClient

client = APIClient(api_key="your_api_key_here")

# Generator returns a stream of responses
for response in client.generate(
    prompt="Explain quantum computing in simple terms",
    model_id="rand0mdevel0per/l0.sydney@latest"
):
    if response is not None:
        if isinstance(response[0], tuple) and len(response[0]) == 2:
            # Text/Image data and step info
            (text, image), (step, tokens) = response
            if text:
                print(text, end="", flush=True)
        elif isinstance(response, tuple) and len(response) == 2:
            # Billing information
            cost, cost_per_mtk = response
            print(f"\n\nCost: {cost}, Cost per million tokens: {cost_per_mtk}")
```

#### Session Resumption
```python
# Start a new session and get session_id
session_id = None
for response in client.generate(
    prompt="Let's have a conversation about space exploration",
    model_id="rand0mdevel0per/l0.sydney@latest"
):
    if response is not None and isinstance(response[0], tuple) and len(response[0]) == 2:
        # Text/Image data and step info
        (text, image), (step, tokens) = response
        if text:
            print(text, end="", flush=True)
    elif isinstance(response, tuple) and len(response) == 2:
        # Billing information
        cost, cost_per_mtk = response
        print(f"\n\nCost: {cost}, Cost per million tokens: {cost_per_mtk}")

# Resume the session
for response in client.generate(
    prompt="What were we discussing?",
    session_id=session_id  # Use the session_id from the previous response
):
    if response is not None:
        if isinstance(response[0], tuple) and len(response[0]) == 2:
            # Text/Image data and step info
            (text, image), (step, tokens) = response
            if text:
                print(text, end="", flush=True)
        elif isinstance(response, tuple) and len(response) == 2:
            # Billing information
            cost, cost_per_mtk = response
            print(f"\n\nCost: {cost}, Cost per million tokens: {cost_per_mtk}")
```

### JavaScript Examples

#### Basic Usage
```javascript
import { APIClient } from './sintelli_api.js';

const client = new APIClient("your_api_key_here");

// Async generator returns a stream of responses
for await (const response of client.generate(
    "Explain quantum computing in simple terms",
    null,  // img
    "user",  // role
    16234,  // max_tokens
    5,  // timeout
    null,  // session_id
    "rand0mdevel0per/l0.sydney@latest"  // model_id
)) {
    if (response) {
        switch (response.type) {
            case 'session':
                console.log(`Session started with ID: ${response.session_id}`);
                break;
            case 'data':
                if (response.delta.text) {
                    process.stdout.write(response.delta.text);
                }
                break;
            case 'billing':
                console.log(`\n\nCost: ${response.cost}, Cost per million tokens: ${response.cost_per_mtk}`);
                break;
        }
    }
}
```

#### Session Resumption
```javascript
import { APIClient } from './sintelli_api.js';

const client = new APIClient("your_api_key_here");
let sessionId = null;

// Start a new session
for await (const response of client.generate(
    "Let's have a conversation about space exploration",
    null,  // img
    "user",  // role
    16234,  // max_tokens
    5,  // timeout
    null,  // session_id
    "rand0mdevel0per/l0.sydney@latest"  // model_id
)) {
    if (response) {
        switch (response.type) {
            case 'session':
                sessionId = response.session_id;
                console.log(`Session started with ID: ${sessionId}`);
                break;
            case 'data':
                if (response.delta.text) {
                    process.stdout.write(response.delta.text);
                }
                break;
            case 'billing':
                console.log(`\n\nCost: ${response.cost}, Cost per million tokens: ${response.cost_per_mtk}`);
                break;
        }
    }
}

// Resume the session
for await (const response of client.generate(
    "What were we discussing?",
    null,  // img
    "user",  // role
    16234,  // max_tokens
    5,  // timeout
    sessionId  // session_id to resume
)) {
    if (response) {
        switch (response.type) {
            case 'data':
                if (response.delta.text) {
                    process.stdout.write(response.delta.text);
                }
                break;
            case 'billing':
                console.log(`\n\nCost: ${response.cost}, Cost per million tokens: ${response.cost_per_mtk}`);
                break;
        }
    }
}
```

### TypeScript Examples

#### Basic Usage
```typescript
import { APIClient, GenerationYield } from './sintelli_api.ts';

const client = new APIClient("your_api_key_here");

// Async generator returns a stream of responses
for await (const response of client.generate(
    "Explain quantum computing in simple terms",
    null,  // img
    "user",  // role
    16234,  // max_tokens
    5,  // timeout
    null,  // session_id
    "rand0mdevel0per/l0.sydney@latest"  // model_id
)) {
    if (response) {
        switch (response.type) {
            case 'session':
                console.log(`Session started with ID: ${response.session_id}`);
                break;
            case 'data':
                if (response.delta.text) {
                    process.stdout.write(response.delta.text);
                }
                break;
            case 'billing':
                console.log(`\n\nCost: ${response.cost}, Cost per million tokens: ${response.cost_per_mtk}`);
                break;
        }
    }
}
```

#### Session Resumption
```typescript
import { APIClient, GenerationYield } from './sintelli_api.ts';

const client = new APIClient("your_api_key_here");
let sessionId: string | null = null;

// Start a new session
for await (const response of client.generate(
    "Let's have a conversation about space exploration",
    null,  // img
    "user",  // role
    16234,  // max_tokens
    5,  // timeout
    null,  // session_id
    "rand0mdevel0per/l0.sydney@latest"  // model_id
)) {
    if (response) {
        switch (response.type) {
            case 'session':
                sessionId = response.session_id;
                console.log(`Session started with ID: ${sessionId}`);
                break;
            case 'data':
                if (response.delta.text) {
                    process.stdout.write(response.delta.text);
                }
                break;
            case 'billing':
                console.log(`\n\nCost: ${response.cost}, Cost per million tokens: ${response.cost_per_mtk}`);
                break;
        }
    }
}

// Resume the session
for await (const response of client.generate(
    "What were we discussing?",
    null,  // img
    "user",  // role
    16234,  // max_tokens
    5,  // timeout
    sessionId  // session_id to resume
)) {
    if (response) {
        switch (response.type) {
            case 'data':
                if (response.delta.text) {
                    process.stdout.write(response.delta.text);
                }
                break;
            case 'billing':
                console.log(`\n\nCost: ${response.cost}, Cost per million tokens: ${response.cost_per_mtk}`);
                break;
        }
    }
}
```

### Rust Examples

#### Basic Usage
```rust
use sintelli_api::{APIClient, GenerationYield};
use futures::StreamExt;

#[tokio::main]
async fn main() {
    let client = APIClient::new(
        "your_api_key_here".to_string(),
        "https://sintelli.rand0mk4cas.workers.dev".to_string()
    );

    let mut stream = client
        .generate(
            "Explain quantum computing in simple terms".to_string(),
            None,  // img
            Some("user".to_string()),  // role
            16234,  // max_tokens
            5,  // timeout
            None,  // session_id
            Some("rand0mdevel0per/l0.sydney@latest".to_string())  // model_id
        )
        .await
        .expect("Failed to start generation");

    while let Some(result) = stream.next().await {
        match result {
            Ok(yield_data) => {
                match yield_data {
                    GenerationYield::Session { session_id } => {
                        println!("Session started with ID: {}", session_id);
                    }
                    GenerationYield::Data { delta, step, tokens } => {
                        if let Some(text) = delta.text {
                            print!("{}", text);
                        }
                        // Print other info if needed
                        println!(" (step: {}, tokens: {})", step, tokens);
                    }
                    GenerationYield::Billing { cost, cost_per_mtk } => {
                        println!(
                            "\n\nCost: {}, Cost per million tokens: {}",
                            cost, cost_per_mtk
                        );
                    }
                }
            }
            Err(e) => {
                eprintln!("Error occurred: {}", e);
                break;
            }
        }
    }
}
```

#### Session Resumption
```rust
use sintelli_api::{APIClient, GenerationYield};
use futures::StreamExt;

#[tokio::main]
async fn main() {
    let client = APIClient::new(
        "your_api_key_here".to_string(),
        "https://sintelli.rand0mk4cas.workers.dev".to_string()
    );

    // Start a new session
    let mut stream = client
        .generate(
            "Let's have a conversation about space exploration".to_string(),
            None,  // img
            Some("user".to_string()),  // role
            16234,  // max_tokens
            5,  // timeout
            None,  // session_id
            Some("rand0mdevel0per/l0.sydney@latest".to_string())  // model_id
        )
        .await
        .expect("Failed to start generation");

    let mut session_id = String::new();
    let mut full_text = String::new();

    while let Some(result) = stream.next().await {
        match result {
            Ok(yield_data) => {
                match yield_data {
                    GenerationYield::Session { session_id: id } => {
                        session_id = id;
                        println!("Session started with ID: {}", session_id);
                    }
                    GenerationYield::Data { delta, step, tokens } => {
                        if let Some(text) = delta.text {
                            print!("{}", text);
                            full_text.push_str(&text);
                        }
                        // Print other info if needed
                        println!(" (step: {}, tokens: {})", step, tokens);
                    }
                    GenerationYield::Billing { cost, cost_per_mtk } => {
                        println!(
                            "\n\nCost: {}, Cost per million tokens: {}",
                            cost, cost_per_mtk
                        );
                    }
                }
            }
            Err(e) => {
                eprintln!("Error occurred: {}", e);
                break;
            }
        }
    }

    // Resume the session
    let mut stream = client
        .generate(
            "What were we discussing?".to_string(),
            None,  // img
            Some("user".to_string()),  // role
            16234,  // max_tokens
            5,  // timeout
            Some(session_id),  // session_id to resume
            None  // model_id (not needed for resuming)
        )
        .await
        .expect("Failed to resume generation");

    while let Some(result) = stream.next().await {
        match result {
            Ok(yield_data) => {
                match yield_data {
                    GenerationYield::Data { delta, step, tokens } => {
                        if let Some(text) = delta.text {
                            print!("{}", text);
                            full_text.push_str(&text);
                        }
                        // Print other info if needed
                        println!(" (step: {}, tokens: {})", step, tokens);
                    }
                    GenerationYield::Billing { cost, cost_per_mtk } => {
                        println!(
                            "\n\nCost: {}, Cost per million tokens: {}",
                            cost, cost_per_mtk
                        );
                    }
                    _ => {} // Ignore session info for resumed session
                }
            }
            Err(e) => {
                eprintln!("Error occurred: {}", e);
                break;
            }
        }
    }
}
```

## Response Format

The API returns different types of responses during the generation process:

1. **Session Information**: Returned when a new session is initialized or an existing session is resumed.
2. **Data Chunks**: Returned during the generation process, containing text and/or image data.
3. **Billing Information**: Returned at the end of the generation process, containing cost information.

### Session Information
```json
{
  "status": "initialized",
  "session_id": "session_id_here"
}
```

### Data Chunks
```json
{
  "status": "generating",
  "delta": {
    "text": "Generated text here",
    "image": "Base64 encoded image data"
  },
  "step": 1,
  "tokens": 10
}
```

### Billing Information
```json
{
  "status": "completed",
  "cost": 50,
  "cost_per_mtk": 1000
}
```

## Error Handling

All clients handle errors gracefully and provide detailed error messages. Common error scenarios include:

1. **Missing API Key**: Ensure you've provided a valid API key during client initialization.
2. **Missing Model ID**: When starting a new session, a model ID is required.
3. **Network Errors**: Connection issues or timeouts will be reported as errors.
4. **API Errors**: Errors returned by the API server will be propagated to the client.

Each language-specific implementation handles errors according to its idiomatic patterns:
- Python: Returns `None` or raises exceptions
- JavaScript/TypeScript: Uses console.error for logging
- Rust: Uses Result types and error propagation