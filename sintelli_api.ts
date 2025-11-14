// --- TYPE DEFINITIONS ---

/**
 * Represents a data chunk containing text and/or image data.
 */
interface Delta {
    text: string | null;
    image: string | null; // Base64 encoded image string
}

/**
 * Represents a step during the streaming generation process.
 */
interface StreamingStep {
    status: 'generating';
    session: string; // Current session ID
    delta: Delta;
    step: number;
    tokens: number; // Total tokens processed/generated
}

/**
 * Represents the information returned upon session initialization or resumption.
 */
interface SessionInfo {
    status: 'initialized' | 'resumed';
    session_id: string; // New or resumed session ID
}

/**
 * Represents the final information returned after generation completes.
 */
interface CompletedInfo {
    status: 'completed';
    cost: number;
    cost_per_mtk: number; // Cost per million tokens
}

/**
 * Represents a communication error reported by the API.
 */
interface ErrorInfo {
    status: 'error';
    message: string;
}

/**
 * The union of all possible JSON response types from the streaming API.
 */
type APIResponse = StreamingStep | SessionInfo | CompletedInfo | ErrorInfo;

// --- GENERATOR YIELD TYPES (What the client consumes) ---

interface GenerationYieldData {
    type: 'data';
    delta: Delta;
    step: number;
    tokens: number;
}

interface GenerationYieldBilling {
    type: 'billing';
    cost: number;
    cost_per_mtk: number;
}

interface GenerationYieldSession {
    type: 'session';
    session_id: string;
}

/**
 * The union of all possible data types yielded by the generate AsyncGenerator.
 */
type GenerationYield = GenerationYieldData | GenerationYieldBilling | GenerationYieldSession;


// ---------------------------
// UTILITY FUNCTIONS
// ---------------------------

/**
 * A streaming parser that reads and parses newline-separated JSON objects from a stream.
 * @param stream The ReadableStream from the fetch response.
 * @returns An AsyncGenerator yielding parsed APIResponse objects.
 */
async function* jsonStreamParser(stream: ReadableStream<Uint8Array>): AsyncGenerator<APIResponse> {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
        while (true) {
            const {done, value} = await reader.read();

            if (done) {
                // Process any remaining content in the buffer
                if (buffer.trim().length > 0) {
                    try {
                        yield JSON.parse(buffer.trim()) as APIResponse;
                    } catch (e) {
                        console.error("Error parsing final buffer part:", e, buffer);
                    }
                }
                break;
            }

            // Decode the chunk and append it to the buffer
            buffer += decoder.decode(value, {stream: true});

            // Check for complete JSON lines separated by newline
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);

                if (line.length > 0) {
                    try {
                        yield JSON.parse(line) as APIResponse;
                    } catch (e) {
                        // Ignore malformed JSON lines and continue
                        console.warn("Skipping malformed JSON line:", line);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ---------------------------
// API CLIENT CLASS
// ---------------------------

export class APIClient {
    private base_url: string;
    private api_key: string;
    private headers: HeadersInit;

    /**
     * Constructor: Initializes the API client.
     * @param api_key Your API key.
     * @param base_url The root URL of the API server (e.g., https://yourdomain.com).
     */
    constructor(api_key: string = "", base_url: string = "https://sintelli.workers.dev") {
        this.api_key = api_key;
        // Remove trailing slash from base_url for correct path concatenation
        this.base_url = base_url.replace(/\/$/, "");
        this.headers = {
            "Authorization": `Bearer ${this.api_key}`,
            "Content-Type": "application/json"
        };
    }

    /**
     * Core generation method: Interacts with the LLM and handles streaming output.
     * @param prompt The user's text prompt.
     * @param img Optional Base64 encoded image data for multi-modal input.
     * @param role Role (defaults to 'user').
     * @param max_tokens Maximum number of tokens to generate.
     * @param timeout Request timeout in seconds.
     * @param session_id Optional, used to resume an existing session.
     * @param model_id Required for new sessions, specifies the model ID to use.
     * @returns An AsyncGenerator yielding chunks of generated data or final billing info.
     */
    public async* generate(
        prompt: string,
        img: string | null = null,
        role: string = "user",
        max_tokens: number = 16234,
        timeout: number = 5,
        session_id: string | null = null,
        model_id: string | null = null
    ): AsyncGenerator<GenerationYield | null> {
        if (!this.api_key || !prompt || !this.base_url) {
            console.error("API key, prompt, or base URL is missing.");
            return;
        }

        const endpoint = '/api/v1/';
        const url = `${this.base_url}${endpoint}`;

        const payload: { [key: string]: any } = {
            input: prompt,
            role: role,
            max_tokens: max_tokens,
            timeout: timeout,
        };

        if (img) {
            payload.img = img;
        }

        if (session_id) {
            payload.type = "resume";
            payload.session_id = session_id;
        } else {
            payload.type = "new";
            if (!model_id) {
                console.error("New session requires a model_id.");
                return;
            }
            payload.model_id = model_id;
        }

        // Use AbortController for request timeout
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
            console.warn(`Request timed out after ${timeout} seconds.`);
        }, timeout * 1000);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`API Error: ${response.status} - ${errorBody}`);
                return;
            }

            if (!response.body) {
                console.error("Response body is null (No streaming data).");
                return;
            }

            // Process the stream using the JSON parser
            const stream = jsonStreamParser(response.body);

            for await (const jsonObject of stream) {
                if (jsonObject.status === 'error') {
                    console.error("API returned error:", jsonObject.message);
                    return;
                }

                switch (jsonObject.status) {
                    case 'initialized':
                    case 'resumed':
                        // Session established/resumed info
                        yield {type: 'session', session_id: jsonObject.session_id};
                        break;
                    case 'generating':
                        // Text/Image generation chunk
                        yield {
                            type: 'data',
                            delta: jsonObject.delta,
                            step: jsonObject.step,
                            tokens: jsonObject.tokens
                        };
                        break;
                    case 'completed':
                        // Final billing information
                        yield {
                            type: 'billing',
                            cost: jsonObject.cost,
                            cost_per_mtk: jsonObject.cost_per_mtk
                        };
                        return; // End the generator
                    default:
                        // Handle unexpected status
                        console.warn("Received unknown status:", jsonObject);
                        break;
                }
            }

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.error("Request was aborted due to timeout or external intervention.");
            } else {
                console.error("Fetch or streaming error:", error);
            }
        } finally {
            clearTimeout(timer);
        }
    }
}