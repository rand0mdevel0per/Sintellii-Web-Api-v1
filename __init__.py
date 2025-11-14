import requests
import json
from typing import Generator, Any, Union, Dict, Tuple


class APIClient:
    def __init__(self, api_key: str = "", base_url: str = "https://sintelli.workers.dev/api/v1/"):
        self.base_url = base_url
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def generate(self, prompt: str, img: str = None, role: str = "user", max_tokens: int = 16234, timeout: int = 5,
                 session_id: str = None,
                 model_id: str = None) -> Generator[
        Union[Tuple[Tuple[str | None, str | None], Tuple[int, int]], Tuple[int, int]] | None, Any, None]:
        if not self.api_key:
            return None
        if not prompt:
            return None
        if not self.base_url:
            return None
        try:
            payload = {}
            if not session_id:
                payload["type"] = "new"
                if not model_id:
                    return None
                payload["model_id"] = model_id
            else:
                payload["type"] = "resume"
                payload["session_id"] = session_id
            payload["input"] = prompt
            if img:
                payload["image"] = img
            payload["role"] = role
            payload["max_tokens"] = max_tokens
            payload["timeout"] = timeout
            with requests.post(self.base_url, json=payload, stream=True, timeout=300, headers=self.headers) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line:
                        try:
                            line_str = line.decode('utf-8')
                            json_data = json.loads(line_str)
                            status = json_data.get("status")
                            if status == "error":
                                yield None
                                break
                            elif status == "initialized" or status == "resumed":
                                continue
                            elif status == "generating":
                                delta: Dict[str, str] = json_data.get("delta")
                                text = None
                                img = None
                                if "text" in delta:
                                    text = delta.get("text")
                                if "image" in delta:
                                    img = delta.get("image")
                                steps: int = json_data.get("step")
                                tks: int = json_data.get("tokens")
                                yield (text, img), (steps, tks)
                                continue
                            elif status == "completed":
                                cost: int = json_data.get("cost")
                                cost_per_mtk: int = json_data.get("cost_per_mtk")
                                yield cost, cost_per_mtk
                                break
                        except:
                            yield None
                            break
        except:
            return None
        return None