from app.common.enums.contests import ContestStatus
from app.models.contest import Contest
from app.utils.timezone import now_ist, to_ist


def compute_contest_status(contest: Contest) -> ContestStatus:
    """Derive lifecycle status from contest time window, preserving archived state."""
    if contest.status == ContestStatus.ARCHIVED:
        return ContestStatus.ARCHIVED

    now = now_ist()
    start = to_ist(contest.start_at)
    end = to_ist(contest.end_at)

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
        contest.updated_at = now_ist()
        if persist:
            await contest.save()  # type: ignore[misc]
    return computed


def contest_status_filter_clauses(
    status: ContestStatus, *, exclude_archived_for_time_window: bool = True
) -> list[object]:
    """Return Beanie filter clauses for status-based list queries."""
    now = now_ist()

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
