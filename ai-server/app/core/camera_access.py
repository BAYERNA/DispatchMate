"""Authenticate against live account state and resolve only registered camera IDs.

No client-supplied URLs, filesystem paths, redirects or DNS resolution. Explicit numeric
camera IPs permit private LAN cameras without permitting arbitrary internal destinations.
"""
import ipaddress
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import Header, HTTPException
from app.core.config import get_settings


async def backend_get(path: str, authorization: str) -> dict | list:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "로그인이 필요합니다.")
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=3, follow_redirects=False, trust_env=False) as client:
            response = await client.get(settings.backend_base_url.rstrip('/') + path,
                                        headers={"Authorization": authorization})
        if response.status_code in (401, 403):
            raise HTTPException(403, "세션 또는 접근 권한이 없습니다.")
        if response.status_code == 404:
            raise HTTPException(404, "등록된 카메라를 찾을 수 없습니다.")
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "계정·카메라 상태를 확인할 수 없습니다.") from None


async def require_operator(authorization: str = Header(default="")) -> str:
    user = await backend_get('/api/v1/auth/session', authorization)
    if user.get('role') not in ('ADMIN', 'COMMANDER'):
        raise HTTPException(403, "관리자·지휘관 전용입니다.")
    return authorization


def validate_camera_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        host = ipaddress.ip_address(parts.hostname or '')
        allowed = {ipaddress.ip_address(value.strip()) for value in get_settings().camera_allowed_hosts.split(',') if value.strip()}
        if parts.scheme not in ('http', 'https', 'rtsp') or host not in allowed:
            raise ValueError()
        if host.is_loopback or host.is_link_local or host.is_multicast or host.is_unspecified:
            raise ValueError()
        if parts.username or parts.password or parts.fragment or not 1 <= (parts.port or 80) <= 65535:
            raise ValueError()
    except ValueError:
        raise HTTPException(403, "허용된 카메라 IP·프로토콜이 아닙니다.") from None
    return url


async def camera_url(device_id: UUID, authorization: str) -> str:
    # /devices/{id} already enforces ADMIN/COMMANDER and live JWT/account state.
    device = await backend_get(f'/api/v1/devices/{device_id}', authorization)
    if device.get('deviceType') not in ('CCTV', 'DRONE') or not device.get('streamUrl'):
        raise HTTPException(404, "영상이 등록된 CCTV·드론이 아닙니다.")
    return validate_camera_url(device['streamUrl'])
