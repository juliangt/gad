# backend/src/gad/jobs/scheduler.py
import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from gad.jobs.expire_plans import expire_plans

_scheduler: AsyncIOScheduler | None = None


def setup_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        lambda: asyncio.create_task(expire_plans()),
        trigger="interval",
        minutes=5,
        id="expire_plans",
        replace_existing=True,
    )
    _scheduler = scheduler
    return scheduler


async def start_scheduler() -> None:
    scheduler = setup_scheduler()
    scheduler.start()


async def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
