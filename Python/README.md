# Sintelli API Client (Python)

Official Python client library for the Sintelli API.

## Installation

```bash
pip install sintelli_api_client
```

## Usage

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

## Documentation

For detailed documentation, please refer to the [main repository](https://github.com/rand0mdevel0per/Sintellii-Web-Api-v1).