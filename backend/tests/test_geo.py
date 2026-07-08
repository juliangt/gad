# backend/tests/test_geo.py
from gad.models.geo import haversine_meters, snap_to_grid


def test_snap_to_grid_returns_float_pair():
    lat, lng = snap_to_grid(-34.5889, -58.4305)
    assert isinstance(lat, float)
    assert isinstance(lng, float)


def test_snap_to_grid_quantizes_to_150m():
    lat1, lng1 = snap_to_grid(-34.5889, -58.4305)
    lat2, lng2 = snap_to_grid(-34.5888, -58.4304)
    assert lat1 == lat2
    assert lng1 == lng2


def test_snap_to_grid_distance_under_150m():
    d = haversine_meters(-34.5889, -58.4305, *snap_to_grid(-34.5889, -58.4305))
    assert d <= 150.0


def test_snap_to_grid_distant_points_differ():
    palermo = snap_to_grid(-34.5889, -58.4305)
    centro = snap_to_grid(-34.6037, -58.3816)
    assert palermo != centro
