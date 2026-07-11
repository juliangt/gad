import pytest

from gad.chat.websocket import SlidingWindowRateLimiter


def test_allows_up_to_rate_per_second():
    rl = SlidingWindowRateLimiter(max_per_second=5)
    for _ in range(5):
        assert rl.allow() is True


def test_rejects_above_rate():
    rl = SlidingWindowRateLimiter(max_per_second=3)
    for _ in range(3):
        assert rl.allow() is True
    assert rl.allow() is False
    assert rl.allow() is False


def test_recovers_after_window():
    rl = SlidingWindowRateLimiter(max_per_second=2, window=0.05)
    assert rl.allow() is True
    assert rl.allow() is True
    assert rl.allow() is False
    # Tras esperar window, la ventana se limpia.
    import time

    time.sleep(0.06)
    assert rl.allow() is True
