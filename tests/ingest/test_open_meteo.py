from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pandas as pd
import pytest

from solar_race_planner.ingest.open_meteo import (
    OUTPUT_COLUMNS,
    WEATHER_VARIABLES,
    OpenMeteoClient,
    Resolution,
    RoutePoint,
)


def _make_location_payload(
    lat: float,
    lon: float,
    *,
    resolution: str = "hourly",
    times: list[str] | None = None,
) -> dict[str, object]:
    step_times = times or ["2026-11-18T00:00", "2026-11-18T01:00"]
    n = len(step_times)
    block: dict[str, object] = {"time": step_times}
    for idx, var in enumerate(WEATHER_VARIABLES, start=1):
        block[var] = [float(idx * 10 + t) for t in range(n)]
    return {
        "latitude": lat,
        "longitude": lon,
        "utc_offset_seconds": 0,
        "timezone": "GMT",
        resolution: block,
    }


def _mock_open_meteo_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.params["wind_speed_unit"] == "ms"
    lats = [float(v) for v in request.url.params["latitude"].split(",")]
    lons = [float(v) for v in request.url.params["longitude"].split(",")]
    resolution = "minutely_15" if "minutely_15" in request.url.params else "hourly"

    items = [
        _make_location_payload(lat, lon, resolution=resolution) for lat, lon in zip(lats, lons, strict=True)
    ]
    payload: object = items[0] if len(items) == 1 else items
    return httpx.Response(200, json=payload)


