import pytest
from unittest.mock import patch, MagicMock
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from gad.jobs import scheduler
from gad.jobs.scheduler import setup_scheduler, start_scheduler, shutdown_scheduler


@pytest.fixture(autouse=True)
def reset_scheduler():
    # Store the original scheduler
    old_scheduler = scheduler._scheduler
    # Reset for each test
    scheduler._scheduler = None
    yield
    # Restore after the test
    scheduler._scheduler = old_scheduler


def test_setup_scheduler_creates_jobs():
    sched = setup_scheduler()
    assert isinstance(sched, AsyncIOScheduler)

    jobs = sched.get_jobs()
    assert len(jobs) == 2

    expire_plans_job = next((j for j in jobs if j.id == "expire_plans"), None)
    assert expire_plans_job is not None
    assert expire_plans_job.trigger.__class__.__name__ == "IntervalTrigger"
    # APScheduler's IntervalTrigger has an interval attribute which is a timedelta
    assert expire_plans_job.trigger.interval.total_seconds() == 5 * 60

    expire_availability_job = next((j for j in jobs if j.id == "expire_availability"), None)
    assert expire_availability_job is not None
    assert expire_availability_job.trigger.__class__.__name__ == "IntervalTrigger"
    assert expire_availability_job.trigger.interval.total_seconds() == 5 * 60


def test_setup_scheduler_is_singleton():
    sched1 = setup_scheduler()
    sched2 = setup_scheduler()
    assert sched1 is sched2


@pytest.mark.asyncio
@patch("gad.jobs.scheduler.setup_scheduler")
async def test_start_scheduler(mock_setup):
    mock_scheduler = MagicMock()
    mock_setup.return_value = mock_scheduler

    await start_scheduler()

    mock_setup.assert_called_once()
    mock_scheduler.start.assert_called_once()


@pytest.mark.asyncio
async def test_shutdown_scheduler():
    sched = setup_scheduler()
    with patch.object(sched, 'shutdown') as mock_shutdown:
        await shutdown_scheduler()
        mock_shutdown.assert_called_once_with(wait=False)
        assert scheduler._scheduler is None
