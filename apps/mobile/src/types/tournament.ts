export interface Tournament {
    id: string; // the slug: the backend's tournament list carries no other id
    // Names the tournament to the backend in X-Tournament-Slug.
    slug: string;
    title: string;
    game_name: string;
    stream_url?: string;
    image_url?: string;
    status: 'LIVE' | 'UPCOMING' | 'COMPLETED';
    status_display: string;
    start_time: string;
    duration?: string;
    registration_closes?: string;
}

export type TournamentStatus = 'LIVE' | 'UPCOMING' | 'COMPLETED';

export interface TournamentApiResponse extends Tournament { }