def test_fetch_forecast_returns_tidy_dataframe_with_provenance(tmp_path: Path) -> None:
    points = [
        RoutePoint(point_id="darwin", lat=-12.4634, lon=130.8456),
        RoutePoint(point_id="alice", lat=-23.6980, lon=133.8807),
    ]
    http_client = httpx.Client(transport=httpx.MockTransport(_mock_open_meteo_handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast(points, model="ecmwf_ifs025", forecast_days=2)

    assert list(df.columns) == list(OUTPUT_COLUMNS)
    assert len(df) == 4
    assert set(df["point_id"]) == {"darwin", "alice"}
    assert (df["step_minutes"] == 60).all()
    assert isinstance(df["time_utc"].dtype, pd.DatetimeTZDtype)
    assert str(df["time_utc"].dtype.tz) == "UTC"
    assert (df["model"] == "ecmwf_ifs025").all()
    assert df["issue_time_utc"].notna().all()
    assert df["request_url"].str.contains("api.open-meteo.com/v1/forecast").all()


def test_fetch_forecast_handles_single_point_and_minutely_15(tmp_path: Path) -> None:
    points = [RoutePoint(point_id=0, lat=-12.4634, lon=130.8456)]
    http_client = httpx.Client(transport=httpx.MockTransport(_mock_open_meteo_handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast(points, resolution="minutely_15")

    assert len(df) == 2
    assert (df["point_id"] == "0").all()
    assert (df["step_minutes"] == 15).all()


def test_fetch_forecast_empty_points_makes_no_requests_and_is_lazy(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return _mock_open_meteo_handler(request)

    cache_dir = tmp_path / "lazy_cache"
    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    with OpenMeteoClient(cache_dir=cache_dir, http_client=http_client) as client:
        assert not cache_dir.exists()
        df = client.fetch_forecast([])

    assert calls == 0
    assert not cache_dir.exists()
    assert df.empty
    assert list(df.columns) == list(OUTPUT_COLUMNS)


def test_fetch_forecast_batches_300_points_into_at_most_5_requests(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return _mock_open_meteo_handler(request)

    points = [
        RoutePoint(point_id=f"km_{i * 10}", lat=-12.5 - i * 0.07, lon=130.8 + i * 0.02) for i in range(300)
    ]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        df = client.fetch_forecast(points)

    assert calls <= 5
    assert df["point_id"].nunique() == 300
    assert len(df) == 600


def test_fetch_forecast_retries_on_429_and_5xx_with_capped_backoff(tmp_path: Path) -> None:
    attempts = 0
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, headers={"Retry-After": "999"})
        if attempts == 2:
            return httpx.Response(503)
        return _mock_open_meteo_handler(request)

    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(
        cache_dir=tmp_path,
        http_client=http_client,
        backoff_base_seconds=0.5,
        max_retry_delay_seconds=10.0,
        sleep_fn=sleeps.append,
    ) as client:
        df = client.fetch_forecast(points)

    assert attempts == 3
    assert sleeps == [10.0, 1.0]
    assert len(df) == 2


def test_fetch_forecast_raises_after_exhausting_retries(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(
        cache_dir=tmp_path,
        http_client=http_client,
        max_retries=2,
        sleep_fn=lambda _: None,
    ) as client:
        with pytest.raises(httpx.HTTPStatusError):
            client.fetch_forecast(points)


def test_fetch_forecast_uses_disk_cache_and_respects_ttl(tmp_path: Path) -> None:
    calls = 0
    current_time = datetime(2026, 11, 18, 12, 0, 0, tzinfo=UTC)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return _mock_open_meteo_handler(request)

    points = [
        RoutePoint(point_id="p1", lat=-12.46, lon=130.84),
        RoutePoint(point_id="p2", lat=-14.47, lon=132.26),
    ]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(
        cache_dir=tmp_path,
        cache_ttl_seconds=1800.0,
        http_client=http_client,
        now_fn=lambda: current_time,
    ) as client:
        df1 = client.fetch_forecast(points, use_cache=True)
        current_time += timedelta(minutes=15)
        df2 = client.fetch_forecast(points, use_cache=True)
        current_time += timedelta(minutes=45)
        df3 = client.fetch_forecast(points, use_cache=True)

    assert calls == 2
    pd.testing.assert_frame_equal(df1, df2)
    assert (df3["issue_time_utc"] > df1["issue_time_utc"]).all()


@pytest.mark.parametrize(
    "points", [[], [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]], ids=["empty", "one_point"]
)
def test_fetch_forecast_rejects_invalid_resolution(tmp_path: Path, points: list[RoutePoint]) -> None:
    with OpenMeteoClient(cache_dir=tmp_path) as client:
        with pytest.raises(ValueError, match="Unsupported resolution"):
            client.fetch_forecast(points, resolution="daily")  # type: ignore[arg-type]


def test_fetch_forecast_treats_corrupt_cache_as_miss(tmp_path: Path) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return _mock_open_meteo_handler(request)

    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(cache_dir=tmp_path, http_client=http_client) as client:
        client.fetch_forecast(points)
        assert calls == 1

        # Corrupt every cache file written so far.
        for cache_file in tmp_path.glob("*.json"):
            cache_file.write_text("{not valid json", encoding="utf-8")

        df = client.fetch_forecast(points)
        assert calls == 2  # refetched instead of raising
        assert len(df) == 2

        # The entry was repaired, so a third call hits the cache again.
        client.fetch_forecast(points)
        assert calls == 2


def test_fetch_forecast_retries_on_transport_error(tmp_path: Path) -> None:
    attempts = 0
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts <= 2:
            raise httpx.ConnectError("boom", request=request)
        return _mock_open_meteo_handler(request)

    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(
        cache_dir=tmp_path,
        http_client=http_client,
        backoff_base_seconds=0.5,
        sleep_fn=sleeps.append,
    ) as client:
        df = client.fetch_forecast(points)

    assert attempts == 3
    assert sleeps == [0.5, 1.0]
    assert len(df) == 2


def test_fetch_forecast_raises_transport_error_after_exhausting_retries(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    points = [RoutePoint(point_id="p1", lat=-12.46, lon=130.84)]
    http_client = httpx.Client(transport=httpx.MockTransport(handler))

    with OpenMeteoClient(
        cache_dir=tmp_path,
        http_client=http_client,
        max_retries=2,
        sleep_fn=lambda _: None,
    ) as client:
        with pytest.raises(httpx.ConnectError):
            client.fetch_forecast(points)


@pytest.mark.live
@pytest.mark.parametrize(("resolution", "step_minutes"), [("hourly", 60), ("minutely_15", 15)])
def test_live_open_meteo_returns_all_variables(
    tmp_path: Path, resolution: Resolution, step_minutes: int
) -> None:
    points = [
        RoutePoint(point_id="darwin", lat=-12.4634, lon=130.8456),
        RoutePoint(point_id="alice", lat=-23.6980, lon=133.8807),
    ]
    with OpenMeteoClient(cache_dir=tmp_path) as client:
        df = client.fetch_forecast(points, resolution=resolution, forecast_days=2, use_cache=False)

    rows_per_point = 2 * 24 * 60 // step_minutes

    assert list(df.columns) == list(OUTPUT_COLUMNS)
    assert set(df["point_id"]) == {"darwin", "alice"}
    assert (df.groupby("point_id").size() == rows_per_point).all()
    assert (df["step_minutes"] == step_minutes).all()
    assert df[list(WEATHER_VARIABLES)].notna().all().all()
