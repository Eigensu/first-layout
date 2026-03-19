export const CONTEST_STATUS = {
	LIVE: "live",
	ONGOING: "ongoing",
	COMPLETED: "completed",
	ARCHIVED: "archived",
} as const;

export const CONTEST_VISIBILITY = {
	PUBLIC: "public",
	PRIVATE: "private",
} as const;

export const CONTEST_POINTS_SCOPE = {
	TIME_WINDOW: "time_window",
	SNAPSHOT: "snapshot",
} as const;

export const CONTEST_TYPE = {
	DAILY: "daily",
	FULL: "full",
} as const;

export type ContestStatus =
	(typeof CONTEST_STATUS)[keyof typeof CONTEST_STATUS];
export type ContestVisibility =
	(typeof CONTEST_VISIBILITY)[keyof typeof CONTEST_VISIBILITY];
export type PointsScope =
	(typeof CONTEST_POINTS_SCOPE)[keyof typeof CONTEST_POINTS_SCOPE];
export type ContestType = (typeof CONTEST_TYPE)[keyof typeof CONTEST_TYPE];

export const CONTEST_STATUS_OPTIONS = Object.values(
	CONTEST_STATUS,
) as ContestStatus[];
export const CONTEST_VISIBILITY_OPTIONS = Object.values(
	CONTEST_VISIBILITY,
) as ContestVisibility[];
export const CONTEST_POINTS_SCOPE_OPTIONS = Object.values(
	CONTEST_POINTS_SCOPE,
) as PointsScope[];
export const CONTEST_TYPE_OPTIONS = Object.values(
	CONTEST_TYPE,
) as ContestType[];

export const CONTEST_DEFAULTS = {
	status: CONTEST_STATUS.LIVE,
	visibility: CONTEST_VISIBILITY.PUBLIC,
	points_scope: CONTEST_POINTS_SCOPE.TIME_WINDOW,
	contest_type: CONTEST_TYPE.FULL,
} as const;

