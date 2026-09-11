from app.common.datetime_utils import to_utc_naive, utc_now
from app.common.enums.contests import ContestStatus
from app.models.contest import Contest


def compute_contest_status(contest: Contest) -> ContestStatus:
    """Derive lifecycle status from contest time window, preserving archived state."""
    if contest.status == ContestStatus.ARCHIVED:
        return ContestStatus.ARCHIVED

    now = utc_now()
    start = to_utc_naive(contest.start_at)
    end = to_utc_naive(contest.end_at)

    if end <= now:
        return ContestStatus.COMPLETED
    if start <= now < end:
        return ContestStatus.ONGOING
    return ContestStatus.LIVE


async def sync_contest_status(contest: Contest, *, persist: bool = True) -> ContestStatus:
    """Compute and optionally persist the latest lifecycle status for a contest."""
    computed = compute_contest_status(contest)
    if contest.status != computed:
        contest.status = computed
        if persist:
            contest.updated_at = utc_now()
            await contest.save()  # type: ignore[misc]
    return computed


def contest_status_filter_clauses(
    status: ContestStatus, *, exclude_archived_for_time_window: bool = True
) -> list[object]:
    """Return Beanie filter clauses for status-based list queries."""
    now = utc_now()

    if status == ContestStatus.ARCHIVED:
        return [Contest.status == ContestStatus.ARCHIVED]

    clauses: list[object] = []
    if exclude_archived_for_time_window:
        clauses.append(Contest.status != ContestStatus.ARCHIVED)

    if status == ContestStatus.ONGOING:
        clauses.extend([Contest.start_at <= now, Contest.end_at > now])
    elif status == ContestStatus.LIVE:
        clauses.append(Contest.start_at > now)
    elif status == ContestStatus.COMPLETED:
        clauses.append(Contest.end_at <= now)

    return clauses
