// --- TYPE DEFINITIONS (via JSDoc) ---

/**
 * @typedef {object} Delta Represents a data chunk containing text and/or image data.
 * @property {string | null} text
 * @property {string | null} image Base64 encoded image string.
 *
 * @typedef {object} StreamingStep Represents a step during the streaming generation process.
 * @property {'generating'} status
 * @property {string} session Current session ID.
 * @property {Delta} delta
 * @property {number} step
 * @property {number} tokens Total tokens processed/generated.
 *
 * @typedef {object} SessionInfo Represents the information returned upon session initialization or resumption.
 * @property {'initialized' | 'resumed'} status
 * @property {string} session_id New or resumed session ID.
 *
 * @typedef {object} CompletedInfo Represents the final information returned after generation completes.
 * @property {'completed'} status
 * @property {number} cost
 * @property {number} cost_per_mtk Cost per million tokens.
 *
 * @typedef {object} ErrorInfo Represents a communication error reported by the API.
 * @property {'error'} status
 * @property {string} message
 *
 * @typedef {StreamingStep | SessionInfo | CompletedInfo | ErrorInfo} APIResponse The union of all possible JSON response types.
 *
 * @typedef {object} GenerationYieldData
 * @property {'data'} type
 * @property {Delta} delta
 * @property {number} step
 * @property {number} tokens
 *
 * @typedef {object} GenerationYieldBilling
 * @property {'billing'} type
 * @property {number} cost
 * @property {number} cost_per_mtk
 *
 * @typedef {object} GenerationYieldSession
 * @property {'session'} type
 * @property {string} session_id
 *
 * @typedef {GenerationYieldData | GenerationYieldBilling | GenerationYieldSession} GenerationYield The union of all possible data types yielded by the generate AsyncGenerator.
 */

// ---------------------------
// UTILITY FUNCTIONS
// ---------------------------

/**
 * A streaming parser that reads and parses newline-separated JSON objects from a stream.
 * @param {ReadableStream<Uint8Array>} stream The ReadableStream from the fetch response.
 * @returns {AsyncGenerator<APIResponse>} An AsyncGenerator yielding parsed APIResponse objects.
 */
async function* jsonStreamParser(stream) {
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
                        yield JSON.parse(buffer.trim());
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
                        yield JSON.parse(line);
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
    /** @private @type {string} */
    base_url;
    /** @private @type {string} */
    api_key;
    /** @private @type {HeadersInit} */
    headers;

    /**
     * Constructor: Initializes the API client.
     * @param {string} [api_key=""] Your API key.
     * @param {string} [base_url="https://sintelli.workers.dev"] The root URL of the API server (e.g., https://yourdomain.com).
     */
    constructor(api_key = "", base_url = "https://sintelli.workers.dev") {
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
     * @param {string} prompt The user's text prompt.
     * @param {string | null} [img=null] Optional Base64 encoded image data for multi-modal input.
     * @param {string} [role="user"] Role (defaults to 'user').
     * @param {number} [max_tokens=16234] Maximum number of tokens to generate.
     * @param {number} [timeout=5] Request timeout in seconds.
     * @param {string | null} [session_id=null] Optional, used to resume an existing session.
     * @param {string | null} [model_id=null] Required for new sessions, specifies the model ID to use.
     * @returns {AsyncGenerator<GenerationYield | null>} An AsyncGenerator yielding chunks of generated data or final billing info.
     */
    async* generate(
        prompt,
        img = null,
        role = "user",
        max_tokens = 16234,
        timeout = 5,
        session_id = null,
        model_id = null
    ) {
        if (!this.api_key || !prompt || !this.base_url) {
            console.error("API key, prompt, or base URL is missing.");
            return;
        }

        const endpoint = '/api/v1/';
        const url = `${this.base_url}${endpoint}`;

        /** @type {{[key: string]: any}} */
        const payload = {
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
                if ('status' in jsonObject) {
                    if (jsonObject.status === 'error') {
                        console.error("API returned error:", jsonObject.message);
                        return;
                    }

                    switch (jsonObject.status) {
                        case 'initialized':
                        case 'resumed':
                            // Session established/resumed info
                            /** @type {GenerationYieldSession} */
                            const sessionYield = {type: 'session', session_id: jsonObject.session_id};
                            yield sessionYield;
                            break;
                        case 'generating':
                            // Text/Image generation chunk
                            /** @type {GenerationYieldData} */
                            const dataYield = {
                                type: 'data',
                                delta: jsonObject.delta,
                                step: jsonObject.step,
                                tokens: jsonObject.tokens
                            };
                            yield dataYield;
                            break;
                        case 'completed':
                            // Final billing information
                            /** @type {GenerationYieldBilling} */
                            const billingYield = {
                                type: 'billing',
                                cost: jsonObject.cost,
                                cost_per_mtk: jsonObject.cost_per_mtk
                            };
                            yield billingYield;
                            return; // End the generator
                        default:
                            // Handle unexpected status
                            console.warn("Received unknown status:", jsonObject);
                            break;
                    }
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