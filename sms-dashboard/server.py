from __future__ import annotations

import json
import ssl
import subprocess
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
CONFIG = json.loads((ROOT / "points.json").read_text(encoding="utf-8"))
SSO_SCRIPT = Path.home() / ".codex/skills/cowork-xhs-sso/scripts/run-sso.sh"
META_BASE = "https://meta.devops.xiaohongshu.com/virgo2/business/dashboard"
SSL_CTX = ssl._create_unverified_context()
TRACKING_START = datetime.strptime(CONFIG["trackingStartDate"], "%Y-%m-%d").date()

app = FastAPI(title="Tinytype SMS Analytics")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

_sso_cookie: str | None = None


def iter_points() -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for group in CONFIG["groups"]:
        for point in group["points"]:
            points.append({**point, "group": group["name"]})
    return points


def get_meta_user() -> str:
    red_info_path = REPO_ROOT / ".redInfo"
    if red_info_path.exists():
        try:
            red_info = json.loads(red_info_path.read_text(encoding="utf-8"))
            email = ((red_info.get("userInfo") or {}).get("email") or "").split("@")[0]
            if email:
                return email
        except json.JSONDecodeError:
            pass
    return "zixun1"


def get_sso_cookie() -> str:
    global _sso_cookie
    if _sso_cookie:
        return _sso_cookie
    if not SSO_SCRIPT.exists():
        raise HTTPException(
            status_code=500,
            detail="未找到 SSO 脚本，请确认 cowork-xhs-sso skill 已安装。",
        )
    try:
        _sso_cookie = subprocess.check_output(
            ["bash", str(SSO_SCRIPT), str(REPO_ROOT)],
            text=True,
            stderr=subprocess.STDOUT,
        ).strip()
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"SSO 获取失败: {exc.output}") from exc
    return _sso_cookie


def meta_request(url: str, body: dict[str, Any] | None = None, method: str = "POST") -> dict[str, Any]:
    cookie = get_sso_cookie()
    headers = {
        "accept": "application/json",
        "appid": str(CONFIG["appId"]),
        "content-type": "application/json;charset=UTF-8",
        "origin": "https://meta.devops.xiaohongshu.com",
        "referer": CONFIG["metaLinks"]["pageDetail"],
        "Cookie": cookie,
    }
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, context=SSL_CTX, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"Meta API 错误: {detail}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Meta API 连接失败: {exc}") from exc

    if not payload.get("success"):
        raise HTTPException(
            status_code=502,
            detail=payload.get("error_msg") or payload.get("techErrorMsg") or "Meta API 查询失败",
        )
    return payload


def meta_post(path: str, body: dict[str, Any]) -> dict[str, Any]:
    payload = meta_request(f"{META_BASE}/{path}", body)
    return payload.get("data") or {}


def overview_for_point(point_id: int, start: date, end: date) -> dict[str, float | None]:
    body = {
        "queryFrom": "overView",
        "user": get_meta_user(),
        "appId": CONFIG["appId"],
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "compareStartDate": "",
        "compareEndDate": "",
        "commonConditions": [],
        "extraConditions": [],
        "pointIds": [point_id],
        "pageViewPointIds": [point_id],
        "pageEndPointIds": [point_id],
    }
    data = meta_post("_dataOverview", body)
    return {
        "uv": data.get("dailyUv"),
        "pv": data.get("dailyPv"),
    }


def fetch_point_status_map() -> dict[int, int]:
    body = {
        "appId": CONFIG["appId"],
        "keyword": CONFIG["pageInstance"],
        "pageIndex": 1,
        "pageSize": 100,
    }
    payload = meta_request("https://meta.devops.xiaohongshu.com/virgo2/point/list/v2", body)
    items = (payload.get("data") or {}).get("list") or []
    return {int(item["pointId"]): int(item.get("pointStatus") or 0) for item in items}


