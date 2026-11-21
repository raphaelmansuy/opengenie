"""List deployments on the Generic AI Gateway. Serving discovery is a different call."""

from __future__ import annotations

import httpx

from ....config import Settings
from ..providers.gateway import (
    api_headers,
    configured_base,
    configured_key,
    deployments_url,
    specs_from_deployments,
)
from .databricks import DiscoveryResult


class GatewayDiscovery:
    """`GET {base}/deployments`. A missing base, a missing key, or a transport error leaves the seed."""

    def __init__(self, base_url: str = "", api_key: str = "", *, client: httpx.AsyncClient | None = None) -> None:
        self._base = base_url
        self._key = api_key
        self._client = client

    @classmethod
    def from_settings(cls, cfg: Settings) -> GatewayDiscovery:
        return cls(configured_base(cfg.llm_gateway_base_url), configured_key())

    async def fetch(self, token: str | None = None) -> DiscoveryResult:
        del token  # the workspace token is not a credential for this host
        if not self._base or not self._key:
            return DiscoveryResult((), "error", "gateway base URL or key is not configured")
        if self._base.startswith("http://"):
            return DiscoveryResult((), "error", "the gateway base URL must be https")
        url = deployments_url(self._base)
        own = self._client is None
        http = self._client or httpx.AsyncClient(timeout=30.0)
        try:
            response = await http.get(url, headers=api_headers(self._key))
        except httpx.HTTPError as exc:
            return DiscoveryResult((), "error", type(exc).__name__)
        finally:
            if own:
                await http.aclose()
        if response.status_code in (401, 403, 405):
            return DiscoveryResult((), "denied", "the gateway refused the key")
        if response.status_code >= 400:
            return DiscoveryResult((), "error", f"HTTP {response.status_code}")
        try:
            body = response.json()
        except ValueError:
            return DiscoveryResult((), "error", "the deployments response was not JSON")
        if not isinstance(body, dict) or "models" not in body:
            return DiscoveryResult((), "error", "the deployments response has no models list")
        return DiscoveryResult(tuple(specs_from_deployments(body)), "ok")
