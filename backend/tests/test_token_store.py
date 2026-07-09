import pytest

from gad.auth.token_store import TokenStore


@pytest.mark.asyncio
async def test_is_revoked_returns_false_for_unknown_jti(redis_client):
    store = TokenStore(redis_client)
    assert await store.is_revoked("nonexistent-jti") is False


@pytest.mark.asyncio
async def test_revoke_then_is_revoked_returns_true(redis_client):
    store = TokenStore(redis_client)
    await store.revoke_jti("user-1", "jti-1", ttl_seconds=3600)
    assert await store.is_revoked("jti-1") is True


@pytest.mark.asyncio
async def test_revoke_user_revokes_all_their_jtis(redis_client):
    store = TokenStore(redis_client)
    await store.revoke_jti("user-1", "jti-a", ttl_seconds=3600)
    await store.revoke_jti("user-1", "jti-b", ttl_seconds=3600)
    await store.revoke_user("user-1", ttl_seconds=3600)
    assert await store.is_revoked("jti-a") is True
    assert await store.is_revoked("jti-b") is True