def fetch_module_metrics(start: date, end: date) -> dict[int, dict[str, float | None]]:
    body = {
        "appId": CONFIG["appId"],
        "pageInstance": CONFIG["pageInstance"],
        "pageViewPointId": CONFIG["pageViewPointId"],
        "pageEndPointId": CONFIG["pageEndPointId"],
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "pageIndex": 1,
        "pageSize": 10000,
        "imageId": CONFIG["pageViewPointId"],
        "commonConditions": [],
        "extraConditions": [],
    }
    try:
        payload = meta_request(
            "https://meta.devops.xiaohongshu.com/virgo2/business/modules/_searchFromDashboard",
            body,
        )
        data = payload.get("data") or {}
    except HTTPException:
        return {}

    metrics: dict[int, dict[str, float | None]] = {}
    for item in data.get("items") or []:
        module_uv = item.get("avgClickUv")
        if module_uv is None:
            module_uv = item.get("avgImpressionUv")
        for point in item.get("points") or []:
            point_id = point.get("id") or point.get("pointId")
            if point_id is None:
                continue
            metrics[int(point_id)] = {
                "uv": module_uv,
                "pv": point.get("pv"),
            }
    return metrics


def parse_date(value: str, field: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} 格式应为 YYYY-MM-DD") from exc


def date_range(start: date, end: date) -> list[date]:
    days: list[date] = []
    current = start
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def build_click_rows(start: date, end: date) -> dict[str, Any]:
    skip = {CONFIG["pageViewPointId"], CONFIG["pageEndPointId"]}
    configured = [point for point in iter_points() if point["pointId"] not in skip]

    status_map = fetch_point_status_map()
    module_metrics = fetch_module_metrics(start, end)

    unpublished = [
        point["pointId"]
        for point in configured
        if status_map.get(point["pointId"], 0) != 1
    ]

    rows: list[dict[str, Any]] = []
    need_query: list[dict[str, Any]] = []

    for point in configured:
        point_id = point["pointId"]
        merged = module_metrics.get(point_id, {"uv": None, "pv": None})
        row = {
            "pointId": point_id,
            "label": point["label"],
            "group": point["group"],
            "action": point["action"],
            "pointStatus": status_map.get(point_id),
            "published": status_map.get(point_id) == 1,
            "uv": merged["uv"],
            "pv": merged["pv"],
        }
        if row["published"] and row["uv"] is None and row["pv"] is None:
            need_query.append(row)
        else:
            row["uv"] = 0 if row["uv"] is None else row["uv"]
            row["pv"] = 0 if row["pv"] is None else row["pv"]
        rows.append(row)

    if need_query:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {
                pool.submit(overview_for_point, row["pointId"], start, end): row for row in need_query
            }
            for future in as_completed(futures, timeout=25):
                row = futures[future]
                try:
                    metrics = future.result()
                    row["uv"] = metrics["uv"] if metrics["uv"] is not None else 0
                    row["pv"] = metrics["pv"] if metrics["pv"] is not None else 0
                except Exception:
                    row["uv"] = 0
                    row["pv"] = 0

    rows.sort(key=lambda item: (-(item["pv"] or 0), item["group"], item["label"]))

    warning = None
    if unpublished:
        warning = (
            f"有 {len(unpublished)} 个点击/曝光点位在 UBA 中尚未上线（pointStatus≠1），"
            "事件虽已上报至 spider-tracker，但不会计入看板。"
            "请在 Meta 需求 12698 中将点位发布上线后再查数。"
        )

    return {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "trackingStartDate": CONFIG["trackingStartDate"],
        "items": rows,
        "unpublishedPointIds": unpublished,
        "warning": warning,
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/config")
def api_config() -> dict[str, Any]:
    return CONFIG


@app.get("/api/metrics")
def api_metrics(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
) -> dict[str, Any]:
    start_date = parse_date(start, "start")
    end_date = parse_date(end, "end")
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")

    page_point_id = CONFIG["pageViewPointId"]
    summary = overview_for_point(page_point_id, start_date, end_date)

    daily: list[dict[str, Any]] = []
    for day in date_range(start_date, end_date):
        metrics = overview_for_point(page_point_id, day, day)
        daily.append(
            {
                "date": day.isoformat(),
                "uv": metrics["uv"],
                "pv": metrics["pv"],
                "hasData": metrics["uv"] is not None or metrics["pv"] is not None,
            }
        )

    return {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "trackingStartDate": CONFIG["trackingStartDate"],
        "summary": summary,
        "daily": daily,
    }


@app.get("/api/clicks")
def api_clicks(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
) -> dict[str, Any]:
    start_date = parse_date(start, "start")
    end_date = parse_date(end, "end")
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    return build_click_rows(start_date, end_date)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8787, reload=True)
