"""Bounded capture for authenticated API previews. Never follow HTTP redirects."""
import asyncio
from urllib.parse import urlsplit
import cv2
import httpx
import numpy as np
from app.core.camera_access import validate_camera_url

MAX_BYTES = 2 * 1024 * 1024


def _rtsp_frame(url):
    capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG, [
        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 3000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000])
    try:
        ok, frame = capture.read()
        return frame if ok else None
    finally:
        capture.release()


async def capture_frame(url):
    validate_camera_url(url)
    if urlsplit(url).scheme == 'rtsp':
        return await asyncio.to_thread(_rtsp_frame, url)
    async with httpx.AsyncClient(timeout=3, follow_redirects=False, trust_env=False) as client:
        async with client.stream('GET', url) as response:
            response.raise_for_status()
            data = bytearray()
            async for chunk in response.aiter_bytes(16384):
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise ValueError('Camera frame too large')
                start = data.find(b'\xff\xd8')
                end = data.find(b'\xff\xd9', max(start, 0))
                if start >= 0 and end > start:
                    return await asyncio.to_thread(cv2.imdecode, np.frombuffer(bytes(data[start:end+2]), dtype=np.uint8), cv2.IMREAD_COLOR)
    return None
